// O que o `vl` pede ao launcher (src-tauri/src/canal.rs): o status, os apps, rodar, parar,
// reiniciar, a saída. Só os apps e as variações que já estão aqui: o pedido traz nomes, nunca um
// comando. Sem o nome do app, vale a pasta de onde o `vl` foi chamado (e a worktree em que ela está).
// As respostas são texto para ler no terminal (é o que o Claude Code lê) e, para o --json, dados.

import { api } from './api'
import {
  acharVariacao,
  acharWorktree,
  appsDaPasta,
  appsPeloNome,
  localDoApp,
  pastaDoApp,
  pastaNaWorktree,
  Recusa,
  todosOsApps,
  variacaoPadrao,
  type AppAchado,
} from './apps'
import { useConfig } from './config'
import { estaAtiva, pedidoDaVariacao, useExecucoes } from './execucoes'
import { rotuloDaWorktree } from './git'
import { useMonitor } from './monitor'
import { duracao, formatarCpu, formatarMemoria, mesmaPasta } from './texto'
import type { App, Config, Execucao, Linha, OndeEsta, PedidoDoCanal, RespostaDoCanal, Uso } from './tipos'
import { useUi } from './ui'

/** Quanto o `vl rodar` espera o app anunciar o endereço. */
const ESPERA_DO_ENDERECO_MS = 60_000
const ESPERA_DO_PARAR_MS = 15_000
const LINHAS_PADRAO = 60
const MAX_LINHAS = 3000
const ORIGEM = 'vl'
const PARECE_ENDERECO = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])/

type Comando = (pedido: PedidoDoCanal) => Promise<RespostaDoCanal> | RespostaDoCanal

const comandos: Record<string, Comando> = { status, apps, rodar, parar, reiniciar, saida, abrir }

/** Atende um pedido. Nunca lança: o erro vira a resposta. */
export async function atender(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  if (!Object.hasOwn(comandos, pedido.comando)) return { ok: false, erro: `Comando desconhecido: ${pedido.comando}.` }
  try {
    return await comandos[pedido.comando]!(pedido)
  } catch (erro) {
    return { ok: false, erro: erro instanceof Recusa ? erro.message : `Deu errado: ${String(erro)}` }
  }
}

let conectado = false
/** Os pedidos já atendidos: o Rust manda de novo os pendentes quando a interface recarrega. */
const atendidos = new Set<number>()

/** Passa a atender o `vl`. Chamar depois de carregar a configuração e as execuções. */
export async function conectarCanal() {
  if (conectado) return
  conectado = true
  await api.aoPedirPeloCanal(async (pedido) => {
    if (atendidos.has(pedido.id)) return
    atendidos.add(pedido.id)
    const resposta = await atender(pedido)
    await api.responderCanal(pedido.id, resposta).catch((e) => console.error('o vl ficou sem resposta', e))
  })
  await api.canalPronto()
}

// ---------------------------------------------------------------------------------------------
// Os comandos

function status(): RespostaDoCanal {
  const nomes = nomesDosApps()
  const { uso } = useMonitor.getState()
  const todas = Object.values(useExecucoes.getState().execucoes).sort((a, b) => a.inicio - b.inicio)
  const ativas = todas.filter(estaAtiva)
  const encerradas = todas.filter((e) => !estaAtiva(e)).slice(-8)
  const partes = [
    ativas.length === 0
      ? 'Nada rodando no vlauncher.'
      : `Rodando no vlauncher (${ativas.length}):\n\n${ativas.map((e) => descrever(e, nomes, uso[e.id])).join('\n\n')}`,
  ]
  if (encerradas.length > 0) {
    partes.push(`Encerradas:\n${encerradas.map((e) => `  ${titulo(e, nomes)}: ${situacao(e)}`).join('\n')}`)
  }
  return { ok: true, texto: partes.join('\n\n'), dados: { execucoes: todas.map((e) => dadosDaExecucao(e, nomes, uso[e.id])) } }
}

function apps(): RespostaDoCanal {
  const config = useConfig.getState().config
  if (config.grupos.every((g) => g.apps.length === 0)) return { ok: true, texto: 'O launcher ainda não tem apps.', dados: { grupos: [] } }
  const ativas = Object.values(useExecucoes.getState().execucoes).filter(estaAtiva)
  const texto = config.grupos
    .filter((g) => g.apps.length > 0)
    .map((g) => {
      const linhas = g.apps.map((app) => {
        const padrao = variacaoPadrao(app)
        const variacoes = app.variacoes.map((v) => (v.id === padrao?.id ? `${v.nome} (padrão)` : v.nome)).join(', ') || 'nenhuma'
        const rodando = ativas.filter((e) => e.appId === app.id).map((e) => `${e.rotulo} em ${e.local}${e.url ? `, ${e.url}` : ''}`)
        return [
          `  ${app.nome}: ${pastaDoApp(app)} (${localDoApp(app)})`,
          `    variações: ${variacoes}`,
          ...(rodando.length > 0 ? [`    rodando: ${rodando.join('; ')}`] : []),
        ].join('\n')
      })
      return [g.nome, ...linhas].join('\n')
    })
    .join('\n\n')
  const dados = {
    grupos: config.grupos.map((g) => ({
      nome: g.nome,
      apps: g.apps.map((app) => ({
        id: app.id,
        nome: app.nome,
        pasta: app.pasta,
        ondeRoda: pastaDoApp(app),
        local: localDoApp(app),
        variacoes: app.variacoes.map((v) => ({ nome: v.nome, comando: v.comando, padrao: v.id === variacaoPadrao(app)?.id })),
      })),
    })),
  }
  return { ok: true, texto, dados }
}

async function rodar(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  const { achado, onde } = await acharApp(pedido)
  const { app } = achado
  const variacao = acharVariacao(app, pedido.args.variacao)
  const lugar = await lugarDeRodar(app, pedido.args.local, onde)
  const nomes = nomesDosApps()
  const nome = `${app.nome} · ${variacao.nome}`

  const jaRoda = Object.values(useExecucoes.getState().execucoes).find(
    (e) => e.appId === app.id && e.variacaoId === variacao.id && estaAtiva(e) && mesmaPasta(e.pasta, lugar.pasta),
  )
  if (jaRoda) {
    return {
      ok: true,
      texto: `${nome} já estava rodando em ${jaRoda.local}, há ${duracao(Date.now() - jaRoda.inicio)}${jaRoda.url ? `: ${jaRoda.url}` : '.'}`,
      dados: dadosDaExecucao(jaRoda, nomes, useMonitor.getState().uso[jaRoda.id]),
    }
  }

  // O launcher passa a mostrar esta pasta em "Onde rodar", como se a pessoa a tivesse escolhido.
  if (!mesmaPasta(lugar.pasta, pastaDoApp(app))) {
    useConfig.getState().editarApp(app.id, { pastaAtual: lugar.principal ? undefined : lugar.pasta, localAtual: lugar.local })
  }

  if (variacao.noTerminal) {
    await api.abrirTerminal(lugar.pasta, variacao.comando, variacao.env)
    return { ok: true, texto: `${nome} abriu no Windows Terminal, fora do launcher (a variação está marcada para rodar lá).` }
  }

  const avisos = await avisosDaPasta(app, lugar.pasta)
  let execucao: Execucao
  try {
    execucao = await api.iniciarExecucao(pedidoDaVariacao(app, variacao, lugar, ORIGEM))
  } catch (erro) {
    throw new Recusa(`Não consegui rodar ${nome}: ${String(erro)}`)
  }
  useUi.getState().escolherAba(app.id, execucao.id)
  if (pedido.args.esperar === false) {
    return { ok: true, texto: `${nome} começou a rodar em ${lugar.local} (pid ${execucao.pid}).`, dados: dadosDaExecucao(execucao, nomes) }
  }
  const pronta = await esperarPronta(execucao.id, Boolean(variacao.url?.trim()))
  return relatorioDoInicio(pronta ?? execucao, app, nome, avisos, nomes)
}

async function parar(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  const nomes = nomesDosApps()
  const rodando = Object.values(useExecucoes.getState().execucoes).filter((e) => e.estado === 'rodando')
  let alvo: Execucao[]
  if (pedido.args.todas) {
    alvo = rodando
    if (alvo.length === 0) return { ok: true, texto: 'Nada rodando.' }
  } else {
    const { achado, onde } = await acharApp(pedido)
    alvo = execucoesDoApp(rodando, achado.app, pedido.args.variacao, onde)
    if (alvo.length === 0) return { ok: true, texto: `${achado.app.nome} não está rodando.` }
  }
  await Promise.all(alvo.map((e) => api.pararExecucao(e.id)))
  await esperar(() => alvo.every((e) => (useExecucoes.getState().execucoes[e.id]?.estado ?? 'encerrada') === 'encerrada'), ESPERA_DO_PARAR_MS)
  const lista = alvo.map((e) => `  ${titulo(e, nomes)}`).join('\n')
  return { ok: true, texto: `${alvo.length === 1 ? 'Parei' : `Parei ${alvo.length}`}:\n${lista}`, dados: { paradas: alvo.map((e) => e.id) } }
}

async function reiniciar(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  const { achado, onde } = await acharApp(pedido)
  const { app } = achado
  const recentes = Object.values(useExecucoes.getState().execucoes).sort((a, b) => b.inicio - a.inicio)
  const candidatas = execucoesDoApp(recentes, app, pedido.args.variacao, onde)
  const alvo = candidatas.find(estaAtiva) ?? candidatas[0]
  // Nunca rodou desde que o launcher abriu: reiniciar é rodar.
  if (!alvo) return rodar(pedido)

  const nomes = nomesDosApps()
  const nome = `${app.nome} · ${alvo.rotulo}`
  let nova: Execucao
  try {
    nova = await api.reiniciarExecucao(alvo.id)
  } catch (erro) {
    throw new Recusa(`Não consegui reiniciar ${nome}: ${String(erro)}`)
  }
  useUi.getState().escolherAba(app.id, nova.id)
  if (pedido.args.esperar === false) {
    return { ok: true, texto: `${nome} reiniciou em ${nova.local} (pid ${nova.pid}).`, dados: dadosDaExecucao(nova, nomes) }
  }
  const variacao = app.variacoes.find((v) => v.id === alvo.variacaoId)
  const pronta = await esperarPronta(nova.id, Boolean(variacao?.url?.trim()))
  return relatorioDoInicio(pronta ?? nova, app, nome, [], nomes)
}

async function saida(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  const { achado, onde } = await acharApp(pedido)
  const recentes = Object.values(useExecucoes.getState().execucoes).sort((a, b) => b.inicio - a.inicio)
  const candidatas = execucoesDoApp(recentes, achado.app, pedido.args.variacao, onde)
  const alvo = candidatas.find(estaAtiva) ?? candidatas[0]
  if (!alvo) return { ok: false, erro: `${achado.app.nome} não rodou desde que o launcher abriu.` }

  const n = Math.min(Math.max(1, Math.round(pedido.args.linhas ?? LINHAS_PADRAO)), MAX_LINHAS)
  const linhas = await ultimasLinhas(alvo.id, n)
  const nomes = nomesDosApps()
  const cabecalho = `${titulo(alvo, nomes)}: ${situacao(alvo)}${alvo.url ? ` · ${alvo.url}` : ''}`
  return {
    ok: true,
    texto: `${cabecalho}\n\n${linhas.length > 0 ? linhas.map((l) => l.texto).join('\n') : '(sem saída ainda)'}`,
    dados: { execucao: dadosDaExecucao(alvo, nomes, useMonitor.getState().uso[alvo.id]), linhas },
  }
}

async function abrir(pedido: PedidoDoCanal): Promise<RespostaDoCanal> {
  let nome = 'o vlauncher'
  if (pedido.args.app || pedido.pasta) {
    try {
      const { achado } = await acharApp(pedido)
      useUi.getState().abrirApp(achado.app.id)
      nome = `o painel de ${achado.app.nome}`
    } catch (erro) {
      // Sem o nome, a pasta era só um palpite: abre o launcher assim mesmo.
      if (pedido.args.app) throw erro
    }
  }
  await api.mostrarJanela()
  return { ok: true, texto: `Abri ${nome}.` }
}

// ---------------------------------------------------------------------------------------------
// O app, a worktree e a espera

/** O app do pedido: pelo nome ou, sem nome, pela pasta de onde o `vl` foi chamado. */
async function acharApp(pedido: PedidoDoCanal): Promise<{ achado: AppAchado; onde: OndeEsta | null }> {
  const config = useConfig.getState().config
  const pasta = pedido.pasta?.trim() || null
  const onde = pasta ? await api.ondeEsta(pasta).catch(() => null) : null
  const consulta = pedido.args.app?.trim()

  const achados = consulta ? appsPeloNome(config, consulta) : pasta ? appsDaPasta(config, pasta, onde) : []
  if (achados.length === 1) return { achado: achados[0]!, onde }
  if (achados.length > 1) {
    const nomes = achados.map(({ app }) => app.nome).join(', ')
    throw new Recusa(consulta ? `"${consulta}" pode ser ${nomes}: diga qual.` : `Nesta pasta há ${achados.length} apps (${nomes}): diga qual.`)
  }
  if (consulta) throw new Recusa(`Nenhum app do launcher se chama "${consulta}". ${quaisApps(config)}`)
  throw new Recusa(`Nenhum app do launcher${pasta ? ` em ${pasta}` : ''}: diga qual (vl rodar <app>). ${quaisApps(config)}`)
}

function quaisApps(config: Config) {
  const nomes = todosOsApps(config).map(({ app }) => app.nome)
  return nomes.length > 0 ? `Os apps: ${nomes.join(', ')}.` : 'O launcher ainda não tem apps.'
}

interface Lugar {
  pasta: string
  local: string
  principal: boolean
}

/**
 * Onde rodar: a worktree do `--local`; senão, a worktree de onde o `vl` foi chamado, se for do mesmo
 * repositório; senão, a escolhida no launcher.
 */
async function lugarDeRodar(app: App, local: string | undefined, onde: OndeEsta | null): Promise<Lugar> {
  if (local?.trim()) {
    const locais = await api.listarLocais(app.pasta)
    const w = acharWorktree(locais.worktrees, local.trim())
    if (!w) throw new Recusa(`${app.nome} não tem worktree de "${local}". Crie uma pelo launcher, em Onde rodar.`)
    if (!w.existe) throw new Recusa(`A pasta da worktree de "${local}" não existe mais.`)
    return { pasta: w.pasta, local: rotuloDaWorktree(w), principal: w.principal }
  }
  const naWorktree = onde && pastaNaWorktree(app, onde)
  if (onde && naWorktree) {
    return { pasta: naWorktree, local: onde.branch ?? `HEAD ${onde.head}`, principal: mesmaPasta(onde.raiz, onde.raizPrincipal) }
  }
  return { pasta: pastaDoApp(app), local: localDoApp(app), principal: !app.pastaAtual }
}

/** O que falta na pasta para o app rodar (o mesmo aviso de "Onde rodar"). */
async function avisosDaPasta(app: App, pasta: string): Promise<string[]> {
  const locais = await api.listarLocais(app.pasta).catch(() => null)
  const w = locais?.worktrees.find((x) => mesmaPasta(x.pasta, pasta))
  if (!w) return []
  const avisos: string[] = []
  if (w.precisaDependencias) avisos.push('a pasta está sem node_modules: instale as dependências (o launcher instala, em Onde rodar).')
  if (w.arquivosFaltando.length > 0) {
    avisos.push(`faltam ${w.arquivosFaltando.join(', ')}, que estão na pasta principal (o launcher copia, em Onde rodar).`)
  }
  return avisos
}

/** As execuções do app (da variação, se pedida). Rodando em mais de uma worktree, valem as da pasta de onde o `vl` foi chamado. */
function execucoesDoApp(execucoes: Execucao[], app: App, variacao: string | undefined, onde: OndeEsta | null) {
  let lista = execucoes.filter((e) => e.appId === app.id)
  if (variacao?.trim()) {
    const v = acharVariacao(app, variacao)
    lista = lista.filter((e) => e.variacaoId === v.id)
  }
  const aqui = onde && pastaNaWorktree(app, onde)
  if (lista.length > 1 && aqui) {
    const daqui = lista.filter((e) => mesmaPasta(e.pasta, aqui))
    if (daqui.length > 0) lista = daqui
  }
  return lista
}

/** Resolve quando a condição valer (conferida a cada mudança nas execuções) ou o tempo acabar. */
function esperar(condicao: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (condicao()) return resolve()
    const terminar = () => {
      window.clearTimeout(relogio)
      desligar()
      resolve()
    }
    const relogio = window.setTimeout(terminar, ms)
    const desligar = useExecucoes.subscribe(() => {
      if (condicao()) terminar()
    })
  })
}

/**
 * Espera o app anunciar o endereço, ou encerrar. Com o endereço fixo na variação, a execução já nasce
 * com ele: aí vale a primeira linha da saída que mostrar um localhost.
 */
async function esperarPronta(id: string, enderecoFixo: boolean): Promise<Execucao | undefined> {
  const agora = () => useExecucoes.getState().execucoes[id]
  await esperar(() => {
    const e = agora()
    if (!e || e.estado === 'encerrada') return true
    if (!enderecoFixo) return Boolean(e.url)
    return (useExecucoes.getState().linhas[id] ?? []).some((l) => PARECE_ENDERECO.test(l.texto))
  }, ESPERA_DO_ENDERECO_MS)
  return agora()
}

// ---------------------------------------------------------------------------------------------
// O texto das respostas

const nomesDosApps = () => new Map(todosOsApps(useConfig.getState().config).map(({ app }) => [app.id, app.nome]))

/** O nome como argumento do `vl` (entre aspas, se tiver espaço). */
const noComando = (nome: string) => (/\s/.test(nome) ? `"${nome}"` : nome)

const titulo = (e: Execucao, nomes: Map<string, string>) => `${nomes.get(e.appId) ?? 'app'} · ${e.rotulo} · ${e.local}`

function situacao(e: Execucao, agora = Date.now()) {
  if (e.estado === 'rodando') return `rodando há ${duracao(agora - e.inicio)}`
  if (e.estado === 'parando') return 'parando'
  const tempo = duracao((e.fim ?? agora) - e.inicio)
  if (e.parada) return `parada depois de ${tempo}`
  return `encerrou${e.codigo !== null ? ` com código ${e.codigo}` : ''} depois de ${tempo}`
}

function medidas(uso: Uso | undefined) {
  if (!uso) return []
  const r = [`CPU ${formatarCpu(uso.cpu)}`, formatarMemoria(uso.memoria)]
  if (uso.portas.length > 0) r.push(`${uso.portas.length === 1 ? 'porta' : 'portas'} ${uso.portas.join(', ')}`)
  return r
}

function descrever(e: Execucao, nomes: Map<string, string>, uso: Uso | undefined) {
  const detalhes = [situacao(e), e.url, ...medidas(uso), `pid ${e.pid}`, e.origem === ORIGEM ? 'pelo vl' : null].filter(Boolean)
  return `  ${titulo(e, nomes)}\n    ${detalhes.join(' · ')}\n    ${e.pasta}`
}

function dadosDaExecucao(e: Execucao, nomes: Map<string, string>, uso?: Uso) {
  return {
    id: e.id,
    app: nomes.get(e.appId) ?? null,
    variacao: e.rotulo,
    local: e.local,
    pasta: e.pasta,
    estado: e.estado,
    url: e.url,
    pid: e.pid,
    inicio: e.inicio,
    fim: e.fim,
    codigo: e.codigo,
    parada: e.parada,
    origem: e.origem,
    cpu: uso?.cpu ?? null,
    memoria: uso?.memoria ?? null,
    portas: uso?.portas ?? [],
  }
}

async function ultimasLinhas(id: string, n: number): Promise<Linha[]> {
  const linhas = await api.linhasDaExecucao(id).catch(() => useExecucoes.getState().linhas[id] ?? [])
  return linhas.slice(-n)
}

async function relatorioDoInicio(e: Execucao, app: App, nome: string, avisos: string[], nomes: Map<string, string>): Promise<RespostaDoCanal> {
  const linhas = await ultimasLinhas(e.id, 20)
  const dados = dadosDaExecucao(e, nomes, useMonitor.getState().uso[e.id])
  const saidaRecente = linhas.length > 0 ? `\n\nÚltimas linhas da saída:\n${linhas.map((l) => `  ${l.texto}`).join('\n')}` : ''
  const comAvisos = avisos.length > 0 ? `\n\n${avisos.map((a) => `Aviso: ${a}`).join('\n')}` : ''
  // Com mais de uma variação, a dica diz qual: sem ela, o vl saida mostraria a que estiver rodando.
  const alvo = `${noComando(app.nome)}${app.variacoes.length > 1 ? ` -v ${noComando(e.rotulo)}` : ''}`

  if (e.estado === 'encerrada') {
    if (!e.parada && e.codigo !== 0) {
      return { ok: false, erro: `${nome} ${situacao(e)}.`, texto: `Mais da saída: vl saida ${alvo} -n 200${saidaRecente}${comAvisos}`, dados }
    }
    return { ok: true, texto: `${nome} rodou e ${situacao(e)}.${saidaRecente}${comAvisos}`, dados }
  }
  const endereco = e.url
    ? `Endereço: ${e.url}`
    : `Ainda sem endereço na saída depois de ${ESPERA_DO_ENDERECO_MS / 1000} s (ele pode estar demorando, ou não anunciar um).`
  return {
    ok: true,
    texto: `${nome} rodando em ${e.local}.\n${endereco}\nPasta: ${e.pasta}\nA saída: vl saida ${alvo}; para parar: vl parar ${alvo}.${saidaRecente}${comAvisos}`,
    dados,
  }
}

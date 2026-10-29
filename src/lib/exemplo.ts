// A Api de mentira para o `pnpm dev` no navegador: dados de exemplo e execuções que imitam a saída
// do Vite. Não entra no app instalado (o api.ts só importa este arquivo fora do Tauri).

import type { Api } from './api'
import type { Config, Execucao, Linha, Locais, Projeto, Worktree } from './tipos'

const ouvintes = {
  estado: new Set<(e: Execucao) => void>(),
  linhas: new Set<(id: string, l: Linha[]) => void>(),
  removida: new Set<(id: string) => void>(),
}
const execucoes = new Map<string, { e: Execucao; linhas: Linha[]; timer?: number }>()
const imagens = new Map<string, string>()

// Projetos fictícios.
const configInicial: Config = {
  versao: 1,
  tema: 'escuro',
  grupos: [
    {
      id: 'g1',
      nome: 'Trabalho',
      pasta: 'D:\\projetos\\trabalho',
      apps: [
        {
          id: 'a1',
          nome: 'loja-online',
          descricao: 'A loja, com o checkout e o painel de pedidos',
          pasta: 'D:\\projetos\\trabalho\\loja-online',
          variacoes: [
            { id: 'v1', nome: 'dev:all', comando: 'npm run dev:all', env: [], abrirQuandoPronto: true, noTerminal: false },
            { id: 'v2', nome: 'preview', comando: 'npm run preview', env: [], abrirQuandoPronto: false, noTerminal: false },
          ],
          variacaoPadrao: 'v1',
        },
        {
          id: 'a2',
          nome: 'api-pagamentos',
          pasta: 'D:\\projetos\\trabalho\\api-pagamentos',
          variacoes: [{ id: 'v3', nome: 'dev', comando: 'pnpm dev', env: [], abrirQuandoPronto: false, noTerminal: false }],
        },
        {
          id: 'a3',
          nome: 'painel-admin',
          pasta: 'D:\\projetos\\trabalho\\painel-admin',
          variacoes: [
            { id: 'v4', nome: 'dev:all', comando: 'npm run dev:all', env: [], abrirQuandoPronto: false, noTerminal: false },
            { id: 'v5', nome: 'staging:all', comando: 'npm run staging:all', env: [], abrirQuandoPronto: false, noTerminal: false },
          ],
        },
        {
          id: 'a4',
          nome: 'auth-service',
          pasta: 'D:\\projetos\\trabalho\\auth-service',
          variacoes: [
            { id: 'v6', nome: 'docker (dev)', comando: 'docker compose -f docker-compose.dev.yml up', env: [], abrirQuandoPronto: false, noTerminal: false },
          ],
        },
      ],
    },
    {
      id: 'g2',
      nome: 'Pessoal',
      pasta: 'D:\\projetos\\pessoal',
      apps: [
        {
          id: 'a5',
          nome: 'site-pessoal',
          descricao: 'Portfólio e blog',
          pasta: 'D:\\projetos\\pessoal\\site-pessoal',
          variacoes: [{ id: 'v7', nome: 'dev', comando: 'pnpm dev', env: [], abrirQuandoPronto: true, noTerminal: false }],
        },
        {
          id: 'a6',
          nome: 'financas',
          pasta: 'D:\\projetos\\pessoal\\financas',
          variacoes: [{ id: 'v8', nome: 'dev', comando: 'npm run dev', env: [], abrirQuandoPronto: false, noTerminal: false }],
        },
      ],
    },
  ],
}

function salvo(): Config | null {
  try {
    const texto = localStorage.getItem('launcher-exemplo')
    return texto ? (JSON.parse(texto) as Config) : null
  } catch {
    return null
  }
}

const SAIDA_DO_VITE = [
  '> loja-online@1.0.0 dev:all',
  '> concurrently "npm run dev" "npm run dev:api"',
  '[1] [api] conectando no Postgres…',
  '[1] [api] Servidor em http://localhost:3001',
  '[0]   VITE v8.3.5  ready in 812 ms',
  '[0]   ➜  Local:   http://localhost:8080/',
  '[0]   ➜  Network: http://192.168.0.12:8080/',
]

function ouvir<T>(conjunto: Set<T>, cb: T) {
  conjunto.add(cb)
  return () => void conjunto.delete(cb)
}

function emitir(e: Execucao) {
  for (const cb of ouvintes.estado) cb({ ...e })
}

function iniciar(pedido: Parameters<Api['iniciarExecucao']>[0]): Execucao {
  const e: Execucao = {
    id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    appId: pedido.appId,
    variacaoId: pedido.variacaoId,
    rotulo: pedido.rotulo,
    local: pedido.local,
    pasta: pedido.pasta,
    comando: pedido.comando,
    pid: 1000 + Math.floor(Math.random() * 9000),
    inicio: Date.now(),
    fim: null,
    codigo: null,
    estado: 'rodando',
    parada: false,
    url: pedido.url,
  }
  const registro: { e: Execucao; linhas: Linha[]; timer?: number } = { e, linhas: [] }
  execucoes.set(e.id, registro)
  let i = 0
  registro.timer = window.setInterval(() => {
    const texto = i < SAIDA_DO_VITE.length ? SAIDA_DO_VITE[i]! : `[1] [api] GET /api/saude 200 em ${(Math.random() * 40).toFixed(0)} ms`
    const linha: Linha = { n: i, texto, erro: i === 2 && pedido.rotulo.includes('staging') }
    i++
    registro.linhas.push(linha)
    for (const cb of ouvintes.linhas) cb(e.id, [linha])
    if (!e.url && texto.includes('Local:')) {
      e.url = 'http://localhost:8080/'
      emitir(e)
    }
  }, 450)
  return e
}

export const exemplo: Api = {
  caminhoDados: async () => 'C:\\Users\\voce\\AppData\\Roaming\\br.com.viniciusventura.launcher',
  carregarConfig: async () => salvo() ?? structuredClone(configInicial),
  salvarConfig: async (config) => localStorage.setItem('launcher-exemplo', JSON.stringify(config)),
  importarImagem: async () => '',
  async importarImagemColada(bytes, extensao) {
    const nome = `${Date.now().toString(36)}.${extensao}`
    imagens.set(nome, URL.createObjectURL(new Blob([bytes as BlobPart], { type: `image/${extensao}` })))
    return nome
  },
  removerImagem: async (nome) => void imagens.delete(nome),
  urlDaImagem: (nome) => imagens.get(nome) ?? '',

  iniciarExecucao: async (pedido) => iniciar(pedido),
  async pararExecucao(id) {
    const r = execucoes.get(id)
    if (!r) return
    r.e.estado = 'parando'
    r.e.parada = true
    emitir(r.e)
    window.setTimeout(() => {
      window.clearInterval(r.timer)
      r.e.estado = 'encerrada'
      r.e.fim = Date.now()
      r.e.codigo = 1
      emitir(r.e)
    }, 500)
  },
  async pararTodas() {
    const rodando = [...execucoes.values()].filter((r) => r.e.estado === 'rodando')
    await Promise.all(rodando.map((r) => exemplo.pararExecucao(r.e.id)))
    return rodando.length
  },
  async reiniciarExecucao(id) {
    const r = execucoes.get(id)!
    window.clearInterval(r.timer)
    execucoes.delete(id)
    for (const cb of ouvintes.removida) cb(id)
    const { appId, variacaoId, rotulo, local, pasta, comando, url } = r.e
    return iniciar({ appId, variacaoId, rotulo, local, pasta, comando, url, env: [], abrirQuandoPronto: false })
  },
  async descartarExecucao(id) {
    window.clearInterval(execucoes.get(id)?.timer)
    execucoes.delete(id)
    for (const cb of ouvintes.removida) cb(id)
  },
  listarExecucoes: async () => [...execucoes.values()].map((r) => ({ ...r.e })),
  linhasDaExecucao: async (id) => execucoes.get(id)?.linhas ?? [],
  limparLinhas: async (id) => {
    const r = execucoes.get(id)
    if (r) r.linhas = []
  },

  async listarLocais(pasta): Promise<Locais> {
    const dia = 86400
    const agora = Date.now() / 1000
    const w = (x: Omit<Worktree, 'pasta'>): Worktree => ({ ...x, pasta: x.caminho })
    return {
      ehGit: true,
      subpasta: '',
      worktrees: [
        w({ caminho: pasta, branch: 'main', head: 'a5fd782cf', principal: true, podavel: false, travada: false, existe: true, precisaDependencias: false, arquivosFaltando: [], data: agora - 2 * dia }),
        w({ caminho: `${pasta}\\.claude\\worktrees\\feat-checkout-pix`, branch: 'feat/checkout-pix', head: 'e8af75467', principal: false, podavel: false, travada: false, existe: true, precisaDependencias: false, arquivosFaltando: [], data: agora - 3600 }),
        w({ caminho: `${pasta}\\.claude\\worktrees\\fix-frete-gratis`, branch: 'fix/frete-gratis', head: '654d10937', principal: false, podavel: false, travada: false, existe: true, precisaDependencias: true, arquivosFaltando: ['.env'], data: agora - 5 * 3600 }),
        w({ caminho: `${pasta}\\.claude\\worktrees\\revisao-release-1-4`, branch: null, head: 'd73bca15d', principal: false, podavel: false, travada: false, existe: true, precisaDependencias: false, arquivosFaltando: [], data: null }),
      ],
      branches: [
        { nome: 'develop', remota: false, data: agora - dia },
        { nome: 'feat/cupons-de-desconto', remota: false, data: agora - 4 * dia },
        { nome: 'origin/staging', remota: true, data: agora - 6 * dia },
      ],
    }
  },
  buscarBranches: async () => new Promise((r) => setTimeout(r, 800)),
  criarWorktree: async (repositorio, branch) => `${repositorio}\\.claude\\worktrees\\${branch.replace(/^origin\//, '').replaceAll('/', '-')}`,
  trocarBranch: async () => undefined,
  copiarArquivosLocais: async () => ['.env'],
  async inspecionarPasta(pasta): Promise<Projeto | null> {
    const nome = pasta.split('\\').pop() ?? pasta
    return {
      pasta,
      nome,
      ehGit: true,
      gerenciador: 'npm',
      tipo: 'node',
      sugestoes: [
        { nome: 'dev', comando: 'npm run dev' },
        { nome: 'dev:all', comando: 'npm run dev:all' },
        { nome: 'start', comando: 'npm run start' },
      ],
      outrosScripts: [{ nome: 'build', comando: 'npm run build' }],
    }
  },
  async escanearPasta(pasta) {
    const nomes = ['loja-online', 'api-pagamentos', 'painel-admin', 'auth-service', 'scripts-de-dados', 'design-system']
    const projetos = await Promise.all(nomes.map((n) => exemplo.inspecionarPasta(`${pasta}\\${n}`)))
    return projetos.filter((p): p is Projeto => p !== null)
  },

  abrirUrl: async (url) => void window.open(url, '_blank'),
  abrirPasta: async () => undefined,
  abrirVscode: async () => undefined,
  abrirTerminal: async () => undefined,
  abrirClaude: async (pasta, comando) => console.info('[exemplo] Claude Code:', comando, 'em', pasta),

  // Sem diálogos do navegador (eles travam a página): a pasta padrão e o "sim" direto.
  escolherPasta: async (_titulo, padrao) => padrao ?? 'D:\\projetos\\trabalho',
  escolherImagem: async () => null,
  async confirmar(mensagem) {
    console.info('[exemplo] confirmado:', mensagem)
    return true
  },
  definirTemaDaJanela: async () => undefined,
  definirDesfoqueDaJanela: async () => undefined,
  manterVidroAtivo: async () => undefined,

  aoMudarExecucao: async (cb) => ouvir(ouvintes.estado, cb),
  aoChegarLinhas: async (cb) => ouvir(ouvintes.linhas, cb),
  aoRemoverExecucao: async (cb) => ouvir(ouvintes.removida, cb),
  aoAbrirBusca: async () => () => undefined,
  aoArrastarArquivos: async () => () => undefined,
}

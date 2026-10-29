// O espelho das execuções que o Rust guarda: o estado de cada uma e as últimas linhas da saída.

import { create } from 'zustand'
import { api } from './api'
import { avisar, avisarErro } from './avisos'
import { useConfig } from './config'
import { nomeDaPasta } from './texto'
import type { App, Execucao, Linha, Variacao } from './tipos'

const MAX_LINHAS = 3000

interface EstadoExecucoes {
  execucoes: Record<string, Execucao>
  linhas: Record<string, Linha[]>
  conectar(): Promise<void>
  rodar(app: App, variacao: Variacao): Promise<Execucao | null>
  /** Um comando avulso na pasta do app (instalar dependências, por exemplo). */
  rodarComando(app: App, rotulo: string, comando: string, pasta?: string, local?: string): Promise<Execucao | null>
  parar(id: string): Promise<void>
  pararTodas(): Promise<void>
  reiniciar(id: string): Promise<Execucao | null>
  descartar(id: string): Promise<void>
  limpar(id: string): Promise<void>
}

export const pastaDoApp = (app: App) => app.pastaAtual ?? app.pasta
export const localDoApp = (app: App) => app.localAtual ?? (app.pastaAtual ? nomeDaPasta(app.pastaAtual) : 'pasta principal')
export const variacaoPadrao = (app: App) => app.variacoes.find((v) => v.id === app.variacaoPadrao) ?? app.variacoes[0]
export const estaAtiva = (e: Execucao) => e.estado !== 'encerrada'

let conectado = false

export const useExecucoes = create<EstadoExecucoes>()((set, get) => {
  const guardar = (e: Execucao) => set((s) => ({ execucoes: { ...s.execucoes, [e.id]: e } }))
  // A resposta do invoke pode chegar depois do evento (um comando que falha na hora já avisou que
  // encerrou): ela só entra se o evento ainda não trouxe a execução.
  const guardarSeNova = (e: Execucao) => set((s) => (s.execucoes[e.id] ? {} : { execucoes: { ...s.execucoes, [e.id]: e } }))
  const tirar = (id: string) =>
    set((s) => {
      const { [id]: _e, ...execucoes } = s.execucoes
      const { [id]: _l, ...linhas } = s.linhas
      return { execucoes, linhas }
    })

  async function iniciar(app: App, rotulo: string, comando: string, extra: Partial<Parameters<typeof api.iniciarExecucao>[0]>) {
    try {
      const e = await api.iniciarExecucao({
        appId: app.id,
        variacaoId: null,
        rotulo,
        local: localDoApp(app),
        pasta: pastaDoApp(app),
        comando,
        env: [],
        url: null,
        abrirQuandoPronto: false,
        ...extra,
      })
      guardarSeNova(e)
      return e
    } catch (erro) {
      avisarErro(erro)
      return null
    }
  }

  return {
    execucoes: {},
    linhas: {},

    async conectar() {
      if (conectado) return
      conectado = true
      await api.aoMudarExecucao(guardar)
      await api.aoRemoverExecucao(tirar)
      await api.aoChegarLinhas((id, novas) =>
        set((s) => {
          const todas = [...(s.linhas[id] ?? []), ...novas]
          return { linhas: { ...s.linhas, [id]: todas.length > MAX_LINHAS ? todas.slice(-MAX_LINHAS) : todas } }
        }),
      )
      // A interface recarregou (ou abriu agora): pega o que já está rodando, com a saída.
      const lista = await api.listarExecucoes()
      const linhas = Object.fromEntries(await Promise.all(lista.map(async (e) => [e.id, await api.linhasDaExecucao(e.id)] as const)))
      set({ execucoes: Object.fromEntries(lista.map((e) => [e.id, e])), linhas })
    },

    async rodar(app, variacao) {
      if (variacao.noTerminal) {
        try {
          await api.abrirTerminal(pastaDoApp(app), variacao.comando, variacao.env)
          avisar(`${app.nome} · ${variacao.nome} abriu no Terminal.`)
        } catch (erro) {
          avisarErro(erro)
        }
        return null
      }
      return iniciar(app, variacao.nome, variacao.comando, {
        variacaoId: variacao.id,
        env: variacao.env,
        url: variacao.url?.trim() || null,
        abrirQuandoPronto: variacao.abrirQuandoPronto,
      })
    },

    rodarComando: (app, rotulo, comando, pasta, local) =>
      iniciar(app, rotulo, comando, { ...(pasta && { pasta }), ...(local && { local }) }),

    async parar(id) {
      await api.pararExecucao(id).catch(avisarErro)
    },

    async pararTodas() {
      const rodando = Object.values(get().execucoes).filter((e) => e.estado === 'rodando')
      if (rodando.length === 0) return
      // Parar tudo derruba vários servidores de uma vez: pergunta antes, dizendo quais.
      const nomes = new Map(useConfig.getState().config.grupos.flatMap((g) => g.apps.map((a) => [a.id, a.nome] as const)))
      const lista = rodando.map((e) => `• ${nomes.get(e.appId) ?? 'app'} · ${e.rotulo} (${e.local})`).join('\n')
      const uma = rodando.length === 1
      const confirmou = await api.confirmar(
        `Tem certeza? ${uma ? 'Vai parar:' : `Vão parar as ${rodando.length}:`}\n\n${lista}`,
        uma ? 'Parar a execução' : 'Parar todas as execuções',
        uma ? 'Parar' : 'Parar todas',
      )
      if (!confirmou) return
      try {
        const quantas = await api.pararTodas()
        if (quantas > 0) avisar(quantas === 1 ? 'Parando 1 execução.' : `Parando ${quantas} execuções.`)
      } catch (erro) {
        avisarErro(erro)
      }
    },

    async reiniciar(id) {
      try {
        const nova = await api.reiniciarExecucao(id)
        tirar(id)
        guardarSeNova(nova)
        return nova
      } catch (erro) {
        avisarErro(erro)
        return null
      }
    },

    async descartar(id) {
      await api.descartarExecucao(id).catch(avisarErro)
      tirar(id)
    },

    async limpar(id) {
      await api.limparLinhas(id).catch(avisarErro)
      set((s) => ({ linhas: { ...s.linhas, [id]: [] } }))
    },
  }
})

/** O app saiu do launcher: o que ele tinha rodando para, e as execuções saem da lista. */
export async function descartarDoApp(...appIds: string[]) {
  const { execucoes, descartar } = useExecucoes.getState()
  await Promise.all(Object.values(execucoes).filter((e) => appIds.includes(e.appId)).map((e) => descartar(e.id)))
}

/** As execuções de um app, da mais nova para a mais antiga. */
export function useExecucoesDoApp(appId: string | null | undefined) {
  const execucoes = useExecucoes((s) => s.execucoes)
  return Object.values(execucoes)
    .filter((e) => e.appId === appId)
    .sort((a, b) => b.inicio - a.inicio)
}

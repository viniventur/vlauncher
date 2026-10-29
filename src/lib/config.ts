// Os grupos, os apps e as variações: o launcher.json. Cada mudança grava sozinha (300 ms depois da
// última), e a foto que sai de uso é apagada da pasta de imagens.

import { create } from 'zustand'
import { api } from './api'
import { novoId } from './ids'
import { normalizar } from './subgrupos'
import type { App, Config, ContaClaude, Grupo, Subgrupo, Tema } from './tipos'

const VAZIA: Config = { versao: 1, tema: 'escuro', grupos: [] }

interface EstadoConfig {
  pronto: boolean
  erro: string | null
  config: Config
  carregar(): Promise<void>
  definirTema(tema: Tema): void
  definirVidro(vidro: boolean): void
  definirTransparencia(transparencia: number): void
  definirDesfoque(desfoque: boolean): void
  definirContasClaude(contas: ContaClaude[]): void
  criarGrupo(dados: Omit<Grupo, 'id' | 'apps'>): string
  editarGrupo(id: string, dados: Partial<Omit<Grupo, 'id' | 'apps'>>): void
  removerGrupo(id: string): void
  ordenarGrupos(ids: string[]): void
  /** Recolhe (ou mostra) os apps de todos os grupos de uma vez. */
  recolherTodos(recolhido: boolean): void
  criarApp(grupoId: string, dados: Omit<App, 'id'>): string
  editarApp(id: string, dados: Partial<Omit<App, 'id'>>): void
  moverApp(id: string, grupoId: string): void
  removerApp(id: string): void
  /** O resultado de um arrasto: a ordem dos apps em cada grupo. */
  reorganizarApps(ordem: Record<string, string[]>): void
  /** Um subgrupo novo com esses apps (que saem de outro subgrupo, se estiverem num). */
  criarSubgrupo(grupoId: string, dados: { nome: string; apps: string[] }): string
  editarSubgrupo(id: string, dados: Partial<Omit<Subgrupo, 'id'>>): void
  /** A variação do app que entra no "rodar tudo" do subgrupo. */
  escolherVariacaoNoSubgrupo(id: string, appId: string, variacaoId: string): void
  /** Desfaz o subgrupo: os apps voltam soltos para a grade. */
  desfazerSubgrupo(id: string): void
  /** Leva o subgrupo, com os apps, para outro grupo. */
  moverSubgrupo(id: string, grupoId: string): void
}

export function acharApp(config: Config, id: string | null | undefined): { app: App; grupo: Grupo } | null {
  if (!id) return null
  for (const grupo of config.grupos) {
    const app = grupo.apps.find((a) => a.id === id)
    if (app) return { app, grupo }
  }
  return null
}

function apagarImagem(nome?: string) {
  if (nome) api.removerImagem(nome).catch(() => undefined)
}

export const useConfig = create<EstadoConfig>()((set, get) => {
  const mudar = (f: (c: Config) => Config) => set({ config: f(get().config) })
  // Mexeu nos apps (removeu, moveu, reordenou): os subgrupos perdem o app que saiu do grupo e se
  // desfazem com menos de dois.
  const mudarApps = (f: (apps: App[], grupo: Grupo) => App[]) =>
    mudar((c) => ({ ...c, grupos: c.grupos.map((g) => normalizar({ ...g, apps: f(g.apps, g) })) }))
  const grupoDoSubgrupo = (id: string) => get().config.grupos.find((g) => g.subgrupos?.some((s) => s.id === id))
  const mudarSubgrupos = (grupoId: string, f: (subgrupos: Subgrupo[]) => Subgrupo[]) =>
    mudar((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.id === grupoId ? normalizar({ ...g, subgrupos: f(g.subgrupos ?? []) }) : g)),
    }))
  // Os apps que entram num subgrupo saem de qualquer outro (um app fica em um só).
  const tirarDosOutros = (subgrupos: Subgrupo[], apps: string[], menos?: string) =>
    subgrupos.map((s) => (s.id === menos ? s : { ...s, apps: s.apps.filter((a) => !apps.includes(a)) }))

  return {
    pronto: false,
    erro: null,
    config: VAZIA,

    async carregar() {
      try {
        await api.caminhoDados()
        const salva = await api.carregarConfig()
        set({ config: { ...VAZIA, ...salva }, pronto: true })
      } catch (e) {
        set({ erro: String(e), pronto: true })
      }
    },

    definirTema: (tema) => mudar((c) => ({ ...c, tema })),
    definirVidro: (vidro) => mudar((c) => ({ ...c, vidro })),
    definirTransparencia: (n) => mudar((c) => ({ ...c, transparencia: Math.round(Math.min(100, Math.max(0, n))) })),
    definirDesfoque: (desfoque) => mudar((c) => ({ ...c, desfoque })),
    definirContasClaude: (contasClaude) => mudar((c) => ({ ...c, contasClaude })),

    criarGrupo(dados) {
      const id = novoId()
      mudar((c) => ({ ...c, grupos: [...c.grupos, { ...dados, id, apps: [] }] }))
      return id
    },

    editarGrupo(id, dados) {
      const antes = get().config.grupos.find((g) => g.id === id)
      if (antes && 'imagem' in dados && antes.imagem !== dados.imagem) apagarImagem(antes.imagem)
      mudar((c) => ({ ...c, grupos: c.grupos.map((g) => (g.id === id ? { ...g, ...dados } : g)) }))
    },

    removerGrupo(id) {
      const grupo = get().config.grupos.find((g) => g.id === id)
      if (!grupo) return
      apagarImagem(grupo.imagem)
      grupo.apps.forEach((a) => apagarImagem(a.imagem))
      mudar((c) => ({ ...c, grupos: c.grupos.filter((g) => g.id !== id) }))
    },

    recolherTodos: (recolhido) => mudar((c) => ({ ...c, grupos: c.grupos.map((g) => ({ ...g, recolhido })) })),

    ordenarGrupos(ids) {
      mudar((c) => ({
        ...c,
        grupos: ids.map((id) => c.grupos.find((g) => g.id === id)).filter((g): g is Grupo => Boolean(g)),
      }))
    },

    criarApp(grupoId, dados) {
      const id = novoId()
      mudar((c) => ({
        ...c,
        grupos: c.grupos.map((g) => (g.id === grupoId ? { ...g, apps: [...g.apps, { ...dados, id }] } : g)),
      }))
      return id
    },

    editarApp(id, dados) {
      const antes = acharApp(get().config, id)?.app
      if (antes && 'imagem' in dados && antes.imagem !== dados.imagem) apagarImagem(antes.imagem)
      mudarApps((apps) => apps.map((a) => (a.id === id ? { ...a, ...dados } : a)))
    },

    moverApp(id, grupoId) {
      const achado = acharApp(get().config, id)
      if (!achado || achado.grupo.id === grupoId) return
      mudar((c) => ({
        ...c,
        grupos: c.grupos.map((g) => {
          if (g.id === achado.grupo.id) return normalizar({ ...g, apps: g.apps.filter((a) => a.id !== id) })
          if (g.id === grupoId) return { ...g, apps: [...g.apps, achado.app] }
          return g
        }),
      }))
    },

    removerApp(id) {
      apagarImagem(acharApp(get().config, id)?.app.imagem)
      mudarApps((apps) => apps.filter((a) => a.id !== id))
    },

    reorganizarApps(ordem) {
      const todos = new Map(get().config.grupos.flatMap((g) => g.apps.map((a) => [a.id, a] as const)))
      mudar((c) => ({
        ...c,
        grupos: c.grupos.map((g) =>
          normalizar({
            ...g,
            apps: (ordem[g.id] ?? g.apps.map((a) => a.id)).map((id) => todos.get(id)).filter((a): a is App => Boolean(a)),
          }),
        ),
      }))
    },

    criarSubgrupo(grupoId, dados) {
      const id = novoId()
      mudarSubgrupos(grupoId, (subgrupos) => [...tirarDosOutros(subgrupos, dados.apps), { id, nome: dados.nome, apps: dados.apps }])
      return id
    },

    editarSubgrupo(id, dados) {
      const grupo = grupoDoSubgrupo(id)
      if (!grupo) return
      mudarSubgrupos(grupo.id, (subgrupos) => {
        const outros = dados.apps ? tirarDosOutros(subgrupos, dados.apps, id) : subgrupos
        return outros.map((s) => (s.id === id ? { ...s, ...dados } : s))
      })
    },

    escolherVariacaoNoSubgrupo(id, appId, variacaoId) {
      const subgrupo = grupoDoSubgrupo(id)?.subgrupos?.find((s) => s.id === id)
      if (subgrupo) get().editarSubgrupo(id, { variacoes: { ...subgrupo.variacoes, [appId]: variacaoId } })
    },

    desfazerSubgrupo(id) {
      const grupo = grupoDoSubgrupo(id)
      if (grupo) mudarSubgrupos(grupo.id, (subgrupos) => subgrupos.filter((s) => s.id !== id))
    },

    moverSubgrupo(id, grupoId) {
      const origem = grupoDoSubgrupo(id)
      const subgrupo = origem?.subgrupos?.find((s) => s.id === id)
      if (!origem || !subgrupo || origem.id === grupoId) return
      const levados = origem.apps.filter((a) => subgrupo.apps.includes(a.id))
      mudar((c) => ({
        ...c,
        grupos: c.grupos.map((g) => {
          if (g.id === origem.id) {
            return normalizar({ ...g, apps: g.apps.filter((a) => !subgrupo.apps.includes(a.id)), subgrupos: g.subgrupos?.filter((s) => s.id !== id) })
          }
          if (g.id === grupoId) return { ...g, apps: [...g.apps, ...levados], subgrupos: [...(g.subgrupos ?? []), subgrupo] }
          return g
        }),
      }))
    },
  }
})

// Grava sozinho: 300 ms depois da última mudança, e na hora se a janela for fechada.
let espera: number | undefined
function gravar() {
  window.clearTimeout(espera)
  espera = undefined
  const { config, pronto, erro } = useConfig.getState()
  // Com erro na leitura, não grava por cima do arquivo (ele fica para conserto à mão).
  if (pronto && !erro) api.salvarConfig(config).catch((e) => console.error('não gravou o launcher.json', e))
}
useConfig.subscribe((agora, antes) => {
  if (agora.config === antes.config || !antes.pronto) return
  window.clearTimeout(espera)
  espera = window.setTimeout(gravar, 300)
})
window.addEventListener('beforeunload', () => {
  if (espera !== undefined) gravar()
})

// O que está aberto na tela: o painel de um app ou de um subgrupo, o monitor, um diálogo, a busca.

import { create } from 'zustand'

export type Dialogo =
  | { tipo: 'grupo'; id?: string; pasta?: string; depoisImportar?: boolean }
  | { tipo: 'app'; id?: string; grupoId?: string; pasta?: string }
  | { tipo: 'importar'; grupoId: string }
  | { tipo: 'contas' }
  | { tipo: 'subgrupo'; id?: string; grupoId?: string }

interface EstadoUi {
  appAberto: string | null
  /** O painel de um subgrupo. Divide o lado direito com o painel do app e o monitor (um de cada vez). */
  subgrupoAberto: string | null
  /** O monitor (a CPU e a memória do que está rodando). */
  monitorAberto: boolean
  dialogo: Dialogo | null
  buscaAberta: boolean
  /** A aba de execução escolhida em cada app (e em cada subgrupo, pelo id dele). */
  abaDoApp: Record<string, string>
  abrirApp(id: string | null): void
  abrirSubgrupo(id: string | null): void
  abrirMonitor(aberto: boolean): void
  abrirDialogo(d: Dialogo | null): void
  abrirBusca(aberta: boolean): void
  escolherAba(appId: string, execucaoId: string): void
}

export const useUi = create<EstadoUi>()((set) => ({
  appAberto: null,
  subgrupoAberto: null,
  monitorAberto: false,
  dialogo: null,
  buscaAberta: false,
  abaDoApp: {},
  abrirApp: (appAberto) => set(appAberto ? { appAberto, subgrupoAberto: null, monitorAberto: false } : { appAberto }),
  abrirSubgrupo: (subgrupoAberto) =>
    set(subgrupoAberto ? { subgrupoAberto, appAberto: null, monitorAberto: false } : { subgrupoAberto }),
  abrirMonitor: (monitorAberto) => set(monitorAberto ? { monitorAberto, appAberto: null, subgrupoAberto: null } : { monitorAberto }),
  abrirDialogo: (dialogo) => set({ dialogo }),
  abrirBusca: (buscaAberta) => set({ buscaAberta }),
  escolherAba: (appId, execucaoId) => set((s) => ({ abaDoApp: { ...s.abaDoApp, [appId]: execucaoId } })),
}))

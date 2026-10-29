// O que está aberto na tela: o painel de um app, um diálogo, a busca.

import { create } from 'zustand'

export type Dialogo =
  | { tipo: 'grupo'; id?: string; pasta?: string; depoisImportar?: boolean }
  | { tipo: 'app'; id?: string; grupoId?: string; pasta?: string }
  | { tipo: 'importar'; grupoId: string }
  | { tipo: 'contas' }

interface EstadoUi {
  appAberto: string | null
  dialogo: Dialogo | null
  buscaAberta: boolean
  /** A aba de execução escolhida em cada app. */
  abaDoApp: Record<string, string>
  abrirApp(id: string | null): void
  abrirDialogo(d: Dialogo | null): void
  abrirBusca(aberta: boolean): void
  escolherAba(appId: string, execucaoId: string): void
}

export const useUi = create<EstadoUi>()((set) => ({
  appAberto: null,
  dialogo: null,
  buscaAberta: false,
  abaDoApp: {},
  abrirApp: (appAberto) => set({ appAberto }),
  abrirDialogo: (dialogo) => set({ dialogo }),
  abrirBusca: (buscaAberta) => set({ buscaAberta }),
  escolherAba: (appId, execucaoId) => set((s) => ({ abaDoApp: { ...s.abaDoApp, [appId]: execucaoId } })),
}))

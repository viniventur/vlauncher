// O monitor: a CPU e a memória de cada execução, de 2 em 2 s (src-tauri/src/monitor.rs), com os
// últimos 3 minutos guardados para os minigráficos.

import { create } from 'zustand'
import { api } from './api'
import type { Amostra, Uso } from './tipos'

/** 3 minutos, de 2 em 2 s. */
export const PONTOS = 90
export const INTERVALO_MS = 2000

export interface Ponto {
  /** Milissegundos desde 1970. */
  t: number
  cpu: number
  memoria: number
}

interface EstadoMonitor {
  /** A última amostra: a máquina e cada execução. */
  ultima: Amostra | null
  uso: Record<string, Uso>
  historico: Record<string, Ponto[]>
  /** A soma dos apps em cada amostra. */
  total: Ponto[]
  conectar(): Promise<void>
}

const juntar = (lista: Ponto[] | undefined, ponto: Ponto) => [...(lista ?? []), ponto].slice(-PONTOS)

/** O estado depois de uma amostra. O que parou de rodar sai (o histórico dele junto). */
export function registrar(antes: Pick<EstadoMonitor, 'historico' | 'total'>, amostra: Amostra) {
  const t = amostra.instante
  const uso: Record<string, Uso> = {}
  const historico: Record<string, Ponto[]> = {}
  for (const u of amostra.execucoes) {
    uso[u.id] = u
    historico[u.id] = juntar(antes.historico[u.id], { t, cpu: u.cpu, memoria: u.memoria })
  }
  const soma = amostra.execucoes.reduce((s, u) => ({ cpu: s.cpu + u.cpu, memoria: s.memoria + u.memoria }), { cpu: 0, memoria: 0 })
  const total = amostra.execucoes.length === 0 ? [] : juntar(antes.total, { t, ...soma })
  return { ultima: amostra, uso, historico, total }
}

let conectado = false

export const useMonitor = create<EstadoMonitor>()((set) => ({
  ultima: null,
  uso: {},
  historico: {},
  total: [],
  async conectar() {
    if (conectado) return
    conectado = true
    await api.aoAmostrar((amostra) => set((s) => registrar(s, amostra)))
  },
}))

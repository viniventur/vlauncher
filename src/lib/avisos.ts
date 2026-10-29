// Os avisos no canto da tela: o que deu certo some sozinho; erro fica um pouco mais.

import { create } from 'zustand'

export interface Aviso {
  id: number
  texto: string
  tipo: 'info' | 'erro'
}

interface EstadoAvisos {
  avisos: Aviso[]
  fechar(id: number): void
}

let proximo = 1

export const useAvisos = create<EstadoAvisos>()((set) => ({
  avisos: [],
  fechar: (id) => set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) })),
}))

export function avisar(texto: string, tipo: Aviso['tipo'] = 'info') {
  const id = proximo++
  useAvisos.setState((s) => ({ avisos: [...s.avisos.slice(-3), { id, texto, tipo }] }))
  window.setTimeout(() => useAvisos.getState().fechar(id), tipo === 'erro' ? 9000 : 4500)
}

/** Para os catch: a mensagem que o Rust devolveu, como aviso de erro. */
export function avisarErro(erro: unknown) {
  avisar(erro instanceof Error ? erro.message : String(erro), 'erro')
}

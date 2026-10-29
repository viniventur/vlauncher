// A transparência do liquid glass: o valor guardado (0 a 100) e os passos dos atalhos.

/** 22%: o que está atrás aparece sem atrapalhar a leitura (a opacidade de 78% de muito Windows Terminal). */
export const TRANSPARENCIA_PADRAO = 22

/** Os atalhos do Windows Terminal: Ctrl+Alt+= deixa mais opaca, Ctrl+Alt+- mais transparente e
 *  Ctrl+Alt+0 opaca. Pelo código da tecla, não pelo caractere: no ABNT2, Ctrl+Alt é o AltGr, e o
 *  AltGr+= vira "§". Devolve a transparência nova, ou null se a tecla não for de transparência. */
export function transparenciaPeloAtalho(codigo: string, atual: number): number | null {
  const limitar = (n: number) => Math.min(100, Math.max(0, n))
  if (codigo === 'Equal' || codigo === 'NumpadAdd') return limitar(atual - 5)
  if (codigo === 'Minus' || codigo === 'NumpadSubtract') return limitar(atual + 5)
  if (codigo === 'Digit0' || codigo === 'Numpad0') return 0
  return null
}

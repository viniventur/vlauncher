// A geometria do arrastar na galeria: em que faixa da prancha o ponteiro está. No meio da capa, o app
// arrastado junta com ela (como no iPhone); do lado de lá (o oposto ao de onde ele veio), passa para
// depois dela; do lado de cá, fica antes, sem tirá-la do lugar. Assim, parar no meio não reordena.

/** A capa é 16:10; embaixo dela vêm o nome e a linha de baixo. */
const ALTURA_DA_CAPA = 10 / 16
/** A faixa do meio, na largura, em que o app junta. */
const MEIO = [0.3, 0.7] as const

export type Zona = 'perto' | 'centro' | 'longe'

interface Retangulo {
  left: number
  top: number
  width: number
}

/**
 * A faixa da prancha sob o ponteiro. `vemDeAntes`: o app arrastado está antes dela na grade (o lado de
 * lá, então, é a direita); `undefined` quando ele vem de outro grupo (fora do meio, tudo é lado de lá).
 */
export function zonaNaPrancha(prancha: Retangulo, ponto: { x: number; y: number }, vemDeAntes: boolean | undefined): Zona {
  const fracao = (ponto.x - prancha.left) / prancha.width
  const naCapa = ponto.y >= prancha.top && ponto.y <= prancha.top + prancha.width * ALTURA_DA_CAPA
  if (naCapa && fracao >= MEIO[0] && fracao <= MEIO[1]) return 'centro'
  if (vemDeAntes === undefined) return 'longe'
  return fracao >= 0.5 === vemDeAntes ? 'longe' : 'perto'
}

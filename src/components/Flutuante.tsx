// O que abre por cima, preso a um botão: menus e o seletor de onde rodar. Fecha com Esc, com um
// clique fora ou quando uma ação do conteúdo pede.

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode
  children: (fechar: () => void) => ReactNode
  /** De que lado do gatilho o conteúdo se alinha. */
  lado?: 'esquerda' | 'direita'
  className?: string
}

export function Flutuante({ gatilho, children, lado = 'esquerda', className = '' }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAberto(false)
      }
    }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla, true)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla, true)
    }
  }, [aberto])

  return (
    <div ref={raiz} className="relative">
      {gatilho(() => setAberto((a) => !a), aberto)}
      {aberto && (
        <div
          className={`vidro vidro-opaco entra-baixo absolute top-full z-40 mt-2 rounded-lg border border-linha bg-elevada ${lado === 'direita' ? 'right-0' : 'left-0'} ${className}`}
        >
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  )
}

export interface ItemDeMenu {
  rotulo: string
  icone?: ReactNode
  /** Um complemento à direita, em código (o comando que o item roda, por exemplo). */
  detalhe?: string
  acao: () => void
  perigo?: boolean
}

interface PropsMenu {
  itens: (ItemDeMenu | null)[]
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode
  /** A pergunta em cima das opções. */
  titulo?: string
  lado?: 'esquerda' | 'direita'
}

export function Menu({ itens, gatilho, titulo, lado = 'direita' }: PropsMenu) {
  return (
    <Flutuante gatilho={gatilho} lado={lado} className="min-w-56 py-1.5">
      {(fechar) => (
        <ul role="menu" aria-label={titulo}>
          {titulo && (
            <li role="none" className="secao px-3.5 pt-1 pb-1.5">
              {titulo}
            </li>
          )}
          {itens.map((item, i) =>
            item ? (
              <li key={item.rotulo} role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    fechar()
                    item.acao()
                  }}
                  className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-apoio transition-colors hover:bg-[color-mix(in_oklch,var(--texto)_8%,transparent)] ${item.perigo ? 'text-erro' : 'text-texto'}`}
                >
                  <span className="grid w-4 place-items-center text-texto-3 [&>svg]:size-4">{item.icone}</span>
                  {item.rotulo}
                  {item.detalhe && <span className="ml-auto pl-6 font-mono text-codigo whitespace-nowrap text-texto-3">{item.detalhe}</span>}
                </button>
              </li>
            ) : (
              <li key={`separador-${i}`} aria-hidden="true" className="my-1.5 border-t border-linha" />
            ),
          )}
        </ul>
      )}
    </Flutuante>
  )
}

// A foto de um app ou de um grupo. Uma foto ou um print cobrem o quadro; um logo entra inteiro numa
// prancha branca, como as figuras do site. Sem foto, uma capa tipográfica: as iniciais em itálico,
// na superfície, como a prancha vazia de uma galeria.

import { api } from '../lib/api'
import { iniciais } from '../lib/texto'
import type { Ajuste } from '../lib/tipos'

interface Props {
  nome: string
  imagem?: string
  ajuste?: Ajuste
  className?: string
  /** Tamanho das iniciais (a capa pequena do grupo usa menos). */
  tamanho?: 'grande' | 'pequena'
}

export function Capa({ nome, imagem, ajuste = 'preencher', className = '', tamanho = 'grande' }: Props) {
  if (imagem) {
    const inteira = ajuste === 'inteira'
    return (
      <div className={`overflow-hidden ${inteira ? 'bg-branco' : 'bg-superficie'} ${className}`}>
        <img
          src={api.urlDaImagem(imagem)}
          alt=""
          draggable={false}
          className={`size-full ${inteira ? `object-contain ${tamanho === 'grande' ? 'p-[9%]' : 'p-[7%]'}` : 'object-cover'}`}
        />
      </div>
    )
  }
  return (
    <div
      className={`vidro grid place-items-center overflow-hidden bg-superficie text-texto-3 ${className}`}
      aria-hidden="true"
    >
      <span
        className={`font-medium italic leading-none tracking-[-0.02em] ${tamanho === 'grande' ? 'text-[3.25rem]' : 'text-[1.05rem]'}`}
      >
        {iniciais(nome)}
      </span>
    </div>
  )
}

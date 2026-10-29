// O diálogo modal (o <dialog> nativo: prende o foco e fecha com Esc).

import { X } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'

interface Props {
  titulo: string
  subtitulo?: ReactNode
  aoFechar: () => void
  aoEnviar?: () => void
  rodape?: ReactNode
  largura?: string
  children: ReactNode
}

export function Dialogo({ titulo, subtitulo, aoFechar, aoEnviar, rodape, largura = '42rem', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d || d.open) return
    d.showModal()
    // O showModal põe o foco no primeiro elemento focável, que é o fechar: o certo é o primeiro campo.
    d.querySelector<HTMLElement>('[data-autofoco], input, select, textarea')?.focus()
  }, [])

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    aoEnviar?.()
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar()
      }}
      style={{ width: `min(${largura}, calc(100vw - 2rem))` }}
      className="vidro vidro-opaco entra-baixo m-auto max-h-[min(52rem,calc(100vh-3rem))] overflow-hidden rounded-xl border border-linha bg-elevada p-0 text-texto backdrop:bg-veu backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={enviar} className="flex max-h-[inherit] flex-col">
        <header className="flex items-start gap-4 px-7 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-titulo">{titulo}</h2>
            {subtitulo && <p className="mt-1 text-apoio text-texto-2">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} className="icone-botao -mr-2" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6">{children}</div>
        {rodape && <footer className="flex items-center gap-3 border-t border-linha px-7 py-4">{rodape}</footer>}
      </form>
    </dialog>
  )
}

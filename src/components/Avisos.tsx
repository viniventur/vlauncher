import { X } from 'lucide-react'
import { useAvisos } from '../lib/avisos'

export function Avisos() {
  const avisos = useAvisos((s) => s.avisos)
  const fechar = useAvisos((s) => s.fechar)
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-50 grid w-[min(28rem,calc(100vw-2.5rem))] gap-2" aria-live="polite">
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tipo === 'erro' ? 'alert' : 'status'}
          className="vidro vidro-opaco entra-baixo pointer-events-auto flex items-start gap-3 rounded-lg border border-linha bg-elevada py-2.5 pr-2 pl-4 text-apoio"
        >
          <span className={`mt-[0.45rem] size-2 shrink-0 rounded-full ${a.tipo === 'erro' ? 'bg-erro' : 'bg-destaque'}`} />
          <p className="min-w-0 flex-1 break-words" data-selecionavel>
            {a.texto}
          </p>
          <button className="icone-botao pequeno -my-1" onClick={() => fechar(a.id)} aria-label="Fechar o aviso">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

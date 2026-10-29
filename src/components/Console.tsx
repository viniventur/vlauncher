// A saída de uma execução. Fica no escuro nos dois temas (é um terminal) e acompanha o fim enquanto
// a pessoa não sobe para ler; os erros aparecem no magenta da marca.

import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useExecucoes } from '../lib/execucoes'
import type { Linha } from '../lib/tipos'

const PARECE_ERRO = /\b(error|erro|errors|failed|falhou|exception|fatal|ERR!|EADDRINUSE|ELIFECYCLE)\b/i
const VAZIO: never[] = []

export function Console({ id }: { id: string }) {
  const linhas = useExecucoes((s) => s.linhas[id] ?? VAZIO)
  const caixa = useRef<HTMLDivElement>(null)
  const [noFim, setNoFim] = useState(true)

  useLayoutEffect(() => {
    const c = caixa.current
    if (c && noFim) c.scrollTop = c.scrollHeight
  }, [linhas, noFim])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={caixa}
        data-selecionavel
        onScroll={(e) => {
          const c = e.currentTarget
          setNoFim(c.scrollHeight - c.scrollTop - c.clientHeight < 24)
        }}
        className="absolute inset-0 overflow-auto rounded-md bg-console px-4 py-3 font-mono text-codigo text-giz-2"
        role="log"
        aria-live="off"
      >
        {linhas.length === 0 ? (
          <p className="text-giz-3 italic">Sem saída ainda.</p>
        ) : (
          linhas.map((l) => <LinhaDaSaida key={l.n} linha={l} />)
        )}
      </div>
      {!noFim && (
        <button
          onClick={() => setNoFim(true)}
          className="aparece absolute right-4 bottom-3 rounded-full bg-escuro-2 px-3 py-1 text-legenda font-semibold text-giz-1 hover:bg-escuro-15"
        >
          Ir para o fim
        </button>
      )}
    </div>
  )
}

// As linhas não mudam depois de chegar: memo evita refazer as antigas a cada lote novo.
const LinhaDaSaida = memo(function LinhaDaSaida({ linha }: { linha: Linha }) {
  return (
    <div className={`whitespace-pre-wrap break-words ${PARECE_ERRO.test(linha.texto) ? 'text-magenta-claro' : ''}`}>
      {linha.texto || ' '}
    </div>
  )
})

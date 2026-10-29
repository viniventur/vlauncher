// O liquid glass, na gota do topo: o interruptor, a transparência da janela (de 0, opaca, a 100%,
// só o vidro) e o desfoque do que está atrás dela (o acrylic do Windows). Os atalhos são os do Windows
// Terminal: Ctrl+Alt+= e Ctrl+Alt+- mudam de 5 em 5; Ctrl+Alt+0 deixa opaca.

import { Droplet } from 'lucide-react'
import { useConfig } from '../lib/config'
import { TRANSPARENCIA_PADRAO } from '../lib/vidro'
import { Flutuante } from './Flutuante'

export function AjusteDoVidro() {
  const vidro = useConfig((s) => Boolean(s.config.vidro))
  const transparencia = useConfig((s) => s.config.transparencia ?? TRANSPARENCIA_PADRAO)
  const desfoque = useConfig((s) => s.config.desfoque ?? true)
  const { definirVidro, definirTransparencia, definirDesfoque } = useConfig.getState()

  return (
    <Flutuante
      lado="direita"
      className="w-80 p-5"
      gatilho={(abrir, aberto) => (
        <button
          className={`icone-botao ${vidro ? 'bg-[color-mix(in_oklch,var(--destaque)_16%,transparent)] text-destaque hover:text-destaque' : ''}`}
          onClick={abrir}
          aria-expanded={aberto}
          aria-label="Liquid glass"
          title={vidro ? `Liquid glass: ${transparencia}% transparente` : 'Liquid glass'}
        >
          <Droplet className={`size-[1.1rem] ${vidro ? 'fill-current' : ''}`} />
        </button>
      )}
    >
      {() => (
        <div className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-semibold">Liquid glass</span>
              <span className="block text-legenda text-texto-3">No claro ou no escuro</span>
            </span>
            <Interruptor ligado={vidro} aoMudar={definirVidro} rotulo="Liquid glass" />
          </div>

          <div className={`grid gap-2 transition-opacity ${vidro ? '' : 'opacity-40'}`}>
            <span className="flex items-baseline justify-between text-apoio">
              <span>Transparência</span>
              <span className="font-semibold">{transparencia}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={transparencia}
              disabled={!vidro}
              onChange={(e) => definirTransparencia(Number(e.target.value))}
              aria-label="Transparência da janela"
              aria-valuetext={`${transparencia}% transparente`}
              className="w-full accent-[var(--destaque)] disabled:cursor-not-allowed"
            />
            <span className="flex justify-between text-legenda text-texto-3">
              <span>opaca</span>
              <span>só o vidro</span>
            </span>
          </div>

          <label className={`flex items-start gap-2.5 text-apoio transition-opacity ${vidro ? '' : 'opacity-40'}`}>
            <input
              type="checkbox"
              checked={desfoque}
              disabled={!vidro}
              onChange={(e) => definirDesfoque(e.target.checked)}
              className="mt-[0.2rem] size-4 shrink-0 accent-[var(--destaque)]"
            />
            <span>
              Desfocar o que está atrás
              <span className="block text-legenda text-texto-3">
                O acrylic do Windows. Sem ele, a transparência é pura.
              </span>
            </span>
          </label>

          <p className="border-t border-linha pt-3 text-legenda text-texto-3">
            Ctrl+Alt+= e Ctrl+Alt+− mudam de 5 em 5; Ctrl+Alt+0 deixa opaca. Os do Windows Terminal.
          </p>
        </div>
      )}
    </Flutuante>
  )
}

function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <button
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${ligado ? 'bg-botao' : 'bg-[color-mix(in_oklch,var(--texto)_22%,transparent)]'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-transform duration-200 ease-[var(--ease-quart)] ${ligado ? 'translate-x-5 bg-texto-botao' : 'bg-texto'}`}
      />
    </button>
  )
}

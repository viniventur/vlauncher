// Um minigráfico: os últimos minutos de uma medida (a CPU ou a memória de um app), do mais antigo, à
// esquerda, até agora, à direita. A linha fica no cinza das legendas, com um véu de 10% embaixo, e só o
// ponto de agora vai no ciano: é o valor vivo. A escala começa no zero (uma oscilação pequena não
// vira pico) e o passo é fixo, de 2 em 2 s: com pouco histórico, a linha cresce a partir da direita.
// O mouse, ou as setas com o foco, mostram o valor de cada instante.

import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { PONTOS } from '../lib/monitor'

interface Props {
  /** Do mais antigo ao mais novo. */
  valores: number[]
  /** O instante de cada valor (ms). */
  instantes: number[]
  /** O topo da escala. Os minigráficos lado a lado dividem o mesmo, para dar para comparar. */
  teto: number
  formatar: (valor: number) => string
  /** "CPU de loja-online": o que o gráfico mede, para quem não o vê. */
  rotulo: string
  altura?: number
  /** A cor do anel em volta dos pontos: a da superfície embaixo. */
  fundo?: string
}

const MARGEM = 6

function haQuanto(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 2) return 'agora'
  if (s < 60) return `há ${s} s`
  const min = Math.floor(s / 60)
  return s % 60 ? `há ${min} min ${s % 60} s` : `há ${min} min`
}

export function Minigrafico({ valores, instantes, teto, formatar, rotulo, altura = 32, fundo = 'var(--elevada)' }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  const [foco, setFoco] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setLargura(el.clientWidth)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const n = valores.length
  const passo = Math.max(0, largura - 2 * MARGEM) / (PONTOS - 1)
  const x = (i: number) => largura - MARGEM - (n - 1 - i) * passo
  const base = altura - 1.5
  const y = (v: number) => base - (Math.min(Math.max(v, 0), teto) / (teto || 1)) * (base - MARGEM)

  const linha = valores.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = n > 1 ? `${linha}L${x(n - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z` : ''
  const ultimo = n > 0 ? valores[n - 1]! : null
  const maximo = n > 0 ? Math.max(...valores) : null

  const escolher = (indice: number) => setFoco(Math.min(n - 1, Math.max(0, indice)))
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0 || passo === 0) return
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    escolher(Math.round(n - 1 - (largura - MARGEM - px) / passo))
  }

  const focado = foco !== null && foco < n ? foco : null
  const xFoco = focado !== null ? x(focado) : 0
  const lido = focado ?? n - 1
  const quando = (i: number) => haQuanto((instantes[n - 1] ?? 0) - (instantes[i] ?? 0))
  // Para o teclado e o leitor de tela, o gráfico é um cursor no tempo (um range invisível por cima):
  // as setas andam pelos instantes, e cada um é lido com o valor.
  const leitura =
    ultimo === null || maximo === null
      ? 'ainda sem medidas'
      : `${formatar(valores[lido]!)}, ${quando(lido)}; o máximo foi ${formatar(maximo)}`

  return (
    <div
      ref={caixa}
      onPointerMove={aoMover}
      onPointerLeave={() => setFoco(null)}
      className="relative w-full rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-destaque"
      style={{ height: altura }}
    >
      <input
        type="range"
        min={0}
        max={Math.max(0, n - 1)}
        step={1}
        value={Math.max(0, lido)}
        disabled={n === 0}
        aria-label={rotulo}
        aria-valuetext={leitura}
        onChange={(e) => escolher(Number(e.target.value))}
        onFocus={() => n > 0 && setFoco(n - 1)}
        onBlur={() => setFoco(null)}
        className="absolute inset-0 m-0 size-full cursor-default opacity-0"
      />
      {largura > 0 && (
        <svg width={largura} height={altura} className="overflow-visible" aria-hidden>
          <line x1={0} x2={largura} y1={base + 0.5} y2={base + 0.5} stroke="var(--linha)" strokeWidth={1} />
          {area && <path d={area} fill="var(--texto-3)" fillOpacity={0.1} />}
          {n > 1 && <path d={linha} fill="none" stroke="var(--texto-3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {focado !== null && <line x1={xFoco} x2={xFoco} y1={MARGEM - 3} y2={base} stroke="var(--texto-3)" strokeWidth={1} />}
          {ultimo !== null && <circle cx={x(n - 1)} cy={y(ultimo)} r={4} fill="var(--destaque)" stroke={fundo} strokeWidth={2} />}
          {focado !== null && focado !== n - 1 && <circle cx={xFoco} cy={y(valores[focado]!)} r={4} fill="var(--texto)" stroke={fundo} strokeWidth={2} />}
        </svg>
      )}
      {focado !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded-md bg-texto px-2 py-1 text-legenda whitespace-nowrap text-fundo"
          style={{ left: Math.min(Math.max(xFoco, 44), largura - 44) }}
        >
          <strong className="font-semibold">{formatar(valores[focado]!)}</strong> <span className="opacity-70">{quando(focado)}</span>
        </div>
      )}
    </div>
  )
}

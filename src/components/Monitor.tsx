// O monitor: quanto cada app rodando pesa na máquina. A CPU e a memória de agora e dos últimos 3
// minutos, as portas e os processos de cada execução, e a soma de todos ao lado do que a máquina
// inteira está usando. Abre pelo "N rodando" do topo (ou pela busca), no lado direito, no lugar do
// painel de um app. Mede como o Gerenciador de Tarefas (src-tauri/src/monitor.rs).

import { ChevronRight, ExternalLink, RotateCcw, Square, SquareTerminal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { acharApp, useConfig } from '../lib/config'
import { estaAtiva, useExecucoes } from '../lib/execucoes'
import { useMonitor, type Ponto } from '../lib/monitor'
import { duracao, formatarCpu, formatarMemoria, urlCurta } from '../lib/texto'
import type { Execucao, Uso } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Minigrafico } from './Minigrafico'

const VAZIO: Ponto[] = []
const MB = 1024 ** 2

/** O topo da escala de um grupo de séries: o maior valor, com folga, e nunca menos que `minimo`. */
const tetoDe = (series: number[][], minimo: number) => Math.max(minimo, ...series.flat().map((v) => v * 1.12))

export function Monitor() {
  const aberto = useUi((s) => s.monitorAberto)
  const abrirMonitor = useUi((s) => s.abrirMonitor)
  const algumDialogo = useUi((s) => s.dialogo !== null || s.buscaAberta)

  useEffect(() => {
    if (!aberto || algumDialogo) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) abrirMonitor(false)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, algumDialogo, abrirMonitor])

  if (!aberto) return null
  return (
    <>
      <div
        role="presentation"
        className="veu-painel aparece fixed inset-0 z-20 bg-[color-mix(in_oklch,var(--fundo)_45%,transparent)]"
        onClick={() => abrirMonitor(false)}
      />
      <aside
        className="vidro vidro-opaco entra-painel fixed top-0 right-0 bottom-0 z-30 flex w-[min(58rem,74vw)] flex-col border-l border-linha bg-elevada"
        aria-label="Monitor"
      >
        <ConteudoDoMonitor />
      </aside>
    </>
  )
}

function ConteudoDoMonitor() {
  const abrirMonitor = useUi((s) => s.abrirMonitor)
  const execucoes = useExecucoes((s) => s.execucoes)
  const historico = useMonitor((s) => s.historico)
  const ativas = useMemo(() => Object.values(execucoes).filter(estaAtiva).sort((a, b) => a.inicio - b.inicio), [execucoes])

  // As linhas dividem a escala: dá para ver qual app pesa mais só de bater o olho.
  const series = ativas.map((e) => historico[e.id] ?? VAZIO)
  const tetoCpu = tetoDe(series.map((s) => s.map((p) => p.cpu)), 5)
  const tetoMemoria = tetoDe(series.map((s) => s.map((p) => p.memoria)), 256 * MB)

  return (
    <>
      <header className="flex items-start gap-6 px-8 pt-7 pb-6">
        <div className="min-w-0 flex-1">
          <p className="text-legenda text-texto-3">
            {ativas.length === 0 ? 'nada rodando' : `${ativas.length} rodando · medido de 2 em 2 s, como no Gerenciador de Tarefas`}
          </p>
          <h2 className="text-titulo">Monitor</h2>
        </div>
        <button className="icone-botao -mt-2 -mr-3" onClick={() => abrirMonitor(false)} aria-label="Fechar o monitor" title="Fechar (Esc)">
          <X className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-9 overflow-y-auto px-8 pb-8">
        {ativas.length === 0 ? (
          <div className="max-w-[34rem] py-4">
            <p className="text-subtitulo">Nada rodando agora.</p>
            <p className="mt-2 text-apoio text-texto-2">
              Quando um app rodar, pela galeria, pela busca ou pelo terminal (<code className="font-mono text-codigo">vl rodar</code>), a CPU, a
              memória e as portas dele aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <Resumo />
            <section>
              <h3 className="secao mb-1">Execuções</h3>
              <ul className="divide-y divide-linha border-b border-linha">
                {ativas.map((e) => (
                  <LinhaDaExecucao key={e.id} execucao={e} tetoCpu={tetoCpu} tetoMemoria={tetoMemoria} />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  )
}

/** A soma dos apps (agora e nos últimos minutos), ao lado do que a máquina inteira usa. */
function Resumo() {
  const total = useMonitor((s) => s.total)
  const ultima = useMonitor((s) => s.ultima)
  const atual = total.at(-1)
  if (!ultima || !atual) return <p className="text-apoio text-texto-3">Medindo…</p>

  const instantes = total.map((p) => p.t)
  return (
    <div className="grid grid-cols-2 gap-x-10 gap-y-6">
      <Ficha
        rotulo="CPU dos apps"
        valor={formatarCpu(atual.cpu)}
        serie={total.map((p) => p.cpu)}
        instantes={instantes}
        teto={tetoDe([total.map((p) => p.cpu)], 5)}
        formatar={formatarCpu}
        partes={[atual.cpu, Math.max(0, ultima.cpuMaquina - atual.cpu)]}
        capacidade={100}
        maquina={`a máquina: ${formatarCpu(ultima.cpuMaquina)}, com ${ultima.nucleos} núcleos`}
      />
      <Ficha
        rotulo="Memória dos apps"
        valor={formatarMemoria(atual.memoria)}
        serie={total.map((p) => p.memoria)}
        instantes={instantes}
        teto={tetoDe([total.map((p) => p.memoria)], 256 * MB)}
        formatar={formatarMemoria}
        partes={[atual.memoria, Math.max(0, ultima.memoriaUsada - atual.memoria)]}
        capacidade={ultima.memoriaTotal}
        maquina={`a máquina: ${formatarMemoria(ultima.memoriaUsada)} de ${formatarMemoria(ultima.memoriaTotal)}`}
      />
    </div>
  )
}

interface PropsFicha {
  rotulo: string
  valor: string
  serie: number[]
  instantes: number[]
  teto: number
  formatar: (v: number) => string
  /** [os apps, o resto da máquina], na unidade da capacidade. */
  partes: [number, number]
  capacidade: number
  maquina: string
}

function Ficha({ rotulo, valor, serie, instantes, teto, formatar, partes, capacidade, maquina }: PropsFicha) {
  const [apps, outros] = partes
  const livre = Math.max(0, capacidade - apps - outros)
  const fatia = (v: number) => `${capacidade > 0 ? (v / capacidade) * 100 : 0}%`
  return (
    <div className="min-w-0">
      <h3 className="secao">{rotulo}</h3>
      <div className="mt-1 flex items-end gap-5">
        <p className="text-[2rem] leading-none font-semibold [font-variant-numeric:proportional-nums]">{valor}</p>
        <div className="min-w-0 flex-1">
          <Minigrafico valores={serie} instantes={instantes} teto={teto} formatar={formatar} rotulo={rotulo} altura={40} />
        </div>
      </div>
      {/* A capacidade da máquina, de ponta a ponta: os apps, o resto do que está em uso e o livre. Os
          números estão no texto (o valor acima, a máquina abaixo): a barra só os mostra juntos. */}
      <div aria-hidden className="mt-4 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
        <span className="rounded-[2px] bg-destaque" style={{ width: fatia(apps), minWidth: apps > 0 ? 3 : 0 }} />
        <span className="rounded-[2px] bg-[color-mix(in_oklch,var(--texto)_42%,transparent)]" style={{ width: fatia(outros) }} />
        <span className="flex-1 rounded-[2px] bg-[color-mix(in_oklch,var(--texto)_10%,transparent)]" style={{ minWidth: livre > 0 ? 2 : 0 }} />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-legenda text-texto-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-destaque" /> os apps
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[color-mix(in_oklch,var(--texto)_42%,transparent)]" /> o resto
        </span>
        <span>· {maquina}</span>
      </p>
    </div>
  )
}

interface PropsLinha {
  execucao: Execucao
  tetoCpu: number
  tetoMemoria: number
}

function LinhaDaExecucao({ execucao: e, tetoCpu, tetoMemoria }: PropsLinha) {
  const config = useConfig((s) => s.config)
  const uso = useMonitor((s) => s.uso[e.id])
  const historico = useMonitor((s) => s.historico[e.id]) ?? VAZIO
  const [processosAbertos, setProcessosAbertos] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const nome = acharApp(config, e.appId)?.app.nome ?? 'app'
  const parando = e.estado === 'parando'

  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const verNoPainel = () => {
    useUi.getState().escolherAba(e.appId, e.id)
    useUi.getState().abrirApp(e.appId)
  }
  const instantes = historico.map((p) => p.t)
  const portas = uso?.portas ?? []

  return (
    <li className="py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)_minmax(7rem,10rem)_auto] items-center gap-x-6">
        <div className="min-w-0">
          <button className="flex max-w-full items-center gap-2.5 text-left font-semibold transition-colors hover:text-destaque" onClick={verNoPainel} title="Ver no painel do app">
            <span className="ponto-vivo" />
            <span className="truncate">{nome}</span>
          </button>
          <p className="truncate text-legenda text-texto-3" title={e.pasta}>
            {e.rotulo} · {e.local}
            {e.origem === 'vl' && <span className="italic"> · pelo vl</span>}
          </p>
          <p className="truncate text-legenda text-texto-3">
            {parando ? 'parando…' : `há ${duracao(agora - e.inicio)}`}
            {portas.length > 0 && ` · ${portas.length === 1 ? 'porta' : 'portas'} ${portas.join(', ')}`}
          </p>
        </div>

        <Medida rotulo="CPU" valor={uso ? formatarCpu(uso.cpu) : '—'}>
          <Minigrafico valores={historico.map((p) => p.cpu)} instantes={instantes} teto={tetoCpu} formatar={formatarCpu} rotulo={`CPU de ${nome}`} altura={28} />
        </Medida>
        <Medida rotulo="Memória" valor={uso ? formatarMemoria(uso.memoria) : '—'}>
          <Minigrafico valores={historico.map((p) => p.memoria)} instantes={instantes} teto={tetoMemoria} formatar={formatarMemoria} rotulo={`Memória de ${nome}`} altura={28} />
        </Medida>

        <div className="flex">
          {e.url && (
            <button className="icone-botao pequeno" onClick={() => api.abrirUrl(e.url!).catch(avisarErro)} aria-label={`Abrir ${urlCurta(e.url)}`} title={`Abrir ${urlCurta(e.url)}`}>
              <ExternalLink className="size-4" />
            </button>
          )}
          <button className="icone-botao pequeno" onClick={verNoPainel} aria-label="Ver a saída" title="Ver a saída">
            <SquareTerminal className="size-4" />
          </button>
          <button className="icone-botao pequeno" onClick={() => useExecucoes.getState().reiniciar(e.id)} disabled={parando} aria-label="Reiniciar" title="Reiniciar">
            <RotateCcw className="size-4" />
          </button>
          <button className="icone-botao pequeno" onClick={() => useExecucoes.getState().parar(e.id)} disabled={parando} aria-label={`Parar ${nome}`} title="Parar">
            <Square className="size-3.5 fill-current" />
          </button>
        </div>
      </div>

      {uso && uso.quantos > 0 && (
        <button
          className="mt-2 -ml-1 flex items-center gap-1 rounded-sm text-legenda text-texto-3 transition-colors hover:text-texto"
          onClick={() => setProcessosAbertos((a) => !a)}
          aria-expanded={processosAbertos}
        >
          <ChevronRight className={`size-3.5 transition-transform duration-200 ${processosAbertos ? 'rotate-90' : ''}`} />
          {uso.quantos === 1 ? '1 processo' : `${uso.quantos} processos`}
        </button>
      )}
      {processosAbertos && uso && <Processos uso={uso} />}
    </li>
  )
}

function Medida({ rotulo, valor, children }: { rotulo: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-legenda text-texto-3">{rotulo}</span>
        <span className="font-semibold [font-variant-numeric:proportional-nums]">{valor}</span>
      </p>
      {children}
    </div>
  )
}

/** Os processos da execução, do que mais ocupa memória para o que menos. */
function Processos({ uso }: { uso: Uso }) {
  const fora = uso.quantos - uso.processos.length
  return (
    <div className="mt-2 ml-5 max-w-[34rem]" data-selecionavel>
      <table className="w-full text-legenda">
        <thead className="text-texto-3">
          <tr>
            <th className="py-1 text-left font-semibold">Processo</th>
            <th className="py-1 text-right font-semibold">PID</th>
            <th className="py-1 text-right font-semibold">CPU</th>
            <th className="py-1 text-right font-semibold">Memória</th>
          </tr>
        </thead>
        <tbody>
          {uso.processos.map((p) => (
            <tr key={p.pid} className="border-t border-linha">
              <td className="py-1 font-mono text-codigo">{p.nome}</td>
              <td className="py-1 text-right text-texto-3">{p.pid}</td>
              <td className="py-1 text-right">{formatarCpu(p.cpu)}</td>
              <td className="py-1 text-right">{formatarMemoria(p.memoria)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fora > 0 && <p className="mt-1 text-legenda text-texto-3">e mais {fora === 1 ? '1 processo' : `${fora} processos`}, os mais leves.</p>}
    </div>
  )
}

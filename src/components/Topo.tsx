// O topo: a marca, a busca, o que está rodando agora (o monitor e o parar todas), recolher os grupos,
// o tema e o grupo novo. Fica preso no alto: os botões de tudo-de-uma-vez estão sempre a um clique.

import { ChevronsDownUp, ChevronsUpDown, FolderPlus, Moon, Search, Square, Sun } from 'lucide-react'
import { useConfig } from '../lib/config'
import { estaAtiva, useExecucoes } from '../lib/execucoes'
import { useMonitor } from '../lib/monitor'
import { formatarCpu, formatarMemoria } from '../lib/texto'
import { useUi } from '../lib/ui'
import { AjusteDoVidro } from './AjusteDoVidro'
import { Simbolo } from './Marca'

export function Topo() {
  const tema = useConfig((s) => s.config.tema)
  const definirTema = useConfig((s) => s.definirTema)
  const { abrirBusca, abrirDialogo } = useUi.getState()

  return (
    <header className="vidro sticky top-0 z-10 border-b border-linha bg-[color-mix(in_oklch,var(--fundo)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-[90rem] grid-cols-[1fr_minmax(0,26rem)_1fr] items-center gap-5 px-12">
        <div className="flex items-center gap-3">
          {/* O símbolo é o V: com ele, a palavra fecha o nome, vlauncher. */}
          <Simbolo className="h-8 w-auto" />
          <span aria-hidden className="text-[1.25rem] leading-none font-medium tracking-[0.01em]">
            launcher
          </span>
          <span className="sr-only">vlauncher</span>
        </div>

        <button
          onClick={() => abrirBusca(true)}
          className="flex h-9 w-full items-center gap-2.5 rounded-full border border-linha px-4 text-apoio text-texto-3 transition-colors hover:border-[color-mix(in_oklch,var(--texto)_35%,var(--linha))] hover:text-texto-2"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Rodar ou abrir um app</span>
          <kbd className="font-mono text-[0.7rem]">Ctrl K</kbd>
        </button>

        <div className="flex items-center justify-end gap-3">
          <Rodando />
          <RecolherTodos />
          <button
            className="icone-botao"
            onClick={() => definirTema(tema === 'escuro' ? 'claro' : 'escuro')}
            aria-label={tema === 'escuro' ? 'Usar o tema claro' : 'Usar o tema escuro'}
            title={tema === 'escuro' ? 'Papel' : 'Tinta'}
          >
            {tema === 'escuro' ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
          </button>
          <AjusteDoVidro />
          <button className="botao-2 pequeno" onClick={() => abrirDialogo({ tipo: 'grupo' })}>
            <FolderPlus className="size-3.5" /> Grupo
          </button>
        </div>
      </div>
    </header>
  )
}

/** Recolhe os apps de todos os grupos; com todos já recolhidos, mostra todos de novo. */
function RecolherTodos() {
  const grupos = useConfig((s) => s.config.grupos)
  const recolherTodos = useConfig((s) => s.recolherTodos)
  if (grupos.length === 0) return null

  const todosRecolhidos = grupos.every((g) => g.recolhido)
  const rotulo = todosRecolhidos ? 'Mostrar todos os grupos' : 'Recolher todos os grupos'
  return (
    <button className="icone-botao" onClick={() => recolherTodos(!todosRecolhidos)} aria-label={rotulo} title={rotulo}>
      {todosRecolhidos ? <ChevronsUpDown className="size-[1.1rem]" /> : <ChevronsDownUp className="size-[1.1rem]" />}
    </button>
  )
}

/**
 * O que está rodando: um botão duplo. À esquerda, quantas: abre o monitor, com a CPU, a memória e as
 * ações de cada uma; à direita, o quadrado que para todas de uma vez.
 */
function Rodando() {
  const execucoes = useExecucoes((s) => s.execucoes)
  const monitorAberto = useUi((s) => s.monitorAberto)
  const total = useMonitor((s) => s.total.at(-1))
  const ativas = Object.values(execucoes).filter(estaAtiva)
  if (ativas.length === 0) return null

  const rodando = ativas.filter((e) => e.estado === 'rodando').length
  const metade = 'transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--texto)_8%,transparent)]'
  const medida = total ? `: CPU ${formatarCpu(total.cpu)}, ${formatarMemoria(total.memoria)}` : ''

  return (
    <div className="flex h-[1.875rem] shrink-0 items-stretch rounded-full border border-[color-mix(in_oklch,var(--texto)_55%,transparent)] text-legenda font-semibold whitespace-nowrap">
      <button
        onClick={() => useUi.getState().abrirMonitor(!monitorAberto)}
        aria-expanded={monitorAberto}
        className={`flex items-center gap-2.5 rounded-l-full pr-2.5 pl-3 ${metade}`}
        title={`Abrir o monitor${medida}`}
      >
        <span className="ponto-vivo" />
        {ativas.length === 1 ? '1 rodando' : `${ativas.length} rodando`}
      </button>
      <button
        onClick={() => useExecucoes.getState().pararTodas()}
        disabled={rodando === 0}
        className={`flex items-center rounded-r-full border-l border-[color-mix(in_oklch,var(--texto)_30%,transparent)] pr-3 pl-2.5 ${metade} disabled:opacity-40 disabled:hover:bg-transparent`}
        aria-label={rodando === 1 ? 'Parar a execução' : `Parar todas as ${rodando} execuções`}
        title="Parar todas"
      >
        <Square className="size-3 fill-current" />
      </button>
    </div>
  )
}

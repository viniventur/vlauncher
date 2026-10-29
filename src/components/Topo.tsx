// O topo: a marca, a busca, o que está rodando agora (com o parar todas), recolher os grupos, o tema
// e o grupo novo. Fica preso no alto: os botões de tudo-de-uma-vez estão sempre a um clique.

import { ChevronsDownUp, ChevronsUpDown, ExternalLink, FolderPlus, Moon, Search, Square, Sun } from 'lucide-react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { estaAtiva, useExecucoes } from '../lib/execucoes'
import { urlCurta } from '../lib/texto'
import { useUi } from '../lib/ui'
import { AjusteDoVidro } from './AjusteDoVidro'
import { Flutuante } from './Flutuante'
import { Simbolo } from './Marca'

export function Topo() {
  const tema = useConfig((s) => s.config.tema)
  const definirTema = useConfig((s) => s.definirTema)
  const { abrirBusca, abrirDialogo } = useUi.getState()

  return (
    <header className="vidro sticky top-0 z-10 border-b border-linha bg-[color-mix(in_oklch,var(--fundo)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-[90rem] grid-cols-[1fr_minmax(0,26rem)_1fr] items-center gap-5 px-12">
        <div className="flex items-center gap-3">
          <Simbolo className="h-8 w-auto" />
          <span className="text-[1.25rem] leading-none font-medium tracking-[0.01em]">Launcher</span>
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
 * O que está rodando: um botão duplo. À esquerda, quantas e a lista (com parar e abrir de cada uma);
 * à direita, o quadrado que para todas de uma vez.
 */
function Rodando() {
  const execucoes = useExecucoes((s) => s.execucoes)
  const grupos = useConfig((s) => s.config.grupos)
  const abrirApp = useUi((s) => s.abrirApp)
  const ativas = Object.values(execucoes).filter(estaAtiva).sort((a, b) => a.inicio - b.inicio)
  if (ativas.length === 0) return null

  const nomeDoApp = (id: string) => grupos.flatMap((g) => g.apps).find((a) => a.id === id)?.nome ?? 'app'
  const rodando = ativas.filter((e) => e.estado === 'rodando').length
  const metade = 'transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--texto)_8%,transparent)]'

  return (
    <Flutuante
      lado="direita"
      className="w-[26rem] py-2"
      gatilho={(abrir, aberto) => (
        <div className="flex h-[1.875rem] shrink-0 items-stretch rounded-full border border-[color-mix(in_oklch,var(--texto)_55%,transparent)] text-legenda font-semibold whitespace-nowrap">
          <button onClick={abrir} aria-expanded={aberto} className={`flex items-center gap-2.5 rounded-l-full pr-2.5 pl-3 ${metade}`}>
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
      )}
    >
      {(fechar) => (
        <ul>
          {ativas.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2 hover:bg-[color-mix(in_oklch,var(--texto)_7%,transparent)]">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  fechar()
                  useUi.getState().escolherAba(e.appId, e.id)
                  abrirApp(e.appId)
                }}
              >
                <span className="block truncate font-semibold">{nomeDoApp(e.appId)}</span>
                <span className="block truncate text-legenda text-texto-3">
                  {e.rotulo} · {e.local}
                  {e.estado === 'parando' && ' · parando…'}
                </span>
              </button>
              {e.url && (
                <button className="botao-2 pequeno" onClick={() => api.abrirUrl(e.url!).catch(avisarErro)}>
                  <ExternalLink className="size-3.5" /> {urlCurta(e.url)}
                </button>
              )}
              <button
                className="icone-botao pequeno"
                onClick={() => useExecucoes.getState().parar(e.id)}
                disabled={e.estado === 'parando'}
                aria-label="Parar"
                title="Parar"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Flutuante>
  )
}

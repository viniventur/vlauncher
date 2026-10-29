/* oxlint-disable jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/prefer-tag-over-role --
   a lista segue o padrão combobox + listbox do ARIA: o foco fica no campo e as setas escolhem. */
// A busca (Ctrl+K no launcher, Ctrl+Alt+Espaço de qualquer lugar): digitar parte do nome e Enter
// para rodar a variação (ou tudo de um subgrupo), abrir o painel, abrir o endereço ou parar o que está
// rodando.

import { Activity, ChevronsDownUp, ChevronsUpDown, Droplet, ExternalLink, LayoutGrid, LayoutPanelLeft, Play, Search, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { estaAtiva, localDoApp, pararSubgrupo, rodarSubgrupo, useExecucoes, variacaoPadrao } from '../lib/execucoes'
import { appsDoSubgrupo, subgruposValidos, variacaoNoSubgrupo } from '../lib/subgrupos'
import { combina, urlCurta } from '../lib/texto'
import { useUi } from '../lib/ui'

interface Item {
  chave: string
  icone: ReactNode
  titulo: string
  detalhe: string
  busca: string[]
  acao: () => void
}

export function Busca() {
  const { abrirBusca, abrirApp, abrirSubgrupo, escolherAba } = useUi.getState()
  const grupos = useConfig((s) => s.config.grupos)
  const execucoes = useExecucoes((s) => s.execucoes)
  const vidro = useConfig((s) => Boolean(s.config.vidro))
  const [texto, setTexto] = useState('')
  const [indice, setIndice] = useState(0)
  const lista = useRef<HTMLUListElement>(null)
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

  const itens = useMemo(() => {
    const apps = new Map(grupos.flatMap((g) => g.apps.map((a) => [a.id, { app: a, grupo: g }] as const)))
    const quantasRodando = Object.values(execucoes).filter((e) => e.estado === 'rodando').length
    const pararTodas: Item[] =
      quantasRodando > 1
        ? [
            {
              chave: 'parar-todas',
              icone: <Square className="fill-current" />,
              titulo: 'Parar todas as execuções',
              detalhe: `${quantasRodando} rodando`,
              busca: ['parar', 'todas', 'todos', 'execuções', 'apps'],
              acao: () => useExecucoes.getState().pararTodas(),
            },
          ]
        : []
    const todosRecolhidos = grupos.length > 0 && grupos.every((g) => g.recolhido)
    const recolher: Item[] =
      grupos.length > 0
        ? [
            {
              chave: 'recolher-todos',
              icone: todosRecolhidos ? <ChevronsUpDown /> : <ChevronsDownUp />,
              titulo: todosRecolhidos ? 'Mostrar todos os grupos' : 'Recolher todos os grupos',
              detalhe: `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}`,
              busca: ['recolher', 'colapsar', 'mostrar', 'expandir', 'todos', 'grupos'],
              acao: () => useConfig.getState().recolherTodos(!todosRecolhidos),
            },
          ]
        : []
    const monitor: Item = {
      chave: 'monitor',
      icone: <Activity />,
      titulo: 'Abrir o monitor',
      detalhe: quantasRodando > 0 ? `a CPU e a memória das ${quantasRodando === 1 ? '1 execução' : `${quantasRodando} execuções`}` : 'a CPU e a memória do que estiver rodando',
      busca: ['monitor', 'cpu', 'memória', 'processos', 'portas', 'desempenho', 'painel'],
      acao: () => useUi.getState().abrirMonitor(true),
    }
    const aparencia: Item[] = [
      {
        chave: 'vidro',
        icone: <Droplet />,
        titulo: vidro ? 'Desligar o liquid glass' : 'Ligar o liquid glass',
        detalhe: 'o fundo de vidro, no tema claro ou escuro',
        busca: ['liquid', 'glass', 'vidro', 'tema', 'fundo', vidro ? 'desligar' : 'ligar'],
        acao: () => useConfig.getState().definirVidro(!vidro),
      },
    ]
    const rodando: Item[] = Object.values(execucoes)
      .filter(estaAtiva)
      .flatMap((e) => {
        const nome = apps.get(e.appId)?.app.nome ?? 'app'
        const r: Item[] = []
        if (e.url) {
          r.push({
            chave: `url-${e.id}`,
            icone: <ExternalLink />,
            titulo: `Abrir ${nome}`,
            detalhe: `${urlCurta(e.url)} · ${e.rotulo} · ${e.local}`,
            busca: [nome, 'abrir', e.rotulo, e.local, e.url],
            acao: () => api.abrirUrl(e.url!).catch(avisarErro),
          })
        }
        r.push({
          chave: `parar-${e.id}`,
          icone: <Square className="fill-current" />,
          titulo: `Parar ${nome}`,
          detalhe: `${e.rotulo} · ${e.local}`,
          busca: [nome, 'parar', e.rotulo, e.local],
          acao: () => useExecucoes.getState().parar(e.id),
        })
        return r
      })

    // Os subgrupos: rodar tudo, parar o que estiver rodando e abrir o painel.
    const subgrupos = grupos.flatMap((g) => subgruposValidos(g).map((subgrupo) => ({ subgrupo, grupo: g, membros: appsDoSubgrupo(subgrupo, g) })))
    const pararSubgrupos: Item[] = subgrupos.flatMap(({ subgrupo, membros }) => {
      const quantas = Object.values(execucoes).filter((e) => e.estado === 'rodando' && membros.some((a) => a.id === e.appId)).length
      if (quantas === 0) return []
      return [
        {
          chave: `parar-subgrupo-${subgrupo.id}`,
          icone: <Square className="fill-current" />,
          titulo: `Parar ${subgrupo.nome}`,
          detalhe: `tudo do subgrupo · ${quantas} rodando`,
          busca: [subgrupo.nome, 'parar', 'tudo', 'subgrupo'],
          acao: () => pararSubgrupo(membros),
        },
      ]
    })
    const doSubgrupo = ({ subgrupo, grupo: g, membros }: (typeof subgrupos)[number]): Item[] => [
      {
        chave: `rodar-subgrupo-${subgrupo.id}`,
        icone: <Play className="fill-current" />,
        titulo: `${subgrupo.nome} · rodar tudo`,
        detalhe: `${membros.map((a) => `${a.nome} (${variacaoNoSubgrupo(subgrupo, a)?.nome ?? 'sem variação'})`).join(' + ')} · ${g.nome}`,
        busca: [subgrupo.nome, g.nome, 'rodar', 'tudo', 'subgrupo', ...membros.map((a) => a.nome)],
        acao: async () => {
          const novas = await rodarSubgrupo(subgrupo, membros)
          if (novas[0]) escolherAba(subgrupo.id, novas[0].id)
          abrirSubgrupo(subgrupo.id)
        },
      },
      {
        chave: `abrir-subgrupo-${subgrupo.id}`,
        icone: <LayoutGrid />,
        titulo: subgrupo.nome,
        detalhe: `subgrupo · ${membros.map((a) => a.nome).join(' + ')} · ${g.nome}`,
        busca: [subgrupo.nome, g.nome, 'subgrupo', 'painel', ...membros.map((a) => a.nome)],
        acao: () => abrirSubgrupo(subgrupo.id),
      },
    ]

    const doLauncher: Item[] = grupos.flatMap((g) => [
      ...subgrupos.filter((s) => s.grupo === g).flatMap(doSubgrupo),
      ...g.apps.flatMap((app) => {
        const padrao = variacaoPadrao(app)
        const ordenadas = padrao ? [padrao, ...app.variacoes.filter((v) => v.id !== padrao.id)] : app.variacoes
        return [
          ...ordenadas.map<Item>((v) => ({
            chave: `rodar-${app.id}-${v.id}`,
            icone: <Play className="fill-current" />,
            titulo: `${app.nome} · ${v.nome}`,
            detalhe: `rodar em ${localDoApp(app)} · ${g.nome}`,
            busca: [app.nome, v.nome, g.nome, 'rodar'],
            acao: async () => {
              const e = await useExecucoes.getState().rodar(app, v)
              if (e) {
                escolherAba(app.id, e.id)
                abrirApp(app.id)
              }
            },
          })),
          {
            chave: `abrir-${app.id}`,
            icone: <LayoutPanelLeft />,
            titulo: app.nome,
            detalhe: `painel · ${g.nome}`,
            busca: [app.nome, g.nome, app.descricao ?? '', 'painel'],
            acao: () => abrirApp(app.id),
          },
        ]
      }),
    ])
    return [...pararTodas, ...pararSubgrupos, ...rodando, ...doLauncher, monitor, ...recolher, ...aparencia]
      .filter((i) => combina(texto, ...i.busca))
      .slice(0, 60)
  }, [grupos, execucoes, texto, vidro, abrirApp, abrirSubgrupo, escolherAba])

  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  const executar = (item: Item | undefined) => {
    if (!item) return
    abrirBusca(false)
    item.acao()
  }

  return (
    <dialog
      ref={dialogo}
      onCancel={(e) => {
        e.preventDefault()
        abrirBusca(false)
      }}
      onClick={(e) => {
        if (e.target === dialogo.current) abrirBusca(false)
      }}
      className="vidro vidro-opaco entra-baixo mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-linha bg-elevada p-0 text-texto backdrop:bg-veu"
    >
      <label className="flex items-center gap-3 border-b border-linha px-5 py-4">
        <Search className="size-5 text-texto-3" />
        <input
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setIndice(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndice((i) => Math.min(i + 1, itens.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndice((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              executar(itens[indice])
            }
          }}
          placeholder="Rodar, abrir ou parar um app"
          className="min-w-0 flex-1 bg-transparent text-[1.125rem] outline-none placeholder:text-texto-3"
          role="combobox"
          aria-expanded="true"
          aria-controls="resultados-da-busca"
        />
        <kbd className="rounded border border-linha px-1.5 py-0.5 font-mono text-[0.7rem] text-texto-3">Esc</kbd>
      </label>
      <ul ref={lista} id="resultados-da-busca" role="listbox" className="max-h-[min(26rem,60vh)] overflow-y-auto py-2">
        {itens.length === 0 && <li className="px-5 py-6 text-apoio text-texto-3">Nada com “{texto}”.</li>}
        {itens.map((item, i) => (
          <li
            key={item.chave}
            role="option"
            aria-selected={i === indice}
            onMouseMove={() => setIndice(i)}
            onClick={() => executar(item)}
            className={`flex cursor-pointer items-center gap-3.5 px-5 py-2.5 ${i === indice ? 'bg-[color-mix(in_oklch,var(--texto)_8%,transparent)]' : ''}`}
          >
            <span className={`[&>svg]:size-4 ${i === indice ? 'text-destaque' : 'text-texto-3'}`}>{item.icone}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{item.titulo}</span>
              <span className="block truncate text-legenda text-texto-3">{item.detalhe}</span>
            </span>
            {i === indice && <span className="text-legenda text-texto-3">Enter</span>}
          </li>
        ))}
      </ul>
    </dialog>
  )
}

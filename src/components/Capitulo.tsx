// Um grupo, como um capítulo da galeria do site: a linha fina em cima, a foto, o nome e quantos
// apps tem; embaixo, as pranchas dos apps e dos subgrupos (no lugar do primeiro app de cada um).

import { useDroppable } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Ellipsis, FolderOpen, FolderSearch, GripVertical, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { descartarDoApp } from '../lib/execucoes'
import { idDoItem, itensDaGrade, sugestoesDeSubgrupos } from '../lib/subgrupos'
import type { App, Grupo } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Capa } from './Capa'
import { Menu } from './Flutuante'
import { Prancha } from './Prancha'
import { PranchaSubgrupo } from './PranchaSubgrupo'

interface Props {
  grupo: Grupo
  /** A ordem dos apps durante um arrasto (pode já ter um app vindo de outro grupo). */
  apps: App[]
  /** Arrastando um grupo: todos se recolhem ao cabeçalho, para a ordem caber na tela. */
  soCabecalho: boolean
}

export function Capitulo({ grupo, apps, soCabecalho }: Props) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: grupo.id,
    data: { tipo: 'grupo' },
  })
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-30' : ''}
      aria-label={grupo.nome}
    >
      <Cabecalho grupo={grupo} quantos={apps.length} alca={{ ref: setActivatorNodeRef, ...listeners, ...attributes }} />
      {!soCabecalho && !grupo.recolhido && <Pranchas grupo={grupo} apps={apps} />}
    </section>
  )
}

function Pranchas({ grupo, apps }: { grupo: Grupo; apps: App[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `soltar:${grupo.id}`, data: { tipo: 'grupo-apps', grupoId: grupo.id } })
  const abrirDialogo = useUi((s) => s.abrirDialogo)
  const itens = useMemo(() => itensDaGrade({ apps, subgrupos: grupo.subgrupos }), [apps, grupo.subgrupos])
  return (
    <SortableContext items={itens.map(idDoItem)} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-7 gap-y-9 pt-6 pb-4"
      >
        {itens.map((item) =>
          item.tipo === 'app' ? (
            <Prancha key={item.app.id} app={item.app} grupoId={grupo.id} />
          ) : (
            <PranchaSubgrupo key={item.subgrupo.id} subgrupo={item.subgrupo} apps={item.apps} grupoId={grupo.id} />
          ),
        )}
        {apps.length === 0 && (
          <button
            onClick={() => abrirDialogo({ tipo: 'app', grupoId: grupo.id, pasta: grupo.pasta })}
            className={`grid aspect-[16/10] place-items-center rounded-md border border-dashed text-apoio text-texto-3 transition-colors hover:border-texto-3 hover:text-texto-2 ${isOver ? 'border-destaque' : 'border-linha'}`}
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" /> Adicionar o primeiro app
            </span>
          </button>
        )}
      </div>
    </SortableContext>
  )
}

function Cabecalho({ grupo, quantos, alca }: { grupo: Grupo; quantos: number; alca: Record<string, unknown> }) {
  const abrirDialogo = useUi((s) => s.abrirDialogo)
  const { editarGrupo, removerGrupo } = useConfig.getState()
  const sugestoes = useMemo(() => sugestoesDeSubgrupos(grupo).length, [grupo])

  const remover = async () => {
    const aviso =
      quantos > 0
        ? `O grupo ${grupo.nome} e os ${quantos} apps dele saem do launcher (as pastas dos projetos ficam como estão).`
        : `O grupo ${grupo.nome} sai do launcher.`
    if (await api.confirmar(aviso, 'Remover grupo', 'Remover')) {
      descartarDoApp(...grupo.apps.map((a) => a.id))
      removerGrupo(grupo.id)
    }
  }

  return (
    <header className="group/cab flex items-center gap-4 border-t border-linha pt-5">
      <button
        {...alca}
        className="icone-botao pequeno -ml-10 cursor-grab text-texto-3 opacity-0 transition-opacity group-hover/cab:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        aria-label={`Arrastar o grupo ${grupo.nome}`}
        title="Arrastar para reordenar"
      >
        <GripVertical className="size-4" />
      </button>

      <button
        data-alvo-imagem={`grupo:${grupo.id}`}
        onClick={() => abrirDialogo({ tipo: 'grupo', id: grupo.id })}
        className="shrink-0 rounded-md"
        title={`Trocar a foto do grupo (ou arraste uma imagem para cá)${grupo.imagemOrigem ? `\nVeio de ${grupo.imagemOrigem}` : ''}`}
      >
        <Capa nome={grupo.nome} imagem={grupo.imagem} ajuste={grupo.ajuste} tamanho="pequena" className="size-12 rounded-md" />
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-subtitulo">{grupo.nome}</h2>
        {grupo.pasta && <p className="truncate text-legenda text-texto-3">{grupo.pasta}</p>}
      </div>

      <span className="text-apoio text-texto-3">{quantos === 1 ? '1 app' : `${quantos} apps`}</span>

      <button className="botao-2 pequeno" onClick={() => abrirDialogo({ tipo: 'app', grupoId: grupo.id, pasta: grupo.pasta })}>
        <Plus className="size-4" /> App
      </button>

      <Menu
        gatilho={(abrir) => (
          <button className="icone-botao" onClick={abrir} aria-label={`Mais opções do grupo ${grupo.nome}`}>
            <Ellipsis className="size-5" />
          </button>
        )}
        itens={[
          { rotulo: 'Editar o grupo', icone: <Pencil />, acao: () => abrirDialogo({ tipo: 'grupo', id: grupo.id }) },
          grupo.apps.length >= 2
            ? {
                rotulo: 'Novo subgrupo',
                icone: <LayoutGrid />,
                detalhe: sugestoes > 0 ? (sugestoes === 1 ? '1 sugerido' : `${sugestoes} sugeridos`) : undefined,
                acao: () => abrirDialogo({ tipo: 'subgrupo', grupoId: grupo.id }),
              }
            : null,
          grupo.pasta
            ? { rotulo: 'Procurar apps na pasta', icone: <FolderSearch />, acao: () => abrirDialogo({ tipo: 'importar', grupoId: grupo.id }) }
            : null,
          grupo.pasta ? { rotulo: 'Abrir a pasta', icone: <FolderOpen />, acao: () => api.abrirPasta(grupo.pasta!).catch(avisarErro) } : null,
          null,
          { rotulo: 'Remover o grupo', icone: <Trash2 />, acao: remover, perigo: true },
        ]}
      />

      <button
        className="icone-botao -mr-2"
        onClick={() => editarGrupo(grupo.id, { recolhido: !grupo.recolhido })}
        aria-expanded={!grupo.recolhido}
        aria-label={grupo.recolhido ? `Mostrar os apps de ${grupo.nome}` : `Recolher ${grupo.nome}`}
      >
        <ChevronDown className={`size-5 transition-transform duration-300 ${grupo.recolhido ? '-rotate-90' : ''}`} />
      </button>
    </header>
  )
}

/** O grupo arrastado, como aparece sob o cursor. */
export function CabecalhoSobreposto({ grupo }: { grupo: Grupo }) {
  return (
    <div className="vidro vidro-opaco flex rotate-[0.6deg] items-center gap-4 rounded-lg border border-linha bg-elevada px-4 py-3">
      <Capa nome={grupo.nome} imagem={grupo.imagem} ajuste={grupo.ajuste} tamanho="pequena" className="size-12 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-subtitulo">{grupo.nome}</p>
        {grupo.pasta && <p className="truncate text-legenda text-texto-3">{grupo.pasta}</p>}
      </div>
      <span className="text-apoio text-texto-3">{grupo.apps.length} apps</span>
    </div>
  )
}

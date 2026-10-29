// Os grupos e os apps, organizáveis: arraste um grupo pela alça para reordenar; arraste um app para
// outra posição ou para outro grupo (até para um grupo recolhido, soltando no cabeçalho).

import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import { acharApp, useConfig } from '../lib/config'
import type { App } from '../lib/tipos'
import { CabecalhoSobreposto, Capitulo } from './Capitulo'
import { PranchaVisual } from './Prancha'

type Ordem = Record<string, string[]>
type Arrasto = { tipo: 'app' | 'grupo'; id: string } | null

const tipoDe = (c: { data: { current?: Record<string, unknown> | undefined } }) => c.data.current?.tipo

export function Galeria() {
  const config = useConfig((s) => s.config)
  const { ordenarGrupos, reorganizarApps } = useConfig.getState()
  const [arrasto, setArrasto] = useState<Arrasto>(null)
  // Durante o arrasto de um app, a ordem provisória (o app já aparece no grupo de destino).
  const [ordem, setOrdem] = useState<Ordem | null>(null)

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ordemAtual: Ordem = useMemo(
    () => ordem ?? Object.fromEntries(config.grupos.map((g) => [g.id, g.apps.map((a) => a.id)])),
    [ordem, config.grupos],
  )
  const appsPorId = useMemo(() => new Map(config.grupos.flatMap((g) => g.apps.map((a) => [a.id, a] as const))), [config.grupos])
  const grupoDoApp = (id: string) => Object.keys(ordemAtual).find((g) => ordemAtual[g]!.includes(id))

  // Grupo só colide com grupo. App prefere outro app sob o cursor; depois a área de um grupo; depois
  // o cabeçalho de um grupo (o recolhido).
  const colisao: CollisionDetection = (args) => {
    if (arrasto?.tipo === 'grupo') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => tipoDe(c) === 'grupo') })
    }
    const alvos = args.droppableContainers.filter((c) => ['app', 'grupo-apps', 'grupo'].includes(String(tipoDe(c))))
    const sob = pointerWithin({ ...args, droppableContainers: alvos })
    const porTipo = (t: string) => sob.find((c) => tipoDe(args.droppableContainers.find((d) => d.id === c.id)!) === t)
    const achado = porTipo('app') ?? porTipo('grupo-apps') ?? porTipo('grupo')
    if (achado) return [achado]
    return closestCorners({ ...args, droppableContainers: alvos.filter((c) => tipoDe(c) === 'app') })
  }

  const inicio = ({ active }: DragStartEvent) => {
    const tipo = active.data.current?.tipo as 'app' | 'grupo'
    setArrasto({ tipo, id: String(active.id) })
    if (tipo === 'app') setOrdem(ordemAtual)
  }

  const sobre = ({ active, over }: DragOverEvent) => {
    if (arrasto?.tipo !== 'app' || !over) return
    const id = String(active.id)
    const de = grupoDoApp(id)
    const tipo = over.data.current?.tipo
    const para =
      tipo === 'app' ? grupoDoApp(String(over.id)) : tipo === 'grupo-apps' ? String(over.data.current?.grupoId) : tipo === 'grupo' ? String(over.id) : undefined
    if (!de || !para || de === para) return
    setOrdem((o) => {
      const atual = o ?? ordemAtual
      const destino = atual[para]!.filter((x) => x !== id)
      const i = tipo === 'app' ? destino.indexOf(String(over.id)) : -1
      destino.splice(i < 0 ? destino.length : i, 0, id)
      return { ...atual, [de]: atual[de]!.filter((x) => x !== id), [para]: destino }
    })
  }

  const fim = ({ active, over }: DragEndEvent) => {
    if (arrasto?.tipo === 'grupo') {
      if (over && active.id !== over.id) {
        const ids = config.grupos.map((g) => g.id)
        ordenarGrupos(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
      }
    } else if (arrasto?.tipo === 'app' && ordem) {
      let final = ordem
      const id = String(active.id)
      const grupo = grupoDoApp(id)
      if (over && over.data.current?.tipo === 'app' && grupo && grupoDoApp(String(over.id)) === grupo) {
        const lista = final[grupo]!
        final = { ...final, [grupo]: arrayMove(lista, lista.indexOf(id), lista.indexOf(String(over.id))) }
      }
      reorganizarApps(final)
    }
    setArrasto(null)
    setOrdem(null)
  }

  const cancelar = () => {
    setArrasto(null)
    setOrdem(null)
  }

  const appArrastado = arrasto?.tipo === 'app' ? acharApp(config, arrasto.id)?.app : undefined
  const grupoArrastado = arrasto?.tipo === 'grupo' ? config.grupos.find((g) => g.id === arrasto.id) : undefined

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={colisao}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={inicio}
      onDragOver={sobre}
      onDragEnd={fim}
      onDragCancel={cancelar}
    >
      <SortableContext items={config.grupos.map((g) => g.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-10">
          {config.grupos.map((grupo) => (
            <Capitulo
              key={grupo.id}
              grupo={grupo}
              apps={(ordemAtual[grupo.id] ?? []).map((id) => appsPorId.get(id)).filter((a): a is App => Boolean(a))}
              soCabecalho={arrasto?.tipo === 'grupo'}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {appArrastado && <PranchaVisual app={appArrastado} sobreposta />}
        {grupoArrastado && <CabecalhoSobreposto grupo={grupoArrastado} />}
      </DragOverlay>
    </DndContext>
  )
}

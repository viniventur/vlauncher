// Os grupos e os apps, organizáveis: arraste um grupo pela alça para reordenar; arraste um app para
// outra posição ou para outro grupo (até para um grupo recolhido, soltando no cabeçalho); arraste um
// subgrupo para outra posição no mesmo grupo (ele leva os apps juntos).

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
import { acharSubgrupo, appsDoSubgrupo, idDoItem, itensDaGrade, ordemDosApps } from '../lib/subgrupos'
import type { App } from '../lib/tipos'
import { CabecalhoSobreposto, Capitulo } from './Capitulo'
import { PranchaVisual } from './Prancha'
import { PranchaSubgrupoVisual } from './PranchaSubgrupo'

type Ordem = Record<string, string[]>
type Arrasto = { tipo: 'app' | 'grupo' | 'subgrupo'; id: string } | null
type ComDados = { id: string | number; data: { current?: Record<string, unknown> | undefined } }

const tipoDe = (c: ComDados) => c.data.current?.tipo
/** Os alvos que ocupam um lugar na grade: os apps e os subgrupos. */
const naGrade = (c: ComDados) => ['app', 'subgrupo'].includes(String(tipoDe(c)))

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
  // O grupo de um alvo da grade: o do app, ou o que o subgrupo traz nos dados.
  const grupoDoAlvo = (alvo: ComDados) => (tipoDe(alvo) === 'subgrupo' ? String(alvo.data.current?.grupoId) : grupoDoApp(String(alvo.id)))
  // Sobre um subgrupo, um app entra no lugar do primeiro app dele.
  const primeiroDoSubgrupo = (subgrupoId: string, lista: string[]) => {
    const apps = acharSubgrupo(config, subgrupoId)?.subgrupo.apps ?? []
    return lista.find((id) => apps.includes(id))
  }

  // Grupo só colide com grupo; subgrupo, com os itens do próprio grupo. App prefere outro app (ou um
  // subgrupo) sob o cursor; depois a área de um grupo; depois o cabeçalho de um grupo (o recolhido).
  const colisao: CollisionDetection = (args) => {
    if (arrasto?.tipo === 'grupo') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => tipoDe(c) === 'grupo') })
    }
    if (arrasto?.tipo === 'subgrupo') {
      const grupoId = args.active.data.current?.grupoId
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => naGrade(c) && grupoDoAlvo(c) === grupoId) })
    }
    const alvos = args.droppableContainers.filter((c) => naGrade(c) || ['grupo-apps', 'grupo'].includes(String(tipoDe(c))))
    const sob = pointerWithin({ ...args, droppableContainers: alvos })
    const porTipo = (t: string) => sob.find((c) => tipoDe(args.droppableContainers.find((d) => d.id === c.id)!) === t)
    const achado = porTipo('app') ?? porTipo('subgrupo') ?? porTipo('grupo-apps') ?? porTipo('grupo')
    if (achado) return [achado]
    return closestCorners({ ...args, droppableContainers: alvos.filter(naGrade) })
  }

  const inicio = ({ active }: DragStartEvent) => {
    const tipo = active.data.current?.tipo as 'app' | 'grupo' | 'subgrupo'
    setArrasto({ tipo, id: String(active.id) })
    if (tipo === 'app') setOrdem(ordemAtual)
  }

  const sobre = ({ active, over }: DragOverEvent) => {
    if (arrasto?.tipo !== 'app' || !over) return
    const id = String(active.id)
    const de = grupoDoApp(id)
    const tipo = over.data.current?.tipo
    const para =
      tipo === 'app' || tipo === 'subgrupo'
        ? grupoDoAlvo(over)
        : tipo === 'grupo-apps'
          ? String(over.data.current?.grupoId)
          : tipo === 'grupo'
            ? String(over.id)
            : undefined
    if (!de || !para || de === para) return
    setOrdem((o) => {
      const atual = o ?? ordemAtual
      const destino = atual[para]!.filter((x) => x !== id)
      const alvo = tipo === 'subgrupo' ? primeiroDoSubgrupo(String(over.id), destino) : tipo === 'app' ? String(over.id) : undefined
      const i = alvo ? destino.indexOf(alvo) : -1
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
    } else if (arrasto?.tipo === 'app' || arrasto?.tipo === 'subgrupo') {
      let final = ordemAtual
      const id = String(active.id)
      const grupoId = arrasto.tipo === 'subgrupo' ? String(active.data.current?.grupoId) : grupoDoApp(id)
      // Trocou de lugar dentro do grupo: reordena os itens da grade (apps e subgrupos) e depois desdobra
      // cada subgrupo nos apps dele.
      if (over && over.id !== active.id && grupoId && naGrade(over) && grupoDoAlvo(over) === grupoId) {
        const grupo = config.grupos.find((g) => g.id === grupoId)
        const comOrdem = {
          apps: final[grupoId]!.map((x) => appsPorId.get(x)).filter((a): a is App => Boolean(a)),
          subgrupos: grupo?.subgrupos,
        }
        const itens = itensDaGrade(comOrdem).map(idDoItem)
        const de = itens.indexOf(id)
        const para = itens.indexOf(String(over.id))
        if (de >= 0 && para >= 0) final = { ...final, [grupoId]: ordemDosApps(arrayMove(itens, de, para), comOrdem) }
      }
      // O app pode ter mudado de grupo (a ordem provisória): grava sempre; o subgrupo, só se mudou.
      if (arrasto.tipo === 'app' || final !== ordemAtual) reorganizarApps(final)
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
  const subgrupoArrastado = arrasto?.tipo === 'subgrupo' ? acharSubgrupo(config, arrasto.id) : null

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
        {subgrupoArrastado && (
          <PranchaSubgrupoVisual
            subgrupo={subgrupoArrastado.subgrupo}
            apps={appsDoSubgrupo(subgrupoArrastado.subgrupo, subgrupoArrastado.grupo)}
            sobreposta
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

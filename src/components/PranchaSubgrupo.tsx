// Um subgrupo na galeria, como uma pasta do iPhone: as capas dos apps em mosaico e, embaixo, o nome, os
// apps e o rodar tudo (ou o parar tudo). Clicar abre o painel do subgrupo; arrastar reordena dentro do
// grupo, levando os apps juntos.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, Play, Square } from 'lucide-react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { estaAtiva, pararSubgrupo, rodarSubgrupo, useExecucoes } from '../lib/execucoes'
import type { App, Subgrupo } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Mosaico } from './Mosaico'

interface Props {
  subgrupo: Subgrupo
  apps: App[]
}

export function PranchaSubgrupo({ subgrupo, apps, grupoId }: Props & { grupoId: string }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: subgrupo.id,
    data: { tipo: 'subgrupo', grupoId },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-25' : ''}
      {...listeners}
    >
      <PranchaSubgrupoVisual subgrupo={subgrupo} apps={apps} />
    </div>
  )
}

export function PranchaSubgrupoVisual({ subgrupo, apps, sobreposta = false }: Props & { sobreposta?: boolean }) {
  const abrirSubgrupo = useUi((s) => s.abrirSubgrupo)
  const aberto = useUi((s) => s.subgrupoAberto === subgrupo.id)
  const execucoes = useExecucoes((s) => s.execucoes)
  const ativas = Object.values(execucoes).filter((e) => estaAtiva(e) && apps.some((a) => a.id === e.appId))
  const rodando = apps.filter((a) => ativas.some((e) => e.appId === a.id))
  // O endereço do primeiro app (na ordem do subgrupo) que está rodando e anunciou um.
  const endereco = apps.map((a) => ativas.find((e) => e.appId === a.id && e.url)?.url).find(Boolean)
  const parando = ativas.length > 0 && ativas.every((e) => e.estado === 'parando')

  return (
    <article
      className={`group relative ${sobreposta ? 'rotate-[1.5deg] cursor-grabbing' : 'cursor-pointer'}`}
      onClick={() => abrirSubgrupo(subgrupo.id)}
      aria-label={`${subgrupo.nome}: subgrupo com ${apps.map((a) => a.nome).join(' e ')}`}
    >
      <div
        className={`relative overflow-hidden rounded-md transition-shadow duration-300 ${aberto ? 'ring-2 ring-destaque ring-offset-4 ring-offset-fundo' : ''} ${sobreposta ? 'shadow-[0_24px_60px_-16px_rgb(0_0_0/0.6)]' : ''}`}
      >
        <Mosaico
          apps={apps}
          className="rounded-md [&>div]:transition-transform [&>div]:duration-[400ms] [&>div]:ease-[var(--ease-expo)] group-hover:[&>div]:scale-[1.03]"
        />
        {rodando.length > 0 && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-2 rounded-full bg-[color-mix(in_oklch,var(--color-escuro-1)_82%,transparent)] px-2.5 py-1 text-legenda font-semibold text-giz-1 backdrop-blur-sm">
            <span className="ponto-vivo" />
            {parando ? 'parando' : rodando.length === apps.length ? 'rodando' : `rodando ${rodando.length} de ${apps.length}`}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug transition-colors duration-200 group-hover:text-destaque">
            <button className="max-w-full truncate text-left" onClick={(e) => (e.stopPropagation(), abrirSubgrupo(subgrupo.id))}>
              {subgrupo.nome}
            </button>
          </h3>
          <p className="truncate text-legenda text-texto-3">{apps.map((a) => a.nome).join(' · ')}</p>
        </div>

        {endereco && (
          <button
            className="icone-botao pequeno -mt-0.5"
            title={`Abrir ${endereco}`}
            aria-label={`Abrir ${subgrupo.nome} no navegador`}
            onClick={(e) => {
              e.stopPropagation()
              api.abrirUrl(endereco).catch(avisarErro)
            }}
          >
            <ExternalLink className="size-4" />
          </button>
        )}
        {ativas.length > 0 ? (
          <button
            className="icone-botao pequeno -mt-0.5 -mr-1.5"
            title="Parar tudo"
            aria-label={`Parar tudo de ${subgrupo.nome}`}
            disabled={parando}
            onClick={(e) => {
              e.stopPropagation()
              pararSubgrupo(apps)
            }}
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            className="icone-botao pequeno -mt-0.5 -mr-1.5 hover:text-destaque"
            title="Rodar tudo"
            aria-label={`Rodar tudo de ${subgrupo.nome}`}
            onClick={(e) => {
              e.stopPropagation()
              rodarSubgrupo(subgrupo, apps)
            }}
          >
            <Play className="size-4 fill-current" />
          </button>
        )}
      </div>
    </article>
  )
}

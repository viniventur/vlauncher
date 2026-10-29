// O app na galeria: a foto (ou a capa tipográfica) em 16:10 e, embaixo, o nome, onde roda e o botão
// de rodar a variação padrão. Arrasta para reordenar ou para outro grupo.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, Play, Square } from 'lucide-react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { estaAtiva, localDoApp, useExecucoes, useExecucoesDoApp, variacaoPadrao } from '../lib/execucoes'
import type { App } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Capa } from './Capa'

export function Prancha({ app, grupoId }: { app: App; grupoId: string }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: app.id,
    data: { tipo: 'app', grupoId },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-25' : ''}
      {...listeners}
    >
      <PranchaVisual app={app} />
    </div>
  )
}

export function PranchaVisual({ app, sobreposta = false }: { app: App; sobreposta?: boolean }) {
  const abrirApp = useUi((s) => s.abrirApp)
  const aberto = useUi((s) => s.appAberto === app.id)
  const { rodar, parar } = useExecucoes.getState()
  const ativas = useExecucoesDoApp(app.id).filter(estaAtiva)
  const principal = ativas[0]
  const padrao = variacaoPadrao(app)

  const linhaDeBaixo = principal
    ? `${principal.rotulo} · ${principal.local}${ativas.length > 1 ? ` · +${ativas.length - 1}` : ''}`
    : padrao
      ? `${localDoApp(app)} · ${padrao.nome}`
      : `${localDoApp(app)} · sem variação`

  return (
    <article
      data-alvo-imagem={`app:${app.id}`}
      className={`group relative ${sobreposta ? 'rotate-[1.5deg] cursor-grabbing' : 'cursor-pointer'}`}
      onClick={() => abrirApp(app.id)}
    >
      <div
        className={`relative overflow-hidden rounded-md transition-shadow duration-300 ${aberto ? 'ring-2 ring-destaque ring-offset-4 ring-offset-fundo' : ''} ${sobreposta ? 'shadow-[0_24px_60px_-16px_rgb(0_0_0/0.6)]' : ''}`}
      >
        <Capa
          nome={app.nome}
          imagem={app.imagem}
          ajuste={app.ajuste}
          className="aspect-[16/10] [&>*]:transition-transform [&>*]:duration-[400ms] [&>*]:ease-[var(--ease-expo)] group-hover:[&>*]:scale-[1.03]"
        />
        {principal && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-2 rounded-full bg-[color-mix(in_oklch,var(--color-escuro-1)_82%,transparent)] px-2.5 py-1 text-legenda font-semibold text-giz-1 backdrop-blur-sm">
            <span className="ponto-vivo" />
            {principal.estado === 'parando' ? 'parando' : 'rodando'}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug transition-colors duration-200 group-hover:text-destaque">
            <button className="max-w-full truncate text-left" onClick={(e) => (e.stopPropagation(), abrirApp(app.id))}>
              {app.nome}
            </button>
          </h3>
          <p className="truncate text-legenda text-texto-3">{linhaDeBaixo}</p>
        </div>

        {principal?.url && (
          <button
            className="icone-botao pequeno -mt-0.5"
            title={`Abrir ${principal.url}`}
            aria-label={`Abrir ${app.nome} no navegador`}
            onClick={(e) => {
              e.stopPropagation()
              api.abrirUrl(principal.url!).catch(avisarErro)
            }}
          >
            <ExternalLink className="size-4" />
          </button>
        )}
        {principal ? (
          <button
            className="icone-botao pequeno -mt-0.5 -mr-1.5"
            title="Parar"
            aria-label={`Parar ${app.nome}`}
            onClick={(e) => {
              e.stopPropagation()
              ativas.forEach((x) => parar(x.id))
            }}
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            className="icone-botao pequeno -mt-0.5 -mr-1.5 hover:text-destaque disabled:opacity-40 disabled:hover:bg-transparent"
            title={padrao ? `Rodar ${padrao.nome}` : 'Adicione uma variação para rodar'}
            aria-label={`Rodar ${app.nome}`}
            disabled={!padrao}
            onClick={(e) => {
              e.stopPropagation()
              if (padrao) rodar(app, padrao)
            }}
          >
            <Play className="size-4 fill-current" />
          </button>
        )}
      </div>
    </article>
  )
}

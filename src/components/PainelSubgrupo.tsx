// O painel de um subgrupo, à direita: o mosaico, o rodar e o parar tudo; cada app com o estado, a
// variação que entra no "rodar tudo", o rodar ou o parar só dele, o tirar do subgrupo e o "Onde rodar"
// (a worktree de cada um é independente); embaixo, a saída de todos os apps do subgrupo.

import { ExternalLink, Pencil, Play, Square, Ungroup, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { estaAtiva, pararSubgrupo, pastaDoApp, rodarSubgrupo, useExecucoes, useExecucoesDoApp } from '../lib/execucoes'
import { useMonitor } from '../lib/monitor'
import { acharSubgrupo, appsDoSubgrupo, variacaoNoSubgrupo } from '../lib/subgrupos'
import { formatarCpu, formatarMemoria, mesmaPasta, urlCurta } from '../lib/texto'
import type { App, Grupo, Subgrupo } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Capa } from './Capa'
import { Execucoes } from './Execucoes'
import { Mosaico } from './Mosaico'
import { OndeRodar } from './OndeRodar'

export function PainelSubgrupo() {
  const subgrupoAberto = useUi((s) => s.subgrupoAberto)
  const config = useConfig((s) => s.config)
  const achado = useMemo(() => acharSubgrupo(config, subgrupoAberto), [config, subgrupoAberto])
  const abrirSubgrupo = useUi((s) => s.abrirSubgrupo)
  const algumDialogo = useUi((s) => s.dialogo !== null || s.buscaAberta)

  useEffect(() => {
    if (!achado || algumDialogo) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) abrirSubgrupo(null)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [achado, algumDialogo, abrirSubgrupo])

  if (!achado) return null
  return (
    <>
      <div
        role="presentation"
        className="veu-painel aparece fixed inset-0 z-20 bg-[color-mix(in_oklch,var(--fundo)_45%,transparent)]"
        onClick={() => abrirSubgrupo(null)}
      />
      <aside
        className="vidro vidro-opaco entra-painel fixed top-0 right-0 bottom-0 z-30 flex w-[min(50rem,68vw)] flex-col border-l border-linha bg-elevada"
        aria-label={`Subgrupo ${achado.subgrupo.nome}`}
      >
        <ConteudoDoSubgrupo key={achado.subgrupo.id} subgrupo={achado.subgrupo} grupo={achado.grupo} />
      </aside>
    </>
  )
}

function ConteudoDoSubgrupo({ subgrupo, grupo }: { subgrupo: Subgrupo; grupo: Grupo }) {
  const { abrirSubgrupo, abrirDialogo, escolherAba } = useUi.getState()
  const apps = appsDoSubgrupo(subgrupo, grupo)
  const todas = useExecucoes((s) => s.execucoes)
  const execucoes = Object.values(todas)
    .filter((e) => apps.some((a) => a.id === e.appId))
    .sort((a, b) => b.inicio - a.inicio)
  const rodando = execucoes.some((e) => e.estado === 'rodando')
  const nomes = new Map(apps.map((a) => [a.id, a.nome]))

  const rodarTudo = async () => {
    const novas = await rodarSubgrupo(subgrupo, apps)
    if (novas[0]) escolherAba(subgrupo.id, novas[0].id)
  }

  return (
    <>
      <header className="flex gap-6 px-8 pt-7 pb-6">
        <Mosaico apps={apps} className="w-44 shrink-0 self-start rounded-md" />
        <div className="min-w-0 flex-1">
          <p className="text-legenda text-texto-3">{grupo.nome} · subgrupo</p>
          <h2 className="truncate text-titulo">{subgrupo.nome}</h2>
          <p className="mt-1 truncate text-apoio text-texto-2">{apps.map((a) => a.nome).join(' · ')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="botao pequeno" onClick={rodarTudo} title="Roda a variação de cada app, cada um na sua worktree">
              <Play className="size-3.5 fill-current" /> Rodar tudo
            </button>
            {rodando && (
              <button className="botao-2 pequeno" onClick={() => pararSubgrupo(apps)}>
                <Square className="size-3 fill-current" /> Parar tudo
              </button>
            )}
          </div>
        </div>
        <div className="-mt-2 -mr-3 flex shrink-0 self-start">
          <button
            className="icone-botao"
            onClick={() => abrirDialogo({ tipo: 'subgrupo', id: subgrupo.id })}
            aria-label="Editar o subgrupo"
            title="Editar"
          >
            <Pencil className="size-[1.05rem]" />
          </button>
          <button className="icone-botao" onClick={() => abrirSubgrupo(null)} aria-label="Fechar o painel" title="Fechar (Esc)">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-8 pb-7">
        <section>
          <h3 className="secao mb-1">Apps</h3>
          <ul className="divide-y divide-linha border-b border-linha">
            {apps.map((app) => (
              <Membro key={app.id} app={app} subgrupo={subgrupo} />
            ))}
          </ul>
        </section>

        {execucoes.length > 0 && (
          <section className="flex min-h-[22rem] flex-1 flex-col">
            <h3 className="secao mb-2.5">Execuções</h3>
            <Execucoes chave={subgrupo.id} execucoes={execucoes} nomeDoApp={(id) => nomes.get(id) ?? 'app'} />
          </section>
        )}
      </div>
    </>
  )
}

/** Um app do subgrupo: o estado, a variação do "rodar tudo", rodar ou parar só ele, tirar, e onde roda. */
function Membro({ app, subgrupo }: { app: App; subgrupo: Subgrupo }) {
  const { abrirApp, abrirSubgrupo, escolherAba } = useUi.getState()
  const { rodar, parar } = useExecucoes.getState()
  const escolherVariacao = useConfig((s) => s.escolherVariacaoNoSubgrupo)
  const execucoes = useExecucoesDoApp(app.id)
  const variacao = variacaoNoSubgrupo(subgrupo, app)
  const pasta = pastaDoApp(app)
  const ativa = variacao ? execucoes.find((e) => e.variacaoId === variacao.id && estaAtiva(e) && mesmaPasta(e.pasta, pasta)) : undefined
  const noutroLugar = execucoes.filter((e) => estaAtiva(e) && e.id !== ativa?.id)
  const uso = useMonitor((s) => (ativa ? s.uso[ativa.id] : undefined))

  const estado = ativa
    ? [ativa.estado === 'parando' ? 'parando…' : 'rodando', ativa.url && urlCurta(ativa.url), uso && `CPU ${formatarCpu(uso.cpu)}`, uso && formatarMemoria(uso.memoria)]
        .filter(Boolean)
        .join(' · ')
    : noutroLugar.length > 0
      ? `rodando noutro lugar: ${noutroLugar.map((e) => `${e.rotulo} em ${e.local}`).join(', ')}`
      : 'parado'

  // O app volta solto para a grade (e continua rodando, se estiver). Com um app só, o subgrupo se desfaz.
  const tirar = async () => {
    const resto = subgrupo.apps.filter((id) => id !== app.id)
    if (resto.length < 2) {
      const aviso = `Sem ${app.nome}, o subgrupo ${subgrupo.nome} fica com um app só e se desfaz.`
      if (!(await api.confirmar(aviso, 'Tirar do subgrupo', 'Tirar'))) return
      abrirSubgrupo(null)
    }
    useConfig.getState().editarSubgrupo(subgrupo.id, { apps: resto })
  }

  return (
    <li className="py-4">
      <div className="flex items-center gap-4">
        <button className="group/m flex min-w-0 flex-1 items-center gap-3.5 text-left" onClick={() => abrirApp(app.id)} title="Abrir o painel do app">
          <Capa nome={app.nome} imagem={app.imagem} ajuste={app.ajuste} tamanho="pequena" className="aspect-[16/10] w-16 shrink-0 rounded-[5px]" />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold transition-colors group-hover/m:text-destaque">
              {ativa && <span className="ponto-vivo" />}
              <span className="truncate">{app.nome}</span>
            </span>
            <span className={`block truncate text-legenda ${ativa ? 'text-destaque' : 'text-texto-3'}`}>{estado}</span>
          </span>
        </button>

        {app.variacoes.length > 1 ? (
          <select
            className="campo h-8 min-h-0 w-auto max-w-[11rem] py-0 pr-7 pl-2.5 text-legenda"
            value={variacao?.id}
            onChange={(e) => escolherVariacao(subgrupo.id, app.id, e.target.value)}
            aria-label={`A variação de ${app.nome} no rodar tudo`}
            title="A variação que entra no rodar tudo"
          >
            {app.variacoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-legenda text-texto-3">{variacao?.nome ?? 'sem variação'}</span>
        )}

        {ativa?.url && (
          <button className="icone-botao pequeno" onClick={() => api.abrirUrl(ativa.url!).catch(avisarErro)} title={`Abrir ${ativa.url}`} aria-label={`Abrir ${app.nome}`}>
            <ExternalLink className="size-4" />
          </button>
        )}
        {ativa ? (
          <button className="botao-2 pequeno" onClick={() => parar(ativa.id)} disabled={ativa.estado === 'parando'}>
            <Square className="size-3 fill-current" /> {ativa.estado === 'parando' ? 'Parando…' : 'Parar'}
          </button>
        ) : (
          <button
            className="botao-2 pequeno"
            disabled={!variacao}
            onClick={async () => {
              const e = variacao && (await rodar(app, variacao))
              if (e) escolherAba(subgrupo.id, e.id)
            }}
          >
            <Play className="size-3.5 fill-current" /> Rodar
          </button>
        )}
        <button className="icone-botao pequeno -mr-1.5" onClick={tirar} title="Tirar do subgrupo" aria-label={`Tirar ${app.nome} do subgrupo`}>
          <Ungroup className="size-4" />
        </button>
      </div>
      <div className="mt-3 pl-[5.375rem]">
        <OndeRodar app={app} />
      </div>
    </li>
  )
}

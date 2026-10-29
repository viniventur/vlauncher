// O painel de um app, à direita: a foto e os atalhos (VS Code, terminal, Claude Code, pasta), onde
// rodar, as variações e as execuções com a saída.

import { Bot, ChevronDown, Settings2, Code, ExternalLink, FolderOpen, Pencil, Play, Square, SquareTerminal, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { acharApp, useConfig } from '../lib/config'
import { estaAtiva, pastaDoApp, useExecucoes, useExecucoesDoApp, variacaoPadrao } from '../lib/execucoes'
import { mesmaPasta, urlCurta } from '../lib/texto'
import { contasDoClaude, corDaConta } from '../lib/claude'
import type { App, Execucao, Grupo } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Capa } from './Capa'
import { Execucoes } from './Execucoes'
import { Menu } from './Flutuante'
import { OndeRodar } from './OndeRodar'

export function Painel() {
  const appAberto = useUi((s) => s.appAberto)
  const config = useConfig((s) => s.config)
  const achado = useMemo(() => acharApp(config, appAberto), [config, appAberto])
  const abrirApp = useUi((s) => s.abrirApp)
  const algumDialogo = useUi((s) => s.dialogo !== null || s.buscaAberta)

  useEffect(() => {
    if (!achado || algumDialogo) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) abrirApp(null)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [achado, algumDialogo, abrirApp])

  if (!achado) return null
  return (
    <>
      {/* O véu fecha com um clique (no teclado, Esc). */}
      <div role="presentation" className="veu-painel aparece fixed inset-0 z-20 bg-[color-mix(in_oklch,var(--fundo)_45%,transparent)]" onClick={() => abrirApp(null)} />
      <aside
        className="vidro vidro-opaco entra-painel fixed top-0 right-0 bottom-0 z-30 flex w-[min(50rem,68vw)] flex-col border-l border-linha bg-elevada"
        aria-label={achado.app.nome}
      >
        <ConteudoDoPainel key={achado.app.id} app={achado.app} grupo={achado.grupo} />
      </aside>
    </>
  )
}

function ConteudoDoPainel({ app, grupo }: { app: App; grupo: Grupo }) {
  const { abrirApp, abrirDialogo } = useUi.getState()
  const pasta = pastaDoApp(app)
  const execucoes = useExecucoesDoApp(app.id)

  const atalhos = [
    { rotulo: 'VS Code', icone: <Code />, acao: () => api.abrirVscode(pasta) },
    { rotulo: 'Terminal', icone: <SquareTerminal />, acao: () => api.abrirTerminal(pasta) },
    { rotulo: 'Pasta', icone: <FolderOpen />, acao: () => api.abrirPasta(pasta) },
  ]
  const contas = useConfig((s) => contasDoClaude(s.config))

  return (
    <>
      <header className="flex gap-6 px-8 pt-7 pb-6">
        <button
          data-alvo-imagem={`app:${app.id}`}
          onClick={() => abrirDialogo({ tipo: 'app', id: app.id })}
          className="w-44 shrink-0 self-start rounded-md"
          title={`Trocar a foto (ou arraste uma imagem para cá)${app.imagemOrigem ? `\nVeio de ${app.imagemOrigem}` : ''}`}
        >
          <Capa nome={app.nome} imagem={app.imagem} ajuste={app.ajuste} className="aspect-[16/10] rounded-md" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-legenda text-texto-3">{grupo.nome}</p>
          <h2 className="truncate text-titulo">{app.nome}</h2>
          {app.descricao && <p className="mt-1 text-apoio text-texto-2">{app.descricao}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {atalhos.slice(0, 2).map((a) => (
              <button key={a.rotulo} className="botao-2 pequeno [&>svg]:size-3.5" onClick={() => a.acao().catch(avisarErro)} title={`Abrir em ${pasta}`}>
                {a.icone} {a.rotulo}
              </button>
            ))}
            <Menu
              lado="esquerda"
              titulo="Abrir com a conta"
              gatilho={(abrir, aberto) => (
                <button className="botao-2 pequeno [&>svg]:size-3.5" onClick={abrir} aria-expanded={aberto} title={`Claude Code em ${pasta}`}>
                  <Bot /> Claude Code <ChevronDown className="-mr-0.5 size-3! opacity-70" />
                </button>
              )}
              itens={[
                ...contas.map((c, i) => ({
                  rotulo: c.nome,
                  detalhe: c.comando,
                  icone: <span className={`size-2 rounded-full ${corDaConta(i)}`} />,
                  acao: () => api.abrirClaude(pasta, c.comando).catch(avisarErro),
                })),
                null,
                { rotulo: 'Configurar contas…', icone: <Settings2 />, acao: () => abrirDialogo({ tipo: 'contas' }) },
              ]}
            />
            {atalhos.slice(2).map((a) => (
              <button key={a.rotulo} className="botao-2 pequeno [&>svg]:size-3.5" onClick={() => a.acao().catch(avisarErro)} title={`Abrir em ${pasta}`}>
                {a.icone} {a.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="-mt-2 -mr-3 flex shrink-0 self-start">
          <button className="icone-botao" onClick={() => abrirDialogo({ tipo: 'app', id: app.id })} aria-label="Editar o app" title="Editar">
            <Pencil className="size-[1.05rem]" />
          </button>
          <button className="icone-botao" onClick={() => abrirApp(null)} aria-label="Fechar o painel" title="Fechar (Esc)">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-8 pb-7">
        <section>
          <h3 className="secao mb-2.5">Onde rodar</h3>
          <OndeRodar app={app} />
        </section>

        <section>
          <h3 className="secao mb-1">Variações</h3>
          <Variacoes app={app} execucoes={execucoes} />
        </section>

        {execucoes.length > 0 && (
          <section className="flex min-h-[22rem] flex-1 flex-col">
            <h3 className="secao mb-2.5">Execuções</h3>
            <Execucoes chave={app.id} execucoes={execucoes} />
          </section>
        )}
      </div>
    </>
  )
}

function Variacoes({ app, execucoes }: { app: App; execucoes: Execucao[] }) {
  const { rodar, parar } = useExecucoes.getState()
  const escolherAba = useUi((s) => s.escolherAba)
  const abrirDialogo = useUi((s) => s.abrirDialogo)
  const padrao = variacaoPadrao(app)
  const pasta = pastaDoApp(app)

  if (app.variacoes.length === 0) {
    return (
      <p className="py-3 text-apoio text-texto-2">
        Nenhuma variação ainda.{' '}
        <button className="font-semibold text-destaque underline underline-offset-[0.2em]" onClick={() => abrirDialogo({ tipo: 'app', id: app.id })}>
          Adicionar
        </button>
      </p>
    )
  }

  return (
    <ul className="divide-y divide-linha border-b border-linha">
      {app.variacoes.map((v) => {
        const ativa = execucoes.find((e) => e.variacaoId === v.id && estaAtiva(e) && mesmaPasta(e.pasta, pasta))
        const ehPadrao = v.id === padrao?.id
        return (
          <li key={v.id} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {ativa && <span className="ponto-vivo" />}
                {v.nome}
                {ehPadrao && <span className="text-legenda font-normal text-texto-3 italic">padrão</span>}
                {v.noTerminal && <span className="text-legenda font-normal text-texto-3 italic">no Terminal</span>}
              </p>
              <p className="truncate font-mono text-codigo text-texto-3" title={v.comando}>
                {v.env.length > 0 && <span>{v.env.map(([k, val]) => `${k}=${val}`).join(' ')} </span>}
                {v.comando}
              </p>
            </div>
            {ativa?.url && (
              <button className="botao-2 pequeno" onClick={() => api.abrirUrl(ativa.url!).catch(avisarErro)}>
                <ExternalLink className="size-3.5" /> {urlCurta(ativa.url)}
              </button>
            )}
            {ativa ? (
              <button className="botao-2 pequeno" onClick={() => parar(ativa.id)} disabled={ativa.estado === 'parando'}>
                <Square className="size-3 fill-current" /> {ativa.estado === 'parando' ? 'Parando…' : 'Parar'}
              </button>
            ) : (
              <button
                className={`${ehPadrao ? 'botao' : 'botao-2'} pequeno`}
                onClick={async () => {
                  const e = await rodar(app, v)
                  if (e) escolherAba(app.id, e.id)
                }}
              >
                <Play className="size-3.5 fill-current" /> Rodar
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

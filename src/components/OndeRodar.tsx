// Onde rodar: a pasta principal ou uma das worktrees, e as branches que ainda não têm worktree (que
// ganham uma num clique). Embaixo, o que falta na pasta escolhida: node_modules, .env, .npmrc. Num
// monorepo, o app roda na mesma subpasta de cada worktree (o Rust já devolve essa pasta).

import { Check, FolderGit2, GitBranch, GitBranchPlus, Package, RefreshCw, Search, TriangleAlert, ArrowRightLeft, FileKey } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { avisar, avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { pastaDoApp, useExecucoes, useExecucoesDoApp } from '../lib/execucoes'
import { rotuloDaWorktree } from '../lib/git'
import { combina, haQuanto, mesmaPasta, nomeDaPasta, relativoA } from '../lib/texto'
import type { App, Branch, Locais, Worktree } from '../lib/tipos'
import { Flutuante } from './Flutuante'

const ROTULO_INSTALAR = 'instalar dependências'

export function OndeRodar({ app }: { app: App }) {
  const editarApp = useConfig((s) => s.editarApp)
  const [locais, setLocais] = useState<Locais | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setLocais(await api.listarLocais(app.pasta))
      setErro(null)
    } catch (e) {
      setErro(String(e))
    }
  }, [app.pasta])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Mantém o rótulo em dia (a branch da pasta principal pode ter mudado fora do launcher) e volta
  // para a principal se a worktree escolhida sumiu.
  useEffect(() => {
    if (!locais?.ehGit) return
    const atual = locais.worktrees.find((w) => mesmaPasta(w.pasta, pastaDoApp(app)))
    if (!atual) {
      const principal = locais.worktrees[0]
      editarApp(app.id, { pastaAtual: undefined, localAtual: principal ? rotuloDaWorktree(principal) : undefined })
    } else if (rotuloDaWorktree(atual) !== app.localAtual) {
      editarApp(app.id, { localAtual: rotuloDaWorktree(atual) })
    }
    // Só quando a lista chega: o app muda por causa deste efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locais])

  // Terminou de instalar as dependências: a lista é refeita (o aviso some).
  const instalacoes = useExecucoesDoApp(app.id).filter((e) => e.rotulo === ROTULO_INSTALAR)
  const terminadas = instalacoes.filter((e) => e.estado === 'encerrada').length
  const instalando = instalacoes.some((e) => e.estado !== 'encerrada')
  const terminadasAntes = useRef(terminadas)
  useEffect(() => {
    if (terminadas > terminadasAntes.current) carregar()
    terminadasAntes.current = terminadas
  }, [terminadas, carregar])

  if (erro) return <p className="text-apoio text-erro">{erro}</p>
  if (!locais) return <div className="h-14 animate-pulse rounded-lg bg-superficie" />
  if (!locais.ehGit) {
    return (
      <p className="flex items-center gap-2 text-apoio text-texto-2">
        <FolderGit2 className="size-4 text-texto-3" /> {app.pasta} <span className="text-texto-3">· não é um repositório git</span>
      </p>
    )
  }

  const atual = locais.worktrees.find((w) => mesmaPasta(w.pasta, pastaDoApp(app))) ?? locais.worktrees[0]
  const raiz = locais.worktrees[0]?.caminho ?? app.pasta

  const escolher = (w: Worktree) =>
    editarApp(app.id, { pastaAtual: w.principal ? undefined : w.pasta, localAtual: rotuloDaWorktree(w) })

  const instalar = async (w: Worktree) => {
    const projeto = await api.inspecionarPasta(w.pasta).catch(() => null)
    const gerenciador = projeto?.gerenciador ?? 'npm'
    const comando = gerenciador === 'npm' ? 'npm ci' : `${gerenciador} install`
    useExecucoes.getState().rodarComando(app, ROTULO_INSTALAR, comando, w.pasta, rotuloDaWorktree(w))
  }

  const copiar = async (w: Worktree) => {
    try {
      const copiados = await api.copiarArquivosLocais(locais.worktrees[0]!.pasta, w.pasta)
      avisar(copiados.length ? `Copiei ${copiados.join(', ')} da pasta principal.` : 'Nada a copiar.')
      carregar()
    } catch (e) {
      avisarErro(e)
    }
  }

  return (
    <div className="grid gap-3">
      <Flutuante
        className="w-[min(36rem,calc(100vw-4rem))]"
        gatilho={(abrir, aberto) => (
          <button
            onClick={abrir}
            aria-expanded={aberto}
            className="vidro flex w-full items-center gap-3 rounded-lg border border-linha bg-fundo px-4 py-2.5 text-left transition-colors hover:border-[color-mix(in_oklch,var(--texto)_35%,var(--linha))]"
          >
            <GitBranch className="size-4 shrink-0 text-destaque" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{atual ? rotuloDaWorktree(atual) : '—'}</span>
              <span className="block truncate text-legenda text-texto-3">
                {atual?.principal ? 'pasta principal' : atual ? relativoA(atual.caminho, raiz) : ''}
                {locais.subpasta && ` · ${locais.subpasta}`}
              </span>
            </span>
            <span className="text-legenda text-texto-3">
              {locais.worktrees.length} {locais.worktrees.length === 1 ? 'pasta' : 'pastas'} · trocar
            </span>
          </button>
        )}
      >
        {(fechar) => (
          <Lista
            app={app}
            locais={locais}
            atual={atual}
            recarregar={carregar}
            fechar={fechar}
            escolher={(w) => {
              escolher(w)
              fechar()
            }}
          />
        )}
      </Flutuante>

      {atual && !atual.existe && (
        <Aviso icone={<TriangleAlert />} texto="A pasta desta worktree não existe mais (o git pode podá-la)." />
      )}
      {atual?.precisaDependencias && (
        <Aviso icone={<Package />} texto="Esta pasta está sem node_modules.">
          <button className="botao-2 pequeno" disabled={instalando} onClick={() => instalar(atual)}>
            {instalando ? 'Instalando…' : 'Instalar dependências'}
          </button>
        </Aviso>
      )}
      {atual && atual.arquivosFaltando.length > 0 && (
        <Aviso icone={<FileKey />} texto={`Faltam ${atual.arquivosFaltando.join(', ')} (estão na pasta principal).`}>
          <button className="botao-2 pequeno" onClick={() => copiar(atual)}>
            Copiar da principal
          </button>
        </Aviso>
      )}
    </div>
  )
}

function Aviso({ icone, texto, children }: { icone: React.ReactNode; texto: string; children?: React.ReactNode }) {
  return (
    <div className="vidro flex items-center gap-3 rounded-lg bg-superficie px-4 py-2.5 text-apoio text-texto-2">
      <span className="text-texto-3 [&>svg]:size-4">{icone}</span>
      <span className="min-w-0 flex-1">{texto}</span>
      {children}
    </div>
  )
}

interface PropsLista {
  app: App
  locais: Locais
  atual: Worktree | undefined
  recarregar: () => Promise<void>
  /** Criou a worktree ou trocou a branch: a escolha está feita, a lista fecha. */
  fechar: () => void
  escolher: (w: Worktree) => void
}

function Lista({ app, locais, atual, recarregar, fechar, escolher }: PropsLista) {
  const editarApp = useConfig((s) => s.editarApp)
  const raiz = locais.worktrees[0]?.caminho ?? app.pasta
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const worktrees = useMemo(
    () => locais.worktrees.filter((w) => combina(busca, w.branch, w.head, relativoA(w.caminho, raiz))),
    [locais.worktrees, busca, raiz],
  )
  const branches = useMemo(() => locais.branches.filter((b) => combina(busca, b.nome)).slice(0, busca ? 60 : 25), [locais.branches, busca])

  const criar = async (b: Branch) => {
    setOcupado(b.nome)
    try {
      const caminho = await api.criarWorktree(app.pasta, b.nome, b.remota, app.pastaWorktrees)
      const pasta = locais.subpasta ? `${caminho}\\${locais.subpasta}` : caminho
      // A worktree nova nasce sem os arquivos locais: copia logo (nunca sobrescreve).
      const copiados = await api.copiarArquivosLocais(locais.worktrees[0]!.pasta, pasta).catch(() => [])
      const local = b.remota ? b.nome.slice(b.nome.indexOf('/') + 1) : b.nome
      editarApp(app.id, { pastaAtual: pasta, localAtual: local })
      avisar(`Worktree criada em ${nomeDaPasta(caminho)}${copiados.length ? `, com ${copiados.join(', ')}` : ''}.`)
      await recarregar()
      fechar()
    } catch (e) {
      avisarErro(e)
    } finally {
      setOcupado(null)
    }
  }

  const trocar = async (b: Branch) => {
    setOcupado(b.nome)
    try {
      await api.trocarBranch(app.pasta, b.nome, b.remota)
      editarApp(app.id, { pastaAtual: undefined })
      avisar(`A pasta principal agora está em ${b.nome}.`)
      await recarregar()
      fechar()
    } catch (e) {
      avisarErro(e)
    } finally {
      setOcupado(null)
    }
  }

  const buscarRemotas = async () => {
    setOcupado('fetch')
    try {
      await api.buscarBranches(app.pasta)
      await recarregar()
    } catch (e) {
      avisarErro(e)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="flex max-h-[min(34rem,70vh)] flex-col">
      <label className="flex items-center gap-2.5 border-b border-linha px-4 py-3">
        <Search className="size-4 text-texto-3" />
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar branch ou worktree"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-texto-3"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <p className="secao px-4 pt-1 pb-1.5">Pastas</p>
        <ul>
          {worktrees.map((w) => {
            const escolhida = atual && mesmaPasta(atual.pasta, w.pasta)
            return (
              <li key={w.caminho}>
                <button
                  onClick={() => escolher(w)}
                  disabled={!w.existe}
                  className="flex w-full items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-[color-mix(in_oklch,var(--texto)_7%,transparent)] disabled:opacity-45"
                >
                  <span className="mt-1 w-4 shrink-0 text-destaque">{escolhida && <Check className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{rotuloDaWorktree(w)}</span>
                    <span className="block truncate text-legenda text-texto-3">
                      {w.principal ? 'pasta principal' : relativoA(w.caminho, raiz)}
                      {w.precisaDependencias && ' · sem node_modules'}
                      {w.arquivosFaltando.length > 0 && ` · sem ${w.arquivosFaltando.join(', ')}`}
                      {!w.existe && ' · pasta apagada'}
                    </span>
                  </span>
                  {w.data && <span className="mt-0.5 shrink-0 text-legenda text-texto-3">{haQuanto(w.data)}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {branches.length > 0 && (
          <>
            <p className="secao mt-2 border-t border-linha px-4 pt-3 pb-1.5">Branches sem worktree</p>
            <ul>
              {branches.map((b) => (
                <li key={b.nome} className="group/b flex items-center gap-3 px-4 py-1.5 hover:bg-[color-mix(in_oklch,var(--texto)_7%,transparent)]">
                  <GitBranch className="size-4 shrink-0 text-texto-3" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${b.remota ? 'text-texto-2' : ''}`}>{b.nome}</span>
                    <span className="block text-legenda text-texto-3">{haQuanto(b.data)}</span>
                  </span>
                  {ocupado === b.nome ? (
                    <RefreshCw className="size-4 animate-spin text-texto-3" />
                  ) : (
                    <span className="flex gap-1.5 opacity-0 transition-opacity group-hover/b:opacity-100 focus-within:opacity-100">
                      <button
                        className="botao-2 pequeno"
                        title="Usar esta branch na pasta principal (só com a pasta limpa)"
                        onClick={() => trocar(b)}
                      >
                        <ArrowRightLeft className="size-3.5" /> Na principal
                      </button>
                      <button className="botao pequeno" title="Criar uma worktree desta branch" onClick={() => criar(b)}>
                        <GitBranchPlus className="size-3.5" /> Worktree
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-linha px-4 py-2.5 text-legenda text-texto-3">
        <span className="flex-1">Worktrees novas em {app.pastaWorktrees || '.claude\\worktrees'}</span>
        <button className="botao-2 pequeno" onClick={buscarRemotas} disabled={ocupado === 'fetch'}>
          <RefreshCw className={`size-3.5 ${ocupado === 'fetch' ? 'animate-spin' : ''}`} /> Buscar no remoto
        </button>
      </div>
    </div>
  )
}

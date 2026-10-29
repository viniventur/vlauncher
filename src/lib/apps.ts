// Os apps: onde cada um roda, a variação padrão, e como achar um app pelo nome ou pela pasta (o que
// o `vl` precisa: src/lib/canal.ts). Só funções puras, sem a ponte com o Rust.

import { rotuloDaWorktree } from './git'
import { combina, estaDentro, mesmaPasta, nomeDaPasta, normalizar, relativoA } from './texto'
import type { App, Config, Grupo, OndeEsta, Variacao, Worktree } from './tipos'

export const pastaDoApp = (app: App) => app.pastaAtual ?? app.pasta
export const localDoApp = (app: App) => app.localAtual ?? (app.pastaAtual ? nomeDaPasta(app.pastaAtual) : 'pasta principal')
export const variacaoPadrao = (app: App) => app.variacoes.find((v) => v.id === app.variacaoPadrao) ?? app.variacoes[0]

/** Um pedido do `vl` que não dá para atender como veio: a mensagem vai para quem chamou. */
export class Recusa extends Error {}

export interface AppAchado {
  app: App
  grupo: Grupo
}

export const todosOsApps = (config: Config): AppAchado[] => config.grupos.flatMap((grupo) => grupo.apps.map((app) => ({ app, grupo })))

/** "Finanças Pessoais" e "financas-pessoais" → "financaspessoais". */
export const chaveDoNome = (texto: string) => normalizar(texto).replace(/[^a-z0-9]/g, '')

/** O nome é o do app: o id, ou o nome ou o da pasta, sem acento, espaço nem pontuação. */
export function appDoNome(app: App, consulta: string) {
  const chave = chaveDoNome(consulta)
  return app.id === consulta || chaveDoNome(app.nome) === chave || chaveDoNome(nomeDaPasta(app.pasta)) === chave
}

/**
 * Os apps que o nome indica: os de nome igual (sem acento, espaço nem pontuação; vale também o nome
 * da pasta) e, sem nenhum assim, os que têm todas as palavras do nome.
 */
export function appsPeloNome(config: Config, consulta: string): AppAchado[] {
  const todos = todosOsApps(config)
  const chave = chaveDoNome(consulta)
  if (!chave) return []
  const iguais = todos.filter(({ app }) => appDoNome(app, consulta))
  if (iguais.length > 0) return iguais
  return todos.filter(
    ({ app, grupo }) => combina(consulta, app.nome, grupo.nome, nomeDaPasta(app.pasta)) || chaveDoNome(app.nome).includes(chave),
  )
}

/** A pasta do app numa worktree do repositório dele: a mesma subpasta (num monorepo) dentro da raiz. */
export function pastaNaWorktree(app: App, onde: OndeEsta): string | null {
  if (!estaDentro(app.pasta, onde.raizPrincipal)) return null
  if (mesmaPasta(app.pasta, onde.raizPrincipal)) return onde.raiz
  return `${onde.raiz}\\${relativoA(app.pasta, onde.raizPrincipal)}`
}

/**
 * Os apps de uma pasta: o de pasta mais funda que a contém (a principal, a escolhida em "Onde rodar"
 * ou a da worktree em que a pasta está). Num monorepo, o app da subpasta ganha do que é o repositório
 * inteiro. Fora da pasta de qualquer app, mas num repositório do launcher, vêm os apps dele.
 */
export function appsDaPasta(config: Config, pasta: string, onde: OndeEsta | null): AppAchado[] {
  let melhores: AppAchado[] = []
  let fundura = -1
  for (const achado of todosOsApps(config)) {
    const { app } = achado
    const pastas = [app.pasta, app.pastaAtual, onde && pastaNaWorktree(app, onde)].filter((p): p is string => Boolean(p))
    const contem = pastas.filter((p) => estaDentro(pasta, p))
    if (contem.length === 0) continue
    const maisFunda = Math.max(...contem.map((p) => p.split(/[\\/]+/).filter(Boolean).length))
    if (maisFunda > fundura) {
      melhores = [achado]
      fundura = maisFunda
    } else if (maisFunda === fundura) {
      melhores.push(achado)
    }
  }
  if (melhores.length > 0 || !onde) return melhores
  return todosOsApps(config).filter(({ app }) => estaDentro(app.pasta, onde.raizPrincipal))
}

/** A variação pelo nome ("dev:all", "preview"; um pedaço basta se só uma combinar); sem nome, a padrão. */
export function acharVariacao(app: App, nome?: string): Variacao {
  const padrao = variacaoPadrao(app)
  if (!padrao) throw new Recusa(`${app.nome} não tem variação: adicione uma no launcher.`)
  if (!nome?.trim()) return padrao
  const chave = chaveDoNome(nome)
  const iguais = app.variacoes.filter((v) => v.id === nome || chaveDoNome(v.nome) === chave)
  if (iguais.length === 1) return iguais[0]!
  const parecidas = iguais.length > 1 ? iguais : app.variacoes.filter((v) => combina(nome, v.nome))
  if (parecidas.length === 1) return parecidas[0]!
  if (parecidas.length > 1) throw new Recusa(`"${nome}" pode ser ${parecidas.map((v) => v.nome).join(', ')}: diga qual.`)
  throw new Recusa(`${app.nome} não tem a variação "${nome}". As que tem: ${app.variacoes.map((v) => v.nome).join(', ')}.`)
}

/** A worktree pedida pelo `--local`: a branch (com ou sem a pontuação), o nome da pasta ou o caminho. */
export function acharWorktree(worktrees: Worktree[], local: string): Worktree | undefined {
  const chave = chaveDoNome(local)
  return (
    worktrees.find((w) => w.branch?.toLowerCase() === local.toLowerCase()) ??
    worktrees.find((w) => mesmaPasta(w.caminho, local) || mesmaPasta(w.pasta, local)) ??
    worktrees.find((w) => (w.branch && chaveDoNome(w.branch) === chave) || chaveDoNome(nomeDaPasta(w.caminho)) === chave || rotuloDaWorktree(w) === local)
  )
}

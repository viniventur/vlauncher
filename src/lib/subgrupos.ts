// Os subgrupos: apps do mesmo grupo que formam um sistema (o front e a API, em repositórios separados).
// Os apps continuam na lista do grupo, e o subgrupo só aponta para eles. Aqui fica a lógica pura: a
// grade da galeria, a ordem depois de arrastar, a variação do "rodar tudo", as sugestões, o juntar
// arrastando e a limpeza.

import { appDoNome, appsPeloNome, chaveDoNome, variacaoPadrao, type AppAchado } from './apps'
import { combina, mesmaPasta, nomeDaPasta, pastaDe } from './texto'
import type { App, Config, Grupo, Subgrupo, Variacao } from './tipos'

/** Um item da grade de um grupo: um app solto, ou um subgrupo com os apps dele (na ordem do subgrupo). */
export type ItemDaGrade = { tipo: 'app'; app: App } | { tipo: 'subgrupo'; subgrupo: Subgrupo; apps: App[] }

export interface SubgrupoAchado {
  subgrupo: Subgrupo
  grupo: Grupo
}

type ComSubgrupos = Pick<Grupo, 'apps' | 'subgrupos'>

/**
 * Os subgrupos que valem: só com apps do grupo, cada app num subgrupo só (vale o primeiro) e com dois
 * ou mais apps. O que sobra de um subgrupo quebrado (um app apagado à mão no launcher.json) é ignorado.
 */
export function subgruposValidos(grupo: ComSubgrupos): Subgrupo[] {
  const existem = new Set(grupo.apps.map((a) => a.id))
  const usados = new Set<string>()
  const validos: Subgrupo[] = []
  for (const subgrupo of grupo.subgrupos ?? []) {
    const apps = [...new Set(subgrupo.apps)].filter((id) => existem.has(id) && !usados.has(id))
    if (apps.length < 2) continue
    apps.forEach((id) => usados.add(id))
    validos.push(apps.length === subgrupo.apps.length ? subgrupo : { ...subgrupo, apps })
  }
  return validos
}

/** Os apps do subgrupo, na ordem dele. */
export function appsDoSubgrupo(subgrupo: Subgrupo, grupo: Pick<Grupo, 'apps'>): App[] {
  const porId = new Map(grupo.apps.map((a) => [a.id, a]))
  return subgrupo.apps.map((id) => porId.get(id)).filter((a): a is App => Boolean(a))
}

/**
 * A grade do grupo, na ordem de `grupo.apps` (durante um arrasto, a ordem provisória): o subgrupo entra
 * no lugar do primeiro app dele, e os outros apps dele não aparecem soltos.
 */
export function itensDaGrade(grupo: ComSubgrupos): ItemDaGrade[] {
  const subgrupos = subgruposValidos(grupo)
  const doApp = new Map(subgrupos.flatMap((s) => s.apps.map((id) => [id, s] as const)))
  const postos = new Set<string>()
  const itens: ItemDaGrade[] = []
  for (const app of grupo.apps) {
    const subgrupo = doApp.get(app.id)
    if (!subgrupo) {
      itens.push({ tipo: 'app', app })
    } else if (!postos.has(subgrupo.id)) {
      postos.add(subgrupo.id)
      itens.push({ tipo: 'subgrupo', subgrupo, apps: appsDoSubgrupo(subgrupo, grupo) })
    }
  }
  return itens
}

/** O id de um item da grade (o do app ou o do subgrupo), o mesmo do arrastar. */
export const idDoItem = (item: ItemDaGrade) => (item.tipo === 'app' ? item.app.id : item.subgrupo.id)

/** Depois de arrastar na grade (os ids dos itens, apps e subgrupos), a ordem dos apps do grupo. */
export function ordemDosApps(itens: string[], grupo: ComSubgrupos): string[] {
  const subgrupos = new Map(subgruposValidos(grupo).map((s) => [s.id, s]))
  return itens.flatMap((id) => subgrupos.get(id)?.apps ?? [id])
}

/** A variação do app no "rodar tudo": a escolhida no subgrupo, se ainda existir; senão, a padrão do app. */
export function variacaoNoSubgrupo(subgrupo: Subgrupo, app: App): Variacao | undefined {
  const escolhida = subgrupo.variacoes?.[app.id]
  return app.variacoes.find((v) => v.id === escolhida) ?? variacaoPadrao(app)
}

/** A pasta de uma API ou de um back (que sobe antes do front no "rodar tudo"). */
const PARECE_API = /(^|[-_.])(back|backend|api|server|servidor|core)([-_.]|$)/i

/** A ordem do rodar tudo: a API (ou o back) antes do front, pelo nome da pasta. */
export function aApiPrimeiro(apps: App[]): App[] {
  const peso = (a: App) => (PARECE_API.test(nomeDaPasta(a.pasta)) ? 0 : 1)
  return [...apps].sort((a, b) => peso(a) - peso(b))
}

/**
 * Os subgrupos sugeridos: os apps fora de subgrupos que moram na mesma pasta-mãe (que não é a pasta do
 * grupo), dois ou mais, com o nome dela. A API vai antes do front.
 */
export function sugestoesDeSubgrupos(grupo: Grupo): { nome: string; apps: string[] }[] {
  const ocupados = new Set(subgruposValidos(grupo).flatMap((s) => s.apps))
  const porMae = new Map<string, App[]>()
  for (const app of grupo.apps) {
    const mae = pastaDe(app.pasta)
    if (ocupados.has(app.id) || (grupo.pasta && mesmaPasta(mae, grupo.pasta))) continue
    const chave = mae.toLowerCase()
    porMae.set(chave, [...(porMae.get(chave) ?? []), app])
  }
  return [...porMae.values()]
    .filter((apps) => apps.length >= 2)
    .map((apps) => ({ nome: nomeDaPasta(pastaDe(apps[0]!.pasta)), apps: aApiPrimeiro(apps).map((a) => a.id) }))
}

const SEPARADOR = /[\s\-_.]/

/** O começo comum dos nomes, inteiro até um separador: "receitas-api" e "receitas-web" dão "receitas". */
function comecoComum(nomes: string[]) {
  const primeiro = nomes[0] ?? ''
  const limite = Math.min(...nomes.map((n) => n.length))
  let i = 0
  while (i < limite && nomes.every((n) => n[i]!.toLowerCase() === primeiro[i]!.toLowerCase())) i++
  // Cortado no meio de uma palavra ("loja-online" e "loja-admin" param em "loja-a"), volta ao separador.
  const inteiro = nomes.every((n) => i === n.length || SEPARADOR.test(n[i]!))
  const ate = inteiro ? i : primeiro.slice(0, i).search(/[\s\-_.][^\s\-_.]*$/)
  return primeiro.slice(0, Math.max(0, ate)).replace(/[\s\-_.]+$/, '')
}

/**
 * O nome do subgrupo que nasce de juntar os apps arrastando: a pasta-mãe comum (se não for a do grupo),
 * senão o começo comum dos nomes, senão os nomes, com "+". Nunca o nome de um app: o `vl` empataria.
 */
export function nomeAoJuntar(apps: App[], grupo: Pick<Grupo, 'pasta'>, nomesDosApps: string[]): string {
  const deApp = new Set(nomesDosApps.map(chaveDoNome))
  const serve = (nome: string) => nome.length >= 3 && !deApp.has(chaveDoNome(nome))
  const mae = pastaDe(apps[0]!.pasta)
  const mesmaMae = apps.every((a) => mesmaPasta(pastaDe(a.pasta), mae)) && !(grupo.pasta && mesmaPasta(mae, grupo.pasta))
  if (mesmaMae && serve(nomeDaPasta(mae))) return nomeDaPasta(mae)
  const comum = comecoComum(apps.map((a) => a.nome))
  if (serve(comum)) return comum
  return apps.map((a) => a.nome).join(' + ')
}

/**
 * A ordem dos apps depois de juntar arrastando: o app sai de onde estava (de qualquer grupo) e entra logo
 * depois de `depoisDe`, no grupo do alvo. Assim, o subgrupo fica no lugar do alvo.
 */
export function ordemAoJuntar(ordem: Record<string, string[]>, appId: string, grupoId: string, depoisDe: string): Record<string, string[]> {
  const sem = Object.fromEntries(Object.entries(ordem).map(([g, ids]) => [g, ids.filter((id) => id !== appId)]))
  const destino = [...(sem[grupoId] ?? [])]
  const i = destino.indexOf(depoisDe)
  destino.splice(i < 0 ? destino.length : i + 1, 0, appId)
  return { ...sem, [grupoId]: destino }
}

/** O grupo com os subgrupos limpos: sem app que saiu do grupo, e sem subgrupo de menos de dois apps. */
export function normalizar<G extends ComSubgrupos>(grupo: G): G {
  return grupo.subgrupos ? { ...grupo, subgrupos: subgruposValidos(grupo) } : grupo
}

/** O grupo sem o app (removido ou levado para outro grupo), com os subgrupos limpos. */
export function semOApp<G extends ComSubgrupos>(grupo: G, appId: string): G {
  return normalizar({ ...grupo, apps: grupo.apps.filter((a) => a.id !== appId) })
}

/** O nome é o do subgrupo: o id, ou o nome sem acento, espaço nem pontuação. */
const subgrupoDoNome = (subgrupo: Subgrupo, consulta: string) => subgrupo.id === consulta || chaveDoNome(subgrupo.nome) === chaveDoNome(consulta)

/**
 * Os subgrupos que o nome indica, como os apps no `vl`: os de nome igual (sem acento, espaço nem
 * pontuação) e, sem nenhum assim, os que têm todas as palavras do nome.
 */
export function subgruposPeloNome(config: Config, consulta: string): SubgrupoAchado[] {
  const chave = chaveDoNome(consulta)
  if (!chave) return []
  const todos = config.grupos.flatMap((grupo) => subgruposValidos(grupo).map((subgrupo) => ({ subgrupo, grupo })))
  const iguais = todos.filter(({ subgrupo }) => subgrupoDoNome(subgrupo, consulta))
  if (iguais.length > 0) return iguais
  return todos.filter(({ subgrupo, grupo }) => combina(consulta, subgrupo.nome, grupo.nome) || chaveDoNome(subgrupo.nome).includes(chave))
}

/**
 * O que o nome pedido ao `vl` indica, apps e subgrupos. O nome igual ganha do pedaço, seja de app ou de
 * subgrupo: "loja" é o subgrupo loja, e não os apps loja-api e loja-front. Um app e um subgrupo com o
 * mesmo nome se separam pela palavra na frente: "app loja", "subgrupo loja".
 */
export function alvosPeloNome(config: Config, consulta: string): { apps: AppAchado[]; subgrupos: SubgrupoAchado[] } {
  const apps = appsPeloNome(config, consulta)
  const subgrupos = subgruposPeloNome(config, consulta)
  const iguais = {
    apps: apps.filter(({ app }) => appDoNome(app, consulta)),
    subgrupos: subgrupos.filter(({ subgrupo }) => subgrupoDoNome(subgrupo, consulta)),
  }
  if (iguais.apps.length + iguais.subgrupos.length > 0) return iguais
  const tipo = /^(app|subgrupo)\s+(.+)$/i.exec(consulta.trim())
  if (tipo) {
    const doTipo = alvosPeloNome(config, tipo[2]!)
    return tipo[1]!.toLowerCase() === 'app' ? { apps: doTipo.apps, subgrupos: [] } : { apps: [], subgrupos: doTipo.subgrupos }
  }
  return { apps, subgrupos }
}

/** O subgrupo pelo id, com o grupo dele. */
export function acharSubgrupo(config: Config, id: string | null | undefined): SubgrupoAchado | null {
  if (!id) return null
  for (const grupo of config.grupos) {
    const subgrupo = subgruposValidos(grupo).find((s) => s.id === id)
    if (subgrupo) return { subgrupo, grupo }
  }
  return null
}

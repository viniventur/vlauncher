// Pequenas funções de texto: busca sem acento, iniciais da capa, data relativa e caminhos.

export function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Todas as palavras da busca aparecem no texto (em qualquer ordem, sem acento). */
export function combina(busca: string, ...textos: (string | undefined | null)[]) {
  const alvo = normalizar(textos.filter(Boolean).join(' '))
  return normalizar(busca)
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra))
}

/** "loja-online" → "lo"; "Site pessoal" → "sp"; "financas" → "fi". */
export function iniciais(nome: string) {
  const partes = nome.split(/[\s\-_.]+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0]![0]! + partes[1]![0]!).toLowerCase()
  return nome.slice(0, 2).toLowerCase()
}

const relativo = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })

/** Segundos desde 1970 → "há 3 h", "ontem", "há 2 sem." */
export function haQuanto(segundos: number, agora = Date.now() / 1000) {
  const d = segundos - agora
  const abs = Math.abs(d)
  if (abs < 60) return 'agora'
  if (abs < 3600) return relativo.format(Math.round(d / 60), 'minute')
  if (abs < 86400) return relativo.format(Math.round(d / 3600), 'hour')
  if (abs < 7 * 86400) return relativo.format(Math.round(d / 86400), 'day')
  if (abs < 30 * 86400) return relativo.format(Math.round(d / (7 * 86400)), 'week')
  if (abs < 365 * 86400) return relativo.format(Math.round(d / (30 * 86400)), 'month')
  return relativo.format(Math.round(d / (365 * 86400)), 'year')
}

/** Duração de uma execução: "12 s", "4 min", "2 h 05". */
export function duracao(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

export function mesmaPasta(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  const n = (p: string) => p.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
  return n(a) === n(b)
}

/** O caminho como o Windows escreve: barras invertidas, sem a do fim. */
export function caminhoWindows(caminho: string) {
  return caminho.trim().replaceAll('/', '\\').replace(/(?<!^[A-Za-z]:)\\+$/, '')
}

/** O último pedaço do caminho. */
export function nomeDaPasta(caminho: string) {
  return caminho.replaceAll('/', '\\').replace(/\\+$/, '').split('\\').pop() ?? caminho
}

/** O caminho sem o começo que já se sabe: "D:\projetos\app\.claude\worktrees\x" → ".claude\worktrees\x". */
export function relativoA(caminho: string, base: string) {
  const c = caminho.replaceAll('/', '\\')
  const b = base.replaceAll('/', '\\').replace(/\\+$/, '')
  return c.toLowerCase().startsWith(b.toLowerCase() + '\\') ? c.slice(b.length + 1) : c
}

/** "http://localhost:8080/" → "localhost:8080". */
export function urlCurta(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** Linhas "CHAVE=valor" ⇄ pares. */
export function lerEnv(texto: string): [string, string][] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]
    })
}

export function escreverEnv(env: [string, string][]) {
  return env.map(([k, v]) => `${k}=${v}`).join('\n')
}

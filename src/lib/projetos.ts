// Das sugestões que o Rust achou no package.json para as variações de um app novo.

import { novoId } from './ids'
import type { Projeto, Sugestao, Variacao } from './tipos'

/**
 * As variações que um app novo já ganha: os scripts que sobem o app inteiro (os *:all, como um
 * dev:all que sobe o front e a API juntos); sem eles, o dev; sem dev, o start.
 */
export function escolherSugestoes(projeto: Projeto): Sugestao[] {
  const s = projeto.sugestoes
  // Só `palavra:all` (dev:all, public:all): `db:...:all` é migração, nunca variação.
  const tudo = s.filter((x) => /^[^:]+:all$/.test(x.nome) && !x.nome.startsWith('db:'))
  if (tudo.length > 0) return tudo
  const uma = s.find((x) => x.nome === 'dev') ?? s.find((x) => x.nome.startsWith('dev')) ?? s.find((x) => x.nome === 'start') ?? s[0]
  return uma ? [uma] : []
}

export function variacaoDe(s: Sugestao): Variacao {
  return { id: novoId(), nome: s.nome, comando: s.comando, env: [], abrirQuandoPronto: false, noTerminal: false }
}

export function descreverProjeto(p: Projeto) {
  const partes: string[] = []
  if (p.tipo === 'node') partes.push(p.gerenciador ?? 'node')
  else if (p.tipo !== 'pasta') partes.push(p.tipo)
  if (p.ehGit) partes.push('git')
  return partes.join(' · ')
}

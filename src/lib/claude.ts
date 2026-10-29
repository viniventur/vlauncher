// As contas do Claude Code no botão do painel: o nome no menu e o comando que abre cada uma no
// PowerShell, na pasta do app. Sem nada configurado, uma só: o próprio `claude`.

import type { Config, ContaClaude } from './tipos'

export const CONTAS_PADRAO: ContaClaude[] = [{ id: 'claude', nome: 'Claude Code', comando: 'claude' }]

export const contasDoClaude = (config: Config) => (config.contasClaude?.length ? config.contasClaude : CONTAS_PADRAO)

/** O mesmo filtro do Rust (sistema.rs): o comando vai para a linha do PowerShell, sem `;`, `&`, `|`... */
export const comandoValido = (comando: string) => /^[A-Za-z0-9._ =-]+$/.test(comando.trim())

/** A cor do ponto de cada conta no menu: a primeira no ciano, a segunda no verde, as outras neutras. */
export const corDaConta = (indice: number) => ['bg-destaque', 'bg-conta-2'][indice] ?? 'bg-texto-3'

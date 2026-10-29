// As contas do Claude Code: o nome no menu e o comando que abre cada uma. O comando roda no
// PowerShell, com o perfil carregado: pode ser o próprio `claude` ou uma função do perfil que escolhe
// a conta (mudando a CLAUDE_CONFIG_DIR, por exemplo) antes de chamar o `claude`.

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { comandoValido, contasDoClaude, corDaConta } from '../lib/claude'
import { useConfig } from '../lib/config'
import { novoId } from '../lib/ids'
import type { ContaClaude } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Dialogo } from './Dialogo'

export function DialogoContas() {
  const config = useConfig((s) => s.config)
  const definirContasClaude = useConfig((s) => s.definirContasClaude)
  const abrirDialogo = useUi((s) => s.abrirDialogo)
  const [contas, setContas] = useState<ContaClaude[]>(() => contasDoClaude(config))

  const mudar = (id: string, dados: Partial<ContaClaude>) => setContas((cs) => cs.map((c) => (c.id === id ? { ...c, ...dados } : c)))
  const valido = contas.length > 0 && contas.every((c) => c.nome.trim() && comandoValido(c.comando))

  const salvar = () => {
    if (!valido) return
    definirContasClaude(contas.map((c) => ({ ...c, nome: c.nome.trim(), comando: c.comando.trim() })))
    abrirDialogo(null)
  }

  return (
    <Dialogo
      titulo="Contas do Claude Code"
      subtitulo="O botão do painel abre o Claude Code na pasta do app, no PowerShell. Com mais de uma conta, ele pergunta qual."
      aoFechar={() => abrirDialogo(null)}
      aoEnviar={salvar}
      largura="40rem"
      rodape={
        <>
          <button type="button" className="botao-2 ml-auto" onClick={() => abrirDialogo(null)}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={!valido}>
            Salvar
          </button>
        </>
      }
    >
      <ul className="grid gap-2.5">
        {contas.map((c, i) => {
          const comandoRuim = c.comando.trim() !== '' && !comandoValido(c.comando)
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-linha bg-fundo p-2">
              <span className={`ml-1.5 size-2 shrink-0 rounded-full ${corDaConta(i)}`} aria-hidden="true" />
              <input
                className="campo w-40 shrink-0"
                value={c.nome}
                onChange={(e) => mudar(c.id, { nome: e.target.value })}
                placeholder="Trabalho"
                aria-label="Nome da conta"
              />
              <input
                className={`campo codigo ${comandoRuim ? 'border-erro' : ''}`}
                value={c.comando}
                onChange={(e) => mudar(c.id, { comando: e.target.value })}
                placeholder="claude"
                aria-label="Comando"
                aria-invalid={comandoRuim}
              />
              <button
                type="button"
                className="icone-botao pequeno hover:text-erro disabled:opacity-40"
                onClick={() => setContas((cs) => cs.filter((x) => x.id !== c.id))}
                disabled={contas.length === 1}
                aria-label="Remover a conta"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="botao-2 pequeno mt-3" onClick={() => setContas((cs) => [...cs, { id: novoId(), nome: '', comando: '' }])}>
        <Plus className="size-3.5" /> Conta
      </button>
      <p className="mt-4 text-legenda text-texto-3">
        O comando pode ser o próprio <code className="font-mono">claude</code> ou uma função do seu perfil do PowerShell
        que escolhe a conta antes de chamá-lo (pela <code className="font-mono">CLAUDE_CONFIG_DIR</code>, por exemplo).
        Só letras, números, espaço e <code className="font-mono">-_.=</code>.
      </p>
    </Dialogo>
  )
}

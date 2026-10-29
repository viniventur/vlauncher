// As execuções de um painel: uma aba por execução, o estado da escolhida (há quanto roda, a CPU e a
// memória, o endereço) com as ações (copiar, limpar, reiniciar, parar) e a saída. Serve ao painel de um
// app e ao de um subgrupo, que mostra as execuções de todos os apps dele (com o nome do app na aba).

import { Copy, Eraser, ExternalLink, RotateCcw, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { avisar, avisarErro } from '../lib/avisos'
import { estaAtiva, useExecucoes } from '../lib/execucoes'
import { useMonitor } from '../lib/monitor'
import { duracao, formatarCpu, formatarMemoria, urlCurta } from '../lib/texto'
import type { Execucao } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Console } from './Console'

interface Props {
  /** De quem é a aba escolhida: o id do app ou do subgrupo. */
  chave: string
  /** Da mais nova para a mais antiga. */
  execucoes: Execucao[]
  /** O nome do app na aba (no painel do subgrupo, onde há execuções de vários apps). */
  nomeDoApp?: (appId: string) => string
}

export function Execucoes({ chave, execucoes, nomeDoApp }: Props) {
  const abaEscolhida = useUi((s) => s.abaDoApp[chave])
  const escolherAba = useUi((s) => s.escolherAba)
  const { parar, reiniciar, descartar, limpar } = useExecucoes.getState()
  const linhas = useExecucoes((s) => s.linhas)
  const [agora, setAgora] = useState(() => Date.now())

  const atual = execucoes.find((e) => e.id === abaEscolhida) ?? execucoes[0]!
  const ativa = estaAtiva(atual)
  const uso = useMonitor((s) => s.uso[atual.id])

  // O relógio da duração anda enquanto roda.
  useEffect(() => {
    if (!ativa) return
    const t = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [ativa])

  const copiar = async () => {
    const texto = (linhas[atual.id] ?? []).map((l) => l.texto).join('\n')
    await navigator.clipboard.writeText(texto)
    avisar('Saída copiada.')
  }

  const tempo = duracao((atual.fim ?? agora) - atual.inicio)
  // Parada pela pessoa não é falha, mesmo com o código do taskkill; falha é o app sair com erro.
  const falhou = !ativa && !atual.parada && Boolean(atual.codigo)
  const estado = ativa
    ? atual.estado === 'parando'
      ? 'parando…'
      : `rodando há ${tempo}`
    : atual.parada
      ? `parada depois de ${tempo}`
      : `encerrou${atual.codigo !== null ? ` (código ${atual.codigo})` : ''} depois de ${tempo}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto pb-2">
        {execucoes.map((e) => {
          const selecionada = e.id === atual.id
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={selecionada}
              onClick={() => escolherAba(chave, e.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-legenda font-semibold transition-colors ${selecionada ? 'bg-texto text-fundo' : 'text-texto-2 hover:bg-[color-mix(in_oklch,var(--texto)_8%,transparent)]'}`}
            >
              {estaAtiva(e) ? <span className="ponto-vivo" /> : <span className="size-2 rounded-full border border-current opacity-60" />}
              {nomeDoApp && `${nomeDoApp(e.appId)} · `}
              {e.rotulo} · {e.local}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2.5">
        <p className="min-w-0 flex-1 truncate text-legenda text-texto-3" title={`${atual.comando} em ${atual.pasta}`}>
          <span className={ativa ? 'text-destaque' : falhou ? 'text-erro' : ''}>{estado}</span>
          {ativa && uso && (
            <>
              {' · '}
              <button
                className="underline-offset-[0.2em] hover:text-texto hover:underline"
                onClick={() => useUi.getState().abrirMonitor(true)}
                title="Abrir o monitor"
              >
                CPU {formatarCpu(uso.cpu)} · {formatarMemoria(uso.memoria)}
                {uso.portas.length > 0 && ` · ${uso.portas.length === 1 ? 'porta' : 'portas'} ${uso.portas.join(', ')}`}
              </button>
            </>
          )}
          {atual.origem === 'vl' && <span className="italic"> · pelo vl</span>} · {atual.pasta}
        </p>
        {ativa && atual.url && (
          <button className="botao pequeno" onClick={() => api.abrirUrl(atual.url!).catch(avisarErro)}>
            <ExternalLink className="size-3.5" /> {urlCurta(atual.url)}
          </button>
        )}
        <div className="flex">
          <button className="icone-botao pequeno" title="Copiar a saída" aria-label="Copiar a saída" onClick={copiar}>
            <Copy className="size-4" />
          </button>
          <button className="icone-botao pequeno" title="Limpar a saída" aria-label="Limpar a saída" onClick={() => limpar(atual.id)}>
            <Eraser className="size-4" />
          </button>
          <button
            className="icone-botao pequeno"
            title={ativa ? 'Reiniciar' : 'Rodar de novo'}
            aria-label={ativa ? 'Reiniciar' : 'Rodar de novo'}
            onClick={async () => {
              const nova = await reiniciar(atual.id)
              if (nova) escolherAba(chave, nova.id)
            }}
          >
            <RotateCcw className="size-4" />
          </button>
          {ativa ? (
            <button className="icone-botao pequeno" title="Parar" aria-label="Parar" onClick={() => parar(atual.id)}>
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button className="icone-botao pequeno" title="Fechar esta execução" aria-label="Fechar esta execução" onClick={() => descartar(atual.id)}>
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <Console key={atual.id} id={atual.id} />
    </div>
  )
}

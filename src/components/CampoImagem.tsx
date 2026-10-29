// A foto de um app ou grupo num diálogo: escolher o arquivo, colar um print (Ctrl+V com o campo em
// foco) ou arrastar do Explorer. Uma imagem trocada antes de salvar já sai da pasta. Embaixo, de onde
// a foto veio (para trocar por outra da mesma pasta); a foto de antes de o launcher guardar isso tem a
// origem procurada pelo conteúdo, nas pastas do projeto e nas do usuário.

import { FolderOpen, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type ClipboardEvent } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { registrarCampoDeImagem } from '../lib/soltarImagem'
import { caminhoCurto, pastaDe } from '../lib/texto'
import type { Ajuste } from '../lib/tipos'
import { Capa } from './Capa'

interface Props {
  nome: string
  imagem?: string
  /** O arquivo de onde a foto veio, se se sabe. */
  origem?: string
  /** A imagem salva no app ou grupo (essa só sai quando salvar). */
  original?: string
  aoMudar: (imagem: string | undefined, origem: string | undefined) => void
  /** Achou a origem da foto salva: o diálogo guarda (sem esperar o Salvar). */
  aoAcharOrigem: (origem: string) => void
  /** Onde procurar primeiro a origem de uma foto antiga: a pasta do app, a do grupo. */
  dicas: string[]
  ajuste: Ajuste
  aoAjustar: (ajuste: Ajuste) => void
  formato?: 'prancha' | 'quadrado'
}

export function CampoImagem({ nome, imagem, origem, original, aoMudar, aoAcharOrigem, dicas, ajuste, aoAjustar, formato = 'prancha' }: Props) {
  const id = useId()
  const [colada, setColada] = useState(false)
  const [busca, setBusca] = useState<'procurando' | 'sem-origem' | null>(null)

  const trocar = (nova: string | undefined, novaOrigem: string | undefined) => {
    if (imagem && imagem !== original && imagem !== nova) api.removerImagem(imagem).catch(() => undefined)
    setColada(false)
    setBusca(null)
    aoMudar(nova, novaOrigem)
  }

  useEffect(() => registrarCampoDeImagem(id, trocar))

  // A foto salva sem a origem guardada: procura o arquivo igual a ela.
  useEffect(() => {
    if (!imagem || origem || imagem !== original) return
    let vale = true
    setBusca('procurando')
    api
      .localizarOrigem(imagem, dicas.filter(Boolean))
      .then((achada) => {
        if (!vale) return
        setBusca(achada ? null : 'sem-origem')
        if (achada) aoAcharOrigem(achada)
      })
      .catch(() => vale && setBusca('sem-origem'))
    return () => {
      vale = false
    }
    // Só quando a foto muda: as dicas e a função vêm novas a cada render do diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagem])

  const escolher = async () => {
    try {
      const caminho = await api.escolherImagem(origem ? pastaDe(origem) : undefined)
      if (caminho) trocar(await api.importarImagem(caminho), caminho)
    } catch (e) {
      avisarErro(e)
    }
  }

  const colar = async (e: ClipboardEvent) => {
    const arquivo = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (!arquivo) return
    e.preventDefault()
    try {
      const extensao = arquivo.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png'
      trocar(await api.importarImagemColada(new Uint8Array(await arquivo.arrayBuffer()), extensao), undefined)
      setColada(true)
    } catch (erro) {
      avisarErro(erro)
    }
  }

  return (
    <div className="flex items-center gap-5">
      <button
        type="button"
        onClick={escolher}
        onPaste={colar}
        data-alvo-imagem={`campo:${id}`}
        className="shrink-0 rounded-md"
        aria-label="Escolher a foto (ou, com o foco aqui, colar com Ctrl+V)"
      >
        <Capa
          nome={nome || '?'}
          imagem={imagem}
          ajuste={ajuste}
          tamanho={formato === 'quadrado' ? 'pequena' : 'grande'}
          className={`rounded-md ${formato === 'quadrado' ? 'size-20 [&_span]:text-[1.6rem]' : 'aspect-[16/10] w-48'}`}
        />
      </button>
      <div className="grid min-w-0 gap-2">
        <div className="flex gap-2">
          <button type="button" className="botao-2 pequeno" onClick={escolher}>
            <ImagePlus className="size-3.5" /> Escolher imagem
          </button>
          {imagem && (
            <button type="button" className="botao-2 pequeno" onClick={() => trocar(undefined, undefined)}>
              <Trash2 className="size-3.5" /> Tirar
            </button>
          )}
        </div>
        {imagem && (
          <fieldset className="flex gap-1 text-legenda" aria-label="Como a imagem ocupa a capa">
            {(
              [
                ['preencher', 'Preencher (foto, print)'],
                ['inteira', 'Inteira no branco (logo)'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={ajuste === valor}
                onClick={() => aoAjustar(valor)}
                className={`rounded-full px-2.5 py-0.5 font-semibold transition-colors ${ajuste === valor ? 'bg-texto text-fundo' : 'text-texto-2 hover:bg-[color-mix(in_oklch,var(--texto)_8%,transparent)]'}`}
              >
                {rotulo}
              </button>
            ))}
          </fieldset>
        )}
        {imagem && origem && (
          <p className="flex min-w-0 items-center gap-1 text-legenda text-texto-3" data-selecionavel>
            <span className="truncate font-mono text-codigo" title={origem}>
              {caminhoCurto(origem)}
            </span>
            <button
              type="button"
              className="icone-botao pequeno size-6!"
              onClick={() => api.mostrarNoExplorer(origem).catch(avisarErro)}
              aria-label="Mostrar a foto no Explorer"
              title="Mostrar no Explorer"
            >
              <FolderOpen className="size-3.5" />
            </button>
          </p>
        )}
        {imagem && !origem && (colada || busca) && (
          <p className="text-legenda text-texto-3 italic">
            {colada
              ? 'Colada da área de transferência: sem arquivo de origem.'
              : busca === 'procurando'
                ? 'Procurando de onde a foto veio…'
                : 'Não achei o arquivo de onde a foto veio (colada, ou movida de lugar).'}
          </p>
        )}
        <p className="text-legenda text-texto-3">Ou arraste do Explorer, ou selecione a imagem (Tab) e cole um print com Ctrl+V.</p>
      </div>
    </div>
  )
}

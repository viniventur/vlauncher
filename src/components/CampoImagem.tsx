// A foto de um app ou grupo num diálogo: escolher o arquivo, colar um print (Ctrl+V com o campo em
// foco) ou arrastar do Explorer. Uma imagem trocada antes de salvar já sai da pasta.

import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, type ClipboardEvent } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { registrarCampoDeImagem } from '../lib/soltarImagem'
import type { Ajuste } from '../lib/tipos'
import { Capa } from './Capa'

interface Props {
  nome: string
  imagem?: string
  /** A imagem salva no app ou grupo (essa só sai quando salvar). */
  original?: string
  aoMudar: (imagem: string | undefined) => void
  ajuste: Ajuste
  aoAjustar: (ajuste: Ajuste) => void
  formato?: 'prancha' | 'quadrado'
}

export function CampoImagem({ nome, imagem, original, aoMudar, ajuste, aoAjustar, formato = 'prancha' }: Props) {
  const id = useId()

  const trocar = (nova: string | undefined) => {
    if (imagem && imagem !== original && imagem !== nova) api.removerImagem(imagem).catch(() => undefined)
    aoMudar(nova)
  }

  useEffect(() => registrarCampoDeImagem(id, trocar))

  const escolher = async () => {
    try {
      const caminho = await api.escolherImagem()
      if (caminho) trocar(await api.importarImagem(caminho))
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
      trocar(await api.importarImagemColada(new Uint8Array(await arquivo.arrayBuffer()), extensao))
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
      <div className="grid gap-2">
        <div className="flex gap-2">
          <button type="button" className="botao-2 pequeno" onClick={escolher}>
            <ImagePlus className="size-3.5" /> Escolher imagem
          </button>
          {imagem && (
            <button type="button" className="botao-2 pequeno" onClick={() => trocar(undefined)}>
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
        <p className="text-legenda text-texto-3">Ou arraste do Explorer, ou selecione a imagem (Tab) e cole um print com Ctrl+V.</p>
      </div>
    </div>
  )
}

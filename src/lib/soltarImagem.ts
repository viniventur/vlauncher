// Imagem arrastada do Explorer: solta numa prancha, vira a foto do app; no cabeçalho de um grupo, a
// do grupo; no campo de imagem de um diálogo, a daquele campo. O alvo é o elemento com
// data-alvo-imagem="app:<id>" | "grupo:<id>" | "campo:<id>" sob o ponto onde a imagem caiu.

import { api } from './api'
import { avisar, avisarErro } from './avisos'
import { useConfig } from './config'

const IMAGEM = /\.(png|jpe?g|webp|gif|avif|svg)$/i
const campos = new Map<string, (nome: string) => void>()

export function registrarCampoDeImagem(id: string, aoReceber: (nome: string) => void) {
  campos.set(id, aoReceber)
  return () => void campos.delete(id)
}

let iniciado = false

export async function ouvirImagensSoltas() {
  if (iniciado) return
  iniciado = true
  let marcado: Element | null = null
  const desmarcar = () => {
    marcado?.classList.remove('recebendo')
    marcado = null
  }

  await api.aoArrastarArquivos(async (tipo, caminhos, x, y) => {
    if (tipo === 'leave') return desmarcar()
    const alvo = document.elementFromPoint(x, y)?.closest('[data-alvo-imagem]') ?? null
    if (tipo === 'over') {
      if (alvo !== marcado) {
        desmarcar()
        alvo?.classList.add('recebendo')
        marcado = alvo
      }
      return
    }
    desmarcar()
    if (!alvo) return
    const imagem = caminhos.find((c) => IMAGEM.test(c))
    if (!imagem) return avisar('Solte um arquivo de imagem (png, jpg, webp, gif, avif ou svg).', 'erro')

    const [tipoDoAlvo, id = ''] = alvo.getAttribute('data-alvo-imagem')!.split(':')
    try {
      const nome = await api.importarImagem(imagem)
      if (tipoDoAlvo === 'app') useConfig.getState().editarApp(id, { imagem: nome })
      else if (tipoDoAlvo === 'grupo') useConfig.getState().editarGrupo(id, { imagem: nome })
      else campos.get(id)?.(nome)
    } catch (e) {
      avisarErro(e)
    }
  })
}

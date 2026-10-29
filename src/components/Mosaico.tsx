// As capas dos apps de um subgrupo em mosaico, como os ícones dentro de uma pasta do iPhone: uma ou duas
// numa linha, no meio da altura; três ou quatro em 2×2 (mais que quatro, as quatro primeiras). O fundo
// é a "pasta": um tom acima da superfície, que vira vidro no liquid glass.

import type { App } from '../lib/tipos'
import { Capa } from './Capa'

export function Mosaico({ apps, className = '' }: { apps: App[]; className?: string }) {
  const mostrados = apps.slice(0, 4)
  const capa = (app: App, classe: string) => (
    <Capa key={app.id} nome={app.nome} imagem={app.imagem} ajuste={app.ajuste} tamanho="pequena" className={`rounded-[5px] ${classe}`} />
  )
  return (
    <div className={`vidro relative aspect-[16/10] overflow-hidden bg-[color-mix(in_oklch,var(--texto)_7%,var(--fundo))] ${className}`}>
      {mostrados.length <= 2 ? (
        <div className="absolute inset-[7%] flex items-center gap-[5%]">{mostrados.map((app) => capa(app, 'aspect-[16/10] min-w-0 flex-1'))}</div>
      ) : (
        <div className="absolute inset-[6%] grid grid-cols-2 grid-rows-2 gap-[5%]">{mostrados.map((app) => capa(app, 'size-full'))}</div>
      )}
    </div>
  )
}

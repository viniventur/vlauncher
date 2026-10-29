// O símbolo da marca (assets/marca do site): o V com o chapéu do valor estimado. O chapéu é sempre o
// ciano da marca; o V acompanha a cor do texto.

export function Simbolo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 58.66 78.68" className={className} aria-hidden="true" focusable="false">
      <polygon points="11.09,18.24 29.33,0 47.57,18.24 39.09,18.24 29.33,8.48 19.57,18.24" fill="#0088b0" />
      <polygon points="0,32.24 10.66,32.24 29.33,61.8 48,32.24 58.66,32.24 29.33,78.68" fill="currentColor" />
    </svg>
  )
}

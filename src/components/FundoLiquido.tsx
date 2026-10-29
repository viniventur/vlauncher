// O fundo do liquid glass: manchas de cor da marca (o ciano e os tons quentes da tinta) atrás de
// tudo, que o vidro das superfícies desfoca. Só existe com o liquid glass ligado; sem clique, sem
// leitor de tela.

export function FundoLiquido() {
  return (
    <div className="fundo-liquido" aria-hidden="true">
      <span className="mancha mancha-1" />
      <span className="mancha mancha-2" />
      <span className="mancha mancha-3" />
      <span className="mancha mancha-4" />
    </div>
  )
}

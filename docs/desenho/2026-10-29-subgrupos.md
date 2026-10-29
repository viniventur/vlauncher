# Subgrupos: vários repositórios, um sistema só

Desenho aprovado antes de implementar. Exemplo do texto: o sistema "loja", com o front `loja-front`
(Vite) e a API `loja-api` (Docker), em dois repositórios.

## O problema

Muitos sistemas têm o front e a API em repositórios separados, com stacks diferentes. Hoje são dois
apps soltos no grupo: dá para rodar cada um, mas não dá para ver que são uma coisa só, nem rodar o
sistema inteiro de uma vez. E cada um precisa continuar com a sua branch ou worktree: a API na `main`
e o front numa worktree de feature, por exemplo.

## O que entra

- **Subgrupo**: dentro de um grupo, um conjunto de apps que formam um sistema. Na galeria, ele aparece
  como uma pasta do iPhone: um cartão só, com as capas dos apps em mosaico.
- **Painel do subgrupo**: cada app com a sua worktree ("Onde rodar"), a variação que sobe no "rodar
  tudo", o rodar e o parar de cada um, e a saída.
- **Rodar tudo e parar tudo**, no cartão e no painel.
- **Criar, editar e desfazer** um subgrupo, com sugestões pelos repositórios que moram na mesma pasta.
- **Busca e `vl`**: rodar, parar e abrir um subgrupo pelo nome.
- De carona (é a outra metade da pergunta sobre várias worktrees): o "Onde rodar" passa a mostrar quais
  worktrees do app estão rodando agora.

## Modelo de dados

Os apps continuam na lista do grupo, como hoje; o subgrupo só aponta para eles:

```ts
interface Subgrupo {
  id: string
  nome: string
  /** Os apps, na ordem em que sobem no "rodar tudo" (a API antes do front). Todos do mesmo grupo. */
  apps: string[]
  /** A variação de cada app no "rodar tudo"; sem ela, a padrão do app. */
  variacoes?: Record<string, string>
}

interface Grupo {
  // ...
  subgrupos?: Subgrupo[]
}
```

Um app está em no máximo um subgrupo. Por que referências, e não os apps dentro do subgrupo: tudo o que
já funciona por app (worktree, variações, execuções, monitor, `vl`, busca) segue igual, sem tocar em
cada lugar que percorre os apps. Descartado também um "app composto" que roda vários comandos: ele
perderia a worktree independente de cada repositório.

## Galeria

- O subgrupo ocupa a posição do app dele que vem primeiro na ordem do grupo; os apps dele não aparecem
  soltos.
- A capa é um mosaico das capas dos apps: dois lado a lado; três ou quatro em 2×2; mais que quatro,
  as quatro primeiras. Fundo discreto e cantos arredondados, como uma pasta do iPhone.
- Embaixo: o nome do subgrupo e os apps ("loja-api · loja-front"). À direita, o endereço do primeiro
  app rodando que tiver um (na ordem do subgrupo), e o ▶ rodar tudo (ou o ■ parar tudo, se algum
  estiver rodando).
- Com algo rodando, o selo "rodando" mostra quantos: "1 de 2".
- Clicar abre o painel do subgrupo. Arrastar reordena dentro do grupo, como um app (o subgrupo leva os
  apps juntos); para mudar de grupo, pelo diálogo.

## Painel do subgrupo

O mesmo lado direito do painel de um app:

- Cabeçalho: o mosaico, o grupo, o nome; **Rodar tudo**, **Parar tudo** e ✎ editar.
- Uma seção por app, na ordem do subgrupo: a capa pequena e o nome (clicar abre o painel completo do
  app), o estado (rodando há quanto, o endereço, a CPU e a memória), o **Onde rodar** daquele app
  (o mesmo seletor de hoje: a worktree de cada um é independente), a variação que entra no "rodar
  tudo" e o rodar ou parar só dele.
- Embaixo, a saída: uma aba por execução dos apps do subgrupo ("loja-api · docker · main",
  "loja-front · dev · feat/checkout"), com o mesmo console de hoje.

## Rodar tudo e parar tudo

- **Rodar tudo** roda, na ordem do subgrupo, a variação escolhida de cada app, na worktree escolhida em
  "Onde rodar". O que já está rodando com a mesma variação na mesma pasta fica como está. Uma falha
  (o app sem variação, a pasta que sumiu) vira aviso e não impede os outros.
- **Parar tudo** para todas as execuções dos apps do subgrupo, em qualquer worktree, sem perguntar (o
  alcance é o subgrupo, não o launcher inteiro). O compose para os contêineres, como no parar de hoje.
- Sem esperar um app ficar pronto para subir o seguinte: um front de desenvolvimento costuma tentar a API
  de novo sozinho. Ligar o front na porta da API continua nas variáveis da variação.

## Criar, editar, desfazer

- No menu do cabeçalho do grupo: **Novo subgrupo**. O diálogo pede o nome e os apps (os do grupo que
  não estão em outro subgrupo), com a ordem ajustável (subir e descer).
- Sugestões no diálogo: apps cujas pastas ficam na mesma pasta-mãe, que não é a pasta do grupo, viram
  um subgrupo sugerido com o nome dela (`D:\projetos\loja\loja-front` e `...\loja\loja-api` sugerem
  "loja"). Um clique preenche.
- Editar (o ✎ do painel): nome, apps, ordem e grupo (trocar o grupo leva os apps junto).
  **Desfazer o subgrupo** devolve os apps à grade.

## Busca e vl

- Busca (Ctrl+K): "Rodar loja (tudo)", "Parar loja", "Abrir loja".
- `vl rodar <subgrupo>`, `vl parar <subgrupo>`, `vl reiniciar <subgrupo>`: o nome do subgrupo vale como
  o de um app. Rodar tudo pelo `vl` usa a worktree da pasta atual para o app daquele repositório e a
  escolhida no launcher para os outros, e responde com o resultado de cada app. `vl apps` mostra os
  subgrupos. Um nome que serve a um subgrupo e a um app pede para dizer qual, como hoje.

## Várias worktrees do mesmo app

Hoje já funciona: cada execução é de uma pasta, e trocar o "Onde rodar" e rodar de novo deixa as duas
no ar, cada uma com a sua aba, a sua saída e a sua linha no monitor. Entra: na lista do "Onde rodar",
as worktrees que estão rodando ganham o ponto ciano e o nome da variação. As portas continuam por conta
de cada app (a variação com outra porta, como hoje).

## Casos de borda

- O app removido ou levado para outro grupo sai do subgrupo; com menos de dois apps, o subgrupo se
  desfaz e o app que sobrou volta à grade.
- Grupo recolhido: o subgrupo some com os apps, como hoje.
- A variação escolhida apagada no app: volta a valer a padrão.
- O launcher.json antigo (sem `subgrupos`) abre igual: o campo é opcional.

## Testes

- Funções puras num `src/lib/subgrupos.ts`, com testes: os itens da grade (apps soltos e subgrupos na
  posição certa), a ordem final depois de arrastar um subgrupo, as sugestões pela pasta-mãe, a limpeza
  quando um app sai, a variação do "rodar tudo".
- `vl`: achar um subgrupo pelo nome, e o empate com um app.
- De ponta a ponta, com dados de teste: o cartão, o painel, rodar tudo com cada app numa worktree
  diferente, parar tudo, e as capturas nos dois temas.

## Fora do escopo

- Arrastar um app para cima de outro para criar o subgrupo (como no iPhone): fica para depois.
- Subgrupo dentro de subgrupo.
- Esperar a API ficar pronta antes do front, e portas automáticas por worktree.

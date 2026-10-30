# Subgrupos: plano de implementação

> Executado na mesma sessão que escreveu o desenho (`2026-10-29-subgrupos.md`), tarefa por tarefa, com
> commit ao fim de cada uma.

**Objetivo:** apps de vários repositórios que formam um sistema ficam juntos num subgrupo (uma pasta do
iPhone na galeria), que roda tudo ou um por um, com a worktree de cada app independente.

**Arquitetura:** o subgrupo só aponta para os apps do grupo (`Grupo.subgrupos[].apps`, ids). A lógica pura
(a grade, a ordem, as sugestões, a limpeza) fica em `src/lib/subgrupos.ts`, testada; a interface usa os
componentes de hoje (o `OndeRodar`, o `Console`, as execuções) e o `vl` resolve o nome do subgrupo como o
de um app.

**Stack:** React 19, zustand, dnd-kit, Tailwind 4 (a interface); vitest (os testes); o núcleo em Rust não
muda.

## Restrições

- Nada no `launcher.json` muda de formato para quem não usa subgrupos: `subgrupos` é opcional.
- Exemplos, testes e documentação com nomes fictícios: o repositório é público.
- Interface, código e commits em português; a estética da marca (tinta, papel, o ciano só no que roda).
- Um app em no máximo um subgrupo; um subgrupo com menos de dois apps se desfaz.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `src/lib/tipos.ts` | `Subgrupo` e `Grupo.subgrupos` |
| `src/lib/subgrupos.ts` (novo) | Lógica pura: grade, ordem depois de arrastar, variação do "rodar tudo", sugestões, limpeza |
| `src/lib/subgrupos.test.ts` (novo) | Testes da lógica pura |
| `src/lib/config.ts` | Ações: criar, editar, desfazer, mover; limpeza ao remover ou mover um app |
| `src/lib/execucoes.ts` | `rodarSubgrupo` e `pararSubgrupo` |
| `src/lib/ui.ts` | `subgrupoAberto` e o diálogo do subgrupo |
| `src/components/Execucoes.tsx` (novo) | As abas de execução e o console, tirados do `Painel` para servir aos dois painéis |
| `src/components/Mosaico.tsx` (novo) | As capas dos apps em mosaico (o cartão e o painel) |
| `src/components/PranchaSubgrupo.tsx` (novo) | O cartão-pasta na galeria |
| `src/components/PainelSubgrupo.tsx` (novo) | O painel do subgrupo |
| `src/components/DialogoSubgrupo.tsx` (novo) | Criar, editar, desfazer, com as sugestões |
| `src/components/Capitulo.tsx`, `Galeria.tsx` | A grade com os subgrupos e o arrastar |
| `src/components/OndeRodar.tsx` | As worktrees que estão rodando, marcadas |
| `src/components/Busca.tsx` | Rodar, parar e abrir um subgrupo |
| `src/lib/apps.ts`, `src/lib/canal.ts` | O `vl` com subgrupos |
| `src/lib/exemplo.ts`, `README.md`, `docs/*.webp` | O exemplo, a documentação e as capturas |

## Tarefas

### 1. O modelo e a lógica pura

`tipos.ts`: `Subgrupo { id, nome, apps: string[], variacoes?: Record<string, string> }` e
`Grupo.subgrupos?: Subgrupo[]`.

`subgrupos.ts` (puro, sem a ponte com o Rust):

- `subgruposValidos(grupo): Subgrupo[]`: só ids de apps que existem no grupo, sem app em dois subgrupos
  (vale o primeiro), e com dois ou mais apps.
- `itensDaGrade(grupo, ordem: string[]): ItemDaGrade[]`, com
  `ItemDaGrade = { tipo: 'app'; app } | { tipo: 'subgrupo'; subgrupo; apps }`: percorre `ordem` (os ids
  dos apps do grupo, na ordem atual); o subgrupo entra no lugar do primeiro app dele e leva os apps na
  ordem do subgrupo; os outros apps dele não aparecem soltos.
- `ordemDosApps(itens: string[], grupo): string[]`: depois de arrastar, troca o id de cada subgrupo
  pelos apps dele (na ordem do subgrupo).
- `variacaoNoSubgrupo(subgrupo, app): Variacao | undefined`: a escolhida, se ainda existir; senão, a
  padrão do app.
- `sugestoesDeSubgrupos(grupo): { nome: string; apps: string[] }[]`: apps fora de subgrupos agrupados
  pela pasta-mãe, que não é a pasta do grupo, com dois ou mais; o nome é o da pasta-mãe; a API (pasta com
  "back", "api", "server" ou "core" no nome) antes do resto.
- `semOApp(grupo, appId): Grupo` e `normalizar(grupo): Grupo`: o app sai dos subgrupos, e o subgrupo com
  menos de dois apps some.

Testes (`subgrupos.test.ts`), com um grupo fictício (`loja-front`, `loja-api`, `blog`, `painel-front`,
`painel-api`):

- a grade põe o subgrupo no lugar do primeiro app dele e esconde os outros;
- um subgrupo com app que não existe, ou com um só app, não aparece;
- arrastar o subgrupo para o fim leva os dois apps juntos, na ordem do subgrupo;
- a variação escolhida vale; apagada, vale a padrão;
- as sugestões juntam `loja-front` e `loja-api` em "loja", com a API primeiro, e ignoram a pasta do grupo
  e os apps que já estão num subgrupo;
- remover um app de um subgrupo de dois desfaz o subgrupo.

Rodar: `pnpm test`. Commit: `feat: o modelo dos subgrupos e a lógica da grade`.

### 2. As ações e o rodar tudo

`config.ts`: `criarSubgrupo(grupoId, { nome, apps }) → id`, `editarSubgrupo(id, dados)`,
`escolherVariacaoNoSubgrupo(id, appId, variacaoId)`, `desfazerSubgrupo(id)`,
`moverSubgrupo(id, grupoId)` (leva os apps junto); `removerApp`, `moverApp` e `reorganizarApps` passam
pelo `normalizar`. `acharSubgrupo(config, id)`.

`execucoes.ts`: `rodarSubgrupo(subgrupo, apps)` roda, na ordem, a variação de cada app na pasta escolhida
dele, pulando o que já roda igual e avisando o app sem variação; `pararSubgrupo(apps)` para todas as
execuções ativas desses apps.

Teste de ponta a ponta na tarefa 9. Commit: `feat: criar, editar e rodar um subgrupo`.

### 3. As execuções como componente

Tirar o `Execucoes` do `Painel.tsx` para `Execucoes.tsx`, recebendo `execucoes`, a chave da aba escolhida
(o app ou o subgrupo) e, opcional, o nome do app em cada aba. O `Painel` passa a usá-lo. Nada muda na
tela do app. Rodar: `pnpm typecheck && pnpm lint`. Commit: `refactor: as execuções num componente próprio`.

### 4. O cartão na galeria

`Mosaico.tsx`: até quatro capas; uma ou duas numa linha centralizada, três ou quatro em 2×2.
`PranchaSubgrupo.tsx`: o mosaico num fundo discreto (a "pasta"), o selo "rodando 1 de 2", o nome, os apps,
o endereço do primeiro rodando e o ▶/■ de tudo; clicar abre o painel; ordenável (dnd-kit, tipo
`subgrupo`). `Capitulo.tsx` desenha `itensDaGrade`; `Galeria.tsx` reordena o subgrupo dentro do grupo
(`ordemDosApps`) e trata o subgrupo como alvo de um app arrastado (no lugar do primeiro app dele). Commit:
`feat: o subgrupo na galeria, como uma pasta do iPhone`.

### 5. O painel do subgrupo

`ui.ts`: `subgrupoAberto`, `abrirSubgrupo(id)`, exclusivo com o painel do app e o monitor; o diálogo
`{ tipo: 'subgrupo'; id?; grupoId? }`. `PainelSubgrupo.tsx`: o cabeçalho com o mosaico e Rodar tudo,
Parar tudo, editar; uma seção por app (a capa, o nome que abre o painel do app, o estado, a variação do
"rodar tudo", rodar ou parar só ele, e o `OndeRodar`); embaixo, o `Execucoes` com as execuções de todos.
Montar no `App.tsx`. Commit: `feat: o painel do subgrupo`.

### 6. O diálogo

`DialogoSubgrupo.tsx`: nome; os apps do grupo (os de outros subgrupos não aparecem) com a ordem (subir e
descer); as sugestões, que preenchem com um clique; o grupo (ao editar); Desfazer. Salvar só com nome e
dois apps. No menu do cabeçalho do grupo, "Novo subgrupo". Commit: `feat: criar e editar subgrupos, com
sugestões pela pasta`.

### 7. A busca e o vl

`Busca.tsx`: "Rodar <subgrupo> (tudo)", "Parar <subgrupo>", "Abrir <subgrupo>". `apps.ts`:
`subgruposPeloNome(config, consulta)`, com teste (nome igual, pedaço, sem acento). `canal.ts`: `rodar`,
`parar` e `reiniciar` aceitam o nome do subgrupo (empate com um app pede para dizer qual); rodar tudo
espera cada app anunciar o endereço, em paralelo, e responde por app; `apps` lista os subgrupos. Commit:
`feat: o subgrupo na busca e no vl`.

### 8. As worktrees que estão rodando

`OndeRodar.tsx`: na lista, a worktree com execução ativa do app ganha o ponto ciano e a variação; no
botão, o mesmo para a escolhida. Commit: `feat: o Onde rodar mostra as worktrees que estão rodando`.

### 9. Conferir e entregar

- `exemplo.ts`: um subgrupo "loja" (a API de pagamentos e o front da loja) para o `pnpm dev`.
- De ponta a ponta (dados de teste, puppeteer): criar o subgrupo, o cartão, o painel, rodar tudo com cada
  app numa worktree, parar tudo, `vl rodar <subgrupo>`, as capturas nos dois temas.
- README: a seção dos subgrupos e as capturas novas.
- Versão 0.3.0 e o instalador. Commit: `chore: versão 0.3.0`.

### 10. Juntar arrastando

- `src/lib/arrasto.ts`: `zonaNaPrancha(rect, ponto, vemDeAntes)` devolve `perto`, `centro` ou `longe`,
  com testes. `subgrupos.ts`: `aApiPrimeiro(apps)`, `nomeAoJuntar(apps, grupo, nomesDosApps)` e
  `ordemAoJuntar(ordem, appId, grupoId, depoisDe)`, com testes.
- `config.ts`: `juntar(appId, alvoId, ordem)` (cria o subgrupo, ou põe o app no subgrupo alvo, e leva o
  app para o grupo do alvo); devolve o id do subgrupo novo. `ui.ts`: `juntarCom` (o alvo em destaque).
- `Galeria.tsx`: na colisão de um app sobre outro item da grade, as faixas; no meio, o candidato a
  juntar; 400 ms parado nele viram o destaque; soltar com o destaque junta.
- `Prancha.tsx` e `PranchaSubgrupo.tsx`: o destaque de "Juntar"; a prancha arrastada encolhe sobre o
  alvo. `PainelSubgrupo.tsx`: o botão "Tirar do subgrupo".
- De ponta a ponta: juntar dois apps, pôr um terceiro no subgrupo, reordenar sem juntar, tirar pelo
  painel. README: o juntar arrastando. Commit: `feat: juntar os apps arrastando, como no iPhone`.

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="88" alt="">
</p>

<h1 align="center">vlauncher</h1>

<p align="center">
  Um launcher para os projetos em que você trabalha. Rode qualquer app com um clique, na branch ou na
  worktree que você escolher, e acompanhe a saída sem abrir um terminal.
</p>

<p align="center">
  <a href="#instalar">Instalar</a> ·
  <a href="#como-usar">Como usar</a> ·
  <a href="#na-linha-de-comando-o-vl">vl</a> ·
  <a href="#atalhos">Atalhos</a> ·
  <a href="#privacidade-e-segurança">Privacidade</a> ·
  <a href="#desenvolver">Desenvolver</a>
</p>

<p align="center">
  <img src="docs/galeria.webp" alt="A galeria do vlauncher: os apps em dois grupos, um deles rodando">
</p>

> **English:** vlauncher is a Windows desktop app to organize and run your local projects. Group your
> apps, define how each one runs (`npm run dev:all`, `docker compose up`...), pick the branch or git
> worktree before running, follow the output in place and watch each app's CPU, memory and ports. The
> bundled `vl` command line drives it from any terminal, so a server started by Claude Code (through
> the included skill) shows up in the launcher too. Built with Tauri 2, React and Rust. The interface
> is in Brazilian Portuguese.

## Por quê

Quem mantém vários projetos repete o mesmo ritual o dia inteiro: abrir um terminal, entrar na pasta
certa, lembrar qual script sobe o app inteiro, achar a worktree da branch que está revisando,
descobrir que a worktree nova está sem `node_modules` e sem `.env`, e depois caçar qual janela de
terminal está segurando a porta 8080. O vlauncher põe isso numa tela só.

## O que ele faz

**Organiza.** Os apps ficam em grupos, cada um com foto (ou uma capa com as iniciais). Um grupo pode
apontar para a pasta onde ficam os projetos: o vlauncher acha os que ainda não estão lá e já sugere
como rodar cada um. Arraste para reordenar ou para mudar de grupo; recolha um grupo ou todos.

**Roda.** Cada app tem as suas variações, que são os jeitos de rodá-lo: um comando, um endereço fixo
(opcional), variáveis de ambiente, abrir o navegador quando estiver pronto ou rodar no Windows Terminal.
Ao adicionar um app, ele lê o `package.json` e sugere os scripts que sobem o app inteiro (`dev:all`,
`dev`, `start`), nunca migrações nem builds. A saída aparece ao vivo, com o endereço que o app anunciou
a um clique. Parar encerra a árvore inteira de processos (o `npm`, o `node`, o `vite`), e a porta fica
livre de verdade.

<p align="center">
  <img src="docs/painel.webp" alt="O painel de um app: onde rodar, as variações e a saída da execução">
</p>

**Entende branches e worktrees.** Antes de rodar, escolha a pasta: a principal ou qualquer worktree. As
branches que ainda não têm worktree ganham uma num clique, já com os arquivos locais que o git não leva
(`.env*`, `.npmrc`). Ele avisa quando falta `node_modules` e instala com o gerenciador do projeto (npm,
pnpm, yarn ou bun). Num monorepo, o app roda na mesma subpasta de cada worktree.

<p align="center">
  <img src="docs/onde-rodar.webp" alt="O seletor de onde rodar, com as worktrees e as branches sem worktree">
</p>

**Abre o resto.** Do painel de cada app: VS Code, Windows Terminal, Claude Code (com mais de uma conta,
se você usar) e a pasta no Explorer, todos na pasta escolhida.

**Busca de qualquer lugar.** `Ctrl+Alt+Espaço` traz o vlauncher com a busca aberta. Digite parte do
nome e aperte Enter para rodar uma variação, abrir o endereço, parar o que está rodando ou abrir o painel.

<p align="center">
  <img src="docs/busca.webp" alt="A busca rápida, com as variações para rodar">
</p>

**Fica na bandeja.** Com algo rodando, fechar a janela só a esconde: os servidores seguem no ar. "Parar
todas" pede confirmação e lista o que vai parar; sair do vlauncher encerra tudo.

**Monitora.** O monitor mostra quanto cada app pesa: a CPU e a memória da árvore de processos inteira
(o `cmd`, o `npm`, o `node`, o `vite`), de 2 em 2 segundos e com os últimos 3 minutos num minigráfico,
as portas em que ele escuta e os processos, um a um. A soma dos apps aparece ao lado do que a máquina
inteira está usando. Mede como o Gerenciador de Tarefas: a CPU em porcentagem da máquina, a memória pelo
conjunto de trabalho privado. Abre pelo "N rodando" do topo.

<p align="center">
  <img src="docs/monitor.webp" alt="O monitor: a CPU e a memória de dois apps rodando, com os processos de um deles">
</p>

**Atende o terminal e o Claude Code.** O `vl`, que vem junto, roda, para, reinicia e lê a saída dos
apps do vlauncher pela linha de comando. O que sobe por ele aparece no launcher como qualquer outro, com
a saída e o monitor. Com a skill que acompanha o `vl`, o Claude Code passa a subir os servidores por
ele, em vez de deixá-los presos num shell dele.

**Tinta, papel e liquid glass.** Tema escuro ou claro e, por cima de qualquer um dos dois, o liquid
glass: a janela fica transparente (de 0 a 100%), com o acrylic do Windows desfocando o que está atrás.

<p align="center">
  <img src="docs/liquid-glass.webp" alt="O tema claro com o liquid glass ligado">
</p>

## Instalar

O vlauncher roda no **Windows 10 e 11** (testado no 11) e usa o WebView2, que já vem no Windows 11.

1. Baixe o instalador (`vlauncher_x.y.z_x64-setup.exe`) na página de Releases do repositório, ou gere o
   seu (veja [Desenvolver](#desenvolver)).
2. O instalador não é assinado, então o Windows pode mostrar "O Windows protegeu o computador". Clique
   em **Mais informações → Executar assim mesmo**.

Ele instala em `%LOCALAPPDATA%\vlauncher`, com o `vl.exe` ao lado do `vlauncher.exe`. Para usar o `vl`
de qualquer terminal, ponha essa pasta no PATH.

Até a 0.1.0, o vlauncher se instalava como "Launcher". Quem tem essa versão: saia dela pela bandeja
("Encerrar os apps e sair") e rode o instalador novo. Ele remove o "Launcher" e mantém os grupos, os apps
e as fotos (os dados ficam na mesma pasta).

Para os atalhos do painel, deixe no PATH o que quiser usar: o [Windows Terminal](https://aka.ms/terminal)
(`wt`), o VS Code (`code`), o PowerShell 7 (`pwsh`) e o [Claude Code](https://docs.anthropic.com/claude-code)
(`claude`). Nada disso é obrigatório.

## Como usar

1. **Crie um grupo.** Com os projetos numa pasta só (como `D:\projetos\trabalho`), use "Criar grupo de
   uma pasta" e marque os projetos que quer. Cada um entra com as variações sugeridas pelo `package.json`
   (ou pelo `docker-compose.dev.yml`, num projeto só com Docker).
2. **Ajuste as variações.** Em ✎ Editar no painel do app: o comando, o endereço fixo, as variáveis de
   ambiente, "abrir no navegador quando estiver pronto" e a estrela que marca a variação padrão (a que o
   ▶ da galeria roda).
3. **Escolha onde rodar.** Em "Onde rodar", a pasta principal, uma worktree ou uma branch, que vira
   worktree em `.claude\worktrees\<branch>` (o lugar muda na edição do app). "Na principal" troca a
   branch da pasta principal, só com a árvore limpa e nada rodando nela.
4. **Ponha fotos.** Arraste uma imagem do Explorer para a prancha do app ou para a foto do grupo, ou cole
   um print (Ctrl+V) no campo de foto do diálogo. Para logos com fundo transparente, use "Inteira no
   branco".

### Atalhos

| Atalho | O que faz |
| --- | --- |
| `Ctrl+Alt+Espaço` | De qualquer lugar do Windows: mostra o vlauncher com a busca aberta (ou o esconde) |
| `Ctrl+K` | Abre a busca |
| `Esc` | Fecha a busca, o diálogo, o painel ou o monitor |
| `Ctrl+Alt+=` / `Ctrl+Alt+-` | Com o liquid glass ligado: menos ou mais transparente, de 5 em 5 |
| `Ctrl+Alt+0` | Com o liquid glass ligado: opaco |

### Contas do Claude Code

O botão Claude Code abre o Claude Code no PowerShell, na pasta do app. Por padrão roda `claude`. Para ter
mais de uma conta, abra o menu do botão, entre em "Configurar contas…" e dê a cada conta um nome e um
comando. O comando pode ser uma função do seu perfil do PowerShell que escolhe a conta, por exemplo:

```powershell
# no seu $PROFILE
function claude-trabalho { $env:CLAUDE_CONFIG_DIR = "$HOME\.claude-trabalho"; claude.exe @args }
```

Com duas ou mais contas, o botão pergunta qual abrir.

### Dois exemplares do mesmo app

Duas worktrees do mesmo app ao mesmo tempo disputam as portas. O Vite pula sozinho para a próxima porta
livre, mas uma API costuma não pular. Crie uma variação com outra porta nas variáveis de ambiente, por
exemplo `PORT=3002` (e, se o front encaminha para a API, o endereço dela, como
`VITE_API_PROXY_TARGET=http://localhost:3002`).

## Na linha de comando: o `vl`

O `vl` fala com o vlauncher aberto (e o abre, só na bandeja, se ele estiver fechado). Só roda o que já
está no launcher: o app e a variação vêm pelo nome, nunca um comando.

| Comando | O que faz |
| --- | --- |
| `vl status` | O que está rodando: endereço, CPU, memória, portas |
| `vl apps` | Os apps, com as variações e onde cada um roda |
| `vl rodar [app]` | Roda a variação padrão e espera o app anunciar o endereço (até 60 s) |
| `vl parar [app]` | Para o app; `vl parar --todas` para tudo o que está rodando |
| `vl reiniciar [app]` | Para e roda de novo |
| `vl saida [app]` | As últimas linhas da saída (`-n 200` para mais) |
| `vl abrir [app]` | Traz o vlauncher, com o painel do app aberto |

Sem o nome, vale o app da pasta atual, na worktree em que ela está: dentro de
`.claude\worktrees\feat-x`, o `vl rodar` roda o app nessa worktree, e o vlauncher passa a mostrá-la em
"Onde rodar". O nome pode ser só um pedaço, sem acento: `vl rodar loja`. Outras opções: `-v <variação>`,
`--local <branch>`, `--sem-esperar` e `--json`. O `vl` sai com 0 quando deu certo, 1 quando o vlauncher
recusou o pedido (ou o app caiu ao subir) e 2 quando não conseguiu falar com ele.

### Com o Claude Code

Um servidor que o Claude Code sobe por conta própria (`npm run dev` num shell dele) não aparece no
vlauncher. A skill `vlauncher` ensina o Claude a usar o `vl` para isso:

```sh
vl instalar-skill                        # em ~/.claude (ou na CLAUDE_CONFIG_DIR)
vl instalar-skill --em ~/.claude-pessoal # noutra conta
```

Depois, numa sessão, "sobe a loja" vira `vl rodar loja`: a loja aparece rodando no vlauncher, com a
saída e o monitor, e o Claude lê os erros pelo `vl saida`. A skill está em
[`claude-code/vlauncher/SKILL.md`](claude-code/vlauncher/SKILL.md).

## Onde ficam os dados

Tudo fica no seu computador, em `%APPDATA%\br.com.viniciusventura.launcher\`:

- `launcher.json`: grupos, apps, variações e preferências (o formato está em
  [`src/lib/tipos.ts`](src/lib/tipos.ts)). A versão anterior fica no `launcher.json.bak`.
- `imagens\`: as fotos, copiadas para cá quando você as escolhe.

## Privacidade e segurança

- **Nada sai do seu computador.** Sem conta, sem servidor, sem telemetria. A única rede é o `git fetch`
  quando você clica em "Buscar no remoto" e o navegador quando você abre um endereço.
- **Os comandos rodam com o seu usuário**, como se você os digitasse no terminal. Só adicione projetos e
  comandos em que você confia.
- **O `vl` conversa só dentro da máquina**, por um named pipe (`\\.\pipe\vlauncher-<usuário>`) que recusa
  conexões de outras máquinas. Pela permissão padrão do Windows, só o seu usuário (e os administradores)
  escreve nele. O pedido traz o nome de um app e de uma variação já cadastrados, nunca um comando.
- **O monitor só lê**: os processos de cada execução, a CPU e a memória deles e as portas em escuta, como
  o Gerenciador de Tarefas. Nada disso é gravado.
- **Não guarde segredos nas variações.** As variáveis de ambiente ficam em texto puro no `launcher.json`.
  Segredos continuam no `.env` do projeto.
- **Os arquivos locais só andam dentro do repositório**: o vlauncher copia `.env*` e `.npmrc` da pasta
  principal para uma worktree do mesmo repositório, sem sobrescrever, e para nenhum outro lugar.
- **A interface é fechada**: ela só conversa com o núcleo pelo IPC do Tauri, a política de conteúdo (CSP)
  só aceita o que vem do próprio app, e as fotos só são servidas da pasta de imagens dele.
- **Liquid glass:** para o acrylic não virar uma cor sólida quando a janela perde o foco, o vlauncher diz
  ao Windows que a moldura continua ativa (a mensagem `WM_NCACTIVATE`). Por isso, com o desfoque ligado,
  a barra de título não acinzenta sem foco. Não muda nada no foco do teclado.

## Desenvolver

Precisa do Windows, do [Node](https://nodejs.org) 22+ com o [pnpm](https://pnpm.io) e do
[Rust](https://rustup.rs) com o toolchain MSVC (o do Visual Studio Build Tools).

```sh
pnpm install
pnpm app          # o vlauncher em desenvolvimento (Tauri + Vite, com recarga)
pnpm dev          # só a interface no navegador, com dados de exemplo (bom para mexer no visual)
pnpm app:build    # o instalador em src-tauri\target\release\bundle\nsis\
```

Testes:

```sh
pnpm test && pnpm typecheck && pnpm lint
cd src-tauri && cargo test
```

Para inspecionar o app de verdade (o núcleo em Rust, não os dados de exemplo), rode com o DevTools
remoto do WebView2 e conecte em `http://127.0.0.1:9223` (pelo `edge://inspect` ou com o puppeteer).
`LAUNCHER_DADOS` aponta os dados para outra pasta (a config, as fotos e o perfil do WebView2), assim o
teste não toca nos seus dados e roda ao lado do vlauncher instalado. No desenvolvimento, os stores ficam
em `window.launcher`.

```sh
LAUNCHER_DADOS=C:/caminho/dados-teste WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 pnpm app
```

O `vl` de desenvolvimento sai do `cargo build --bin vl` (em `src-tauri\target\debug`). Com a mesma
`LAUNCHER_DADOS` no terminal, ele fala com o vlauncher do teste, nunca com o instalado.

### Por dentro

- **[Tauri 2](https://tauri.app)**: o núcleo em Rust inicia e encerra processos (com a árvore inteira),
  roda o git, lê as pastas, fica na bandeja e registra o atalho global. O Tauri usa o WebView2 que já vem
  no Windows, então o instalador tem 2 MB.
- **React 19, Vite e Tailwind 4** na interface, com [dnd-kit](https://dndkit.com) para arrastar e
  [zustand](https://zustand.docs.pmnd.rs) para o estado. Os dados são um JSON, sem banco.

```
src-tauri/src/
  processos.rs   execuções: iniciar, a saída em lotes, a URL anunciada, parar a árvore (taskkill /T)
  monitor.rs     a CPU, a memória, os processos e as portas de cada execução, de 2 em 2 s
  canal.rs       o named pipe por onde o vl fala com o launcher
  bin/vl.rs      o vl, a linha de comando (protocolo.rs: o nome do pipe, dividido com ele)
  git.rs         worktrees, branches, criar worktree, trocar branch, copiar .env e .npmrc
  projetos.rs    reconhece o projeto numa pasta e os scripts que sobem o app
  dados.rs       launcher.json e as imagens
  sistema.rs     VS Code, Windows Terminal, Claude Code, Explorer, navegador
  janela.rs      bandeja e atalho global
  vidro.rs       o acrylic do liquid glass com a janela sem foco
  instalador/    o gancho do instalador que tira o "Launcher" da 0.1.0
src/
  lib/           tipos, a ponte com o Rust (api.ts), os stores, o que o vl pede (canal.ts, apps.ts)
  components/    galeria, capítulo, prancha, painel, monitor, onde rodar, console, diálogos, busca
claude-code/     a skill vlauncher, que o vl instalar-skill grava
```

## Limitações

- **Só Windows.** Usa o `cmd`, o `taskkill`, o Windows Terminal, o WebView2 e o acrylic do Windows.
- **O monitor e o `vl` só enxergam o que o vlauncher rodou.** Um servidor que você sobe noutro terminal
  não aparece lá.
- **Interface em português.**
- **Instalador sem assinatura de código**, por isso o aviso do SmartScreen na primeira vez.

## Licença

O código é [MIT](LICENSE). O símbolo (o V com o chapéu) e a identidade visual são da marca
[Vinícius Ventura](https://viniciusventura.com.br) e não entram na licença: num fork, troque o ícone
(`src-tauri/icons`, gerado por `scripts/gerar-icone.py`) e o símbolo (`src/components/Marca.tsx`).

A fonte é a [Source Serif 4](https://github.com/adobe-fonts/source-serif) (SIL Open Font License) e os
ícones são do [Lucide](https://lucide.dev) (ISC).

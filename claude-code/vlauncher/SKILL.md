---
name: vlauncher
description: Roda, para, reinicia e lê a saída dos apps locais (servidores de desenvolvimento como npm run dev, pnpm dev, dev:all, docker compose up) pelo vlauncher, o launcher do usuário, para que eles apareçam rodando lá, com a saída, a CPU e a memória. Use sempre que for subir, iniciar, rodar, parar, reiniciar ou ver o log de um app ou servidor local, inclusive quando o usuário pedir para "rodar", "subir" ou "derrubar" um app sem falar em vlauncher.
---

# vlauncher

O usuário organiza e roda os projetos locais pelo vlauncher, um launcher para Windows. Um servidor
que você sobe por conta própria (`npm run dev` num shell seu) não aparece lá: o usuário não vê a
saída nem a CPU e a memória, não consegue pará-lo pelo launcher, e o servidor fica preso à sua
sessão. Para o que fica rodando, use o `vl`, a linha de comando do vlauncher:

```bash
"$LOCALAPPDATA/vlauncher/vl.exe" status
```

No PowerShell, com `&` na frente: `& "$LOCALAPPDATA/vlauncher/vl.exe" status`.

## Comandos

| Para | Comando |
| --- | --- |
| ver o que está rodando (endereço, CPU, memória, portas) | `vl status` |
| ver os apps cadastrados, as variações de cada um e os subgrupos | `vl apps` |
| rodar o app da pasta atual, na worktree em que você está | `vl rodar` |
| rodar um app pelo nome (um pedaço basta, sem acento) | `vl rodar loja` |
| rodar outra variação | `vl rodar loja -v preview` |
| rodar na worktree de uma branch | `vl rodar loja --local feat/checkout` |
| ler a saída (erros de build, do servidor) | `vl saida loja -n 200` |
| reiniciar (depois de mudar o .env ou a configuração) | `vl reiniciar loja` |
| parar | `vl parar loja` |
| rodar um subgrupo inteiro (o front e a API, por exemplo) | `vl rodar <subgrupo>` |

(Em todos, `vl` é o caminho completo acima.)

O `rodar` espera o app anunciar o endereço (até 60 s) e responde com a URL e as últimas linhas da
saída; se o app cair, responde com o erro e sai com código 1. Com o launcher fechado, o `vl rodar`
o abre na bandeja.

## Como usar

- Antes de subir um app, veja o `vl status`: ele pode já estar rodando, até em outra worktree. Não
  suba por fora um servidor que o launcher já roda.
- Dentro de uma worktree (`.claude/worktrees/...`), o `vl rodar` sem nome roda o app dessa
  worktree, e o launcher passa a mostrá-la como a escolhida.
- Um subgrupo junta os apps de um sistema, em repositórios separados (o `vl apps` mostra quais). O
  nome dele vale como o de um app: o `rodar` sobe todos, a API antes do front, cada um com a
  variação escolhida no subgrupo, e espera os endereços; `parar`, `reiniciar` e `saida` valem para
  todos. Com `--local`, roda na worktree da branch cada app que a tiver. Se um app e um subgrupo
  tiverem o mesmo nome, diga qual: `vl rodar "subgrupo loja"`.
- Para entender um erro do servidor, leia o `vl saida`, em vez de subir outro processo.
- Pare só o que você subiu. O `vl parar --todas` derruba tudo o que o usuário está rodando: só com
  pedido explícito.
- Se o `vl` disser que o app não está no launcher, rode do jeito de sempre e conte ao usuário que dá
  para cadastrá-lo no vlauncher.
- Se o `vl.exe` não existir, o vlauncher não está instalado: siga do jeito de sempre.
- O que termina sozinho (testes, build, lint, migrações, instalar dependências) continua no seu
  shell. O `vl` é para o que fica rodando.

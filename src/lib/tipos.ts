// O formato do launcher.json e o que o núcleo em Rust devolve (src-tauri/src).

export type Tema = 'escuro' | 'claro'

/** Uma conta do Claude Code no botão do painel: o nome no menu e o comando que a abre no PowerShell. */
export interface ContaClaude {
  id: string
  nome: string
  /** `claude`, ou uma função do perfil do PowerShell que escolhe a conta antes de chamá-lo. */
  comando: string
}

/** Como a foto ocupa a capa: cobrindo o quadro (foto, print) ou inteira numa prancha branca (logo). */
export type Ajuste = 'preencher' | 'inteira'

export interface Variacao {
  id: string
  /** "dev:all", "public:all", "docker"... */
  nome: string
  comando: string
  /** Endereço fixo. Sem ele, vale o localhost que o app anunciar na saída. */
  url?: string
  env: [string, string][]
  /** Abre no navegador quando o app anunciar o endereço. */
  abrirQuandoPronto: boolean
  /** Roda no Windows Terminal, fora do launcher (sem a saída aqui). */
  noTerminal: boolean
}

export interface App {
  id: string
  nome: string
  descricao?: string
  /** Nome do arquivo em %APPDATA%\...\imagens. */
  imagem?: string
  ajuste?: Ajuste
  /** A pasta principal do repositório. */
  pasta: string
  variacoes: Variacao[]
  variacaoPadrao?: string
  /** A pasta escolhida por último em "Onde rodar": a principal ou uma worktree. */
  pastaAtual?: string
  /** A branch dessa pasta, para mostrar sem perguntar ao git. */
  localAtual?: string
  /** Onde criar as worktrees novas. Padrão: .claude/worktrees, dentro do repositório. */
  pastaWorktrees?: string
}

export interface Grupo {
  id: string
  nome: string
  imagem?: string
  ajuste?: Ajuste
  /** A pasta onde ficam os projetos do grupo (D:\projetos\trabalho), para achar os novos. */
  pasta?: string
  recolhido?: boolean
  apps: App[]
}

export interface Config {
  versao: 1
  tema: Tema
  /** Liquid glass: o fundo de manchas de cor e as superfícies de vidro, no claro ou no escuro. */
  vidro?: boolean
  /** No liquid glass, quanto a janela deixa ver o que está atrás: 0 (opaca) a 100 (só o vidro). */
  transparencia?: number
  /** No liquid glass, desfoca o que está atrás da janela (o acrylic do Windows). Padrão: sim. */
  desfoque?: boolean
  /** As contas do Claude Code (src/lib/claude.ts). Sem nenhuma, vale só o `claude`. */
  contasClaude?: ContaClaude[]
  grupos: Grupo[]
}

export type EstadoExecucao = 'rodando' | 'parando' | 'encerrada'

export interface Execucao {
  id: string
  appId: string
  variacaoId: string | null
  rotulo: string
  local: string
  pasta: string
  comando: string
  pid: number
  inicio: number
  fim: number | null
  codigo: number | null
  estado: EstadoExecucao
  /** Quem parou foi a pessoa (o código de saída, então, não é erro do app). */
  parada: boolean
  url: string | null
}

export interface Linha {
  n: number
  texto: string
  erro: boolean
}

export interface Pedido {
  appId: string
  variacaoId: string | null
  rotulo: string
  local: string
  pasta: string
  comando: string
  env: [string, string][]
  url: string | null
  abrirQuandoPronto: boolean
}

export interface Worktree {
  /** A raiz da worktree. */
  caminho: string
  /** Onde o app roda nela: a raiz ou, num monorepo, a subpasta do app. */
  pasta: string
  branch: string | null
  head: string
  principal: boolean
  podavel: boolean
  travada: boolean
  existe: boolean
  precisaDependencias: boolean
  arquivosFaltando: string[]
  data: number | null
}

export interface Branch {
  nome: string
  remota: boolean
  data: number
}

export interface Locais {
  ehGit: boolean
  /** A subpasta do app dentro do repositório ("" quando o app é o repositório inteiro). */
  subpasta: string
  worktrees: Worktree[]
  branches: Branch[]
}

export interface Sugestao {
  nome: string
  comando: string
}

export interface Projeto {
  pasta: string
  nome: string
  ehGit: boolean
  gerenciador: string | null
  sugestoes: Sugestao[]
  outrosScripts: Sugestao[]
  tipo: 'node' | 'python' | 'rust' | 'docker' | 'pasta'
}

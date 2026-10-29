// A ponte com o núcleo em Rust. Fora do Tauri (o `pnpm dev` aberto no navegador, para mexer na
// interface), as mesmas funções respondem com dados de exemplo (./exemplo.ts).

import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { Effect, getCurrentWindow } from '@tauri-apps/api/window'
import { ask, open } from '@tauri-apps/plugin-dialog'
import type { Config, Execucao, Linha, Locais, Pedido, Projeto, Tema } from './tipos'

export const dentroDoTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface Api {
  caminhoDados(): Promise<string>
  carregarConfig(): Promise<Config | null>
  salvarConfig(config: Config): Promise<void>
  importarImagem(origem: string): Promise<string>
  importarImagemColada(bytes: Uint8Array, extensao: string): Promise<string>
  removerImagem(nome: string): Promise<void>
  urlDaImagem(nome: string): string

  iniciarExecucao(pedido: Pedido): Promise<Execucao>
  pararExecucao(id: string): Promise<void>
  /** Para tudo o que está rodando; devolve quantas parou. */
  pararTodas(): Promise<number>
  reiniciarExecucao(id: string): Promise<Execucao>
  descartarExecucao(id: string): Promise<void>
  listarExecucoes(): Promise<Execucao[]>
  linhasDaExecucao(id: string): Promise<Linha[]>
  limparLinhas(id: string): Promise<void>

  listarLocais(pasta: string): Promise<Locais>
  buscarBranches(pasta: string): Promise<void>
  criarWorktree(repositorio: string, branch: string, remota: boolean, pastaBase?: string): Promise<string>
  trocarBranch(pasta: string, branch: string, remota: boolean): Promise<void>
  copiarArquivosLocais(origem: string, destino: string): Promise<string[]>
  inspecionarPasta(pasta: string): Promise<Projeto | null>
  escanearPasta(pasta: string): Promise<Projeto[]>

  abrirUrl(url: string): Promise<void>
  abrirPasta(pasta: string): Promise<void>
  abrirVscode(pasta: string): Promise<void>
  abrirTerminal(pasta: string, comando?: string, env?: [string, string][]): Promise<void>
  abrirClaude(pasta: string, comando: string): Promise<void>

  escolherPasta(titulo: string, padrao?: string): Promise<string | null>
  escolherImagem(): Promise<string | null>
  confirmar(mensagem: string, titulo: string, ok?: string): Promise<boolean>
  definirTemaDaJanela(tema: Tema): Promise<void>
  /** O acrylic do Windows atrás da janela (no liquid glass com desfoque), ou nenhum efeito. */
  definirDesfoqueDaJanela(acrylic: boolean): Promise<void>
  /** Mantém o acrylic com a janela sem foco (o Windows o trocaria por uma cor sólida). */
  manterVidroAtivo(ligado: boolean): Promise<void>

  aoMudarExecucao(cb: (e: Execucao) => void): Promise<UnlistenFn>
  aoChegarLinhas(cb: (id: string, linhas: Linha[]) => void): Promise<UnlistenFn>
  aoRemoverExecucao(cb: (id: string) => void): Promise<UnlistenFn>
  aoAbrirBusca(cb: () => void): Promise<UnlistenFn>
  /** Arquivos arrastados do Explorer: o tipo do evento, os caminhos e o ponto (em px da página). */
  aoArrastarArquivos(cb: (tipo: 'over' | 'drop' | 'leave', caminhos: string[], x: number, y: number) => void): Promise<UnlistenFn>
}

let pastaDados = ''

const tauri: Api = {
  async caminhoDados() {
    pastaDados = await invoke<string>('caminho_dados')
    return pastaDados
  },
  carregarConfig: () => invoke('carregar_config'),
  salvarConfig: (config) => invoke('salvar_config', { config }),
  importarImagem: (origem) => invoke('importar_imagem', { origem }),
  importarImagemColada: (bytes, extensao) => invoke('importar_imagem_colada', bytes, { headers: { extensao } }),
  removerImagem: (nome) => invoke('remover_imagem', { nome }),
  urlDaImagem: (nome) => convertFileSrc(`${pastaDados}\\imagens\\${nome}`),

  iniciarExecucao: (pedido) => invoke('iniciar_execucao', { pedido }),
  pararExecucao: (id) => invoke('parar_execucao', { id }),
  pararTodas: () => invoke('parar_todas'),
  reiniciarExecucao: (id) => invoke('reiniciar_execucao', { id }),
  descartarExecucao: (id) => invoke('descartar_execucao', { id }),
  listarExecucoes: () => invoke('listar_execucoes'),
  linhasDaExecucao: (id) => invoke('linhas_da_execucao', { id }),
  limparLinhas: (id) => invoke('limpar_linhas', { id }),

  listarLocais: (pasta) => invoke('listar_locais', { pasta }),
  buscarBranches: (pasta) => invoke('buscar_branches', { pasta }),
  criarWorktree: (repositorio, branch, remota, pastaBase) =>
    invoke('criar_worktree', { repositorio, branch, remota, pastaBase: pastaBase ?? null }),
  trocarBranch: (pasta, branch, remota) => invoke('trocar_branch', { pasta, branch, remota }),
  copiarArquivosLocais: (origem, destino) => invoke('copiar_arquivos_locais', { origem, destino }),
  inspecionarPasta: (pasta) => invoke('inspecionar_pasta', { pasta }),
  escanearPasta: (pasta) => invoke('escanear_pasta', { pasta }),

  abrirUrl: (url) => invoke('abrir_url', { url }),
  abrirPasta: (pasta) => invoke('abrir_pasta', { pasta }),
  abrirVscode: (pasta) => invoke('abrir_vscode', { pasta }),
  abrirTerminal: (pasta, comando, env) =>
    invoke('abrir_terminal', { pasta, comandoInicial: comando ?? null, env: env ?? null }),
  abrirClaude: (pasta, comando) => invoke('abrir_claude', { pasta, comando }),

  async escolherPasta(titulo, padrao) {
    const r = await open({ directory: true, title: titulo, defaultPath: padrao })
    return typeof r === 'string' ? r : null
  },
  async escolherImagem() {
    const r = await open({
      title: 'Escolher imagem',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'] }],
    })
    return typeof r === 'string' ? r : null
  },
  confirmar: (mensagem, titulo, ok = 'Confirmar') => ask(mensagem, { title: titulo, kind: 'warning', okLabel: ok, cancelLabel: 'Cancelar' }),
  definirTemaDaJanela: (tema) => getCurrentWindow().setTheme(tema === 'escuro' ? 'dark' : 'light'),
  definirDesfoqueDaJanela: (acrylic) =>
    acrylic ? getCurrentWindow().setEffects({ effects: [Effect.Acrylic] }) : getCurrentWindow().clearEffects(),
  manterVidroAtivo: (ligado) => invoke('manter_vidro_ativo', { ligado }),

  aoMudarExecucao: (cb) => listen<Execucao>('execucao:estado', (e) => cb(e.payload)),
  aoChegarLinhas: (cb) => listen<{ id: string; linhas: Linha[] }>('execucao:linhas', (e) => cb(e.payload.id, e.payload.linhas)),
  aoRemoverExecucao: (cb) => listen<string>('execucao:removida', (e) => cb(e.payload)),
  aoAbrirBusca: (cb) => listen('abrir-busca', () => cb()),
  aoArrastarArquivos: (cb) =>
    getCurrentWebview().onDragDropEvent((e) => {
      const p = e.payload
      if (p.type === 'leave') return cb('leave', [], 0, 0)
      if (p.type === 'enter') return
      const escala = window.devicePixelRatio || 1
      cb(p.type, p.type === 'drop' ? p.paths : [], p.position.x / escala, p.position.y / escala)
    }),
}

export const api: Api = dentroDoTauri ? tauri : (await import('./exemplo')).exemplo

import { describe, expect, it } from 'vitest'
import { acharVariacao, acharWorktree, appsDaPasta, appsPeloNome, chaveDoNome, pastaNaWorktree, Recusa } from './apps'
import type { App, Config, OndeEsta, Variacao, Worktree } from './tipos'

const variacao = (id: string, nome: string): Variacao => ({ id, nome, comando: `npm run ${nome}`, env: [], abrirQuandoPronto: false, noTerminal: false })

const app = (id: string, nome: string, pasta: string, extra: Partial<App> = {}): App => ({
  id,
  nome,
  pasta,
  variacoes: [variacao(`${id}-dev`, 'dev'), variacao(`${id}-all`, 'dev:all'), variacao(`${id}-prev`, 'preview')],
  ...extra,
})

const config: Config = {
  versao: 1,
  tema: 'escuro',
  grupos: [
    {
      id: 'g1',
      nome: 'Trabalho',
      apps: [
        app('a1', 'Loja Online', 'D:\\projetos\\loja-online'),
        app('a2', 'Painel de Pedidos', 'D:\\projetos\\monorepo\\apps\\painel'),
        app('a3', 'API de Pedidos', 'D:\\projetos\\monorepo\\apps\\api'),
      ],
    },
    { id: 'g2', nome: 'Pessoal', apps: [app('a4', 'Finanças', 'D:\\pessoal\\financas', { pastaAtual: 'D:\\pessoal\\financas\\.claude\\worktrees\\nova-tela' })] },
  ],
}

const ids = (achados: { app: App }[]) => achados.map((a) => a.app.id)

describe('achar o app pelo nome', () => {
  it('ignora acento, espaço e pontuação', () => {
    expect(chaveDoNome('Finanças + Pessoais')).toBe('financaspessoais')
    expect(ids(appsPeloNome(config, 'loja-online'))).toEqual(['a1'])
    expect(ids(appsPeloNome(config, 'financas'))).toEqual(['a4'])
  })

  it('aceita um pedaço, e devolve todos quando ele serve a mais de um', () => {
    expect(ids(appsPeloNome(config, 'loja'))).toEqual(['a1'])
    expect(ids(appsPeloNome(config, 'pedidos'))).toEqual(['a2', 'a3'])
    expect(ids(appsPeloNome(config, 'painel pedidos'))).toEqual(['a2'])
    expect(appsPeloNome(config, 'nada-disso')).toEqual([])
    expect(appsPeloNome(config, '  ')).toEqual([])
  })

  it('o nome igual ganha do pedaço', () => {
    const comParecido: Config = { ...config, grupos: [{ id: 'g', nome: 'g', apps: [app('x1', 'api', 'D:\\a'), app('x2', 'api-admin', 'D:\\b')] }] }
    expect(ids(appsPeloNome(comParecido, 'api'))).toEqual(['x1'])
  })
})

describe('achar o app pela pasta', () => {
  const worktree: OndeEsta = { raizPrincipal: 'D:\\projetos\\monorepo', raiz: 'D:\\projetos\\monorepo\\.claude\\worktrees\\feat-x', branch: 'feat/x', head: 'abc' }

  it('acha a subpasta do app numa worktree do monorepo', () => {
    expect(pastaNaWorktree(config.grupos[0]!.apps[1]!, worktree)).toBe('D:\\projetos\\monorepo\\.claude\\worktrees\\feat-x\\apps\\painel')
    expect(pastaNaWorktree(config.grupos[0]!.apps[0]!, worktree)).toBeNull()
  })

  it('fica com o app de pasta mais funda', () => {
    expect(ids(appsDaPasta(config, 'D:\\projetos\\loja-online\\src\\pages', null))).toEqual(['a1'])
    expect(ids(appsDaPasta(config, `${worktree.raiz}\\apps\\api\\src`, worktree))).toEqual(['a3'])
    // A worktree escolhida em "Onde rodar" também vale.
    expect(ids(appsDaPasta(config, 'D:\\pessoal\\financas\\.claude\\worktrees\\nova-tela', null))).toEqual(['a4'])
  })

  it('na raiz do monorepo, devolve os apps dele para escolher', () => {
    expect(ids(appsDaPasta(config, worktree.raiz, worktree))).toEqual(['a2', 'a3'])
    expect(appsDaPasta(config, 'C:\\outro', null)).toEqual([])
  })
})

describe('achar a variação e a worktree', () => {
  const loja = config.grupos[0]!.apps[0]!

  it('sem nome, a padrão; com nome, a igual antes da parecida', () => {
    expect(acharVariacao(loja).id).toBe('a1-dev')
    expect(acharVariacao({ ...loja, variacaoPadrao: 'a1-prev' }).id).toBe('a1-prev')
    expect(acharVariacao(loja, 'dev').id).toBe('a1-dev')
    expect(acharVariacao(loja, 'devall').id).toBe('a1-all')
    expect(acharVariacao(loja, 'prev').id).toBe('a1-prev')
  })

  it('explica o que não deu', () => {
    expect(() => acharVariacao(loja, 'staging')).toThrow(Recusa)
    expect(() => acharVariacao(loja, 'staging')).toThrow(/As que tem: dev, dev:all, preview/)
    expect(() => acharVariacao({ ...loja, variacoes: [] })).toThrow(/não tem variação/)
  })

  it('acha a worktree pela branch ou pela pasta', () => {
    const w = (caminho: string, branch: string | null): Worktree => ({
      caminho,
      pasta: caminho,
      branch,
      head: '123',
      principal: branch === 'main',
      podavel: false,
      travada: false,
      existe: true,
      precisaDependencias: false,
      arquivosFaltando: [],
      data: null,
    })
    const lista = [w('D:\\loja', 'main'), w('D:\\loja\\.claude\\worktrees\\feat-pix', 'feat/pix')]
    expect(acharWorktree(lista, 'feat/pix')?.branch).toBe('feat/pix')
    expect(acharWorktree(lista, 'feat-pix')?.branch).toBe('feat/pix')
    expect(acharWorktree(lista, 'D:/loja')?.branch).toBe('main')
    expect(acharWorktree(lista, 'outra')).toBeUndefined()
  })
})

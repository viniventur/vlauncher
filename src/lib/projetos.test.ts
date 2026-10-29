import { describe, expect, it } from 'vitest'
import { escolherSugestoes } from './projetos'
import type { Projeto } from './tipos'

const projeto = (scripts: string[]): Projeto => ({
  pasta: 'D:\\x',
  nome: 'x',
  ehGit: true,
  gerenciador: 'npm',
  tipo: 'node',
  sugestoes: scripts.map((nome) => ({ nome, comando: `npm run ${nome}` })),
  outrosScripts: [],
})

describe('escolherSugestoes', () => {
  it('prefere os scripts que sobem o app inteiro', () => {
    const nomes = escolherSugestoes(projeto(['dev', 'dev:all', 'dev:api', 'public:all', 'start', 'db:create-escolas:all', 'db:all'])).map((s) => s.nome)
    expect(nomes).toEqual(['dev:all', 'public:all'])
  })

  it('sem *:all, fica com o dev; sem dev, com o start', () => {
    expect(escolherSugestoes(projeto(['start', 'dev'])).map((s) => s.nome)).toEqual(['dev'])
    expect(escolherSugestoes(projeto(['preview', 'start'])).map((s) => s.nome)).toEqual(['start'])
    expect(escolherSugestoes(projeto([]))).toEqual([])
  })
})

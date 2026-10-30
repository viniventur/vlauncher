import { describe, expect, it } from 'vitest'
import {
  aApiPrimeiro,
  alvosPeloNome,
  itensDaGrade,
  nomeAoJuntar,
  normalizar,
  ordemAoJuntar,
  ordemDosApps,
  semOApp,
  subgruposPeloNome,
  subgruposValidos,
  sugestoesDeSubgrupos,
  variacaoNoSubgrupo,
} from './subgrupos'
import type { App, Config, Grupo, Subgrupo } from './tipos'

const app = (id: string, pasta: string): App => ({
  id,
  nome: id,
  pasta,
  variacoes: [
    { id: `${id}-dev`, nome: 'dev', comando: 'npm run dev', env: [], abrirQuandoPronto: false, noTerminal: false },
    { id: `${id}-docker`, nome: 'docker', comando: 'docker compose up', env: [], abrirQuandoPronto: false, noTerminal: false },
  ],
})

const loja: Subgrupo = { id: 's-loja', nome: 'loja', apps: ['loja-api', 'loja-front'] }

const grupo = (subgrupos?: Subgrupo[]): Grupo => ({
  id: 'g',
  nome: 'Trabalho',
  pasta: 'D:\\projetos',
  apps: [
    app('blog', 'D:\\projetos\\blog'),
    app('loja-front', 'D:\\projetos\\loja\\loja-front'),
    app('painel-front', 'D:\\projetos\\painel\\painel-front'),
    app('loja-api', 'D:\\projetos\\loja\\loja-api'),
    app('painel-api', 'D:\\projetos\\painel\\painel-api'),
  ],
  subgrupos,
})

const ids = (g: Grupo) => g.apps.map((a) => a.id)
const resumo = (g: Grupo) =>
  itensDaGrade(g).map((i) => (i.tipo === 'app' ? i.app.id : `${i.subgrupo.nome}(${i.apps.map((a) => a.id).join('+')})`))

describe('a grade com subgrupos', () => {
  it('põe o subgrupo no lugar do primeiro app dele e esconde os outros', () => {
    expect(resumo(grupo([loja]))).toEqual(['blog', 'loja(loja-api+loja-front)', 'painel-front', 'painel-api'])
  })

  it('ignora o subgrupo com app que não existe ou com um app só', () => {
    const quebrado: Subgrupo = { id: 's2', nome: 'x', apps: ['blog', 'nao-existe'] }
    expect(subgruposValidos(grupo([quebrado]))).toEqual([])
    expect(resumo(grupo([quebrado]))).toEqual(ids(grupo()))
  })

  it('um app fica em um subgrupo só: vale o primeiro', () => {
    const outro: Subgrupo = { id: 's2', nome: 'outro', apps: ['loja-front', 'blog'] }
    expect(subgruposValidos(grupo([loja, outro])).map((s) => s.nome)).toEqual(['loja'])
  })

  it('arrastar o subgrupo leva os apps juntos, na ordem dele', () => {
    const g = grupo([loja])
    expect(ordemDosApps(['blog', 'painel-front', 'painel-api', 's-loja'], g)).toEqual([
      'blog',
      'painel-front',
      'painel-api',
      'loja-api',
      'loja-front',
    ])
  })
})

describe('o rodar tudo', () => {
  it('usa a variação escolhida e, sem ela, a padrão do app', () => {
    const g = grupo()
    const api = g.apps.find((a) => a.id === 'loja-api')!
    expect(variacaoNoSubgrupo({ ...loja, variacoes: { 'loja-api': 'loja-api-docker' } }, api)?.nome).toBe('docker')
    expect(variacaoNoSubgrupo({ ...loja, variacoes: { 'loja-api': 'apagada' } }, api)?.nome).toBe('dev')
    expect(variacaoNoSubgrupo(loja, { ...api, variacaoPadrao: 'loja-api-docker' })?.nome).toBe('docker')
  })
})

describe('as sugestões', () => {
  it('juntam os apps da mesma pasta-mãe, com a API primeiro', () => {
    expect(sugestoesDeSubgrupos(grupo())).toEqual([
      { nome: 'loja', apps: ['loja-api', 'loja-front'] },
      { nome: 'painel', apps: ['painel-api', 'painel-front'] },
    ])
  })

  it('ignoram a pasta do grupo e os apps que já estão num subgrupo', () => {
    expect(sugestoesDeSubgrupos(grupo([loja]))).toEqual([{ nome: 'painel', apps: ['painel-api', 'painel-front'] }])
  })
})

describe('achar o subgrupo pelo nome (o vl)', () => {
  const painel: Subgrupo = { id: 's-painel', nome: 'Painel de Pedidos', apps: ['painel-api', 'painel-front'] }
  const config: Config = { versao: 1, tema: 'escuro', grupos: [grupo([loja, painel])] }
  const nomes = (consulta: string) => subgruposPeloNome(config, consulta).map((s) => s.subgrupo.nome)

  it('pelo nome inteiro, sem acento nem pontuação, ou por um pedaço', () => {
    expect(nomes('LOJA')).toEqual(['loja'])
    expect(nomes('painel-de-pedidos')).toEqual(['Painel de Pedidos'])
    expect(nomes('pedidos')).toEqual(['Painel de Pedidos'])
    expect(nomes('nada')).toEqual([])
  })
})

describe('o nome no vl: app ou subgrupo', () => {
  const blog: Subgrupo = { id: 's-blog', nome: 'Blog', apps: ['painel-api', 'painel-front'] }
  const config: Config = { versao: 1, tema: 'escuro', grupos: [grupo([loja, blog])] }
  const alvos = (consulta: string) => {
    const { apps, subgrupos } = alvosPeloNome(config, consulta)
    return [...apps.map((a) => `app ${a.app.id}`), ...subgrupos.map((s) => `subgrupo ${s.subgrupo.nome}`)]
  }

  it('o nome igual ganha do pedaço, de app ou de subgrupo', () => {
    expect(alvos('loja')).toEqual(['subgrupo loja'])
    expect(alvos('loja-api')).toEqual(['app loja-api'])
    expect(alvos('front')).toEqual(['app loja-front', 'app painel-front'])
  })

  it('o app e o subgrupo de mesmo nome se separam pela palavra na frente', () => {
    expect(alvos('blog')).toEqual(['app blog', 'subgrupo Blog'])
    expect(alvos('subgrupo blog')).toEqual(['subgrupo Blog'])
    expect(alvos('app blog')).toEqual(['app blog'])
  })
})

describe('juntar arrastando', () => {
  const nomes = grupo().apps.map((a) => a.nome)
  const doGrupo = (...ids: string[]) => ids.map((id) => grupo().apps.find((a) => a.id === id)!)

  it('a API vai antes do front', () => {
    expect(aApiPrimeiro(doGrupo('loja-front', 'loja-api')).map((a) => a.id)).toEqual(['loja-api', 'loja-front'])
    expect(aApiPrimeiro(doGrupo('blog', 'painel-front')).map((a) => a.id)).toEqual(['blog', 'painel-front'])
  })

  it('o nome: a pasta-mãe comum, o começo comum dos nomes ou os dois nomes', () => {
    expect(nomeAoJuntar(doGrupo('loja-api', 'loja-front'), grupo(), nomes)).toBe('loja')
    // A pasta-mãe é a do grupo: vale o começo comum, cortado num separador.
    const soltos = [app('receitas-api', 'D:\\projetos\\receitas-api'), app('receitas-web', 'D:\\projetos\\receitas-web')]
    expect(nomeAoJuntar(soltos, grupo(), nomes)).toBe('receitas')
    // O começo comum é o nome de um app (o vl empataria): vão os dois nomes.
    const comOMesmo = [app('receitas', 'D:\\projetos\\receitas'), app('receitas-bot', 'D:\\projetos\\receitas-bot')]
    expect(nomeAoJuntar(comOMesmo, grupo(), ['receitas', 'receitas-bot'])).toBe('receitas + receitas-bot')
    expect(nomeAoJuntar(doGrupo('blog', 'painel-front'), grupo(), nomes)).toBe('blog + painel-front')
  })

  it('o app vai para logo depois do alvo, saindo do grupo em que estava', () => {
    const ordem = { g1: ['a', 'x', 'b'], g2: ['c', 'd'] }
    expect(ordemAoJuntar(ordem, 'a', 'g1', 'b')).toEqual({ g1: ['x', 'b', 'a'], g2: ['c', 'd'] })
    expect(ordemAoJuntar(ordem, 'd', 'g1', 'x')).toEqual({ g1: ['a', 'x', 'd', 'b'], g2: ['c'] })
  })
})

describe('a limpeza', () => {
  it('o app que sai desfaz o subgrupo de dois', () => {
    const g = semOApp(grupo([loja]), 'loja-front')
    expect(g.subgrupos).toEqual([])
    expect(ids(g)).not.toContain('loja-front')
  })

  it('normalizar tira dos subgrupos o que não está mais no grupo', () => {
    const tres: Subgrupo = { id: 's3', nome: 'tres', apps: ['blog', 'painel-front', 'painel-api'] }
    const g = { ...grupo([tres]), apps: grupo().apps.filter((a) => a.id !== 'blog') }
    expect(normalizar(g).subgrupos).toEqual([{ ...tres, apps: ['painel-front', 'painel-api'] }])
  })
})

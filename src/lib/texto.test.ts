import { describe, expect, it } from 'vitest'
import {
  caminhoWindows,
  combina,
  escreverEnv,
  estaDentro,
  formatarCpu,
  formatarMemoria,
  iniciais,
  lerEnv,
  mesmaPasta,
  relativoA,
  urlCurta,
} from './texto'

describe('texto', () => {
  it('busca sem acento e em qualquer ordem', () => {
    expect(combina('loja onl', 'lója-online')).toBe(true)
    expect(combina('online loja', 'loja-online', 'dev:all')).toBe(true)
    expect(combina('pagamentos', 'loja-online')).toBe(false)
    expect(combina('', 'qualquer')).toBe(true)
  })

  it('tira as iniciais da capa', () => {
    expect(iniciais('loja-online')).toBe('lo')
    expect(iniciais('Site pessoal')).toBe('sp')
    expect(iniciais('financas')).toBe('fi')
  })

  it('escreve o caminho como o Windows', () => {
    expect(caminhoWindows(' D:/projetos/ ')).toBe('D:\\projetos')
    expect(caminhoWindows('D:\\')).toBe('D:\\')
  })

  it('compara pastas do Windows', () => {
    expect(mesmaPasta('D:/projetos/app/', 'd:\\Projetos\\app')).toBe(true)
    expect(relativoA('D:\\proj\\app\\.claude\\worktrees\\x', 'D:/proj/app')).toBe('.claude\\worktrees\\x')
    expect(estaDentro('d:/proj/app/src', 'D:\\proj\\app\\')).toBe(true)
    expect(estaDentro('D:\\proj\\app', 'D:\\proj\\app')).toBe(true)
    // Começar com o mesmo nome não é estar dentro.
    expect(estaDentro('D:\\proj\\app-admin', 'D:\\proj\\app')).toBe(false)
  })

  it('escreve a memória e a CPU como o Gerenciador de Tarefas', () => {
    expect(formatarMemoria(412.4 * 1024 ** 2)).toBe('412 MB')
    expect(formatarMemoria(1.84 * 1024 ** 3)).toBe('1,8 GB')
    expect(formatarMemoria(999.6 * 1024 ** 2)).toBe('1 GB')
    expect(formatarMemoria(300 * 1024)).toBe('300 KB')
    expect(formatarCpu(0.04)).toBe('0%')
    expect(formatarCpu(3.24)).toBe('3,2%')
    expect(formatarCpu(12.6)).toBe('13%')
  })

  it('lê e escreve as variáveis de ambiente', () => {
    const env = lerEnv('PORT=3002\n# comentário\nVITE_API_PROXY_TARGET = http://localhost:3002\nlixo')
    expect(env).toEqual([
      ['PORT', '3002'],
      ['VITE_API_PROXY_TARGET', 'http://localhost:3002'],
    ])
    expect(escreverEnv(env)).toBe('PORT=3002\nVITE_API_PROXY_TARGET=http://localhost:3002')
  })

  it('encurta o endereço', () => {
    expect(urlCurta('http://localhost:8080/')).toBe('localhost:8080')
  })
})

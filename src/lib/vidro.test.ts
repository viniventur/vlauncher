import { describe, expect, it } from 'vitest'
import { transparenciaPeloAtalho } from './vidro'

describe('transparenciaPeloAtalho', () => {
  it('segue os atalhos do Windows Terminal', () => {
    expect(transparenciaPeloAtalho('Equal', 22)).toBe(17)
    expect(transparenciaPeloAtalho('Minus', 22)).toBe(27)
    expect(transparenciaPeloAtalho('Digit0', 60)).toBe(0)
    expect(transparenciaPeloAtalho('NumpadAdd', 22)).toBe(17)
  })

  it('fica entre 0 e 100', () => {
    expect(transparenciaPeloAtalho('Equal', 3)).toBe(0)
    expect(transparenciaPeloAtalho('Minus', 98)).toBe(100)
  })

  it('ignora as outras teclas', () => {
    expect(transparenciaPeloAtalho('KeyK', 22)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { zonaNaPrancha } from './arrasto'

// Uma prancha de 200 px de largura: a capa (16:10) tem 125 px de altura; o nome vem embaixo.
const prancha = { left: 0, top: 0, width: 200, height: 185 }

describe('a faixa da prancha sob o ponteiro', () => {
  it('no meio da capa, junta', () => {
    expect(zonaNaPrancha(prancha, { x: 100, y: 60 }, true)).toBe('centro')
    expect(zonaNaPrancha(prancha, { x: 70, y: 10 }, false)).toBe('centro')
    expect(zonaNaPrancha(prancha, { x: 100, y: 60 }, undefined)).toBe('centro')
  })

  it('o lado de lá é o oposto ao de onde o app veio', () => {
    expect(zonaNaPrancha(prancha, { x: 180, y: 60 }, true)).toBe('longe')
    expect(zonaNaPrancha(prancha, { x: 20, y: 60 }, true)).toBe('perto')
    expect(zonaNaPrancha(prancha, { x: 20, y: 60 }, false)).toBe('longe')
    expect(zonaNaPrancha(prancha, { x: 180, y: 60 }, false)).toBe('perto')
  })

  it('embaixo da capa, no nome, não junta', () => {
    expect(zonaNaPrancha(prancha, { x: 100, y: 160 }, true)).toBe('longe')
    expect(zonaNaPrancha(prancha, { x: 90, y: 160 }, true)).toBe('perto')
  })

  it('o app de outro grupo: fora do meio, tudo é lado de lá', () => {
    expect(zonaNaPrancha(prancha, { x: 20, y: 60 }, undefined)).toBe('longe')
    expect(zonaNaPrancha(prancha, { x: 180, y: 160 }, undefined)).toBe('longe')
  })
})

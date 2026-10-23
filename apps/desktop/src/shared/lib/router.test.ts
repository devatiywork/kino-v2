import { beforeEach, describe, expect, it } from 'vitest'
import { goBack, navigate, routerStore } from './router'

describe('router', () => {
  beforeEach(() => routerStore.set({ screen: 'home', previous: 'home' }))

  it('«Назад» из плеера возвращает туда, откуда его открыли', () => {
    navigate('history')
    navigate('player')
    expect(routerStore.get().screen).toBe('player')
    goBack()
    expect(routerStore.get().screen).toBe('history')
  })

  it('переход на тот же экран ничего не меняет', () => {
    navigate('home')
    expect(routerStore.get()).toEqual({ screen: 'home', previous: 'home' })
  })
})

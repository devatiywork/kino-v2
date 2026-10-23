import { beforeEach, describe, expect, it } from 'vitest'
import { goBack, navigate, openSeries, routerStore } from './router'

describe('router', () => {
  beforeEach(() => routerStore.set({ screen: 'home', previous: 'home', seriesKey: null }))

  it('«Назад» из плеера возвращает туда, откуда его открыли', () => {
    navigate('history')
    navigate('player')
    expect(routerStore.get().screen).toBe('player')
    goBack()
    expect(routerStore.get().screen).toBe('history')
  })

  it('переход на тот же экран ничего не меняет', () => {
    navigate('home')
    expect(routerStore.get()).toEqual({ screen: 'home', previous: 'home', seriesKey: null })
  })

  it('сериал открывается по ключу, из плеера «Назад» ведёт к нему же', () => {
    openSeries('show:the sopranos')
    expect(routerStore.get()).toMatchObject({ screen: 'show', seriesKey: 'show:the sopranos' })
    navigate('player')
    goBack()
    expect(routerStore.get()).toMatchObject({ screen: 'show', seriesKey: 'show:the sopranos' })
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { seriesSummary } from '../../../test/series'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { SeriesCard } = await import('./SeriesCard')

describe('SeriesCard', () => {
  it('сезон, сколько просмотрено, папка; нажатие открывает сериал', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<SeriesCard series={seriesSummary()} onOpen={onOpen} />)
    const card = screen.getByRole('button', { name: 'Kino Test, Сезон 1 · 1 из 3' })
    expect(card).toHaveTextContent('D:\\Сериалы\\Kino Test')
    await user.click(card)
    expect(onOpen).toHaveBeenCalledWith('show:kino test')
  })
})

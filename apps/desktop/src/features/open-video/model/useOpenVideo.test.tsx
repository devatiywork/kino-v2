import { Button, ToastProvider } from '@kino/ui'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { libraryFile } from '../../../test/library'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

const { useOpenVideo } = await import('./useOpenVideo')
const { resumeStore } = await import('../../../entities/playback')
const { routerStore } = await import('../../../shared/lib/router')
const mock = await tauri

function Harness({ file }: { file: Parameters<ReturnType<typeof useOpenVideo>['openFile']>[0] }) {
  const { openFile } = useOpenVideo()
  return <Button onPress={() => void openFile(file)}>Открыть</Button>
}

describe('opening from the library (integration)', () => {
  beforeEach(() => {
    mock.reset()
    routerStore.set({ screen: 'home', previous: 'home' })
  })

  it('открывает файл, запоминает, откуда продолжено, и переходит в плеер', async () => {
    const user = userEvent.setup()
    mock.respond('player_open', { resumedFrom: 1394 })
    render(
      <ToastProvider>
        <Harness file={libraryFile({ id: 1 })} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    await waitFor(() => expect(routerStore.get().screen).toBe('player'))
    expect(mock.calls()).toEqual([['player_open', { path: 'E:\\Сериалы\\Soprano\\The.Sopranos.S01E01.mkv' }]])
    expect(resumeStore.get().from).toBe(1394)
  })

  it('удалённый файл не открывается — предупреждение с путём', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Harness file={libraryFile({ id: 2, exists: false })} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(await screen.findByText(/Файл не найден: E:\\Сериалы/)).toBeInTheDocument()
    expect(mock.invoke).not.toHaveBeenCalled()
    expect(routerStore.get().screen).toBe('home')
  })
})

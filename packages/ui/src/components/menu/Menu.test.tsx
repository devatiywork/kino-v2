import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconMore } from '../../icons'
import { ContextMenu } from './ContextMenu'
import { MenuButton } from './MenuButton'

const ITEMS = [
  { id: 'play', label: 'Смотреть с начала' },
  { id: 'folder', label: 'Открыть папку', shortcut: 'Ctrl E' },
  { id: 'watched', label: 'Отметить просмотренной', isDisabled: true },
  { id: 'remove', label: 'Убрать из истории', tone: 'danger' as const, separatorBefore: true },
]

describe('MenuButton', () => {
  it('открывает меню с пунктами, разделителем и сочетанием клавиш', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="Ещё" icon={<IconMore />} items={ITEMS} />)
    await user.click(screen.getByRole('button', { name: 'Ещё' }))
    const menu = await screen.findByRole('menu', { name: 'Ещё' })
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(4)
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    expect(within(menu).getByText('Ctrl E')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Отметить просмотренной/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('выбор пункта вызывает действие и закрывает меню', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<MenuButton label="Ещё" icon={<IconMore />} items={ITEMS} onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Ещё' }))
    await user.click(await screen.findByRole('menuitem', { name: /Открыть папку/ }))
    expect(onAction).toHaveBeenCalledWith('folder')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('управляется с клавиатуры', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<MenuButton label="Ещё" icon={<IconMore />} items={ITEMS} onAction={onAction} />)
    await user.tab()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onAction).toHaveBeenCalledWith('folder')
  })
})

describe('ContextMenu', () => {
  it('правая кнопка открывает своё меню вместо системного', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu label="Действия с серией" items={ITEMS} onAction={onAction}>
        <div>Серия 5</div>
      </ContextMenu>,
    )
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 80 })
    fireEvent(screen.getByText('Серия 5'), event)
    expect(event.defaultPrevented).toBe(true)
    const menu = await screen.findByRole('menu', { name: 'Действия с серией' })
    await user.click(within(menu).getByRole('menuitem', { name: /Убрать из истории/ }))
    expect(onAction).toHaveBeenCalledWith('remove')
  })

  it('открывается с клавиатуры: Shift+F10', async () => {
    const user = userEvent.setup()
    render(
      <ContextMenu label="Действия с серией" items={ITEMS}>
        <button type="button">Серия 5</button>
      </ContextMenu>,
    )
    await user.tab()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(await screen.findByRole('menu', { name: 'Действия с серией' })).toBeInTheDocument()
  })
})

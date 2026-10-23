import type { ReactNode } from 'react'
import { Item } from 'react-stately'

/** Пункт списка: подпись, необязательное описание (RU · AC3 5.1) и пометка справа */
export interface ListItem {
  id: string
  label: string
  description?: string
  /** Короткая метка справа: «внешние», «в файле» */
  badge?: ReactNode
  isDisabled?: boolean
}

/** Превращает данные пункта в элемент коллекции react-stately */
export function renderListItem(item: ListItem) {
  return (
    <Item key={item.id} textValue={item.label}>
      {item.label}
    </Item>
  )
}

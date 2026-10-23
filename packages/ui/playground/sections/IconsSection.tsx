import * as ui from '../../src'
import type { IconComponent } from '../../src'
import { Demo } from './Demo'

// Только иконки из createIcon: у них displayName совпадает с именем экспорта (IconButton сюда не попадает)
const ICONS = Object.entries(ui).filter(
  ([name, value]) => typeof value === 'function' && (value as Partial<IconComponent>).displayName === name,
) as Array<[string, IconComponent]>

export function IconsSection() {
  return (
    <Demo title={`Набор: ${ICONS.length} иконок, сетка 24, линия 1.8`}>
      <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {ICONS.map(([name, Icon]) => (
          <div key={name} className="flex flex-col items-center gap-2 rounded-md p-3 text-fg-2 hover:bg-hover hover:text-fg">
            <Icon size={24} />
            <span className="font-mono text-2xs text-fg-3">{name.replace('Icon', '')}</span>
          </div>
        ))}
      </div>
    </Demo>
  )
}

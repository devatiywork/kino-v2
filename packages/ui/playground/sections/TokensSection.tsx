import { Demo } from './Demo'

const COLORS = [
  ['bg', 'Фон окна'],
  ['panel', 'Панели'],
  ['raise', 'Приподнятый слой'],
  ['raise-2', 'Активный слой'],
  ['line', 'Разделители'],
  ['line-2', 'Границы контролов'],
  ['fg', 'Текст'],
  ['fg-2', 'Вторичный текст'],
  ['fg-3', 'Подписи'],
  ['accent', 'Акцент'],
  ['accent-soft', 'Мягкий акцент'],
  ['danger', 'Опасное действие'],
] as const

export function TokensSection() {
  return (
    <>
      <Demo title="Цвета">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {COLORS.map(([name, description]) => (
            <div key={name} className="flex flex-col gap-2">
              <div
                className="h-14 rounded-md border border-line-2"
                style={{ background: `var(--color-${name})` }}
              />
              <span className="font-mono text-xs text-fg">{name}</span>
              <span className="text-xs text-fg-3">{description}</span>
            </div>
          ))}
        </div>
      </Demo>
      <Demo title="Типографика">
        <div className="flex w-full flex-col gap-4">
          <span className="font-display text-hero font-semibold tracking-(--tracking-display)">Peacemaker</span>
          <span className="font-display text-xl font-semibold">Не досмотрено</span>
          <span className="text-md font-medium">Серия 5 · осталось 25 мин</span>
          <span className="text-base text-fg-2">Дорожки подбираются по языку и названию, а не по номеру.</span>
          <span className="font-mono text-sm">23:14 / 48:10 · Peacemaker.S02E05.2160p.mkv</span>
          <span className="text-2xs font-semibold tracking-(--tracking-caps) text-fg-3 uppercase">Сегодня</span>
        </div>
      </Demo>
    </>
  )
}

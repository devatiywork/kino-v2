import { useCallback, useState, type UIEvent } from 'react'

/**
 * The side menu follows the scroll: the current section is the last one whose top is above
 * a third of the view; at the very bottom — the last one
 */
export function useScrollSpy<T extends string>(ids: readonly T[]) {
  const [active, setActive] = useState<T>(ids[0] as T)

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const view = event.currentTarget
      const last = ids.at(-1)
      if (last && view.scrollTop + view.clientHeight >= view.scrollHeight - 2) {
        setActive(last)
        return
      }
      const line = view.getBoundingClientRect().top + view.clientHeight / 3
      let current = ids[0] as T
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= line) current = id
      }
      setActive(current)
    },
    [ids],
  )

  const go = useCallback((id: T) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return { active, onScroll, go }
}

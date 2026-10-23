import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get: () => T
  set: (patch: Partial<T> | ((state: T) => Partial<T>)) => void
  subscribe: (listener: () => void) => () => void
}

/** Minimal external store: state outside React, components subscribe through a selector */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The selector must return a stable value: a primitive or a field of the state, not a new object */
export function useStore<T extends object, R>(store: Store<T>, selector: (state: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}

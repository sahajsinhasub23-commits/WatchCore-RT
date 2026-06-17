import { useSyncExternalStore } from "react";

/* Tiny dependency-free store: avoids pulling Zustand for one shape. */
export function create<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const get = () => state;
  const set = (patch: Partial<T>) => {
    state = { ...state, ...patch };
    listeners.forEach(l => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
  function use<S>(selector: (s: T) => S): S {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(initial));
  }
  return { get, set, subscribe, use };
}

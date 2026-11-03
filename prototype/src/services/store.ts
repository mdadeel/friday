export type Listener = () => void;

/** Minimal observable store, compatible with React's useSyncExternalStore. */
export class Store<T> {
  private value: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.value = initial;
  }

  get = (): T => this.value;

  set = (next: T | ((prev: T) => T)): void => {
    this.value = typeof next === 'function' ? (next as (prev: T) => T)(this.value) : next;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { Observable, Services } from '../services/contracts';

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices must be used inside ServicesProvider');
  return s;
}

/** Subscribes a component to a service observable. Snapshots must be cached (see Store). */
export function useObservable<T>(o: Observable<T>): T {
  return useSyncExternalStore(o.subscribe, o.get, o.get);
}

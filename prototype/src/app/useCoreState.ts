import { useObservable, useServices } from './services';
import { deriveCoreState } from './overlayState';
import type { CoreState } from '../components/Core';

export function useCoreState(): CoreState {
  const { voice, tasks } = useServices();
  return deriveCoreState(useObservable(voice), useObservable(tasks));
}

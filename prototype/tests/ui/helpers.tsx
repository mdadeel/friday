import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { createMockServices } from '../../src/services/mock';
import { ServicesProvider } from '../../src/app/services';
import type { Services } from '../../src/services/contracts';

/** Renders a component with a fresh simulated service graph. */
export function renderWithServices(ui: ReactElement, services: Services = createMockServices()) {
  return { services, ...render(<ServicesProvider services={services}>{ui}</ServicesProvider>) };
}

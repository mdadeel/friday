import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../../src/App';
import { ServicesProvider } from '../../src/app/services';
import { createMockServices } from '../../src/services/mock';

function renderAt(hash: string) {
  window.location.hash = hash;
  const services = createMockServices();
  render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
  return services;
}

describe('app shell and routes', () => {
  test('every screen shows the persistent SIMULATED label in the status bar', () => {
    renderAt('#/chat');
    const bar = screen.getByRole('contentinfo');
    expect(within(bar).getByText('SIMULATED')).toBeTruthy();
  });

  test('settings lists all 14 sections in spec order', () => {
    renderAt('#/settings/general');
    const list = screen.getByRole('navigation', { name: 'Settings sections' });
    const items = within(list).getAllByRole('link');
    expect(items).toHaveLength(14);
    expect(items[0].textContent).toContain('General');
    expect(items[13].textContent).toContain('Logs and diagnostics');
  });

  test('settings fields state when they apply', () => {
    renderAt('#/settings/general');
    expect(screen.getAllByText('Needs daemon restart').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Applies now').length).toBeGreaterThan(0);
  });

  test('the settings search filters sections and shows an empty result message', () => {
    renderAt('#/settings/general');
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    fireEvent.change(search, { target: { value: 'voice' } });
    const list = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(list).getByText('Voice')).toBeTruthy();
    expect(within(list).queryByText('Autonomy and permissions')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText('No setting matches this search.')).toBeTruthy();
  });

  test('chat is the default route for an unknown hash', () => {
    renderAt('#/unknown');
    expect(screen.getByRole('heading', { name: 'What should EDITH do?' })).toBeTruthy();
  });

  test('the routing screen labels its figures as simulated', () => {
    renderAt('#/routing');
    expect(screen.getByRole('heading', { name: 'Routing' })).toBeTruthy();
    expect(screen.getAllByText('SIMULATED').length).toBeGreaterThan(0);
  });
});


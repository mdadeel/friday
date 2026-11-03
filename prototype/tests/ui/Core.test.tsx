import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Core } from '../../src/components/Core';

describe('overlay core', () => {
  test.each(['idle', 'listening', 'thinking', 'speaking', 'error'] as const)('announces the %s state in text', (state) => {
    render(<Core state={state} />);
    const label = state[0].toUpperCase() + state.slice(1);
    expect(screen.getByRole('img', { name: `EDITH state: ${label}` })).toBeTruthy();
  });

  test('error state adds the single amber ring class', () => {
    const { container } = render(<Core state="error" />);
    expect(container.querySelector('.core-error')).toBeTruthy();
    expect(container.querySelector('.core-amber')).toBeTruthy();
  });
});

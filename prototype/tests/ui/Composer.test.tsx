import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Composer } from '../../src/components/Composer';
import { renderWithServices } from './helpers';

describe('composer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('Enter sends the message and clears the input', () => {
    const { services } = renderWithServices(<Composer />);
    const input = screen.getByLabelText('Message EDITH') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'what is 2 + 2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(services.conversation.get().some((m) => m.role === 'owner' && m.text === 'what is 2 + 2')).toBe(true);
    expect(input.value).toBe('');
    act(() => vi.runAllTimers());
  });

  test('Shift+Enter does not send', () => {
    const { services } = renderWithServices(<Composer />);
    const input = screen.getByLabelText('Message EDITH');
    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(services.conversation.get().some((m) => m.role === 'owner')).toBe(false);
  });

  test('cancel is disabled when no task runs', () => {
    renderWithServices(<Composer />);
    const btn = screen.getByRole('button', { name: 'No task is running' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test('attach-context is off by default and marks the message when turned on', () => {
    const { services } = renderWithServices(<Composer />);
    const toggle = screen.getByRole('button', { name: /Attach context/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Message EDITH'), { target: { value: 'hello there' } });
    fireEvent.keyDown(screen.getByLabelText('Message EDITH'), { key: 'Enter' });
    const owner = services.conversation.get().find((m) => m.role === 'owner');
    expect(owner?.contextAttached).toBe(true);
  });
});

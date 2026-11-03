import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MemoryDetail } from '../../src/components/MemoryDetail';
import { renderWithServices } from './helpers';
import { createMockServices } from '../../src/services/mock';

describe('memory detail', () => {
  test('editing creates a new version and keeps the previous content in history', () => {
    const services = createMockServices();
    const item = services.memory.get().find((m) => m.status === 'active')!;
    const before = item.version;
    renderWithServices(<MemoryDetail item={item} />, services);
    fireEvent.click(screen.getByRole('button', { name: 'Edit (creates a new version)' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A corrected fact.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
    const updated = services.memory.get().find((m) => m.id === item.id)!;
    expect(updated.version).toBe(before + 1);
    expect(updated.content).toBe('A corrected fact.');
    expect(updated.history.at(-1)?.content).toBe(item.content);
  });

  test('delete asks for confirmation before removing', () => {
    const services = createMockServices();
    const item = services.memory.get().find((m) => m.status === 'active')!;
    renderWithServices(<MemoryDetail item={item} />, services);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(services.memory.get().find((m) => m.id === item.id)?.status).toBe('active');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(services.memory.get().find((m) => m.id === item.id)?.status).toBe('deleted');
  });
});

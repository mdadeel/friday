let counter = 0;

/** Short, sortable-ish identifiers for simulated records. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

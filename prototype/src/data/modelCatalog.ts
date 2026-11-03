// Published model catalogue. Facts come from the public Ollama library page checked on 2026-11-03:
// https://ollama.com/library/qwen3 (tag list: size, context window, and the "tools" and "thinking" tags).
// Nothing here means a model is installed or working. The prototype has no provider client.
import type { LocalModel } from '../types/contracts';

export const CATALOG_CHECKED_ON = '2026-11-03';
export const QWEN3_SOURCE = 'https://ollama.com/library/qwen3';

const QWEN3_TAGS: { tag: string; size: string; context: string }[] = [
  { tag: 'qwen3:0.6b', size: '523 MB', context: '40K' },
  { tag: 'qwen3:1.7b', size: '1.4 GB', context: '40K' },
  { tag: 'qwen3:4b', size: '2.5 GB', context: '256K' },
  { tag: 'qwen3:8b', size: '5.2 GB', context: '40K' },
  { tag: 'qwen3:14b', size: '9.3 GB', context: '40K' },
  { tag: 'qwen3:30b', size: '19 GB', context: '256K' },
  { tag: 'qwen3:32b', size: '20 GB', context: '40K' },
  { tag: 'qwen3:235b', size: '142 GB', context: '256K' },
];

export const CATALOG_MODELS: LocalModel[] = QWEN3_TAGS.map((m) => ({
  id: `ollama-${m.tag.replace(':', '-')}`,
  provider: 'ollama',
  name: m.tag,
  sizeLabel: m.size,
  context: m.context,
  capabilities: ['tools', 'thinking'],
  source: QWEN3_SOURCE,
  checkedOn: CATALOG_CHECKED_ON,
  status: 'not_checked',
  simulated: true,
}));

import { en } from '../i18n/en';
import type { CapabilityKind } from '../types/contracts';
import { Badge, type BadgeTone } from './Badge';

const MAP: Record<CapabilityKind, { label: string; tone: BadgeTone }> = {
  instruction: { label: en.capabilities.legend.instruction, tone: 'muted' },
  native_tool: { label: en.capabilities.legend.native, tone: 'blue' },
  mcp_tool: { label: en.capabilities.legend.mcp, tone: 'accent' },
  external_service: { label: en.capabilities.legend.external, tone: 'violet' },
};

/** Shows whether a capability is knowledge (Instruction) or execution (tools, services). */
export function CapabilityBadge({ kind }: { kind: CapabilityKind }) {
  return <Badge tone={MAP[kind].tone}>{MAP[kind].label}</Badge>;
}

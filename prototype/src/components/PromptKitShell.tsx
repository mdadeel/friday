import { useState, type ReactNode } from 'react';
import type { RouteName } from '../app/router';
import { useObservable, useServices } from '../app/services';
import {
  MessageSquare,
  Activity,
  Brain,
  Cpu,
  Settings,
  Plus,
  Radio,
  Sun,
  Moon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';

const NAV_ITEMS: { name: RouteName; label: string; icon: typeof MessageSquare; hint: string }[] = [
  { name: 'chat', label: 'Conversation', icon: MessageSquare, hint: 'Autonomous dialogue and execution' },
  { name: 'activity', label: 'Activity & Tasks', icon: Activity, hint: 'Multi-step plans and approvals' },
  { name: 'memory', label: 'Memory Matrix', icon: Brain, hint: 'Persistent semantic & profile facts' },
  { name: 'capabilities', label: 'Capabilities & MCP', icon: Cpu, hint: 'Connected MCP servers and skills' },
  { name: 'routing', label: 'Model Router', icon: Zap, hint: 'Multi-tier model routing and cost analytics' },
  { name: 'settings', label: 'Settings', icon: Settings, hint: 'Daemon config, audio, and credentials' },
];

const TITLES: Record<string, string> = {
  chat: 'EDITH 2.0 Assistant',
  activity: 'Task Execution & Approvals',
  memory: 'Long-term Semantic Memory',
  capabilities: 'Tool & MCP Registry',
  routing: 'Autonomous Model Router',
  settings: 'System Configuration',
};

export function PromptKitShell({ route, children }: { route: RouteName; children: ReactNode }) {
  const s = useServices();
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const voice = useObservable(s.voice);
  const routing = useObservable(s.routing);
  const settings = useObservable(s.settings);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const activeTasks = tasks.filter((t) => !['Completed', 'Failed', 'Cancelled'].includes(t.state)).length;
  const currentTier = routing.recent[0]?.tier ?? 'Fast';
  const currentModel = routing.recent[0]?.model ?? 'ollama/deepseek-r1:8b';
  const isDark = (settings.appearance?.theme ?? 'dark') === 'dark';

  const toggleTheme = () => {
    s.settings.set('appearance', 'theme', isDark ? 'light' : 'dark');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
        aria-label="Sidebar Navigation"
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-mono font-bold shadow-sm shadow-primary/30">
              E
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                  EDITH <span className="text-[10px] px-1 py-0.2 rounded bg-primary/20 text-primary font-mono">2.0</span>
                </span>
                <span className="text-[11px] text-muted-foreground truncate">Autonomous Agent</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-2.5">
          <button
            type="button"
            onClick={() => {
              s.conversation.reset();
              window.location.hash = '#/chat';
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-sidebar-accent/50 py-2 px-3 text-xs font-medium text-foreground hover:bg-sidebar-accent hover:border-primary/50 transition-all ${
              sidebarCollapsed ? 'px-0' : ''
            }`}
            title="Start new conversation"
          >
            <Plus className="h-4 w-4 text-primary" />
            {!sidebarCollapsed && <span>New Session</span>}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const IconComp = item.icon;
            const isCurrent = route === item.name;
            return (
              <a
                key={item.name}
                href={`#/${item.name}`}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                }`}
                title={item.hint}
              >
                <IconComp className={`h-4 w-4 shrink-0 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {!sidebarCollapsed && item.name === 'activity' && pendingApprovals > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 px-1.5 text-[10px] font-bold">
                    {pendingApprovals}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        {/* Sidebar Footer System Status */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          {!sidebarCollapsed && (
            <div className="rounded-lg bg-card/60 border border-border/60 p-2.5 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Daemon 4242
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-medium">LIVE</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Radio className={`h-3 w-3 ${voice.state === 'Listening' ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                  Voice Engine
                </span>
                <span className="text-[10px] text-foreground">{voice.state}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {!sidebarCollapsed && (
              <a
                href="#/overlay"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                title="Preview HUD Overlay"
              >
                <span>HUD Overlay</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-foreground tracking-tight">
              {TITLES[route] ?? 'EDITH 2.0'}
            </h1>
            <span className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2.5 py-0.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="font-mono text-[11px]">{currentTier}</span>
              <span className="text-border">/</span>
              <span className="font-mono text-[11px] text-foreground truncate max-w-48">{currentModel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Native Tool Sandbox Active</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main id="main" className="flex-1 overflow-hidden" tabIndex={-1}>
          {children}
        </main>

        {/* Unified Status Bar */}
        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-card/60 px-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${voice.state === 'Listening' ? 'bg-primary animate-ping' : 'bg-emerald-500'}`} />
              Voice: {voice.state}
            </span>
            <span>Daemon: <span className="text-foreground font-mono">http://127.0.0.1:4242</span></span>
            <span>Active tasks: <span className="text-foreground font-semibold">{activeTasks}</span></span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <span>Model Tier: {currentTier}</span>
            <span>Timezone: Asia/Dhaka (+06:00)</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

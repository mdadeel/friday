import { useState, useEffect, useRef } from 'react';
import type { ChatMessage, TaskRecord } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { VoiceStrip } from '../components/VoiceStrip';
import { ApprovalCard, TaskCard, TERMINAL_STATES } from '../components/TaskViews';
import { navigate } from '../app/router';

// Prompt-Kit components
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container';
import { ScrollButton } from '@/components/ui/scroll-button';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageActions,
  MessageAction,
} from '@/components/ui/message';
import { Markdown } from '@/components/ui/markdown';
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
} from '@/components/ui/chain-of-thought';
import { ThinkingBar } from '@/components/ui/thinking-bar';
import { Tool, type ToolPart } from '@/components/ui/tool';
import { Source, SourceTrigger, SourceContent } from '@/components/ui/source';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/components/ui/prompt-input';
import { PromptSuggestion } from '@/components/ui/prompt-suggestion';
import { FeedbackBar } from '@/components/ui/feedback-bar';
import { Loader } from '@/components/ui/loader';

import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Paperclip,
  CheckCircle2,
  Clock,
  Compass,
  Zap,
  Globe,
  Trash2,
  Activity,
  Layers
} from 'lucide-react';

const QUICK_PROMPT_PILLS = [
  { icon: Clock, text: 'What time is it?' },
  { icon: Zap, text: 'what is 12 * (3 + 4)' },
  { icon: Globe, text: 'Search online for current news about Rust' },
  { icon: Compass, text: 'Research the best architecture for our MCP host' },
  { icon: Activity, text: 'Fix the authentication bug in my repo' },
  { icon: Sparkles, text: 'Who am I?' },
];

export function PromptKitConversation() {
  const s = useServices();
  const messages = useObservable(s.conversation);
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const voice = useObservable(s.voice);
  const routing = useObservable(s.routing);

  const [inputVal, setInputVal] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [activeSpeechMsgId, setActiveSpeechMsgId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const activeTask = tasks.find((t) => !TERMINAL_STATES.includes(t.state)) ?? tasks[0];
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const isGenerating = messages.some((m) => m.streaming);

  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setInputVal(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      // Fallback: simulate audio trigger
      s.voice.pressToTalk();
      setTimeout(() => {
        s.voice.release();
        s.conversation.send('What time is it?', 'voice');
      }, 1500);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      s.voice.release();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        s.voice.pressToTalk();
      } catch (err) {
        console.warn('SpeechRecognition start error:', err);
      }
    }
  };

  const handleSend = () => {
    const text = inputVal.trim();
    if (!text || isGenerating) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      s.voice.release();
    }

    s.conversation.send(text, isListening ? 'voice' : 'text');
    setInputVal('');
  };

  const handleSuggestion = (text: string) => {
    s.conversation.send(text, 'text');
  };

  const handleSpeak = (msgId: string, text: string) => {
    if (!window.speechSynthesis) return;

    if (activeSpeechMsgId === msgId) {
      window.speechSynthesis.cancel();
      setActiveSpeechMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setActiveSpeechMsgId(msgId);
    };

    utterance.onend = () => {
      setActiveSpeechMsgId(null);
    };

    utterance.onerror = () => {
      setActiveSpeechMsgId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Primary Chat Flow */}
      <section className="flex flex-1 flex-col h-full overflow-hidden bg-background/50 relative">
        {/* Voice Strip Bar */}
        <VoiceStrip voice={voice} />

        {/* Chat Scroll Container */}
        <ChatContainerRoot className="flex-1 w-full p-4 md:px-8 max-w-4xl mx-auto">
          <ChatContainerContent className="gap-6 pb-6">
            {/* Empty State Welcome Card */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/10">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    How can EDITH assist you today?
                  </h2>
                  <p className="text-xs text-muted-foreground max-w-md">
                    EDITH 2.0 is connected to the native daemon with autonomous multi-step reasoning,
                    12 native tools, web search, memory matrix, and local model routing.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-lg">
                  {QUICK_PROMPT_PILLS.map((q, idx) => {
                    const IconC = q.icon;
                    return (
                      <PromptSuggestion
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSuggestion(q.text)}
                        className="flex items-center gap-1.5 text-xs bg-card/60 hover:border-primary/50 hover:bg-card transition-all"
                      >
                        <IconC className="h-3.5 w-3.5 text-primary" />
                        <span>{q.text}</span>
                      </PromptSuggestion>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Render Messages */}
            {messages.map((m) => (
              <MessageItemView
                key={m.id}
                message={m}
                tasks={tasks}
                isSpeaking={activeSpeechMsgId === m.id}
                onSpeak={() => handleSpeak(m.id, m.text)}
                onRetry={() => s.conversation.send(m.text, m.source)}
              />
            ))}

            {/* Thinking / Streaming Indicator */}
            {isGenerating && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <ThinkingBar
                  text="Reasoning through plan & executing tools..."
                  className="text-primary font-mono text-xs"
                />
              </div>
            )}

            <ChatContainerScrollAnchor />
          </ChatContainerContent>

          {/* Floating Scroll to Bottom Button */}
          <div className="absolute right-6 bottom-24 z-20">
            <ScrollButton className="bg-card border-border shadow-md hover:bg-card/90" />
          </div>
        </ChatContainerRoot>

        {/* Bottom Prompt Input Area */}
        <div className="w-full max-w-4xl mx-auto p-4 md:px-8 border-t border-border/60 bg-background/80 backdrop-blur-md">
          {/* Quick Suggestions above input when conversation has messages */}
          {messages.length > 0 && messages.length < 4 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 no-scrollbar">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap mr-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Suggestions:
              </span>
              {QUICK_PROMPT_PILLS.slice(0, 4).map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestion(q.text)}
                  className="rounded-full border border-border bg-card/50 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground whitespace-nowrap transition-colors"
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}

          {/* PromptKit Input Component */}
          <PromptInput
            value={inputVal}
            onValueChange={setInputVal}
            onSubmit={handleSend}
            isLoading={isGenerating}
            className="rounded-2xl border-border bg-card shadow-lg ring-1 ring-border/50 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all p-3"
          >
            <PromptInputTextarea
              placeholder="Ask EDITH anything, run a task, or press the mic to speak..."
              className="text-sm min-h-[48px] max-h-36 text-foreground placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
              <PromptInputActions className="gap-1.5">
                <PromptInputAction
                  tooltip="Attach files or repository context"
                  className="text-xs"
                >
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </PromptInputAction>

                <PromptInputAction
                  tooltip={isListening ? 'Stop microphone' : 'Speak to EDITH (Web Speech STT)'}
                  className="text-xs"
                >
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                      isListening
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                </PromptInputAction>

                {isListening && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[11px] font-mono">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                    Listening...
                  </div>
                )}
              </PromptInputActions>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/60 hidden sm:inline-block">
                  Press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-[9px] font-mono">Enter</kbd> to send
                </span>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputVal.trim() || isGenerating}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-primary/30"
                  title="Send message"
                >
                  {isGenerating ? (
                    <Loader variant="circular" size="sm" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </PromptInput>
        </div>
      </section>

      {/* Side Inspector ("Now" Panel) */}
      <aside className="hidden lg:flex w-80 flex-col border-l border-border bg-card/30 p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Autonomous Inspector
            </h3>
          </div>
          <button
            type="button"
            onClick={() => s.conversation.reset()}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-rose-400 transition-colors"
            title="Clear current session"
          >
            <Trash2 className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* Active Task / Execution Plan */}
        <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Active Plan
            </span>
            {activeTask && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium">
                {activeTask.state}
              </span>
            )}
          </div>

          {activeTask ? (
            <div className="space-y-2 text-xs">
              <p className="font-medium text-foreground">{activeTask.objective}</p>
              {activeTask.subtasks && activeTask.subtasks.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {activeTask.subtasks.map((st, idx) => (
                    <div
                      key={st.id ?? idx}
                      className="flex items-start gap-2 text-[11px] text-muted-foreground"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] text-foreground font-semibold">
                        {idx + 1}
                      </span>
                      <span className="truncate">{st.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No active task currently. Ask for a multi-step objective or tool execution to generate an autonomous plan.
            </p>
          )}
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                Waiting for Approval ({pendingApprovals.length})
              </span>
            </div>
            {pendingApprovals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                objective={tasks.find((t) => t.id === a.taskId)?.objective}
              />
            ))}
          </div>
        )}

        {/* Last Model Route Tier */}
        <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Router Diagnostics
            </span>
            <button
              type="button"
              onClick={() => navigate('#/routing')}
              className="text-[11px] text-primary hover:underline"
            >
              Details
            </button>
          </div>

          {routing.recent[0] ? (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tier:</span>
                <span className="font-mono text-foreground font-semibold">{routing.recent[0].tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider:</span>
                <span className="font-mono text-foreground">{routing.recent[0].provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model:</span>
                <span className="font-mono text-primary font-medium truncate max-w-36">{routing.recent[0].model ?? 'rule-based'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latency:</span>
                <span className="font-mono text-foreground">{routing.recent[0].latencyMs}ms</span>
              </div>
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40 italic">
                "{routing.recent[0].reason}"
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No model routing events recorded yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

// Individual Message Component using Prompt-Kit primitives
function MessageItemView({
  message,
  tasks,
  isSpeaking,
  onSpeak,
  onRetry,
}: {
  message: ChatMessage;
  tasks: TaskRecord[];
  isSpeaking: boolean;
  onSpeak: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rated, setRated] = useState<boolean | null>(null);

  if (message.kind === 'task' && message.taskId) {
    const task = tasks.find((t) => t.id === message.taskId);
    return task ? (
      <div className="w-full my-2">
        <TaskCard task={task} />
      </div>
    ) : null;
  }

  const isOwner = message.role === 'owner';

  // Extract <think> reasoning tokens
  let reasoning = message.thinking || '';
  let contentText = message.text || '';
  const thinkMatch = contentText.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    reasoning = (reasoning ? reasoning + '\n' : '') + thinkMatch[1].trim();
    contentText = contentText.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  }

  const copyText = () => {
    navigator.clipboard?.writeText(contentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex w-full flex-col ${isOwner ? 'items-end' : 'items-start'} my-1`}>
      <Message className={`max-w-[88%] gap-3 ${isOwner ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <MessageAvatar
          src={
            isOwner
              ? 'https://api.dicebear.com/7.x/bottts/svg?seed=Adeel'
              : 'https://api.dicebear.com/7.x/shapes/svg?seed=EDITH'
          }
          alt={isOwner ? 'You' : 'EDITH'}
          fallback={isOwner ? 'U' : 'E'}
          className={isOwner ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted border border-border'}
        />

        {/* Message Bubble & Content */}
        <div className={`flex flex-col gap-1.5 ${isOwner ? 'items-end' : 'items-start'} max-w-full`}>
          {/* Header Tag */}
          <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{isOwner ? 'You' : 'EDITH'}</span>
            <span>•</span>
            <span className="font-mono text-[10px]">
              {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            {message.source === 'voice' && (
              <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[10px] font-mono">
                spoken
              </span>
            )}
          </div>

          {/* Reasoning / Chain of Thought */}
          {!isOwner && reasoning && (
            <div className="w-full my-1">
              <ChainOfThought>
                <ChainOfThoughtStep defaultOpen={false}>
                  <ChainOfThoughtTrigger className="px-2.5 py-1.5 rounded-lg bg-card/60 border border-border/80 text-xs text-muted-foreground hover:text-foreground">
                    Thought process & plan analysis
                  </ChainOfThoughtTrigger>
                  <ChainOfThoughtContent className="mt-1 p-3 rounded-lg bg-muted/30 border border-border/60 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                    <ChainOfThoughtItem>{reasoning}</ChainOfThoughtItem>
                  </ChainOfThoughtContent>
                </ChainOfThoughtStep>
              </ChainOfThought>
            </div>
          )}

          {/* Native Tool Execution Cards */}
          {!isOwner && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="w-full space-y-2 my-1">
              {message.toolCalls.map((tc, idx) => {
                const toolPart: ToolPart = {
                  type: tc.name,
                  state:
                    tc.status === 'running'
                      ? 'input-streaming'
                      : tc.status === 'failed'
                      ? 'output-error'
                      : 'output-available',
                  input: tc.input,
                  output: tc.output,
                  toolCallId: `${tc.name}-${idx}`,
                  errorText: tc.status === 'failed' ? (tc.output?.error ?? 'Execution error') : undefined,
                };
                return <Tool key={idx} toolPart={toolPart} defaultOpen={tc.status === 'failed'} />;
              })}
            </div>
          )}

          {/* Main Bubble */}
          <MessageContent
            className={`text-sm rounded-2xl p-4 shadow-xs ${
              isOwner
                ? 'bg-primary text-primary-foreground font-normal rounded-tr-xs'
                : 'bg-card border border-border text-card-foreground rounded-tl-xs'
            }`}
          >
            {isOwner ? (
              <p className="whitespace-pre-wrap m-0 leading-relaxed">{contentText}</p>
            ) : (
              <Markdown className="prose prose-invert max-w-none text-sm leading-relaxed">
                {contentText}
              </Markdown>
            )}
          </MessageContent>

          {/* Evidence Sources Preview */}
          {!isOwner && message.sources && message.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 px-1">
              <span className="text-[11px] text-muted-foreground mr-1">Sources:</span>
              {message.sources.map((src, i) => (
                <Source key={i} href={src.url}>
                  <SourceTrigger showFavicon label={src.title || src.url} className="text-[11px]" />
                  <SourceContent
                    title={src.title}
                    description={`Authority tier ${src.authorityTier} evidence from ${src.url}`}
                  />
                </Source>
              ))}
            </div>
          )}

          {/* Action Bar (Assistant turns only) */}
          {!isOwner && (
            <div className="flex items-center gap-1 pt-1 px-1">
              <MessageActions>
                <MessageAction tooltip={copied ? 'Copied!' : 'Copy response'}>
                  <button
                    type="button"
                    onClick={copyText}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </MessageAction>

                <MessageAction tooltip={isSpeaking ? 'Stop speaking' : 'Read aloud with Web Speech TTS'}>
                  <button
                    type="button"
                    onClick={onSpeak}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      isSpeaking
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                </MessageAction>

                <MessageAction tooltip="Retry query">
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </MessageAction>

                <button
                  type="button"
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="text-[10px] text-muted-foreground/70 hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                >
                  Rate response
                </button>
              </MessageActions>
            </div>
          )}

          {/* Optional Prompt-Kit Feedback Bar */}
          {!isOwner && showFeedback && rated === null && (
            <div className="mt-2 w-full max-w-sm">
              <FeedbackBar
                title="Was this response helpful?"
                onHelpful={() => setRated(true)}
                onNotHelpful={() => setRated(false)}
                onClose={() => setShowFeedback(false)}
                className="w-full text-xs"
              />
            </div>
          )}

          {!isOwner && rated !== null && (
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 px-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Thank you for your feedback!</span>
            </div>
          )}
        </div>
      </Message>
    </div>
  );
}

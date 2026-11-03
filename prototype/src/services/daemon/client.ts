// REST and WebSocket client connecting the frontend to the EDITH 2.0 daemon.

export interface DaemonConfig {
  baseUrl: string; // e.g. "http://127.0.0.1:4242"
  wsUrl: string;   // e.g. "ws://127.0.0.1:4242/v1/events"
  token?: string;
}

export type EventHandler = (event: any) => void;

export class DaemonClient {
  private config: DaemonConfig;
  private ws: WebSocket | null = null;
  private eventHandlers = new Set<EventHandler>();
  private reconnectTimer: any = null;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  setToken(token: string) {
    this.config.token = token;
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    if (this.config.token) {
      headers.set('Authorization', `Bearer ${this.config.token}`);
    }
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(url, { ...options, headers });
  }

  async getJson<T>(endpoint: string): Promise<T> {
    const res = await this.fetch(endpoint);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${endpoint}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async postJson<T>(endpoint: string, body?: any): Promise<T> {
    const res = await this.fetch(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${endpoint}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  connectWs(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.eventHandlers.forEach((handler) => handler(payload));
        } catch (e) {
          console.warn('[DaemonClient] Failed to parse WebSocket envelope:', e);
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (e) {
      console.warn('[DaemonClient] WebSocket connection failed:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, 3000);
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

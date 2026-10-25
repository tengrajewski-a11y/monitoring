// WebSocket connection to the game server. Messages are JSON; the server
// batches them into arrays.

export class Net {
  constructor(onMessage, onClose) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
    this.latency = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Nie można połączyć się z serwerem.'));
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.onClose?.(); } };
      ws.onmessage = (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch { return; }
        for (const m of Array.isArray(data) ? data : [data]) {
          if (m.t === 'pong') this.latency = performance.now() - m.ts;
          else this.onMessage(m);
        }
      };
    });
  }

  get open() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  send(msg) { if (this.open) this.ws.send(JSON.stringify(msg)); }

  ping() { this.send({ t: 'ping', ts: performance.now() }); }

  close() { const ws = this.ws; this.ws = null; ws?.close(); }
}

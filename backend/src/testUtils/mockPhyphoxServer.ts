import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';

const TICK_MS = 20;

// Bind to a real (non-loopback) LAN-ish address rather than 127.0.0.1 - real
// phyphox devices are always on another host, and validateBaseUrl now rejects
// loopback/link-local addresses, so a test "device" needs to look like one too.
function getLanAddress(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Minimal stand-in for a phyphox device's remote-access HTTP server, used so
 * the polling pipeline can be exercised end-to-end in tests without a real
 * phone. Implements /config, /meta, /control, /get per the documented
 * community client behavior (see backend/src/phyphox/client.ts).
 */
export class MockPhyphoxServer {
  private readonly server: Server;
  private readonly data: Record<string, number[]> = { time: [] };
  private tickHandle: NodeJS.Timeout | undefined;
  private t = 0;
  private lastControlCmd: string | undefined;
  private failing = false;

  constructor(private readonly bufferNames: string[]) {
    for (const name of bufferNames) {
      this.data[name] = [];
    }
    this.server = createServer((req, res) => this.handle(req, res));
  }

  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '0.0.0.0', resolve));
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
    const { port } = this.server.address() as AddressInfo;
    return `http://${getLanAddress()}:${port}`;
  }

  async close(): Promise<void> {
    if (this.tickHandle) clearInterval(this.tickHandle);
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  getLastControlCommand(): string | undefined {
    return this.lastControlCmd;
  }

  /** Simulates a network/device outage: every request fails until called again with false. */
  setFailing(failing: boolean): void {
    this.failing = failing;
  }

  /** Mirrors phyphox's real /control?cmd=clear behavior: wipes all buffers and resets the experiment clock. */
  private clearData(): void {
    this.t = 0;
    for (const key of Object.keys(this.data)) {
      this.data[key] = [];
    }
  }

  private tick(): void {
    this.t += TICK_MS / 1000;
    this.data.time.push(this.t);
    for (const name of this.bufferNames) {
      this.data[name].push(Math.sin(this.t));
    }
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (this.failing) {
      res.writeHead(500).end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/config') {
      this.json(res, { buffers: [...this.bufferNames, 'time'].map((name) => ({ name })) });
      return;
    }
    if (url.pathname === '/meta') {
      this.json(res, {});
      return;
    }
    if (url.pathname === '/control') {
      const cmd = url.searchParams.get('cmd') ?? undefined;
      this.lastControlCmd = cmd;
      if (cmd === 'clear') this.clearData();
      this.json(res, { result: true });
      return;
    }
    if (url.pathname === '/get') {
      this.json(res, this.buildGetResponse(url));
      return;
    }

    res.writeHead(404).end();
  }

  private buildGetResponse(url: URL) {
    const buffer: Record<string, { size: number; updateMode: string; buffer: number[] }> = {};

    for (const [name, rawValue] of url.searchParams.entries()) {
      const since = Number(rawValue.split('|')[0] ?? 0);
      const series = this.data[name] ?? [];
      const values = series.filter((_, index) => (this.data.time[index] ?? 0) > since);
      buffer[name] = { size: series.length, updateMode: 'partial', buffer: values };
    }

    return { buffer, status: { measuring: true } };
  }

  private json(res: ServerResponse, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(payload);
  }
}

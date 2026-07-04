import { EventEmitter } from 'node:events';
import type { DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';
import { PhyphoxClient } from './phyphox/client.js';
import type { PhyphoxConfig, PhyphoxControlCommand, PhyphoxGetResponse } from './phyphox/types.js';

const POLL_INTERVAL_MS = 200;
const MAX_BACKOFF_MS = 5000;
const OFFLINE_AFTER_FAILURES = 5;
const TIME_BUFFER_NAME = 'time';

function extractSensors(config: PhyphoxConfig): SensorMeta[] {
  return (config.buffers ?? [])
    .filter((buffer) => buffer.name !== TIME_BUFFER_NAME)
    .map((buffer) => ({ bufferName: buffer.name, label: buffer.name }));
}

function toSamples(deviceId: string, response: PhyphoxGetResponse): Sample[] {
  const times = response.buffer[TIME_BUFFER_NAME]?.buffer ?? [];
  const samples: Sample[] = [];

  for (const [bufferName, entry] of Object.entries(response.buffer)) {
    if (bufferName === TIME_BUFFER_NAME) continue;
    entry.buffer.forEach((value, index) => {
      const t = times[index];
      if (t === undefined) return;
      samples.push({ deviceId, bufferName, t, v: value });
    });
  }

  return samples;
}

/**
 * Owns one device's polling loop: discovers its sensors via /config, then
 * repeatedly fetches new samples via threshold-based /get, with exponential
 * backoff and automatic retry on failure. Emits 'sensors', 'status', 'sample'.
 */
export class DevicePoller extends EventEmitter {
  private readonly client: PhyphoxClient;
  private stopped = true;
  private timer: NodeJS.Timeout | undefined;
  private lastTime = 0;
  private consecutiveFailures = 0;
  private selectedBuffers: string[] = [];
  private sensorsDiscovered = false;

  constructor(
    private readonly deviceId: string,
    baseUrl: string,
  ) {
    super();
    this.client = new PhyphoxClient(baseUrl);
  }

  start(): void {
    this.stopped = false;
    this.scheduleNext(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  control(cmd: PhyphoxControlCommand): Promise<void> {
    return this.client.control(cmd);
  }

  private scheduleNext(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    if (!this.sensorsDiscovered) {
      await this.discover();
      return;
    }

    await this.poll();
  }

  private async discover(): Promise<void> {
    try {
      const config = await this.client.getConfig();
      const sensors = extractSensors(config);
      this.selectedBuffers = sensors.map((sensor) => sensor.bufferName);
      this.sensorsDiscovered = true;
      this.consecutiveFailures = 0;
      this.emit('sensors', sensors as SensorMeta[]);
      this.emit('status', 'connected' as DeviceStatus);
      this.scheduleNext(0);
    } catch {
      this.handleFailure();
    }
  }

  private async poll(): Promise<void> {
    const buffersToFetch = this.selectedBuffers.includes(TIME_BUFFER_NAME)
      ? this.selectedBuffers
      : [TIME_BUFFER_NAME, ...this.selectedBuffers];

    try {
      const response = await this.client.getBuffers(
        buffersToFetch,
        this.lastTime,
        TIME_BUFFER_NAME,
      );
      this.consecutiveFailures = 0;
      this.emit('status', 'connected' as DeviceStatus);

      const samples = toSamples(this.deviceId, response);
      if (samples.length > 0) {
        this.emit('sample', samples);
      }

      const times = response.buffer[TIME_BUFFER_NAME]?.buffer ?? [];
      if (times.length > 0) {
        this.lastTime = Math.max(this.lastTime, ...times);
      }

      this.scheduleNext(POLL_INTERVAL_MS);
    } catch {
      this.handleFailure();
    }
  }

  private handleFailure(): void {
    this.consecutiveFailures += 1;
    const status: DeviceStatus =
      this.consecutiveFailures >= OFFLINE_AFTER_FAILURES ? 'offline' : 'reconnecting';
    this.emit('status', status);

    const backoff = Math.min(POLL_INTERVAL_MS * 2 ** this.consecutiveFailures, MAX_BACKOFF_MS);
    this.scheduleNext(backoff);
  }
}

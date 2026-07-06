import { EventEmitter } from 'node:events';
import type { DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';
import { PhyphoxClient } from './phyphox/client.js';
import type { PhyphoxConfig, PhyphoxControlCommand, PhyphoxGetResponse } from './phyphox/types.js';

const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_MAX_BACKOFF_MS = 5000;
const DEFAULT_OFFLINE_AFTER_FAILURES = 5;
const TIME_BUFFER_NAME = 'time';

export interface DevicePollerOptions {
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  offlineAfterFailures?: number;
}

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
  private readonly pollIntervalMs: number;
  private readonly maxBackoffMs: number;
  private readonly offlineAfterFailures: number;
  private stopped = true;
  private timer: NodeJS.Timeout | undefined;
  private inFlightAbort: AbortController | undefined;
  private lastTime = 0;
  private consecutiveFailures = 0;
  private selectedBuffers: string[] = [];
  private sensorsDiscovered = false;

  constructor(
    private readonly deviceId: string,
    baseUrl: string,
    options: DevicePollerOptions = {},
  ) {
    super();
    this.client = new PhyphoxClient(baseUrl);
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.offlineAfterFailures = options.offlineAfterFailures ?? DEFAULT_OFFLINE_AFTER_FAILURES;
  }

  start(): void {
    this.stopped = false;
    this.scheduleNext(0);
  }

  /** Stops the loop and aborts whatever request is currently in flight, so a removed device's requests don't outlive it. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.inFlightAbort?.abort();
  }

  async control(cmd: PhyphoxControlCommand): Promise<void> {
    await this.client.control(cmd);
    if (cmd === 'clear') {
      // phyphox's clear wipes the device's buffers and resets its experiment
      // clock to 0, so our incremental cursor must reset too - otherwise every
      // subsequent /get?since=<stale lastTime> is filtered out forever.
      this.lastTime = 0;
    }
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
    this.inFlightAbort = new AbortController();
    try {
      const config = await this.client.getConfig(this.inFlightAbort.signal);
      const sensors = extractSensors(config);
      this.selectedBuffers = sensors.map((sensor) => sensor.bufferName);
      this.sensorsDiscovered = true;
      this.consecutiveFailures = 0;
      this.emit('sensors', sensors as SensorMeta[]);
      this.emit('status', 'connected' as DeviceStatus);
      this.scheduleNext(0);
    } catch (err) {
      console.error(`[phyphox] device ${this.deviceId}: /config discovery failed:`, err);
      this.handleFailure();
    }
  }

  private async poll(): Promise<void> {
    const buffersToFetch = this.selectedBuffers.includes(TIME_BUFFER_NAME)
      ? this.selectedBuffers
      : [TIME_BUFFER_NAME, ...this.selectedBuffers];

    this.inFlightAbort = new AbortController();
    try {
      const response = await this.client.getBuffers(
        buffersToFetch,
        this.lastTime,
        TIME_BUFFER_NAME,
        this.inFlightAbort.signal,
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

      this.scheduleNext(this.pollIntervalMs);
    } catch (err) {
      console.error(`[phyphox] device ${this.deviceId}: /get poll failed:`, err);
      this.handleFailure();
    }
  }

  private handleFailure(): void {
    if (this.stopped) return;

    this.consecutiveFailures += 1;
    const status: DeviceStatus =
      this.consecutiveFailures >= this.offlineAfterFailures ? 'offline' : 'reconnecting';
    if (status === 'offline') {
      // Force a fresh /config discovery once the device comes back - it may
      // have reconnected to a different/updated experiment in the meantime.
      this.sensorsDiscovered = false;
    }
    this.emit('status', status);

    const backoff = Math.min(
      this.pollIntervalMs * 2 ** this.consecutiveFailures,
      this.maxBackoffMs,
    );
    this.scheduleNext(backoff);
  }
}

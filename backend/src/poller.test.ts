import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceStatus, LogEntry, Sample, SensorMeta } from '@phyphox-dashboard/shared';
import { DevicePoller } from './poller.js';
import { MockPhyphoxServer } from './testUtils/mockPhyphoxServer.js';

function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs)
        return reject(new Error('timed out waiting for condition'));
      setTimeout(check, 10);
    };
    check();
  });
}

describe('DevicePoller', () => {
  let mock: MockPhyphoxServer;
  let baseUrl: string;
  let poller: DevicePoller;

  beforeEach(async () => {
    mock = new MockPhyphoxServer(['accX']);
    baseUrl = await mock.listen();
  });

  afterEach(async () => {
    poller.stop();
    await mock.close();
  });

  it('resets its incremental time cursor after a successful clear command', async () => {
    const samples: Sample[] = [];
    poller = new DevicePoller('device-1', baseUrl, { pollIntervalMs: 20 });
    poller.on('sample', (batch: Sample[]) => samples.push(...batch));
    poller.start();

    // Wait for the experiment clock to move well past a single tick, so the
    // post-clear comparison below can't tie with it by timing coincidence.
    await waitFor(() => samples.some((sample) => sample.t > 0.3));
    const beforeClearMaxT = Math.max(...samples.map((s) => s.t));

    samples.length = 0;
    await poller.control('clear');

    await waitFor(() => samples.length > 0);
    const afterClearMaxT = Math.max(...samples.map((s) => s.t));
    expect(afterClearMaxT).toBeLessThan(beforeClearMaxT);
  });

  it('re-discovers sensors once a device recovers from an outage', async () => {
    const sensorEvents: SensorMeta[][] = [];
    const statusEvents: DeviceStatus[] = [];
    poller = new DevicePoller('device-1', baseUrl, {
      pollIntervalMs: 20,
      maxBackoffMs: 50,
      offlineAfterFailures: 3,
    });
    poller.on('sensors', (sensors: SensorMeta[]) => sensorEvents.push(sensors));
    poller.on('status', (status: DeviceStatus) => statusEvents.push(status));
    poller.start();

    await waitFor(() => sensorEvents.length > 0);
    expect(sensorEvents).toHaveLength(1);

    mock.setFailing(true);
    await waitFor(() => statusEvents.includes('offline'), 5000);

    mock.setFailing(false);
    await waitFor(() => sensorEvents.length > 1, 5000);
    expect(sensorEvents).toHaveLength(2);
  });

  it('emits log events for discovery, polling, and failures', async () => {
    const logs: LogEntry[] = [];
    poller = new DevicePoller('device-1', baseUrl, {
      pollIntervalMs: 20,
      maxBackoffMs: 50,
      offlineAfterFailures: 2,
    });
    poller.on('log', (entry: LogEntry) => logs.push(entry));
    poller.start();

    await waitFor((): boolean =>
      logs.some((entry) => entry.level === 'info' && entry.message.includes('discovery succeeded')),
    );

    mock.setFailing(true);
    await waitFor((): boolean =>
      logs.some((entry) => entry.level === 'error' && entry.message.includes('poll failed')),
    );
    await waitFor((): boolean => logs.some((entry) => entry.message.includes('reconnecting')));
  });

  it('throttles "polled" log lines to roughly once per second, not once per tick', async () => {
    const logs: LogEntry[] = [];
    poller = new DevicePoller('device-1', baseUrl, { pollIntervalMs: 20 });
    poller.on('log', (entry: LogEntry) => logs.push(entry));
    poller.start();

    // At a 20ms poll interval, ~1.2s covers roughly 60 ticks - if every tick
    // logged, we'd see dozens of "polled:" lines; throttled, at most ~2.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const polledLogs = logs.filter((entry) => entry.message.startsWith('polled:'));
    expect(polledLogs.length).toBeLessThanOrEqual(3);
  });
});

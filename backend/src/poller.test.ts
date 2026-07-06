import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';
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
});

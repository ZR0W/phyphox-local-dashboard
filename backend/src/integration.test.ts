import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { DeviceManager } from './deviceManager.js';
import { MockPhyphoxServer } from './testUtils/mockPhyphoxServer.js';

type Msg = Record<string, unknown>;

/**
 * Buffers every message from the moment the socket is created, so a waitFor()
 * call can never race a broadcast that fires synchronously (e.g. 'deviceAdded'
 * during the POST handler) and arrives before the test gets around to
 * attaching a one-shot listener.
 */
function collectMessages(socket: WebSocket) {
  const messages: Msg[] = [];
  const waiters: Array<{ predicate: (m: Msg) => boolean; resolve: (m: Msg) => void }> = [];

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as Msg;
    messages.push(message);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(message)) {
        waiters[i].resolve(message);
        waiters.splice(i, 1);
      }
    }
  });

  function waitFor(predicate: (m: Msg) => boolean, timeoutMs = 5000): Promise<Msg> {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((w) => w.resolve === wrappedResolve);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error('Timed out waiting for expected WebSocket message'));
      }, timeoutMs);

      function wrappedResolve(message: Msg): void {
        clearTimeout(timer);
        resolve(message);
      }

      waiters.push({ predicate, resolve: wrappedResolve });
    });
  }

  return { messages, waitFor };
}

describe('device polling pipeline', () => {
  let mockPhone: MockPhyphoxServer;
  let mockBaseUrl: string;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    mockPhone = new MockPhyphoxServer(['accX']);
    mockBaseUrl = await mockPhone.listen();

    app = buildApp(new DeviceManager());
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await app.close();
    await mockPhone.close();
  });

  it('registers a device, polls it, and broadcasts samples over WebSocket', async () => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
    await new Promise((resolve) => socket.once('open', resolve));
    const { waitFor } = collectMessages(socket);

    const createResponse = await fetch(`${baseUrl}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Phone', baseUrl: mockBaseUrl }),
    });
    expect(createResponse.status).toBe(201);
    const device = (await createResponse.json()) as { id: string };

    const addedMessage = await waitFor((message) => message.type === 'deviceAdded');
    expect((addedMessage.device as { id: string }).id).toBe(device.id);

    const sensorsMessage = await waitFor(
      (message) => message.type === 'sensors' && message.deviceId === device.id,
    );
    expect(sensorsMessage.sensors).toEqual([{ bufferName: 'accX', label: 'accX' }]);

    const discoveryLogMessage = await waitFor(
      (message) =>
        message.type === 'log' &&
        message.deviceId === device.id &&
        (message.message as string).includes('discovery succeeded'),
    );
    expect(discoveryLogMessage.level).toBe('info');

    const sampleMessage = await waitFor(
      (message) => message.type === 'sample' && message.deviceId === device.id,
    );
    const samples = sampleMessage.samples as Array<{ bufferName: string; t: number; v: number }>;
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]?.bufferName).toBe('accX');

    const listResponse = await fetch(`${baseUrl}/api/devices`);
    const devices = (await listResponse.json()) as Array<{ status: string }>;
    expect(devices[0]?.status).toBe('connected');

    const controlResponse = await fetch(`${baseUrl}/api/devices/${device.id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'start' }),
    });
    expect(controlResponse.status).toBe(200);
    expect(mockPhone.getLastControlCommand()).toBe('start');

    await waitFor(
      (message) =>
        message.type === 'log' &&
        message.deviceId === device.id &&
        (message.message as string).includes('cmd=start') &&
        (message.message as string).includes('succeeded'),
    );

    socket.close();
  });

  it('rejects an invalid device address', async () => {
    const response = await fetch(`${baseUrl}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Phone', baseUrl: 'https://192.168.1.5' }),
    });
    expect(response.status).toBe(400);
  });

  it('stops broadcasting for a device immediately after it is removed', async () => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
    await new Promise((resolve) => socket.once('open', resolve));
    const { messages, waitFor } = collectMessages(socket);

    const createResponse = await fetch(`${baseUrl}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Phone', baseUrl: mockBaseUrl }),
    });
    const device = (await createResponse.json()) as { id: string };

    await waitFor((message) => message.type === 'sample' && message.deviceId === device.id);
    const messageCountBeforeRemoval = messages.length;

    const deleteResponse = await fetch(`${baseUrl}/api/devices/${device.id}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(204);

    await waitFor((message) => message.type === 'deviceRemoved' && message.deviceId === device.id);

    // Give any in-flight request a chance to resolve and (incorrectly) re-broadcast.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const leaked = messages
      .slice(messageCountBeforeRemoval)
      .filter((message) => message.type !== 'deviceRemoved' && message.deviceId === device.id);
    expect(leaked).toEqual([]);

    socket.close();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { DeviceManager } from './deviceManager.js';
import { MockPhyphoxServer } from './testUtils/mockPhyphoxServer.js';

function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for expected WebSocket message'));
    }, timeoutMs);

    function onMessage(raw: WebSocket.RawData) {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (predicate(message)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      }
    }

    socket.on('message', onMessage);
  });
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

    const createResponse = await fetch(`${baseUrl}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Phone', baseUrl: mockBaseUrl }),
    });
    expect(createResponse.status).toBe(201);
    const device = (await createResponse.json()) as { id: string };

    const sensorsMessage = await waitForMessage(
      socket,
      (message) => message.type === 'sensors' && message.deviceId === device.id,
    );
    expect(sensorsMessage.sensors).toEqual([{ bufferName: 'accX', label: 'accX' }]);

    const sampleMessage = await waitForMessage(
      socket,
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
});

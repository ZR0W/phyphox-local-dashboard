import type { FastifyInstance } from 'fastify';
import type { Device, DeviceStatus, LogEntry, Sample, SensorMeta } from '@phyphox-dashboard/shared';
import { WebSocketServer } from 'ws';
import type { DeviceManager } from './deviceManager.js';

export function attachWebSocketHub(
  app: FastifyInstance,
  deviceManager: DeviceManager,
): WebSocketServer {
  const wss = new WebSocketServer({ server: app.server, path: '/ws' });

  function broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  deviceManager.on('deviceAdded', (device: Device) => {
    broadcast({ type: 'deviceAdded', device });
  });

  deviceManager.on('deviceRemoved', (deviceId: string) => {
    broadcast({ type: 'deviceRemoved', deviceId });
  });

  deviceManager.on('sample', (deviceId: string, samples: Sample[]) => {
    broadcast({ type: 'sample', deviceId, samples });
  });

  deviceManager.on('status', (deviceId: string, status: DeviceStatus) => {
    broadcast({ type: 'status', deviceId, status });
  });

  deviceManager.on('sensors', (deviceId: string, sensors: SensorMeta[]) => {
    broadcast({ type: 'sensors', deviceId, sensors });
  });

  deviceManager.on('log', (deviceId: string, entry: LogEntry) => {
    broadcast({ type: 'log', deviceId, ...entry });
  });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'deviceList', devices: deviceManager.listDevices() }));
  });

  app.addHook('onClose', (_instance, done) => {
    wss.close(() => done());
  });

  return wss;
}

import Fastify from 'fastify';
import { DeviceManager } from './deviceManager.js';
import { registerDeviceRoutes } from './routes.js';
import { attachWebSocketHub } from './ws.js';

export function buildApp(deviceManager: DeviceManager = new DeviceManager()) {
  const app = Fastify({ logger: false });

  registerDeviceRoutes(app, deviceManager);
  attachWebSocketHub(app, deviceManager);

  app.addHook('onClose', (_instance, done) => {
    deviceManager.stopAll();
    done();
  });

  return app;
}

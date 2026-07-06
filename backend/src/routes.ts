import type { FastifyInstance } from 'fastify';
import type { DeviceManager } from './deviceManager.js';
import type { PhyphoxControlCommand } from './phyphox/types.js';

const VALID_COMMANDS: PhyphoxControlCommand[] = ['start', 'stop', 'clear'];

function isValidCommand(cmd: unknown): cmd is PhyphoxControlCommand {
  return typeof cmd === 'string' && (VALID_COMMANDS as string[]).includes(cmd);
}

export function registerDeviceRoutes(app: FastifyInstance, deviceManager: DeviceManager): void {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/devices', async () => deviceManager.listDevices());

  app.post<{ Body: { name?: string; baseUrl?: string } }>(
    '/api/devices',
    async (request, reply) => {
      const { name, baseUrl } = request.body ?? {};
      if (!name || !baseUrl) {
        return reply.code(400).send({ error: 'name and baseUrl are required' });
      }

      try {
        const device = deviceManager.addDevice({ name, baseUrl });
        return reply.code(201).send(device);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/devices/:id', async (request, reply) => {
    const removed = deviceManager.removeDevice(request.params.id);
    if (!removed) {
      return reply.code(404).send({ error: 'device not found' });
    }
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: { cmd?: string } }>(
    '/api/devices/:id/control',
    async (request, reply) => {
      const { cmd } = request.body ?? {};
      if (!isValidCommand(cmd)) {
        return reply.code(400).send({ error: `cmd must be one of ${VALID_COMMANDS.join(', ')}` });
      }

      try {
        await deviceManager.controlDevice(request.params.id, cmd);
        return reply.send({ result: true });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );
}

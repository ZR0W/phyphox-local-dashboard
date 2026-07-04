import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Device, DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';
import { DevicePoller } from './poller.js';
import { validateBaseUrl } from './security.js';
import type { PhyphoxControlCommand } from './phyphox/types.js';

interface ManagedDevice {
  device: Device;
  poller: DevicePoller;
}

/**
 * In-memory registry of configured devices, each backed by its own DevicePoller.
 * Re-emits poller events tagged with the device id so a single WebSocket hub
 * can fan them all out without knowing about individual devices.
 */
export class DeviceManager extends EventEmitter {
  private readonly devices = new Map<string, ManagedDevice>();

  addDevice(input: { name: string; baseUrl: string }): Device {
    const baseUrl = validateBaseUrl(input.baseUrl);
    const id = randomUUID();

    const device: Device = {
      id,
      name: input.name,
      baseUrl,
      status: 'reconnecting',
      sensors: [],
      selectedBuffers: [],
    };

    const poller = new DevicePoller(id, baseUrl);

    poller.on('status', (status: DeviceStatus) => {
      device.status = status;
      if (status === 'connected') {
        device.lastSeen = Date.now();
      }
      this.emit('status', id, status);
    });

    poller.on('sensors', (sensors: SensorMeta[]) => {
      device.sensors = sensors;
      device.selectedBuffers = sensors.map((sensor) => sensor.bufferName);
      this.emit('sensors', id, sensors);
    });

    poller.on('sample', (samples: Sample[]) => {
      this.emit('sample', id, samples);
    });

    this.devices.set(id, { device, poller });
    poller.start();

    return device;
  }

  removeDevice(id: string): boolean {
    const entry = this.devices.get(id);
    if (!entry) return false;
    entry.poller.stop();
    this.devices.delete(id);
    return true;
  }

  listDevices(): Device[] {
    return [...this.devices.values()].map((entry) => entry.device);
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id)?.device;
  }

  controlDevice(id: string, cmd: PhyphoxControlCommand): Promise<void> {
    const entry = this.devices.get(id);
    if (!entry) throw new Error(`Unknown device: ${id}`);
    return entry.poller.control(cmd);
  }

  stopAll(): void {
    for (const entry of this.devices.values()) entry.poller.stop();
  }
}

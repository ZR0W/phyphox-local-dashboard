import { useEffect, useState } from 'react';
import type { Device, DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';

const MAX_POINTS_PER_BUFFER = 500;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10000;

export interface BufferSeries {
  t: number[];
  v: number[];
}

interface DashboardState {
  devices: Record<string, Device>;
  series: Record<string, Record<string, BufferSeries>>;
}

type SocketMessage =
  | { type: 'deviceList'; devices: Device[] }
  | { type: 'deviceAdded'; device: Device }
  | { type: 'deviceRemoved'; deviceId: string }
  | { type: 'status'; deviceId: string; status: DeviceStatus }
  | { type: 'sensors'; deviceId: string; sensors: SensorMeta[] }
  | { type: 'sample'; deviceId: string; samples: Sample[] };

function applyMessage(prev: DashboardState, message: SocketMessage): DashboardState {
  switch (message.type) {
    case 'deviceList': {
      const devices: Record<string, Device> = {};
      for (const device of message.devices) devices[device.id] = device;
      return { ...prev, devices };
    }
    case 'deviceAdded': {
      return { ...prev, devices: { ...prev.devices, [message.device.id]: message.device } };
    }
    case 'deviceRemoved': {
      const devices = { ...prev.devices };
      const series = { ...prev.series };
      delete devices[message.deviceId];
      delete series[message.deviceId];
      return { ...prev, devices, series };
    }
    case 'status': {
      const existing = prev.devices[message.deviceId];
      if (!existing) return prev;
      return {
        ...prev,
        devices: { ...prev.devices, [message.deviceId]: { ...existing, status: message.status } },
      };
    }
    case 'sensors': {
      const existing = prev.devices[message.deviceId];
      if (!existing) return prev;
      return {
        ...prev,
        devices: {
          ...prev.devices,
          [message.deviceId]: { ...existing, sensors: message.sensors },
        },
      };
    }
    case 'sample': {
      // Guard against samples for a device we don't (or no longer) know about,
      // e.g. a broadcast that was in flight the instant the device was removed.
      const existing = prev.devices[message.deviceId];
      if (!existing) return prev;

      const deviceSeries = { ...(prev.series[message.deviceId] ?? {}) };
      for (const sample of message.samples) {
        const series = deviceSeries[sample.bufferName] ?? { t: [], v: [] };
        deviceSeries[sample.bufferName] = {
          t: [...series.t, sample.t].slice(-MAX_POINTS_PER_BUFFER),
          v: [...series.v, sample.v].slice(-MAX_POINTS_PER_BUFFER),
        };
      }
      return { ...prev, series: { ...prev.series, [message.deviceId]: deviceSeries } };
    }
    default:
      return prev;
  }
}

export function useDashboardSocket() {
  const [state, setState] = useState<DashboardState>({ devices: {}, series: {} });

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (cancelled) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

      socket.addEventListener('open', () => {
        reconnectAttempt = 0;
      });

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data as string) as SocketMessage;
        setState((prev) => applyMessage(prev, message));
      });

      // The backend sends a fresh 'deviceList' snapshot on every new
      // connection, so reconnecting after a drop resyncs state automatically.
      socket.addEventListener('close', scheduleReconnect);
      socket.addEventListener('error', () => socket?.close());
    }

    function scheduleReconnect(): void {
      if (cancelled) return;
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  async function addDevice(input: { name: string; baseUrl: string }): Promise<void> {
    const response = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? 'Failed to add device');
    }
  }

  return { devices: Object.values(state.devices), series: state.series, addDevice };
}

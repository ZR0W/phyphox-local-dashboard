import { useEffect, useRef, useState } from 'react';
import type { Device, DeviceStatus, Sample, SensorMeta } from '@phyphox-dashboard/shared';

const MAX_POINTS_PER_BUFFER = 500;

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
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    socketRef.current = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string) as SocketMessage;
      setState((prev) => applyMessage(prev, message));
    });

    return () => socket.close();
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

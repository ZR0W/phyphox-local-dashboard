import type { Device } from '@phyphox-dashboard/shared';
import type { BufferSeries } from '../lib/useDashboardSocket.js';
import { LiveChart } from './LiveChart.js';

interface DeviceCardProps {
  device: Device;
  series: Record<string, BufferSeries> | undefined;
}

export function DeviceCard({ device, series }: DeviceCardProps) {
  const firstSensor = device.sensors[0];
  const firstSeries = firstSensor ? series?.[firstSensor.bufferName] : undefined;

  return (
    <section>
      <h2>
        {device.name} <small>({device.status})</small>
      </h2>
      {firstSensor && firstSeries ? (
        <LiveChart t={firstSeries.t} v={firstSeries.v} label={firstSensor.label} />
      ) : (
        <p>Waiting for data…</p>
      )}
    </section>
  );
}

import { AddDeviceForm } from './components/AddDeviceForm.js';
import { DeviceCard } from './components/DeviceCard.js';
import { useDashboardSocket } from './lib/useDashboardSocket.js';

export function App() {
  const { devices, series, addDevice } = useDashboardSocket();

  return (
    <main>
      <h1>Phyphox Local Dashboard</h1>
      <AddDeviceForm onAdd={addDevice} />
      {devices.length === 0 && <p>No devices yet. Add one above to start streaming.</p>}
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} series={series[device.id]} />
      ))}
    </main>
  );
}

import type { LogRecord } from '../lib/useDashboardSocket.js';

interface ActivityLogProps {
  logs: LogRecord[];
}

export function ActivityLog({ logs }: ActivityLogProps) {
  return (
    <section>
      <h2>Activity Log</h2>
      {logs.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <ul style={{ maxHeight: 300, overflowY: 'auto', listStyle: 'none', padding: 0 }}>
          {logs.map((entry) => (
            <li key={entry.id}>
              <code>{new Date(entry.timestamp).toLocaleTimeString()}</code>{' '}
              <strong>[{entry.level}]</strong> {entry.deviceName}: {entry.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

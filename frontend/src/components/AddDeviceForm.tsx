import { useState, type FormEvent } from 'react';

interface AddDeviceFormProps {
  onAdd: (input: { name: string; baseUrl: string }) => Promise<void>;
}

export function AddDeviceForm({ onAdd }: AddDeviceFormProps) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({ name, baseUrl });
      setName('');
      setBaseUrl('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <input
        aria-label="Device nickname"
        placeholder="Nickname"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        aria-label="Device address"
        placeholder="IP:port (e.g. 192.168.1.23:8080)"
        value={baseUrl}
        onChange={(event) => setBaseUrl(event.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : '+ Add Device'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

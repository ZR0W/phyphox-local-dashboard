import type {
  PhyphoxConfig,
  PhyphoxControlCommand,
  PhyphoxControlResponse,
  PhyphoxGetResponse,
  PhyphoxMeta,
} from './types.js';

const REQUEST_TIMEOUT_MS = 3000;

async function fetchJson<T>(url: string, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`phyphox request failed: ${response.status} ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Thin wrapper over one phyphox device's remote-access HTTP interface.
 * Endpoint shapes per https://phyphox.org/wiki/index.php/Remote-interface_communication
 * and the community client behavior documented there (/get threshold syntax,
 * /control result field) - /meta is treated as an opaque passthrough since its
 * exact schema isn't required for polling.
 *
 * Every method accepts an optional external AbortSignal so a caller (the
 * poller) can cancel an in-flight request immediately - e.g. when a device
 * is removed mid-poll - rather than waiting out the internal timeout.
 */
export class PhyphoxClient {
  constructor(private readonly baseUrl: string) {}

  getMeta(signal?: AbortSignal): Promise<PhyphoxMeta> {
    return fetchJson<PhyphoxMeta>(`${this.baseUrl}/meta`, signal);
  }

  getConfig(signal?: AbortSignal): Promise<PhyphoxConfig> {
    return fetchJson<PhyphoxConfig>(`${this.baseUrl}/config`, signal);
  }

  async control(cmd: PhyphoxControlCommand, signal?: AbortSignal): Promise<void> {
    const result = await fetchJson<PhyphoxControlResponse>(
      `${this.baseUrl}/control?cmd=${cmd}`,
      signal,
    );
    if (!result.result) {
      throw new Error(`phyphox refused control command: ${cmd}`);
    }
  }

  /**
   * Threshold-based incremental fetch: only samples newer than `since` (per timeBufferName) are returned.
   * The `|` separator must be sent as `%7C` - phyphox's on-device HTTP server rejects a literal `|` in
   * the query with a 400 (confirmed against a real device; Node's own URL parser is lenient enough that
   * this wasn't caught by MockPhyphoxServer, which never exercised real query-string validation).
   */
  getBuffers(
    bufferNames: string[],
    since: number,
    timeBufferName = 'time',
    signal?: AbortSignal,
  ): Promise<PhyphoxGetResponse> {
    const query = bufferNames
      .map((name) =>
        name === timeBufferName
          ? `${encodeURIComponent(name)}=${since}`
          : `${encodeURIComponent(name)}=${since}%7C${encodeURIComponent(timeBufferName)}`,
      )
      .join('&');
    return fetchJson<PhyphoxGetResponse>(`${this.baseUrl}/get?${query}`, signal);
  }
}

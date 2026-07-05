const HOSTNAME_PATTERN = /^[a-zA-Z0-9.-]+$/;

// phyphox devices are phones on the researcher's LAN, never this machine or a
// cloud metadata service - block loopback/link-local so a malicious or
// mistaken "device address" can't turn the backend into a proxy that probes
// its own host (127.0.0.1) or a cloud metadata endpoint (169.254.169.254).
function isLoopbackOrLinkLocal(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') return true;

  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const [a, b] = ipv4Match.slice(1, 3).map(Number);
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. cloud metadata IP

  return false;
}

export function validateBaseUrl(input: string): string {
  const candidate = /^[a-zA-Z]+:\/\//.test(input) ? input : `http://${input}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`Invalid device address: ${input}`);
  }

  if (url.protocol !== 'http:') {
    throw new Error('Device address must use http (phyphox does not serve https)');
  }
  if (url.username || url.password) {
    throw new Error('Device address must not contain credentials');
  }
  if (!HOSTNAME_PATTERN.test(url.hostname)) {
    throw new Error('Invalid device hostname');
  }
  if (isLoopbackOrLinkLocal(url.hostname)) {
    throw new Error('Device address must not be a loopback or link-local address');
  }

  return `${url.protocol}//${url.host}`;
}

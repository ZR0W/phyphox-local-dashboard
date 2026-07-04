const HOSTNAME_PATTERN = /^[a-zA-Z0-9.-]+$/;

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

  return `${url.protocol}//${url.host}`;
}

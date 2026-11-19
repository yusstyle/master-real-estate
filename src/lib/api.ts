export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

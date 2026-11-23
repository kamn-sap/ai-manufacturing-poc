export async function api(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'リクエストに失敗しました。');
  return body;
}

export function jsonBody(value) {
  return JSON.stringify(value);
}

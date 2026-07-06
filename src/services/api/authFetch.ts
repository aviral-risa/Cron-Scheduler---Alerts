/**
 * Authenticated fetch wrapper that automatically adds Google ID token
 */

let getTokenFn: (() => string | null) | null = null;

export function setAuthTokenGetter(fn: () => string | null) {
  getTokenFn = fn;
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getTokenFn?.() || localStorage.getItem('auth_token');

  // In development, skip auth — the API server bypasses auth in non-production mode
  if (!token && import.meta.env.DEV) {
    return fetch(url, options);
  }

  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Helper for authenticated GET requests
 */
export async function authGet(url: string): Promise<Response> {
  return authFetch(url, { method: 'GET' });
}

/**
 * Helper for authenticated POST requests
 */
export async function authPost(
  url: string,
  body: unknown
): Promise<Response> {
  return authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

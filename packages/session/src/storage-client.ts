import { daemonRequest, requireSession } from './session-client.js';

export async function getCookies(
  sessionName?: string
): Promise<
  Array<{ name: string; value: string; domain: string; path: string; [key: string]: unknown }>
> {
  const name = requireSession(sessionName);
  const result = (await daemonRequest('storage.get', { name, type: 'cookies' })) as {
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      [key: string]: unknown;
    }>;
  };
  return result.cookies || [];
}

export async function setCookie(
  name: string,
  value: string,
  domain: string,
  sessionName?: string
): Promise<void> {
  const sName = requireSession(sessionName);
  await daemonRequest('storage.set', {
    name: sName,
    type: 'cookies',
    data: { name, value, domain, path: '/' },
  });
}

export async function clearCookies(sessionName?: string): Promise<void> {
  const name = requireSession(sessionName);
  await daemonRequest('storage.clear', { name, type: 'cookies' });
}

export async function getLocalStorage(sessionName?: string): Promise<Record<string, string>> {
  const name = requireSession(sessionName);
  const result = (await daemonRequest('storage.get', { name, type: 'localStorage' })) as {
    localStorage: Record<string, string>;
  };
  return result.localStorage || {};
}

export async function setLocalStorage(
  key: string,
  value: string,
  sessionName?: string
): Promise<void> {
  const name = requireSession(sessionName);
  await daemonRequest('storage.set', { name, type: 'localStorage', key, value });
}

export async function clearLocalStorage(sessionName?: string): Promise<void> {
  const name = requireSession(sessionName);
  await daemonRequest('storage.clear', { name, type: 'localStorage' });
}

const baseUrl = process.env.API_URL ?? 'http://localhost:4000';
const csrfHeader = 'X-CSRF-Token';

function createClient() {
  const cookies = new Map<string, string>();
  let csrfToken: string | null = null;

  const cookieHeader = () =>
    [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');

  const storeCookies = (response: Response) => {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    for (const item of setCookie.split(/,(?=[^;,]+=)/)) {
      const [pair] = item.split(';');
      const [key, value] = pair.split('=');
      if (key && value) cookies.set(key.trim(), value.trim());
    }
  };

  const ensureCsrf = async () => {
    if (csrfToken) return csrfToken;
    const response = await fetch(`${baseUrl}/auth/csrf`, {
      headers: cookieHeader() ? { Cookie: cookieHeader() } : undefined,
    });
    storeCookies(response);
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(`GET /auth/csrf failed: ${response.status}`);
    csrfToken = String(body.csrfToken);
    return csrfToken;
  };

  return async function request(path: string, init: RequestInit = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers.set(csrfHeader, await ensureCsrf());
    }
    const cookie = cookieHeader();
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    storeCookies(response);
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        `${method} ${path} failed: ${response.status} ${JSON.stringify(body)}`
      );
    return body;
  };
}

const staff = createClient();

await staff('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'aqmal@performa.id', password: 'demo1234' }),
});

const me = await staff('/auth/me');
const userId = me.user.id;
await staff(`/appraisals/user/${userId}`);

const sl = createClient();

await sl('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'aqmal.hakim@performa.id',
    password: 'demo1234',
  }),
});
const slMe = await sl('/auth/me');
await sl(`/reviews/queue?reviewerUserId=${slMe.user.id}&role=sl`);

console.log('Smoke checks passed');

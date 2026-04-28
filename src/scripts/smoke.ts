const baseUrl = process.env.API_URL ?? 'http://localhost:4000';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `${init?.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`
    );
  return body;
}

const login = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'andi@performa.id', password: 'demo1234' }),
});

const headers = { Authorization: `Bearer ${login.token}` };
await request('/auth/me', { headers });
await request('/appraisals/user/1', { headers });
await request('/appraisals/1', { headers });

const slLogin = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'budi@performa.id', password: 'demo1234' }),
});
await request('/reviews/queue?reviewerUserId=2&role=sl', {
  headers: { Authorization: `Bearer ${slLogin.token}` },
});

console.log('Smoke checks passed');

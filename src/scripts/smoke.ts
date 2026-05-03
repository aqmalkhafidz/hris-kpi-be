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
  body: JSON.stringify({ email: 'aqmal@performa.id', password: 'demo1234' }),
});

const headers = { Authorization: `Bearer ${login.token}` };
const me = await request('/auth/me', { headers });
const userId = me.user.id;
await request(`/appraisals/user/${userId}`, { headers });

const slLogin = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'aqmal.hakim@performa.id',
    password: 'demo1234',
  }),
});
const slMe = await request('/auth/me', {
  headers: { Authorization: `Bearer ${slLogin.token}` },
});
await request(`/reviews/queue?reviewerUserId=${slMe.user.id}&role=sl`, {
  headers: { Authorization: `Bearer ${slLogin.token}` },
});

console.log('Smoke checks passed');

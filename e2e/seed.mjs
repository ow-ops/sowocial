// Seeds the local GoToSocial in compose.yaml with the accounts and posts the Maestro flows expect.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:8080';
const CONTAINER = 'sowocial-e2e-gts';
export const PASSWORD = 'Sowocial-e2e-Passw0rd!';
const REDIRECT = 'urn:ietf:wg:oauth:2.0:oob';
const SCOPES = 'read write follow push admin';

const gts = (...args) => execFileSync('docker', ['exec', CONTAINER, '/gotosocial/gotosocial', 'admin', 'account', ...args], { stdio: 'pipe' });

function createAccount(username, admin = false) {
  try {
    gts('create', '--username', username, '--email', `${username}@e2e.test`, '--password', PASSWORD);
  } catch (error) {
    if (!String(error.stderr).includes('already')) throw error;
  }
  gts('confirm', '--username', username);
  if (admin) gts('promote', '--username', username);
}

// GoToSocial has no password grant, so this walks the browser sign-in with a cookie jar.
async function token(username) {
  const app = await (await fetch(`${BASE}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'sowocial-e2e', redirect_uris: REDIRECT, scopes: SCOPES }),
  })).json();

  const jar = new Map();
  const request = async (path, init = {}) => {
    const response = await fetch(new URL(path, BASE), {
      ...init,
      redirect: 'manual',
      headers: { ...init.headers, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const at = pair.indexOf('=');
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  };
  const form = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const authorize = `/oauth/authorize?${new URLSearchParams({ client_id: app.client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES })}`;
  await request(authorize);
  await request('/auth/sign_in', form({ username: `${username}@e2e.test`, password: PASSWORD }));
  await request(authorize);
  const approved = await request('/oauth/authorize', form({}));
  let location = approved.headers.get('location') ?? '';
  let code = new URL(location, BASE).searchParams.get('code');
  if (!code) {
    const page = await (await request(location)).text();
    code = page.match(/<code>([^<]+)<\/code>/)?.[1] ?? page.match(/code=([\w-]+)/)?.[1];
  }
  if (!code) throw new Error(`no OAuth code for ${username}`);

  const tokenResponse = await (await fetch(`${BASE}/oauth/token`, form({
    grant_type: 'authorization_code',
    code,
    client_id: app.client_id,
    client_secret: app.client_secret,
    redirect_uri: REDIRECT,
  }))).json();
  if (!tokenResponse.access_token) throw new Error(`no token for ${username}: ${JSON.stringify(tokenResponse)}`);
  return tokenResponse.access_token;
}

export async function api(accessToken, method, path, body) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

export async function sessions() {
  createAccount('alice', true);
  createAccount('bob');
  createAccount('carol');
  createAccount('dave');
  return { alice: await token('alice'), bob: await token('bob'), carol: await token('carol'), dave: await token('dave') };
}

const post = (accessToken, status, extra = {}) => api(accessToken, 'POST', '/api/v1/statuses', { status, visibility: 'public', ...extra });

async function seed() {
  const { alice, bob, carol, dave } = await sessions();
  const ids = Object.fromEntries(
    await Promise.all(Object.entries({ alice, carol }).map(async ([name, t]) => [name, (await api(t, 'GET', '/api/v1/accounts/verify_credentials')).id])),
  );
  // Accounts made with the admin CLI start locked, which would leave these follows as requests.
  await Promise.all([alice, bob, carol, dave].map((t) => api(t, 'PATCH', '/api/v1/accounts/update_credentials', { locked: false })));
  await api(bob, 'POST', `/api/v1/accounts/${ids.alice}/follow`);
  await api(bob, 'POST', `/api/v1/accounts/${ids.carol}/follow`);

  const emoji = new FormData();
  emoji.append('shortcode', 'neocat');
  emoji.append('image', new Blob([readFileSync(new URL('../assets/images/favicon.png', import.meta.url))], { type: 'image/png' }), 'neocat.png');
  await api(alice, 'POST', '/api/v1/admin/custom_emojis', emoji).catch((error) => {
    if (!String(error).includes('409')) throw error;
  });
  await api(alice, 'PATCH', '/api/v1/accounts/update_credentials', { display_name: 'Alice :neocat:' });

  // Bob doesn't follow dave, so dave's post reaches him only as carol's boost.
  const boosted = await post(dave, 'A post carol boosts');
  await api(carol, 'POST', `/api/v1/statuses/${boosted.id}/reblog`);
  const first = await post(alice, 'Stroopwafel thread part one');
  const second = await post(alice, 'Stroopwafel thread part two', { in_reply_to_id: first.id });
  await post(carol, '@alice carol answers part two', { in_reply_to_id: second.id });
  await post(alice, 'BUY THE ~~DIP~~ **STROOPWAFEL**', { content_type: 'text/plain' });

  return { alice, bob, carol };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokens = await seed();
  for (const [name, value] of Object.entries(tokens)) console.log(`${name.toUpperCase()}_TOKEN=${value}`);
}

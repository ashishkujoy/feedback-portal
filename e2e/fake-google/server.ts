// A stand-in for Google's OAuth endpoints, for the end-to-end stack only (e2e/compose.yml).
// GET /authorize asks for an email instead of a Google account; POST /token checks the client,
// the redirect URI and PKCE, then returns an unsigned ID token for that email.
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const port = Number(process.env['PORT'] ?? 4000);
const clientId = process.env['CLIENT_ID'] ?? '';
const clientSecret = process.env['CLIENT_SECRET'] ?? '';
const redirectUri = process.env['REDIRECT_URI'] ?? '';

type Grant = Readonly<{ email: string; codeChallenge: string; redirectUri: string }>;
/** One use each, like Google's codes. */
const grants = new Map<string, Grant>();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const send = (response: ServerResponse, status: number, type: string, body: string) => {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
};

const oauthError = (response: ServerResponse, status: number, error: string) =>
  send(response, status, 'application/json', JSON.stringify({ error }));

/** The sign-in page: the authorize query rides along as hidden fields. */
const signInPage = (query: URLSearchParams) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Stand-in Google sign-in</title></head>
<body>
<main>
<h1>Stand-in Google sign-in</h1>
<form method="post" action="/authorize">
${[...query]
  .map(
    ([name, value]) =>
      `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
  )
  .join('\n')}
<label>Email <input type="email" name="email" required></label>
<button type="submit">Continue</button>
</form>
</main>
</body>
</html>`;

const authorize = (response: ServerResponse, form: URLSearchParams) => {
  const redirect = form.get('redirect_uri') ?? '';
  const email = form.get('email')?.trim().toLowerCase() ?? '';
  if (
    form.get('client_id') !== clientId ||
    redirect !== redirectUri ||
    form.get('response_type') !== 'code' ||
    form.get('code_challenge_method') !== 'S256' ||
    !form.get('code_challenge') ||
    !email
  ) {
    send(response, 400, 'text/plain', 'Bad authorization request');
    return;
  }
  const code = randomBytes(16).toString('base64url');
  grants.set(code, {
    email,
    codeChallenge: form.get('code_challenge') ?? '',
    redirectUri: redirect,
  });
  const target = new URL(redirect);
  target.searchParams.set('code', code);
  target.searchParams.set('state', form.get('state') ?? '');
  response.writeHead(302, { location: target.toString() });
  response.end();
};

/** RFC 6749 §2.3.1: each part is form-encoded before Basic. */
const formEncode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);

const token = (request: IncomingMessage, response: ServerResponse, form: URLSearchParams) => {
  const credentials = `${formEncode(clientId)}:${formEncode(clientSecret)}`;
  const expected = `Basic ${Buffer.from(credentials).toString('base64')}`;
  if (request.headers.authorization !== expected) {
    oauthError(response, 401, 'invalid_client');
    return;
  }
  const code = form.get('code') ?? '';
  const grant = grants.get(code);
  grants.delete(code);
  const challenge = createHash('sha256')
    .update(form.get('code_verifier') ?? '')
    .digest('base64url');
  if (
    !grant ||
    form.get('grant_type') !== 'authorization_code' ||
    form.get('redirect_uri') !== grant.redirectUri ||
    challenge !== grant.codeChallenge
  ) {
    oauthError(response, 400, 'invalid_grant');
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    iat: now,
    exp: now + 3600,
    sub: createHash('sha256').update(grant.email).digest('hex').slice(0, 21),
    email: grant.email,
    email_verified: true,
  };
  send(
    response,
    200,
    'application/json',
    JSON.stringify({
      access_token: randomBytes(16).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.`,
    }),
  );
};

const handle = async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url ?? '/', 'http://fake-google');
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, 'text/plain', 'ok\n');
  } else if (request.method === 'GET' && url.pathname === '/authorize') {
    send(response, 200, 'text/html; charset=utf-8', signInPage(url.searchParams));
  } else if (request.method === 'POST' && url.pathname === '/authorize') {
    authorize(response, new URLSearchParams(await readBody(request)));
  } else if (request.method === 'POST' && url.pathname === '/token') {
    token(request, response, new URLSearchParams(await readBody(request)));
  } else {
    send(response, 404, 'text/plain', 'Not found\n');
  }
};

createServer((request, response) => {
  handle(request, response).catch(() => send(response, 500, 'text/plain', 'Error\n'));
}).listen(port, () => {
  process.stdout.write(`stand-in Google listening on ${port}\n`);
});

'use strict';
// Synthetic identity and a strict HTTP adapter; all business writes go to the real PostgreSQL RPC.
const http = require('node:http');
const { randomUUID, randomBytes, randomInt, createHmac } = require('node:crypto');

exports.createService = async (origin, scope, sql) => {
  const { userId } = scope ?? { userId: randomUUID() };
  const email = randomUUID() + '@example.invalid';
  const user = {
    id: userId,
    email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'fixture', providers: ['fixture'] },
    user_metadata: { display_name: 'Profil test' },
    created_at: new Date().toISOString(),
    identities: [],
  };
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const secret = randomBytes(32);
  function issue(seconds) {
    const exp = Math.floor(Date.now() / 1000) + seconds;
    const part =
      encode({ alg: 'HS256', typ: 'JWT' }) +
      '.' +
      encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp, jti: randomUUID() });
    return {
      access_token: part + '.' + createHmac('sha256', secret).update(part).digest('base64url'),
      token_type: 'bearer',
      expires_at: exp,
      expires_in: seconds,
      refresh_token: randomUUID(),
      user,
    };
  }
  let session = issue(7200),
    code = null;
  const metrics = {
    authenticatedReads: 0,
    requests: 0,
    receipts: 0,
    replays: 0,
    rejected: 0,
    unserved: 0,
    otpRequested: 0,
    otpVerified: 0,
    methods: {},
  };
  let paused = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization,apikey,content-type,prefer,accept-profile,content-profile,x-client-info,x-supabase-api-version,range,range-unit',
        'Access-Control-Expose-Headers': 'Content-Range',
        ...headers,
      });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') {
      send(200, {});
      return;
    }
    metrics.requests++;
    if (paused) {
      send(503, {});
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1'),
      path = url.pathname;
    if (req.headers.origin !== origin) {
      metrics.rejected++;
      send(403, {});
      return;
    }
    try {
      if (req.method === 'POST' && ['/auth/v1/otp', '/auth/v1/verify'].includes(path)) {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) throw Error();
        }
        const payload = JSON.parse(body);
        if (req.headers.apikey !== process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || payload.email !== email)
          throw Error();
        if (path === '/auth/v1/otp') {
          metrics.otpRequested++;
          code = String(randomInt(100000, 1000000));
          send(200, {});
          return;
        }
        if (!code || payload.token !== code) throw Error();
        code = null;
        session = issue(7200);
        metrics.otpVerified++;
        send(200, session);
        return;
      }
      if (req.headers.authorization !== 'Bearer ' + session.access_token) {
        metrics.rejected++;
        send(401, {});
        return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (path === '/auth/v1/user') {
          send(200, user);
          return;
        }
        const table = path.replace(/^\/rest\/v1\//, '');
        if (['household_members', 'lists', 'list_items', 'shopping_catalog'].includes(table)) {
          let data = await sql({ name: 'read', table });
          if (table === 'household_members' && url.searchParams.has('user_id'))
            data = data.filter((r) => r.user_id === userId);
          for (const key of ['household_id', 'list_id', 'id', 'status']) {
            const rule = url.searchParams.get(key);
            if (rule?.startsWith('eq.')) data = data.filter((r) => r[key] === rule.slice(3));
            else if (rule?.startsWith('gt.')) data = data.filter((r) => r[key] > rule.slice(3));
          }
          if (url.searchParams.get('order')?.startsWith('id.asc'))
            data.sort((a, b) => a.id.localeCompare(b.id));
          const total = data.length;
          const limit = Number(url.searchParams.get('limit'));
          if (limit > 0) data = data.slice(0, limit);
          metrics.authenticatedReads++;
          const range =
            (data.length ? '0-' + (data.length - 1) : '*') +
            '/' +
            (req.headers.prefer?.includes('count=exact') ? total : '*');
          send(200, req.headers.accept?.includes('pgrst.object') ? (data[0] ?? null) : data, {
            'Content-Range': range,
          });
          return;
        }
      }
      if (req.method === 'POST' && path === '/rest/v1/rpc/apply_course_command') {
        let body = '';
        for await (const b of req) {
          body += b;
          if (body.length > 10000) throw Error();
        }
        const command = JSON.parse(body);
        const ack = await sql({ name: 'apply', body: command });
        metrics.receipts++;
        if (ack.replayed) metrics.replays++;
        metrics.methods[ack.kind] = (metrics.methods[ack.kind] ?? 0) + 1;
        send(200, ack);
        return;
      }
      metrics.unserved++;
      send(404, {});
    } catch (error) {
      metrics.rejected++;
      metrics.lastError = /^database-(?:[A-Z0-9]{5}|query)$/.test(error.message) ? error.message : 'fixture';
      send(400, { code: '22023', message: 'Fixture request rejected.' });
    }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(8083, '127.0.0.1', ok);
  });
  return {
    session,
    expiredSession: () => issue(-60),
    identity: () => ({ email, code }),
    pause: (value) => {
      paused = value;
    },
    stats: () => structuredClone(metrics),
    inspect: () => sql({ name: 'inspect' }),
  };
};

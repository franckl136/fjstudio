'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const root = '/tmp/project',
  app = root + '/apps/homeos',
  output = '/tmp/export',
  origin = 'http://127.0.0.1:8082';
const chrome =
  '/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell';
const delay = (ms) => new Promise((ok) => setTimeout(ok, ms));
let phase = 'sandbox';
function check(v, tag) {
  if (!v) throw Error(tag);
}
function launch(cmd, args, cwd = app) {
  const p = spawn(cmd, args, { cwd, env: process.env, stdio: 'ignore' });
  return p;
}
function complete(cmd, args, cwd) {
  return new Promise((ok, fail) => {
    const p = launch(cmd, args, cwd);
    p.on('error', fail);
    p.on('exit', (n) => (n === 0 ? ok() : fail(Error('process-exit'))));
  });
}
async function wait(fn, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const x = await fn();
      if (x) return x;
    } catch {}
    await delay(180);
  }
  throw Error('condition-timeout');
}
function proveProfile() {
  const meta = fs.readFileSync('/proc/self/status', 'utf8'),
    cg = (key) => fs.readFileSync('/sys/fs/cgroup/' + key, 'utf8').trim();
  const quota = cg('cpu.max').split(' ').map(Number);
  check(
    process.getuid() === 65534 &&
      fs.readdirSync('/sys/class/net').join() === 'lo' &&
      !fs.existsSync('/var/run/docker.sock') &&
      /^NoNewPrivs:\s+1$/m.test(meta) &&
      /^CapEff:\s+0+$/m.test(meta) &&
      Number(cg('memory.max')) === 5 * 1024 ** 3 &&
      cg('pids.max') === '384' &&
      quota[0] / quota[1] === 3 &&
      fs
        .readFileSync('/proc/self/mountinfo', 'utf8')
        .split('\n')
        .some((l) => l.split(' ')[4] === '/' && l.split(' ')[5].split(',').includes('ro')),
    'sandbox-profile',
  );
  return {
    uid: 65534,
    rootReadOnly: true,
    cpu: 3,
    memoryMiB: 5120,
    pids: 384,
    capabilities: 0,
    noNewPrivileges: true,
    interfaces: ['lo'],
  };
}
async function install(input) {
  const files = new Map();
  for (const { name, version, integrity } of input.entries) {
    const data = '/cache/' + sha(integrity);
    const [alg, expect] = integrity.split('-');
    const sum = createHash(alg);
    for await (const chunk of fs.createReadStream(data)) sum.update(chunk);
    check(sum.digest('base64') === expect, 'bad-offline-archive');
    files.set('/' + name + '/-/' + name.split('/').at(-1) + '-' + version + '.tgz', data);
  }
  await complete(
    '/usr/bin/tar',
    [
      '-xf',
      '/cache/' + sha(input.pnpm.integrity),
      '-C',
      '/tmp/pkg',
      '--no-same-owner',
      '--no-same-permissions',
    ],
    root,
  );
  const mirror = http.createServer((req, res) => {
    let file;
    try {
      file = files.get(decodeURIComponent(req.url));
    } catch {}
    if (req.method !== 'GET' || !file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-length': fs.statSync(file).size });
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  });
  await new Promise((ok, fail) => {
    mirror.once('error', fail);
    mirror.listen(3411, '127.0.0.1', ok);
  });
  try {
    await complete(
      '/usr/bin/node',
      [
        '/tmp/pkg/package/bin/pnpm.cjs',
        'install',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--config.node-linker=hoisted',
        '--config.manage-package-manager-versions=false',
        '--registry=http://127.0.0.1:3411/',
        '--config.fetch-retries=0',
      ],
      root,
    );
  } finally {
    mirror.closeAllConnections();
    await new Promise((ok) => mirror.close(ok));
  }
}
function staticServer() {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.json': 'application/json',
  };
  return http.createServer((req, res) => {
    try {
      const route = decodeURIComponent(new URL(req.url, origin).pathname);
      let file = path.resolve(output, route === '/' ? 'index.html' : '.' + route);
      if (req.method !== 'GET' || !file.startsWith(output + '/')) {
        res.writeHead(404).end();
        return;
      }
      if (!fs.existsSync(file)) file += '.html';
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
      });
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch {
      res.writeHead(400).end();
    }
  });
}
async function browser() {
  const process = launch(chrome, [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--user-data-dir=/tmp/chrome',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=9222',
    'about:blank',
  ]);
  const tab = await wait(
    async () =>
      (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find((x) => x.type === 'page'),
    18000,
  );
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map(),
    requests = new Map();
  const consoleLog = { errors: 0, warnings: 0, exceptions: 0, logErrors: 0, classes: {} };
  function messageClass(s) {
    if (/hydration|minified react error #4[012]/i.test(s)) return 'react-hydration';
    if (/favicon/i.test(s)) return 'favicon';
    if (/Failed to load resource|ERR_|Failed to fetch/i.test(s)) return 'resource';
    if (/aria-hidden|blocked aria/i.test(s)) return 'accessibility';
    return 'other';
  }
  function counted(s) {
    const k = messageClass(s);
    consoleLog.classes[k] = (consoleLog.classes[k] ?? 0) + 1;
  }
  function reqClass(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return 'invalid-url';
    }
    if (u.protocol === 'data:' || u.protocol === 'blob:') return 'inline';
    if (u.origin !== origin) return u.hostname === '127.0.0.1' ? 'other-loopback' : 'outside';
    if (u.pathname.endsWith('.js')) return 'javascript';
    if (u.pathname.startsWith('/assets/') || /\.(?:ttf|png|jpg|woff2|ico)$/.test(u.pathname)) return 'asset';
    if (u.pathname === '/sign-in' || u.pathname === '/courses') return 'page';
    return 'other-local';
  }
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data),
      p = d.params;
    if (d.id) {
      const h = pending.get(d.id);
      if (h) {
        pending.delete(d.id);
        d.error ? h.fail(Error('cdp')) : h.ok(d.result);
      }
      return;
    }
    if (d.method === 'Runtime.exceptionThrown') {
      consoleLog.exceptions++;
      counted(p.exceptionDetails.exception?.description ?? '');
    }
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) {
      consoleLog[p.type === 'error' ? 'errors' : 'warnings']++;
      counted(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (d.method === 'Log.entryAdded' && p.entry.level === 'error') {
      consoleLog.logErrors++;
      counted(p.entry.text);
    }
    if (d.method === 'Network.requestWillBeSent')
      requests.set(p.requestId, { category: reqClass(p.request.url), status: 0, failed: false });
    const record = p?.requestId ? requests.get(p.requestId) : null;
    if (record && d.method === 'Network.responseReceived') {
      record.status = p.response.status;
      record.fromWorker = !!p.response.fromServiceWorker;
    }
    if (record && d.method === 'Network.loadingFailed') record.failed = true;
  };
  function cdp(method, params = {}) {
    return new Promise((ok, fail) => {
      const n = ++id;
      pending.set(n, { ok, fail });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  }
  async function value(expression) {
    const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error('evaluation');
    return response.result.value;
  }
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map((m) => cdp(m)));
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 850,
    deviceScaleFactor: 1,
    mobile: true,
  });
  function stats() {
    const grouped = {};
    let outside = 0,
      failed = 0,
      scripts = 0,
      loopbackOther = 0;
    for (const r of requests.values()) {
      const k = r.category + '-' + r.status + (r.failed ? '-failed' : '');
      grouped[k] = (grouped[k] ?? 0) + 1;
      if (r.category === 'outside') outside++;
      if (r.category === 'other-loopback') loopbackOther++;
      if (r.failed || r.status >= 400) failed++;
      if (r.category === 'javascript' && r.status === 200 && !r.failed) scripts++;
    }
    return {
      requests: requests.size,
      grouped,
      outside,
      loopbackOther,
      failed,
      loadedScripts: scripts,
      workerDocuments: [...requests.values()].filter(
        (r) => r.category === 'page' && r.fromWorker && r.status === 200,
      ).length,
    };
  }
  async function shutdown() {
    ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
    await wait(() => process.exitCode !== null || !!process.signalCode, 10000);
  }
  return { cdp, value, stats, consoleLog, ws, shutdown, pid: process.pid };
}
const steps = [];
const row = (label) =>
  `[...document.querySelectorAll('[role="checkbox"]')].find(e=>e.innerText.split('\\n').map(s=>s.trim()).includes(${JSON.stringify(label)}))`;
const labels = ['Riz témoin', 'Haricots témoins', 'Pommes témoins'];
const renamed = 'Riz long témoin';
async function step(label, job) {
  phase = label;
  await job();
  steps.push({ step: label, status: 'PASS' });
}
async function network(b, offline) {
  await b.cdp('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await wait(() => b.value('navigator.onLine===' + String(!offline)));
}
async function type(b, element, text) {
  await b.value(`(()=>{const n=${element};if(!n)throw Error();n.focus();n.select();})()`);
  if (text) await b.cdp('Input.insertText', { text });
}
const namedButton = (name) =>
  `[...document.querySelectorAll('button,[role="button"]')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function edit(b, label, name, qty) {
  await b.value(`(${row(label)}).parentElement.querySelector('[aria-label="⋯"]').click()`);
  await wait(() => b.value(`document.body.innerText.includes('Modifier l’article')`));
  const editor = `[...document.querySelectorAll('input')].find(n=>n.value===${JSON.stringify(label)})`;
  await type(b, editor, name);
  await type(b, `[...document.querySelectorAll('input[placeholder="Qté"]')].at(-1)`, qty);
  await b.value(`(${namedButton('Enregistrer')}).click()`);
  await wait(() => b.value(`!!(${row(name)}) && !document.body.innerText.includes('Modifier l’article')`));
}
async function add(b, label, qty) {
  await type(b, `document.querySelector('input[placeholder="Ajouter un article"]')`, label);
  await type(b, `document.querySelector('input[placeholder="Qté"]')`, qty);
  await wait(() =>
    b.value(
      `(()=>{const button=document.querySelector('[aria-label="Ajouter"]');if(!button||button.getAttribute('aria-disabled')==='true')return false;button.click();return true;})()`,
    ),
  );
  await wait(() => b.value(`!!(${row(label)})`));
}
async function toggle(b, label) {
  await b.value(`(${row(label)}).click()`);
}
async function del(b, label) {
  await b.value(`(${row(label)}).parentElement.querySelector('[aria-label="⋯"]').click()`);
  await wait(() => b.value(`!!(${namedButton('Supprimer')})`));
  await b.value(`(${namedButton('Supprimer')}).click()`);
  await wait(() => b.value(`!(${row(label)})`));
}
function expected(rows) {
  return rows
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, quantity, checked]) => ({ name, quantity, checked }));
}
async function view(b, items) {
  return b.value(`(()=>{const expected=${JSON.stringify(items)};const boxes=[...document.querySelectorAll('[role="checkbox"]')];
    if(boxes.length!==expected.length)return false;
    return expected.every(({name,quantity,checked})=>{const box=boxes.find(x=>x.innerText.split('\\n').map(s=>s.trim()).includes(name));if(!box)return false;
      const title=[...box.querySelectorAll('*')].find(n=>n.firstChild?.nodeType===Node.TEXT_NODE&&n.textContent===name);
      return !!title && box.innerText.includes(quantity) && box.innerText.includes('✓')===checked &&
        getComputedStyle(title).textDecorationLine.includes('line-through')===checked;});})()`);
}
async function storage(b) {
  return b.value(`(async()=>{const names=(await indexedDB.databases()).map(x=>x.name);if(!names.includes('folkandjoy-courses'))return null;
    const db=await new Promise((ok,fail)=>{const r=indexedDB.open('folkandjoy-courses');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});
    try{const all=await new Promise((ok,fail)=>{const r=db.transaction('lists').objectStore('lists').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});
      return all.map(x=>typeof x==='string'?JSON.parse(x):x).map(e=>{
        const target=e.base?.find(i=>i.label===${JSON.stringify(renamed)});
        const lastCheck=target && e.pending?.filter(p=>p.command?.itemId===target.id&&p.command.kind==='check').at(-1);
        return {schema:e.schema,revision:e.revision,base:e.base?.length,pending:e.pending?.length,
          observedChecked:lastCheck?.command.payload.checked??target?.checked??null,
          intents:e.pending?.map(p=>({kind:p.command?.kind,status:p.status,attempts:p.attempts}))};
      });}finally{db.close();}})()`);
}
async function listen(site) {
  await new Promise((ok, fail) => {
    site.once('error', fail);
    site.listen(8082, '127.0.0.1', ok);
  });
}
async function stop(site) {
  site.closeAllConnections();
  await new Promise((ok) => site.close(ok));
}

async function expiredSessionProbe(current, fixture, site, expectedAfter) {
  const result = {};
  let mark = 'lock';
  await network(current, true);
  fixture.pause(true);
  await add(current, 'Avoine test', '7');
  result.pendingBeforeExpiry = await storage(current);
  check(
    result.pendingBeforeExpiry?.some((d) => d.pending > 0),
    'journal-avant-expiration',
  );
  const stable = (await fixture.inspect()).receipts;
  await current.value(
    `localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(fixture.expiredSession()))})`,
  );
  await stop(site);
  await current.shutdown();
  let fresh;
  try {
    fresh = await browser();
    result.newProcess = fresh.pid !== current.pid;
    await network(fresh, true);
    await fresh.cdp('Network.setCacheDisabled', { cacheDisabled: true });
    await fresh.cdp('Page.navigate', { url: origin + '/courses' });
    await wait(
      () =>
        fresh.value(`location.pathname==='/sign-in' && !document.querySelector('input[placeholder="Ajouter un article"]') &&
      !document.body.innerText.includes('Avoine test') && !document.querySelector('[role="checkbox"]')`),
      30000,
    );
    result.lockedWithoutPrivateRows = true;
    result.pendingWhileLocked = await storage(fresh);
    check(
      result.pendingWhileLocked?.some((d) => d.pending > 0) && (await fixture.inspect()).receipts === stable,
      'retention-verrou',
    );
    const siteAgain = staticServer();
    await listen(siteAgain);
    fixture.pause(false);
    await network(fresh, false);
    mark = 'formulaire-connexion';
    const emailField = `document.querySelector('input[placeholder="Ton e-mail"]')`;
    await wait(() => fresh.value(`!!(${emailField}) && !!(${namedButton('Recevoir un code')})`), 15000);
    mark = 'demande-code';
    await type(fresh, `document.querySelector('input[placeholder="Ton e-mail"]')`, fixture.identity().email);
    await wait(() =>
      fresh.value(
        `(()=>{const n=${namedButton('Recevoir un code')};if(!n || n.disabled || n.getAttribute('aria-disabled')==='true')return false;n.click();return true;})()`,
      ),
    );
    await wait(() => fresh.value(`!!document.querySelector('input[placeholder="Code reçu"]')`), 15000);
    mark = 'validation-code';
    await type(fresh, `document.querySelector('input[placeholder="Code reçu"]')`, fixture.identity().code);
    await wait(() =>
      fresh.value(
        `(()=>{const n=${namedButton('Entrer')};if(!n || n.disabled || n.getAttribute('aria-disabled')==='true')return false;n.click();return true;})()`,
      ),
    );
    mark = 'restauration-interface';
    const complete = [...expectedAfter, { name: 'Avoine test', quantity: '7', checked: false }].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    await wait(() => view(fresh, complete), 20000);
    mark = 'reprise-journal-sql';
    await wait(
      async () => JSON.stringify((await fixture.inspect()).rows) === JSON.stringify(complete),
      30000,
    );
    await wait(async () => (await storage(fresh))?.every((d) => d.pending === 0), 20000);
    result.dbAfter = await fixture.inspect();
    result.verifiedSyntheticOtp = fixture.stats().otpVerified === 1;
    result.sameScopeJournalDrained = true;
    result.exactlyOneAdditionalReceipt = result.dbAfter.receipts === stable + 1;
    check(result.exactlyOneAdditionalReceipt && result.verifiedSyntheticOtp, 'accuse-renouvellement');
    return result;
  } catch (error) {
    result.failedAt = mark;
    result.error = String(error.message).slice(0, 45);
    result.service = fixture.stats();
    if (fresh) {
      result.browser = fresh.stats();
      result.journal = await storage(fresh).catch(() => null);
    }
    return result;
  } finally {
    if (fresh) await fresh.shutdown().catch(() => {});
  }
}

async function run() {
  const qualification = proveProfile();
  for (const p of [root, '/tmp/home', '/tmp/pkg', '/tmp/chrome']) fs.mkdirSync(p, { mode: 0o700 });
  const lines = require('node:readline').createInterface({ input: process.stdin, crlfDelay: Infinity });
  const input = await new Promise((ok) => lines.once('line', (s) => ok(JSON.parse(s)))),
    auth = input.profile === 'authenticated';
  let seq = 0;
  const queries = new Map();
  lines.on('line', (line) => {
    const reply = JSON.parse(line),
      task = queries.get(reply.id);
    if (task) {
      queries.delete(reply.id);
      reply.error ? task.fail(Error(reply.error)) : task.ok(reply.value);
    }
  });
  function sql(query) {
    return new Promise((ok, fail) => {
      const id = ++seq;
      queries.set(id, { ok, fail });
      process.stdout.write(JSON.stringify({ id, query }) + '\n');
    });
  }
  phase = 'archive';
  fs.writeFileSync('/tmp/project.tar', Buffer.from(input.archive64, 'base64'));
  await complete(
    '/usr/bin/tar',
    ['-xf', '/tmp/project.tar', '-C', root, '--no-same-owner', '--no-same-permissions'],
    root,
  );
  fs.unlinkSync('/tmp/project.tar');
  fs.writeFileSync('/tmp/service.cjs', input.adapter);
  const fixture = await require('/tmp/service.cjs').createService(origin, input.scope, sql);
  const config = fs.readFileSync(app + '/app.json');
  check(JSON.parse(config).expo.web.output === 'static', 'config');
  phase = 'installation';
  await install(input);
  phase = 'export';
  await complete('/usr/bin/node', [
    root + '/node_modules/expo/bin/cli',
    'export',
    '--platform',
    'web',
    '--output-dir',
    output,
    '--max-workers',
    '2',
  ]);
  await complete('/usr/bin/node', [app + '/scripts/prepare-offline-web.mjs', output]);
  const worker = fs.readFileSync(output + '/fj-offline-worker.js', 'utf8');
  const manifest = JSON.parse(worker.split(';\n')[0].slice('self.FJ_OFFLINE_EXPORT='.length));
  const exported = {
    mode: 'static',
    configUnchanged: sha(config) === sha(fs.readFileSync(app + '/app.json')),
    shellVersion: manifest.version,
    publicResources: manifest.files.length,
    bytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
    documents: manifest.files.filter((f) => f.document).map((f) => f.path),
  };
  const service = fixture.stats;
  let site = staticServer(),
    first,
    second,
    png = null;
  const evidence = {};
  const initial = expected([
    [renamed, '4', true],
    [labels[1], '2', false],
    [labels[2], '3', false],
  ]);
  const final = expected([
    [renamed, '4', false],
    [labels[1], '5', false],
    ['Poire témoin', '6', false],
  ]);
  try {
    await listen(site);
    first = await browser();
    phase = 'connectivite-locale';
    await network(first, false);
    if (auth) {
      const seed = await first.cdp('Page.addScriptToEvaluateOnNewDocument', {
        source: `if(location.origin===${JSON.stringify(origin)})localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(fixture.session))})`,
      });
      await first.cdp('Page.navigate', { url: origin + '/courses' });
      await wait(() => first.value('document.readyState==="complete"'));
      await first.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier });
    } else {
      await first.cdp('Page.navigate', { url: origin + '/sign-in' });
      await wait(() =>
        first.value(
          `(()=>{const b=${namedButton('Continuer sans e-mail (preview)')};if(!b||!Object.keys(b).some(k=>k.startsWith('__reactFiber')))return false;b.click();return true;})()`,
        ),
      );
    }
    await step('session-courses', async () => {
      await wait(
        () =>
          first.value(
            `location.pathname==='/courses' && !!document.querySelector('input[placeholder="Ajouter un article"]')`,
          ),
        23000,
      );
      evidence.previewBanner = await first.value(`document.body.innerText.includes('Preview locale')`);
      check(evidence.previewBanner === !auth, 'profil');
    });
    await step('cache-pret', async () => {
      await wait(() => first.value('!!navigator.serviceWorker.controller'), 30000);
      const keys = await first.value(
        `(async()=>{const out=[];for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())out.push(new URL(r.url).pathname);return out;})()`,
      );
      const allowed = new Set(manifest.files.map((f) => new URL(f.source, origin).pathname));
      evidence.cacheMatchesBuild = keys.length === allowed.size && keys.every((k) => allowed.has(k));
      check(evidence.cacheMatchesBuild, 'cache-divergent');
    });
    await step('creer-trois-articles', async () => {
      for (let i = 0; i < 3; i++) await add(first, labels[i], String(i + 1));
    });
    await step('renommer-changer-quantite-cocher', async () => {
      await edit(first, labels[0], renamed, '4');
      await toggle(first, renamed);
      await wait(() => view(first, initial));
    });
    if (auth) {
      try {
        await wait(
          async () => JSON.stringify((await fixture.inspect()).rows) === JSON.stringify(initial),
          15000,
        );
      } catch {
        /* Keep the unresolved journal and continue the cold-start scenario. */
      }
      evidence.databaseBefore = await fixture.inspect();
      evidence.beforeNetworkCut = await storage(first);
      const converged = JSON.stringify(evidence.databaseBefore.rows) === JSON.stringify(initial);
      steps.push({
        step: 'verification-service-initial',
        status: converged ? 'PASS' : 'FAIL',
        windowSeconds: 15,
      });
    }
    const before = service();
    evidence.initialState = initial;
    await step('cocher-apres-coupure', async () => {
      await first.cdp('Network.clearBrowserCache');
      await network(first, true);
      fixture.pause(true);
      await stop(site);
      evidence.originStopped = true;
      const baseline = auth ? (await fixture.inspect()).receipts : 0;
      evidence.offlineBeforeClose = [];
      for (const checked of [false, true]) {
        await toggle(first, renamed);
        const items = initial.map((item) => (item.name === renamed ? { ...item, checked } : item));
        await wait(() => view(first, items));
        const persisted = await wait(async () => {
          const doc = (await storage(first))?.find((d) => d.observedChecked === checked);
          return doc ?? false;
        });
        const aria = await first.value(`(${row(renamed)}).getAttribute('aria-checked')`);
        evidence.offlineBeforeClose.push({
          visibleChecked: checked,
          ariaChecked: aria,
          persistedChecked: persisted.observedChecked,
          revision: persisted.revision,
          journalSize: persisted.pending,
        });
      }
      evidence.receiptsDuringOfflineToggles = auth ? (await fixture.inspect()).receipts - baseline : 0;
      check(
        evidence.offlineBeforeClose[1].revision > evidence.offlineBeforeClose[0].revision &&
          evidence.receiptsDuringOfflineToggles === 0,
        'ecriture-coche-hors-ligne',
      );
    });
    await step('coupure-et-fermeture', async () => {
      evidence.beforeClose = await storage(first);
      evidence.initialNetwork = first.stats();
      evidence.initialConsole = first.consoleLog;
      check(!evidence.initialNetwork.outside, 'sortie-reseau');
      await first.shutdown();
      evidence.firstExited = true;
    });
    await step('nouveau-processus-hors-ligne', async () => {
      second = await browser();
      evidence.changedPid = second.pid !== first.pid;
      check(evidence.changedPid, 'pid');
      await second.cdp('Network.setCacheDisabled', { cacheDisabled: true });
      await network(second, true);
      const navigation = await second.cdp('Page.navigate', { url: origin + '/courses' });
      check(!navigation.errorText, 'navigation');
      await wait(() => view(second, initial), 18000);
      evidence.clientOffline = await second.value('!navigator.onLine');
      evidence.documentFromWorker = second.stats().workerDocuments > 0;
      check(evidence.clientOffline && evidence.documentFromWorker, 'cold-cache');
      evidence.afterCold = await storage(second);
      evidence.coldNetwork = second.stats();
      evidence.accessDuringCold = service().authenticatedReads - before.authenticatedReads;
      evidence.appliedDuringCold = service().receipts - before.receipts;
      check(evidence.accessDuringCold === 0 && evidence.appliedDuringCold === 0, 'service-cold');
      png = (await second.cdp('Page.captureScreenshot', { format: 'png', fromSurface: true })).data;
    });
    await step('crud-hors-ligne', async () => {
      await add(second, 'Poire témoin', '6');
      await edit(second, labels[1], labels[1], '5');
      await toggle(second, renamed);
      await del(second, labels[2]);
      await wait(() => view(second, final));
      evidence.offlineState = final;
      evidence.offlineStorage = await storage(second);
      check(service().receipts === before.receipts, 'mutation-remote-offline');
    });
    await step('reconnexion', async () => {
      site = staticServer();
      await listen(site);
      fixture.pause(false);
      await network(second, false);
      if (auth)
        await wait(
          async () => JSON.stringify((await fixture.inspect()).rows) === JSON.stringify(final),
          30000,
        );
      await second.cdp('Page.reload', { ignoreCache: true });
      await wait(() => view(second, final), 18000);
      evidence.finalStorage = await storage(second);
      evidence.databaseAfter = auth ? await fixture.inspect() : null;
      evidence.finalService = service();
    });
    if (auth)
      await step('reconnexion-sans-double-application', async () => {
        const prior = service().receipts;
        await network(second, true);
        await delay(250);
        await network(second, false);
        await delay(1500);
        const after = await fixture.inspect();
        check(
          service().receipts === prior &&
            after.receipts === evidence.databaseAfter.receipts &&
            JSON.stringify(after.rows) === JSON.stringify(final),
          'duplicate',
        );
        evidence.receiptsStable = true;
      });
    evidence.browserNetwork = second.stats();
    evidence.finalConsole = second.consoleLog;
    check(!evidence.browserNetwork.outside && !evidence.finalConsole.exceptions, 'navigateur');
    if (auth) {
      phase = 'expiration-et-reprise';
      evidence.expiry = await expiredSessionProbe(second, fixture, site, final);
      steps.push({
        step: phase,
        status:
          evidence.expiry.exactlyOneAdditionalReceipt && evidence.expiry.verifiedSyntheticOtp
            ? 'PASS'
            : 'FAIL',
      });
    }
  } catch (error) {
    steps.push({
      step: phase,
      status: 'FAIL',
      reason: String(error.message)
        .slice(0, 40)
        .replace(/[^a-z0-9-]/gi, ''),
    });
    const b = second ?? first;
    if (b) {
      evidence.lastView = await b
        .value(
          `({courses:location.pathname==='/courses',signIn:location.pathname==='/sign-in',form:!!document.querySelector('input[placeholder="Ajouter un article"]'),rows:document.querySelectorAll('[role="checkbox"]').length,editor:document.body.innerText.includes('Modifier l’article'),offline:!navigator.onLine,controller:!!navigator.serviceWorker.controller})`,
        )
        .catch(() => null);
      evidence.browserNetwork = b.stats();
    }
    if (auth) {
      evidence.failureDatabase = await fixture.inspect().catch(() => null);
      if (b) evidence.failureStorage = await storage(b).catch(() => null);
    }
    evidence.finalService = service();
  }
  return {
    status: steps.some((s) => s.status === 'FAIL') ? 'FAILED' : 'PASS',
    qualification,
    exported,
    steps,
    evidence,
    png,
    serviceType: auth ? 'loopback-http-real-postgres' : 'synthetic-preview-local',
    knownLimit: 'browser-only',
  };
}
run().then(
  (r) => process.stdout.write(JSON.stringify({ result: r }) + '\n', () => process.exit(0)),
  () => {
    console.error('G52_ERROR ' + phase);
    process.exit(1);
  },
);

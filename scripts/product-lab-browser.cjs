'use strict';
// Trusted browser driver. The only data accepted on stdin is the single HTML fixture.
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const chromePath = '/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell';

async function readBytes() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 131072) throw Error('input_limit');
    chunks.push(chunk);
  }
  if (!size) throw Error('empty_input');
  return Buffer.concat(chunks);
}

async function capture() {
  const html = await readBytes();
  const route = '/' + randomUUID();
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== route) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    }).end(html);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const browser = spawn(chromePath, [
    '--remote-debugging-pipe', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
    '--disable-crash-reporter', '--disable-background-networking', '--disable-sync',
    '--disable-extensions', '--disable-dev-shm-usage', '--no-first-run', '--user-data-dir=/tmp/lab-browser',
    '--blink-settings=scriptEnabled=false', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], env: { HOME: '/tmp', PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  let id = 0, session, buffer = '', closed = false;
  const pending = new Map();
  const close = () => {
    closed = true;
    for (const { reject } of pending.values()) reject(Error('browser_closed'));
    pending.clear();
  };
  browser.once('error', close);
  browser.once('exit', close);
  browser.stdio[3].on('error', close);
  browser.stdio[4].setEncoding('utf8').on('data', chunk => {
    buffer += chunk;
    let pos;
    while ((pos = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, pos));
      buffer = buffer.slice(pos + 1);
      const p = pending.get(message.id);
      if (!p) continue;
      pending.delete(message.id);
      if (message.error) p.reject(Error('browser_protocol')); else p.resolve(message.result);
    }
  });
  function send(method, params = {}, useSession = true) {
    if (closed) return Promise.reject(Error('browser_closed'));
    const key = ++id;
    const packet = { id: key, method, params, sessionId: useSession ? session : undefined };
    return new Promise((resolve, reject) => {
      pending.set(key, { resolve, reject });
      browser.stdio[3].write(JSON.stringify(packet) + '\0');
    });
  }
  try {
    const version = (await send('Browser.getVersion', {}, false)).product;
    const target = await send('Target.createTarget', { url: 'about:blank' }, false);
    session = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, false)).sessionId;
    await send('Page.enable');
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const address = origin + route;
    const navigation = await send('Page.navigate', { url: address });
    if (navigation.errorText || !navigation.loaderId) throw Error('navigation_failed');
    let doc;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('DOM.getDocument', { depth: 1 });
      if (result.root.documentURL === address) { doc = result.root; break; }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (!doc) throw Error('missing_document');
    const find = async selector => (await send('DOM.querySelectorAll', { nodeId: doc.nodeId, selector })).nodeIds;
    const titleNodes = await find('head title');
    let hasTitle = false;
    if (titleNodes[0]) {
      const title = (await send('DOM.describeNode', { nodeId: titleNodes[0], depth: 1 })).node;
      hasTitle = (title.children ?? []).some(n => n.nodeType === 3 && n.nodeValue.trim().length > 0);
    }
    const h1 = (await find('h1')).length;
    const main = (await find('main,[role="main"]')).length;
    const language = (await find('html[lang]:not([lang=""])')).length === 1;
    const forbiddenScripts = (await find('script')).length;
    const screenshot = (await send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data;
    if (Buffer.byteLength(screenshot, 'base64') > 524288) throw Error('screenshot_limit');
    return { version, hasTitle, h1, main, language, forbiddenScripts, screenshot };
  } finally {
    browser.kill('SIGKILL');
    server.closeAllConnections();
    server.close();
  }
}
capture().then(data => process.stdout.write(JSON.stringify(data)), () => {
  process.stderr.write('capture_failed\n');
  process.exitCode = 1;
});

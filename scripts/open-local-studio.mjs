import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright-core';
import { getCredentials, validPort } from '../src/config.ts';

// This launcher runs under the Windows account allowed to read the Studio configuration.
// Keep those credentials out of Chrome's environment, the clipboard and the address bar.
const config = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const identity = parseEnv(await readFile(new URL('../.env.human.local', import.meta.url), 'utf8'));
const port = validPort(config.A1_PORT);
const origin = 'http://127.0.0.1:' + port;
if (identity.STUDIO_HUMAN_AUTH !== '1' || identity.STUDIO_LOCAL_ADMIN_PASSWORD_ONLY !== '1') {
  throw new Error('Le choix du mot de passe local est désactivé sur cette instance.');
}

// Refuse to send the local operator key if a different program is listening on this port.
const verifyListener = `
  $ErrorActionPreference = 'Stop'
  $connections = @(Get-NetTCPConnection -State Listen -LocalPort ${port})
  if ($connections.Count -ne 1 -or $connections[0].LocalAddress -ne '127.0.0.1') { exit 1 }
  $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $connections[0].OwningProcess)
  if ($proc.ExecutablePath -ne $env:STUDIO_EXPECTED_NODE -or $proc.CommandLine -notlike '*--env-file=.env.local --env-file=.env.human.local src/main.ts*') { exit 1 }
`;
function checkListener() {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', verifyListener], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, STUDIO_EXPECTED_NODE: process.execPath },
  });
}

let browser;
try {
  checkListener();
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: null });
  const first = await context.request.get(origin, { maxRedirects: 0 });
  if (first.status() !== 200) throw new Error('Studio indisponible');
  const start = await first.text();
  let path = '/';
  if (start.includes('<h1>Activer admin-local</h1>')) {
    const principal = getCredentials(config.A1_CREDENTIALS_JSON).find(c => c.kind === 'operator' && c.id === 'operator-local');
    if (!principal) throw new Error('Configuration opérateur absente');
    checkListener();
    const result = await context.request.post(origin + '/enroll', {
      headers: { Origin: origin }, form: { invitation: principal.token }, maxRedirects: 0,
    });
    if (result.status() !== 303 || result.headers().location !== '/enroll/confirm') throw new Error('Activation indisponible');
    path = '/enroll/confirm';
  } else if (!start.includes('<h1>Ouvrir le Studio</h1>')) {
    throw new Error('Écran de connexion inattendu');
  }
  const page = await context.newPage();
  await page.goto(origin + path);
  await page.bringToFront();
  // The user enters the password directly in the Studio. Closing this window ends the launcher.
  await new Promise(resolve => {
    page.once('close', resolve);
    browser.once('disconnected', resolve);
  });
} catch {
  console.error('Impossible d’ouvrir le Studio local. Vérifiez que le Studio et Chrome sont disponibles.');
  process.exitCode = 1;
} finally {
  if (browser?.isConnected()) await browser.close();
}

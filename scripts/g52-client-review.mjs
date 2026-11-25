import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const commit = 'd0d8f110c7ebb6b3a0a354dd97ba8574dc3ba86e';
const pins = {
  'apps/homeos/lib/session-binding.ts': 'c78a394081d650263efc7b1ed3b271fe473966a1',
  'apps/homeos/lib/session-context.tsx': '49f2524f2a4fecb91b63deacda04e7ca5aa2ca88',
  'packages/data/src/courses-local.ts': 'f50ae158ce887d49dcd9e2e227b169d3ea6fd65f',
  'packages/data/src/courses-quantity.ts': 'b9fbd9a4a89f1add7a61bbc49a142e37c0c0a5e1',
  'packages/data/src/courses-snapshot.ts': 'f440e8cc083fcfb6170b1190e42a13a945f78b1b',
  'packages/data/src/courses-storage.ts': '0a8a2b5c8ce840e920269387e8e1781c62f1f137',
  'packages/data/src/list-items-map.ts': 'a07fa59c0a490aa22035475c18ed99f1883a7dcc',
};
const args = process.argv.slice(2);
const opt = (name, fallback) =>
  args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const location = opt('source', null);
if (!location) throw Error('Indiquer --source <checkout mobile>');
const source = resolve(location);
const binary = process.platform === 'win32' ? 'git.exe' : 'git';
const git = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, binary)).find(existsSync);
if (!git) throw Error('Git requis dans le PATH du poste de recette');
const env = {
  SystemRoot: process.env.SystemRoot,
  PATH: dirname(git),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_ALLOW_PROTOCOL: 'none',
  GIT_TERMINAL_PROMPT: '0',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
};
const readGit = (...cmd) =>
  execFileSync(git, ['--no-optional-locks', '-C', source, ...cmd], {
    env,
    windowsHide: true,
    timeout: 8000,
  });
const texts = {};
for (const [path, id] of Object.entries(pins)) {
  if (
    !readGit('ls-tree', commit, '--', path)
      .toString()
      .startsWith('100644 blob ' + id + '\t')
  )
    throw Error('Arbre non conforme');
  const bytes = readGit('cat-file', 'blob', id);
  if (
    createHash('sha1')
      .update('blob ' + bytes.length + '\0')
      .update(bytes)
      .digest('hex') !== id
  )
    throw Error('Blob non conforme');
  texts[path] = bytes.toString('utf8');
}
function load(path, imports, globals = {}) {
  const js = ts.transpileModule(texts[path], {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const context = createContext(globals);
  const exported = {};
  runInContext('(function(exports,require){' + js + '\n})', context, { filename: path })(
    exported,
    (k) => {
      if (!Object.hasOwn(imports, k)) throw Error('Module hors profil : ' + k);
      return imports[k];
    },
  );
  return exported;
}

const scope = {
  userId: '00000000-0000-4000-8000-000000000001',
  householdId: '00000000-0000-4000-8000-000000000002',
  listId: '00000000-0000-4000-8000-000000000003',
};
const timestamp = '2026-01-01T00:00:00Z';
const { mapListItemRow } = load('packages/data/src/list-items-map.ts', {});
const { nativeCourseStorage } = load('packages/data/src/courses-storage.ts', {});
const { CourseStore, courseItems } = load('packages/data/src/courses-local.ts', {
  '@homeos/domain': { SHOPPING_CATEGORIES: [] },
  './courses-quantity': load('packages/data/src/courses-quantity.ts', {}),
});
async function snapshotProbe(partial, deniedOrError) {
  const items = Array.from({ length: 7 }, (_, i) => ({
    id: String(i + 1),
    list_id: scope.listId,
    household_id: scope.householdId,
    label: 'Article synthétique ' + i,
    label_normalized: 'article ' + i,
    category: null,
    quantity: '1',
    unit: null,
    checked: false,
    checked_at: null,
    checked_by: null,
    position: i,
    scope: 'shared',
    created_by: scope.userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }));
  let calls = 0;
  const supabase = {
    from() {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        gt() {
          return query;
        },
        async abortSignal() {
          calls++;
          return {
            data: deniedOrError === 'empty' ? [] : items.slice(0, partial),
            count: null,
            error: deniedOrError === 'error' ? new Error('synthetic outage') : null,
          };
        },
      };
      return query;
    },
  };
  const { fetchCourseSnapshot } = load('packages/data/src/courses-snapshot.ts', {
    './supabase': { getSupabaseClient: () => supabase },
    './list-items-map': { mapListItemRow, LIST_ITEM_SELECT: 'fixture' },
  });
  let raw = null;
  const storage = nativeCourseStorage({
    getItem: async () => raw,
    setItem: async (_, v) => {
      raw = v;
    },
  });
  const store = new CourseStore(scope, storage, {
    freshId: () => {
      throw Error('Aucune mutation demandée');
    },
  });
  await store.open();
  await store.acceptSnapshot(0, items.map(mapListItemRow));
  let applied = false;
  try {
    const result = await fetchCourseSnapshot(scope, new AbortController().signal);
    applied = await store.acceptSnapshot(store.getSnapshot().revision, result);
  } catch (error) {
    if (deniedOrError !== 'error') throw error;
  }
  return {
    initial: 7,
    availableOnServer: deniedOrError === 'empty' ? null : 7,
    syntheticMode: deniedOrError ?? 'cap',
    serverCalls: calls,
    accepted: applied,
    cacheAfter: courseItems(store.getSnapshot()).length,
  };
}

// Exercise the provider callbacks while explicitly controlling clock, effects and timer dispatch.
// This React hook scheduler models a suspended event loop. It does not emulate Android or iOS.
async function expiryProbe(longToken) {
  let clock = Date.parse(timestamp),
    cursor = 0,
    scheduled = [],
    dirty = false;
  const DateFixture = class extends Date {
    static now() {
      return clock;
    }
  };
  const globals = { Date: DateFixture };
  const binding = load('apps/homeos/lib/session-binding.ts', {}, globals);
  const slots = [],
    timers = new Map();
  let timerId = 0,
    authListener;
  const sameDeps = (a, b) => a?.length === b?.length && b.every((v, i) => Object.is(v, a[i]));
  const memo = (fn, deps) => {
    const i = cursor++;
    if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useCallback: (fn, deps) => memo(() => fn, deps),
    useMemo: memo,
    useRef: (value) => {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState: (initial) => {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [
        slots[i].value,
        (v) => {
          if (!Object.is(v, slots[i].value)) {
            slots[i].value = v;
            dirty = true;
          }
        },
      ];
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) {
        scheduled.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const tokenSec = longToken ? 30 * 86400 : 10;
  const session = {
    user: { id: scope.userId, user_metadata: {} },
    expires_at: clock / 1000 + tokenSec,
  };
  const fixtureBinding = binding.encodeBinding({
    membership: { userId: scope.userId, householdId: scope.householdId, role: 'owner' },
    list: { id: scope.listId },
  });
  const sdk = {
    auth: {
      onAuthStateChange: (fn) => {
        authListener = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession: async () => ({ data: { session } }),
    },
  };
  const mod = load(
    'apps/homeos/lib/session-context.tsx',
    {
      './native-auth-storage': {},
      '@homeos/data': { getSupabaseClientOptional: () => sdk },
      '@react-native-async-storage/async-storage': {
        default: { getItem: async () => fixtureBinding },
      },
      react,
      'react/jsx-runtime': { jsx: (_, props) => props.value },
      './crypto': {},
      './network-context': { useNetwork: () => ({ isOnline: false }) },
      './session-binding': binding,
      './preview-auth-bypass': { isDevAuthBypassEnabled: () => false },
    },
    {
      ...globals,
      setTimeout: (fn, ms) => {
        const id = ++timerId;
        timers.set(id, { fn, at: clock + ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  let value;
  const render = () => {
    cursor = 0;
    dirty = false;
    value = mod.SessionProvider({ children: null });
    const effects = scheduled;
    scheduled = [];
    effects.forEach((f) => f());
  };
  const settle = async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setImmediate(r));
      if (dirty) render();
    }
  };
  const fireDue = () => {
    for (const [key, t] of timers)
      if (t.at <= clock) {
        timers.delete(key);
        t.fn();
      }
  };
  render();
  await settle();
  if (typeof authListener !== 'function' || value.list?.id !== scope.listId || timers.size !== 1)
    throw Error('Session synthétique non amorcée');
  const firstTimer = [...timers.values()][0].at;
  if (longToken) {
    clock = firstTimer;
    fireDue();
    await settle();
  }
  clock = session.expires_at * 1000 + 50;
  render();
  await settle();
  const beforeDispatch = Boolean(value.session && value.membership && value.list);
  fireDue();
  await settle();
  return {
    tokenSeconds: tokenSec,
    firstTimerDelayMs: firstTimer - Date.parse(timestamp),
    clockPastExpiry: true,
    usableByPredicate: binding.sessionUsable(session.expires_at),
    scopeVisibleBeforeTimerDispatch: beforeDispatch,
    scopeVisibleAfterTimerDispatch: Boolean(value.session && value.membership && value.list),
  };
}
const cases = {
  shortPage: await snapshotProbe(2),
  emptyRlsShape: await snapshotProbe(0, 'empty'),
  networkFailure: await snapshotProbe(0, 'error'),
  ordinaryExpiration: await expiryProbe(false),
  longExpiration: await expiryProbe(true),
};
// Assertions establish the behavior of this exact revision, including its known failures.
assert.equal(cases.shortPage.cacheAfter, 2);
assert.equal(cases.emptyRlsShape.cacheAfter, 0);
assert.equal(cases.networkFailure.cacheAfter, 7);
assert.equal(cases.ordinaryExpiration.scopeVisibleBeforeTimerDispatch, true);
assert.equal(cases.ordinaryExpiration.scopeVisibleAfterTimerDispatch, false);
assert.equal(cases.longExpiration.scopeVisibleAfterTimerDispatch, true);
const report = {
  schema: 1,
  commit,
  sourceBlobs: pins,
  profile: 'Fonctions committées, PostgREST/AsyncStorage/React/horloge synthétiques hors réseau',
  node: process.version,
  rawEvidence: cases,
  date: new Date().toISOString(),
};
const file = opt('evidence', null);
if (file) writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(cases));

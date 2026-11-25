import { startLab, alice, household, list, image } from './g52-sql-lab.mjs';
import { createHash } from 'node:crypto';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function webDatabase(git, revision) {
  const migrations = (await git(['ls-tree', '-r', '--name-only', revision, '--', 'supabase/migrations']))
    .toString()
    .trim()
    .split('\n');
  if (!migrations.length || migrations.some((p) => !/^supabase\/migrations\/\d+_[a-z0-9_]+\.sql$/.test(p)))
    throw Error('Migrations hors profil.');
  const paths = [
    'supabase/tests/harness/00_auth_stub.sql',
    ...migrations.sort(),
    'supabase/tests/harness/01_grants.sql',
  ];
  const texts = [];
  for (const path of paths) texts.push((await git(['cat-file', 'blob', revision + ':' + path])).toString());
  const sql = texts.join('\n'),
    lab = await startLab({ sql });
  const activeRows = `select coalesce(jsonb_agg(to_jsonb(i) order by i.position),'[]'::jsonb) from public.list_items i
    where list_id='${list}' and deleted_at is null`;
  const load = async (query) => JSON.parse(await lab.as(alice, query));
  async function inspect() {
    const rows = await load(activeRows);
    const receipts = Number(
      await lab.query(`select count(*) from public.course_operation_receipts where list_id='${list}'`),
    );
    return {
      rows: rows
        .map((r) => ({ name: r.label, quantity: r.quantity, checked: r.checked }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      receipts,
    };
  }
  async function request(operation) {
    if (operation.name === 'inspect') return inspect();
    if (operation.name === 'read') {
      switch (operation.table) {
        case 'list_items':
          return load(activeRows);
        case 'lists':
          return load(
            `select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.lists l where l.id='${list}' and l.deleted_at is null`,
          );
        case 'household_members':
          return load(
            `select coalesce(jsonb_agg(jsonb_build_object('household_id',m.household_id,'user_id',m.user_id,'role',m.role,'status',m.status,'profiles',jsonb_build_object('display_name','Profil test'))),'[]') from public.household_members m where m.household_id='${household}' and m.status='active'`,
          );
        case 'shopping_catalog':
          return load(
            `select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.shopping_catalog c where c.household_id='${household}'`,
          );
        default:
          throw Error('Table hors profil.');
      }
    }
    const p = operation.body;
    if (
      operation.name !== 'apply' ||
      !p ||
      p.p_actor_id !== alice ||
      p.p_list_id !== list ||
      p.p_household_id !== household ||
      !uuid.test(p.p_item_id) ||
      !uuid.test(p.p_operation_id) ||
      !['add', 'update', 'check', 'delete', 'restore'].includes(p.p_kind) ||
      !p.p_payload ||
      typeof p.p_payload !== 'object' ||
      Array.isArray(p.p_payload)
    )
      throw Error('RPC hors profil.');
    const body = Buffer.from(JSON.stringify(p.p_payload));
    if (body.length > 4096) throw Error('Payload trop grand.');
    return load(
      `select public.apply_course_command('${p.p_operation_id}','${alice}','${household}','${list}','${p.p_item_id}','${p.p_kind}',convert_from(decode('${body.toString('hex')}','hex'),'UTF8')::jsonb)`,
    );
  }
  return {
    request,
    scope: { userId: alice, householdId: household, listId: list },
    close: lab.close,
    profile: {
      image,
      migrations: migrations.length,
      migrationBundleSha256: createHash('sha256').update(sql).digest('hex'),
      network: 'none',
      role: 'authenticated',
    },
  };
}

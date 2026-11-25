import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DomainError, isProjectId, type HumanRole, type Operator } from './contracts.ts';
import { transaction } from './database.ts';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const invalid = () => new DomainError(401, 'identity', 'Identifiants ou code temporaires invalides.');
const accountId = /^[a-z][a-z0-9-]{1,39}$/;
const roleNames = ['admin','operator','viewer'];
export function identityKey(raw = process.env.STUDIO_TOTP_MASTER): Buffer {
  if (!raw || !/^[a-zA-Z0-9_-]{43}$/.test(raw)) throw new Error('Configuration locale du second facteur requise.');
  return Buffer.from(raw, 'base64url');
}
export async function verifyIdentityMode(pool:Pool,key?:Buffer) {
  await transaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(8442,15)');
    const stored=(await client.query('SELECT key_fingerprint FROM studio_identity_policy')).rows[0];
    if (key) {
      const fingerprint=createHash('sha256').update(key).digest('hex');
      if (stored && stored.key_fingerprint!==fingerprint) throw new Error('La clé locale ne correspond pas à cette instance.');
      if (!stored) await client.query('INSERT INTO studio_identity_policy(key_fingerprint) VALUES($1)',[fingerprint]);
    } else if (stored || (await client.query('SELECT 1 FROM studio_accounts LIMIT 1')).rowCount) {
      throw new Error('La configuration du second facteur est requise pour cette instance.');
    }
  });
}
function seal(key: Buffer, id: string, bytes: Buffer) {
  const iv = randomBytes(12);
  const box = createCipheriv('aes-256-gcm',key,iv);
  box.setAAD(Buffer.from(id));
  const cipher = Buffer.concat([box.update(bytes),box.final()]);
  return [iv,box.getAuthTag(),cipher].map(b=>b.toString('base64url')).join('.');
}
function open(key: Buffer, id: string, value: string) {
  const [iv,tag,bytes] = value.split('.').map(s=>Buffer.from(s,'base64url'));
  const box = createDecipheriv('aes-256-gcm',key,iv);
  box.setAAD(Buffer.from(id));
  box.setAuthTag(tag);
  return Buffer.concat([box.update(bytes),box.final()]);
}
function base32(bytes: Buffer) {
  let bits=0, value=0, out='';
  for (const byte of bytes) {
    value=(value<<8)|byte; bits+=8;
    while(bits>=5) { bits-=5; out+=alphabet[(value>>>bits)&31]; }
  }
  return bits ? out+alphabet[(value<<(5-bits))&31] : out;
}
export function totp(secret: Buffer, counter: number, digits=6) {
  const payload=Buffer.alloc(8); payload.writeBigUInt64BE(BigInt(counter));
  const mac=createHmac('sha1',secret).update(payload).digest();
  const offset=mac[mac.length-1]&15;
  return ((mac.readUInt32BE(offset)&0x7fffffff) % 10**digits).toString().padStart(digits,'0');
}
function validCounter(secret: Buffer, code: unknown, now: number, last: number) {
  if (typeof code!=='string' || !/^\d{6}$/.test(code)) return null;
  const step=Math.floor(now/30000);
  for(const counter of [step,step-1,step+1]) {
    if(counter>=0 && counter>last && timingSafeEqual(Buffer.from(code),Buffer.from(totp(secret,counter)))) return counter;
  }
  return null;
}
function passwordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},
    (error,key)=>error?reject(error):resolve(key)));
}
function requireAdmin(actor: Operator) {
  if (actor.accountRole!=='admin') throw new DomainError(403,'admin','Un compte administrateur est requis.');
}
async function audit(client: PoolClient, actor:string, action:string, subject:string) {
  await client.query('INSERT INTO studio_access_events(actor,action,subject) VALUES($1,$2,$3)',[actor,action,subject]);
}
async function scopes(client: PoolClient, id: string) {
  return (await client.query<{project_id:string}>('SELECT project_id FROM studio_account_projects WHERE account_id=$1 ORDER BY project_id',[id])).rows.map(r=>r.project_id);
}
export class HumanAccess {
  readonly pool: Pool;
  private key: Buffer;
  private recent: number[] = [];
  private active = 0;
  constructor(pool:Pool,key:Buffer) { this.pool=pool; this.key=key; }

  /** Limits local resource consumption even for unknown account names. Account lockouts persist in SQL. */
  private async limited<T>(work:()=>Promise<T>) {
    const now=Date.now();
    this.recent=this.recent.filter(time=>now-time<60000);
    if(this.recent.length>=40 || this.active>=3) throw new DomainError(429,'throttled','Patientez avant une nouvelle tentative.');
    this.recent.push(now); this.active++;
    try { return await work(); } finally { this.active--; }
  }
  async invite(actor:Operator,id:string,role:HumanRole,projects:string[]) {
    requireAdmin(actor);
    if(!accountId.test(id) || !roleNames.includes(role) || !projects.length || projects.some(p=>!isProjectId(p)||!actor.projectIds.includes(p)))
      throw new DomainError(400,'scope','Identifiant, rôle ou projets invalides.');
    const code=token();
    await transaction(this.pool,async client=>{
      const inserted=await client.query("INSERT INTO studio_accounts(id,role,invite_digest,invite_until) VALUES($1,$2,$3,now()+interval '30 minutes') ON CONFLICT DO NOTHING RETURNING id",[id,role,hash(code)]);
      if(!inserted.rowCount) throw new DomainError(409,'account_exists','Ce compte existe déjà.');
      await client.query('INSERT INTO studio_account_projects SELECT $1, unnest($2::text[])',[id,[...new Set(projects)]]);
      await audit(client,actor.id,'invite',id);
    });
    return code;
  }
  async begin(code:string,bootstrap: { token:string; projectIds:readonly string[] } | undefined) {
    return this.limited(async()=>transaction(this.pool,async client=>{
      if(typeof code!=='string'||code.length>160) throw invalid();
      const digest=hash(code);
      let id:string;
      if(bootstrap && timingSafeEqual(Buffer.from(hash(bootstrap.token)),Buffer.from(digest))) {
        await client.query('SELECT pg_advisory_xact_lock(8442,12)');
        if((await client.query('SELECT 1 FROM studio_accounts WHERE enrolled_at IS NOT NULL LIMIT 1')).rowCount) throw invalid();
        id='admin-local';
        await client.query("INSERT INTO studio_accounts(id,role) VALUES($1,'admin') ON CONFLICT DO NOTHING",[id]);
        await client.query('INSERT INTO studio_account_projects SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[id,bootstrap.projectIds]);
      } else {
        const row=await client.query<{id:string}>('SELECT id FROM studio_accounts WHERE invite_digest=$1 AND invite_until>now() AND enabled AND enrolled_at IS NULL FOR UPDATE',[digest]);
        if(!row.rows[0]) throw invalid(); id=row.rows[0].id;
      }
      const seed=randomBytes(20), ticket=token();
      await client.query("UPDATE studio_accounts SET totp_secret=$2,setup_digest=$3,setup_until=now()+interval '10 minutes',invite_digest=NULL WHERE id=$1",
        [id,seal(this.key,id,seed),hash(ticket)]);
      await audit(client,id,'enrollment_started',id);
      return {id,secret:base32(seed),ticket};
    }));
  }
  async finish(ticket:string,password:string,otp:string) {
    if(typeof password!=='string'||password.length<14||password.length>256)
      throw new DomainError(400,'password','Utilisez entre 14 et 256 caractères.');
    return this.limited(async()=>transaction(this.pool,async client=>{
      const r=await client.query('SELECT id,totp_secret FROM studio_accounts WHERE setup_digest=$1 AND setup_until>now() AND enabled AND enrolled_at IS NULL FOR UPDATE',[hash(ticket)]);
      const row=r.rows[0]; if(!row) throw invalid();
      const counter=validCounter(open(this.key,row.id,row.totp_secret),otp,Date.now(),-1);
      if(counter===null) throw invalid();
      const salt=randomBytes(16), pass=await passwordKey(password,salt);
      await client.query('UPDATE studio_accounts SET password_hash=$2,salt=$3,last_counter=$4,enrolled_at=now(),setup_digest=NULL,setup_until=NULL WHERE id=$1',[row.id,pass,salt,counter]);
      await audit(client,row.id,'enrolled',row.id);
      return this.issue(client,row.id);
    }));
  }
  private async issue(client:PoolClient,id:string) {
    const session=token();
    await client.query('DELETE FROM studio_sessions WHERE expires_at<=now()');
    await client.query("INSERT INTO studio_sessions(digest,account_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hash(session),id]);
    return session;
  }
  async login(id:string,password:string,otp:string) {
    if(typeof id!=='string'||!accountId.test(id)||typeof password!=='string'||password.length>256) throw invalid();
    const session=await this.limited(async()=>transaction(this.pool,async client=>{
      const row=(await client.query('SELECT *,locked_until>now() AS locked FROM studio_accounts WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(row?.locked) return null;
      const actual=await passwordKey(password,row?.salt??Buffer.alloc(16));
      const valid=row?.enabled && row.enrolled_at && timingSafeEqual(actual,row.password_hash);
      const counter=valid?validCounter(open(this.key,id,row.totp_secret),otp,Date.now(),Number(row.last_counter)):null;
      if(counter===null) {
        if(row) {
          await client.query("UPDATE studio_accounts SET failures=CASE WHEN failures>=4 THEN 0 ELSE failures+1 END,locked_until=CASE WHEN failures>=4 THEN now()+interval '5 minutes' ELSE NULL END WHERE id=$1",[id]);
          await audit(client,id,'authentication_failed',id);
        }
        return null;
      }
      await client.query('UPDATE studio_accounts SET failures=0,locked_until=NULL,last_counter=$2 WHERE id=$1',[id,counter]);
      await audit(client,id,'authenticated',id);return this.issue(client,id);
    }));
    if(!session) throw invalid(); return session;
  }
  async actor(session:string):Promise<Operator|null> {
    if(!/^[\w-]{43}$/.test(session)) return null;
    const r=await this.pool.query("SELECT a.id,a.role,ARRAY(SELECT project_id FROM studio_account_projects WHERE account_id=a.id ORDER BY project_id) AS projects FROM studio_sessions s JOIN studio_accounts a ON a.id=s.account_id WHERE s.digest=$1 AND s.expires_at>now() AND a.enabled AND a.enrolled_at IS NOT NULL",[hash(session)]);
    const row=r.rows[0];return row?{id:row.id,projectIds:row.projects,accountRole:row.role}:null;
  }
  async logout(session:string) { await this.pool.query('DELETE FROM studio_sessions WHERE digest=$1',[hash(session)]); }

  async accounts(actor:Operator) {
    requireAdmin(actor);
    return (await this.pool.query(`SELECT a.id,a.role,a.enabled,(a.enrolled_at IS NOT NULL) AS enrolled,
      ARRAY(SELECT project_id FROM studio_account_projects WHERE account_id=a.id ORDER BY project_id) AS projects FROM studio_accounts a
      WHERE NOT EXISTS (SELECT 1 FROM studio_account_projects p WHERE p.account_id=a.id AND NOT (p.project_id=ANY($1::text[]))) ORDER BY a.id`,[actor.projectIds])).rows;
  }
  private async managed(client:PoolClient,actor:Operator,id:string) {
    const row=(await client.query('SELECT id,enabled,enrolled_at FROM studio_accounts WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (!row || (await scopes(client,id)).some(project=>!actor.projectIds.includes(project)))
      throw new DomainError(404,'account','Compte introuvable.');
    return row;
  }
  async renew(actor:Operator,id:string) {
    requireAdmin(actor);
    const invitation=token();
    await transaction(this.pool,async client=>{
      const row=await this.managed(client,actor,id);
      if (!row.enabled || row.enrolled_at) throw new DomainError(409,'enrolled','Seule une invitation en attente peut être renouvelée.');
      await client.query("UPDATE studio_accounts SET invite_digest=$2,invite_until=now()+interval '30 minutes',setup_digest=NULL,setup_until=NULL,totp_secret=NULL WHERE id=$1",[id,hash(invitation)]);
      await audit(client,actor.id,'invitation_renewed',id);
    });
    return invitation;
  }
  async setProjects(actor:Operator,id:string,projects:string[]) {
    requireAdmin(actor);
    if (id===actor.id || !projects.length || projects.some(p=>!isProjectId(p)||!actor.projectIds.includes(p)))
      throw new DomainError(403,'scope','Périmètre de gestion insuffisant.');
    await transaction(this.pool,async client=>{
      await this.managed(client,actor,id);
      await client.query('DELETE FROM studio_account_projects WHERE account_id=$1',[id]);
      await client.query('INSERT INTO studio_account_projects SELECT $1,unnest($2::text[])',[id,[...new Set(projects)]]);
      await audit(client,actor.id,'projects_updated',id);
    });
  }
  async disable(actor:Operator,id:string) {
    requireAdmin(actor);
    if(id===actor.id) throw new DomainError(409,'self','Vous devez conserver votre compte actif.');
    await transaction(this.pool,async client=>{
      await this.managed(client,actor,id);
      await client.query('UPDATE studio_accounts SET enabled=false,invite_digest=NULL,setup_digest=NULL WHERE id=$1',[id]);
      await client.query('DELETE FROM studio_sessions WHERE account_id=$1',[id]); await audit(client,actor.id,'disabled',id);
    });
  }
}

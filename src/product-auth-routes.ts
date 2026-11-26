import type { IncomingMessage,ServerResponse } from 'node:http';
import { DomainError, type Credential, type JsonObject, type Operator } from './contracts.ts';
import { HumanAccess } from './product-auth.ts';
import { e,layout } from './views.ts';

type UI={body:(r:IncomingMessage,k:'form')=>Promise<JsonObject>;html:(r:ServerResponse,status:number,html:string)=>void;redirect:(r:ServerResponse,path:string)=>void};
export function cookie(req:IncomingMessage,name:string) {
  return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1) ?? '';
}
export const humanCookie='studio_product_session';
const setupCookie='studio_enrollment';
const set=(name:string,value:string,age:number)=>name+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age;
const field=(id:string,label:string,type:string,auto:string,attrs='') =>
  '<label>'+label+'<input required name="'+id+'" type="'+type+'" autocomplete="'+auto+'" '+attrs+'></label>';
export function humanLogin() {
  return layout('Connexion au Studio',`<section class="panel login"><h1>Ouvrir le Studio</h1>
    <form method="post" action="/login">${field('id','Identifiant','text','username')}${field('password','Mot de passe','password','current-password','maxlength="256"')}
    ${field('otp','Code de l’authentificateur','text','one-time-code','inputmode="numeric" pattern="[0-9]{6}"')}<button class="primary">Se connecter</button></form>
    <details><summary>Activer un compte local</summary><p>Pour activer le premier compte <strong>admin-local</strong>, ouvrez PowerShell dans le dossier du Studio et lancez <code>npm.cmd run --silent access:local</code>. Collez la clé affichée dans le champ ci-dessous.</p>
    <p>Si vous avez reçu une invitation, saisissez le code fourni par votre administrateur.</p>
    <form method="post" action="/enroll">${field('invitation','Code d’activation','password','off')}<button>Commencer l’activation</button></form></details></section>`);
}
export async function humanRoute(store:HumanAccess,req:IncomingMessage,res:ServerResponse,path:string,actor:Operator|null,
  credentials:readonly Credential[],io:UI) {
  if(path==='/login' && req.method==='POST') {
    const input=await io.body(req,'form');
    const session=await store.login(String(input.id??''),String(input.password??''),String(input.otp??''));
    res.setHeader('Set-Cookie',set(humanCookie,session,28800)); io.redirect(res,'/');return true;
  }
  if(path==='/enroll' && req.method==='POST') {
    const input=await io.body(req,'form');
    const principal=credentials.find(c=>c.id==='operator-local' && c.kind==='operator');
    const result=await store.begin(String(input.invitation??''),principal?.kind==='operator'?principal:undefined);
    res.setHeader('Set-Cookie',set(setupCookie,result.ticket,600));
    io.html(res,200,layout('Activer le compte',`<section class="panel login"><h1>Activer ${e(result.id)}</h1>
      <p>Dans votre application d’authentification, ajoutez cette clé manuellement. Choisissez un code temporel de six chiffres.</p>
      <p><code>${e(result.secret)}</code></p><form method="post" action="/enroll/confirm">
      ${field('password','Nouveau mot de passe (14 caractères minimum)','password','new-password','minlength="14" maxlength="256"')}
      ${field('otp','Code de vérification','text','one-time-code','inputmode="numeric" pattern="[0-9]{6}"')}
      <button class="primary">Activer et se connecter</button></form></section>`));return true;
  }
  if(path==='/enroll/confirm' && req.method==='POST') {
    const input=await io.body(req,'form');
    const session=await store.finish(cookie(req,setupCookie),String(input.password??''),String(input.otp??''));
    res.setHeader('Set-Cookie',[set(setupCookie,'',0),set(humanCookie,session,28800)]);io.redirect(res,'/');return true;
  }
  if(path==='/logout' && req.method==='POST') {
    await store.logout(cookie(req,humanCookie));res.setHeader('Set-Cookie',set(humanCookie,'',0));io.redirect(res,'/');return true;
  }
  if(!['/people','/people/invite','/people/renew','/people/projects','/people/disable'].includes(path))return false;
  if(actor?.accountRole!=='admin')throw new DomainError(403,'admin','Accès administrateur requis.');
  if(path==='/people' && req.method==='GET') {
    const accounts=await store.accounts(actor);
    io.html(res,200,layout('Comptes locaux',`<h1>Comptes locaux</h1><section class="panel"><ul class="mission-list">${accounts.map(a=>`<li><strong>${e(a.id)}</strong><span>${e(a.role)} · ${!a.enabled?'désactivé':a.enrolled?'activé':'invité'}</span>
      ${a.enabled && a.id!==actor.id?`<div><form method="post" action="/people/projects"><input type="hidden" name="id" value="${e(a.id)}"><label>Projets<input required name="projects" value="${e(a.projects.join(','))}"></label><button>Modifier les accès</button></form>
      ${!a.enrolled?`<form method="post" action="/people/renew"><input type="hidden" name="id" value="${e(a.id)}"><button>Renouveler l’invitation</button></form>`:''}
      <form method="post" action="/people/disable"><input type="hidden" name="id" value="${e(a.id)}"><button>Désactiver et fermer les sessions</button></form></div>`:''}</li>`).join('')}</ul></section>
      <section class="panel"><h2>Inviter une personne</h2><form method="post" action="/people/invite">
      ${field('id','Identifiant local','text','off','pattern="[a-z][a-z0-9-]{1,39}"')}
      <label>Rôle<select name="role"><option value="viewer">Lecteur</option><option value="operator">Opérateur</option><option value="admin">Administrateur</option></select></label>
      ${field('projects','Projets (séparés par des virgules)','text','off')}
      <button>Créer l’invitation</button></form></section>`));return true;
  }
  if((path==='/people/invite'||path==='/people/renew') && req.method==='POST') {
    const input=await io.body(req,'form');
    const code=path==='/people/renew'?await store.renew(actor,String(input.id??'')):await store.invite(actor,String(input.id??''),input.role as 'viewer',String(input.projects??'').split(',').map(s=>s.trim()));
    io.html(res,201,layout('Invitation locale','<section class="panel"><h1>Invitation créée</h1><p>Code utilisable une fois, pendant 30 minutes.</p><code>'+e(code)+'</code><p><a href="/people">Comptes locaux</a></p></section>'));return true;
  }
  if(path==='/people/projects' && req.method==='POST') {
    const input=await io.body(req,'form');
    await store.setProjects(actor,String(input.id??''),String(input.projects??'').split(',').map(s=>s.trim()));
    io.redirect(res,'/people');return true;
  }
  if(path==='/people/disable' && req.method==='POST') {
    const input=await io.body(req,'form');await store.disable(actor,String(input.id??''));io.redirect(res,'/people');return true;
  }
  throw new DomainError(405,'method','Méthode indisponible.');
}

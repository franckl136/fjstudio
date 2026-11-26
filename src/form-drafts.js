// Only explicitly enrolled fields may enter the local store. The key is requested from the current session.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let database;
function draftDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('fjstudio-device-drafts-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('drafts', {keyPath:['scope','id']});
      store.createIndex('scope','scope');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function access(form) {
  const response = await fetch(form.dataset.draftAccess, {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin',
    body:JSON.stringify({account:form.dataset.draftAccount}),
  });
  if (!response.ok) throw Error('La session ou les autorisations ont changé.');
  const {key,scope} = await response.json();
  const bytes = Uint8Array.from(atob(key.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
  return {scope,key:await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])};
}
function algorithm(row) {
  return {name:'AES-GCM',iv:row.iv,additionalData:textEncoder.encode(JSON.stringify([row.scope,row.id,row.revision]))};
}
async function storedRows(scope) {
  const db = await draftDatabase();
  return new Promise((resolve,reject) => {
    const query = db.transaction('drafts').objectStore('drafts').index('scope').getAll(scope);
    query.onsuccess = () => resolve(query.result.sort((a,b) => b.time-a.time));
    query.onerror = () => reject(query.error);
  });
}
// Check and mutate in the same read/write transaction, including deletion. Stale tabs cannot recreate a deleted draft.
class DraftConflict extends Error {}
async function changeRow(scope,id,expected,next) {
  const db = await draftDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('drafts','readwrite'), store = tx.objectStore('drafts');
    let conflict = false;
    const get = store.get([scope,id]);
    get.onsuccess = () => {
      if ((get.result?.revision ?? 0) !== expected) { conflict=true; tx.abort(); return; }
      if (next) store.put(next); else store.delete([scope,id]);
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(conflict ? new DraftConflict() : tx.error ?? Error('Stockage indisponible'));
  });
}
function protectForm(form) {
  const tools=form.previousElementSibling;
  const status=tools.querySelector('[data-draft-status]'), list=tools.querySelector('[data-draft-list]');
  const discard=tools.querySelector('[data-draft-discard]'), retry=tools.querySelector('[data-draft-retry]');
  const copy=tools.querySelector('[data-draft-copy]');
  const names=form.dataset.draftFields.split(' ');
  function snapshot() {
    const values={};
    for(const name of names) {
      const field=form.elements.namedItem(name);
      if(field && typeof field.value==='string')values[name]=field.value;
    }
    const data={values,commandKey:form.elements.commandKey.value,revision:form.elements.revision?.value};
    form.dispatchEvent(new CustomEvent('draft-collect',{detail:data}));
    return JSON.stringify(data);
  }
  function populate(data) {
    form.dispatchEvent(new CustomEvent('draft-restore',{detail:data}));
    for(const name of names) {
      const field=form.elements.namedItem(name);
      if(field && Object.hasOwn(data.values,name))field.value=data.values[name];
    }
    form.elements.commandKey.value=data.commandKey;
    if(form.elements.revision)form.elements.revision.value=data.revision;
  }
  const initial=snapshot();
  let last=initial, id=crypto.randomUUID(), revision=0, pending=false, conflict=false, timer;
  let queue=Promise.resolve();
  function run(action) {
    clearTimeout(timer);
    const result=queue.then(action);
    queue=result.catch(()=>{});
    return result;
  }
  function inform(message) { if(status.textContent!==message)status.textContent=message; }
  function failure(error) {
    conflict=error instanceof DraftConflict;
    inform(conflict?'Une autre fenêtre a modifié ou retiré ce brouillon. Conservez une copie séparée.':'Échec de sauvegarde ou de lecture locale. La saisie reste dans ce formulaire. Vérifiez la session et le stockage.');
    copy.hidden=!conflict;retry.hidden=conflict;
  }
  async function save() {
    const current=snapshot();
    if(current===last && !pending)return;
    if(conflict)throw new DraftConflict();
    inform('Enregistrement…');
    const {scope,key}=await access(form);
    const row={scope,id,revision:revision+1,time:Date.now(),iv:crypto.getRandomValues(new Uint8Array(12))};
    row.sealed=await crypto.subtle.encrypt(algorithm(row),key,textEncoder.encode(current));
    await changeRow(scope,id,revision,row);
    revision=row.revision;last=current;pending=snapshot()!==current;
    retry.hidden=true;copy.hidden=true;discard.hidden=false;
    inform(pending?'Modification en cours…':'Enregistré sur cet appareil.');
  }
  function changed() {
    pending=snapshot()!==last;
    clearTimeout(timer);
    if(!pending){inform(revision?'Enregistré sur cet appareil.':'');return;}
    discard.hidden=false;inform('Modification en cours…');
    timer=setTimeout(()=>run(save).catch(failure),250);
  }
  function reset() {
    const blank=JSON.parse(initial);
    blank.commandKey=crypto.randomUUID();populate(blank);
    last=snapshot();id=crypto.randomUUID();revision=0;pending=false;conflict=false;
    discard.hidden=true;retry.hidden=true;copy.hidden=true;
  }
  async function removeCurrent() {
    if(revision){
      const {scope}=await access(form);
      await changeRow(scope,id,revision,null);
    }
    reset();
  }
  function button(label,action) {
    const btn=document.createElement('button');btn.type='button';btn.textContent=label;
    btn.addEventListener('click',()=>run(action).catch(failure));return btn;
  }
  async function catalog() {
    const {scope,key}=await access(form), rows=await storedRows(scope);
    list.replaceChildren();
    for(const row of rows){
      if(row.id===id)continue;
      const group=document.createElement('div');group.className='actions';
      const name=document.createElement('span');
      let title='Brouillon sans objectif';
      try{
        const bytes=await crypto.subtle.decrypt(algorithm(row),key,row.sealed);
        title=JSON.parse(textDecoder.decode(bytes)).values.objective?.trim().slice(0,72)||title;
      }catch{title='Brouillon illisible';}
      name.textContent=title+' · '+new Date(row.time).toLocaleString('fr-FR');
      group.setAttribute('role','group');group.setAttribute('aria-label',name.textContent);
      group.append(name,button('Reprendre',async()=>{
        if(pending)await save();
        const current=await access(form);
        if(current.scope!==scope)throw Error('Périmètre modifié');
        const liveRow=(await storedRows(scope)).find(item=>item.id===row.id);
        if(liveRow?.revision!==row.revision){await catalog();inform('Le brouillon a changé dans une autre fenêtre. Sélectionnez sa version actuelle.');return;}
        const bytes=await crypto.subtle.decrypt(algorithm(row),current.key,row.sealed);
        const data=JSON.parse(textDecoder.decode(bytes));
        const newerMission=form.elements.revision && data.revision!==JSON.parse(initial).revision;
        id=row.id;revision=row.revision;populate(data);last=snapshot();pending=false;conflict=false;
        discard.hidden=false;retry.hidden=true;copy.hidden=true;
        await catalog();
        if(newerMission){
          inform('Brouillon récupéré. La mission a changé depuis cette saisie. Comparez le contrat affiché avant de reprendre la révision courante.');
          list.prepend(button('Utiliser la révision affichée après relecture',async()=>{
            form.elements.revision.value=JSON.parse(initial).revision;
            form.elements.commandKey.value=crypto.randomUUID();pending=true;await save();await catalog();
          }));
        }else inform('Brouillon récupéré.');
        form.elements.objective?.focus();
      }),button('Abandonner',async()=>{
        if(!window.confirm('Abandonner ce brouillon local ?'))return;
        const current=await access(form);
        if(current.scope!==scope)throw Error('Périmètre modifié');
        await changeRow(scope,row.id,row.revision,null);await catalog();inform('Brouillon abandonné.');
      }));
      list.append(group);
    }
  }
  tools.hidden=false;
  form.addEventListener('input',changed);
  form.addEventListener('change',changed);
  discard.addEventListener('click',()=>{
    if(window.confirm('Abandonner la saisie et son brouillon sur cet appareil ?')) {
      run(async()=>{await removeCurrent();await catalog();inform('Brouillon abandonné.');}).catch(failure);
    }
  });
  retry.addEventListener('click',()=>run(async()=>{
    if(pending)await save();
    await catalog();retry.hidden=true;
    if(!pending && !revision)inform('Stockage local disponible.');
  }).catch(failure));
  copy.addEventListener('click',()=>run(async()=>{
    id=crypto.randomUUID();revision=0;conflict=false;pending=true;
    form.elements.commandKey.value=crypto.randomUUID();
    await save();await catalog();
  }).catch(failure));

  // Local persistence is an optional extension of the form guard. Each operation waits for an in-flight autosave.
  form.dispatchEvent(new CustomEvent('draft-persistence',{detail:{
    pending:()=>pending,
    keep:()=>run(save).catch(error=>{failure(error);throw error;}),
    abandon:()=>run(removeCurrent).catch(error=>{failure(error);throw error;}),
    pause:()=>run(async()=>{}),
    submitted:()=>run(removeCurrent),
    retryPending:()=>{if(pending)timer=setTimeout(()=>run(save).catch(failure),250);},
  }}));
  run(catalog).catch(failure);
}
for(const form of document.querySelectorAll('form[data-draft-access]'))protectForm(form);

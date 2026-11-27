const plan = document.querySelector('.office-plan');
const loft=document.querySelector('.loft');
const historyPanel=loft.querySelector('.loft-history');
let playbackTimer;
const expand=loft.querySelector('.loft-expand');
if(document.fullscreenEnabled) {
  expand.hidden=false;
  expand.addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement===loft) await document.exitFullscreen();
      else await loft.requestFullscreen();
    } catch { loft.querySelector('.loft-caption').textContent='Le plein écran est indisponible dans cette fenêtre.'; }
  });
  document.addEventListener('fullscreenchange',()=>{
    const open=document.fullscreenElement===loft;
    expand.setAttribute('aria-pressed',String(open));
    expand.textContent=open?'↙ Réduire':'⛶ Agrandir';
  });
}
function enableReplay() {
  const button=historyPanel.querySelector('.loft-replay');
  if(button) button.hidden=false;
}
function stopReplay() {
  clearTimeout(playbackTimer);
  delete loft.dataset.replay;
  loft.querySelector('.loft-playback')?.remove();
  loft.dispatchEvent(new Event('loft-repaint'));
  loft.querySelector('.loft-caption').textContent='';
  const button=historyPanel.querySelector('.loft-replay');
  if(button) button.textContent='Rejouer les trois étapes';
}
enableReplay();
historyPanel.addEventListener('click',event=>{
  const button=event.target.closest('.loft-replay');
  if(!button) return;
  if(loft.hasAttribute('data-replay')) { stopReplay();return; }
  const steps=Array.from(historyPanel.querySelectorAll('li[data-member]'));
  if(!steps.length) return;
  loft.dataset.replay='';
  button.textContent='Terminer la relecture historique';
  const layer=document.createElement('div');
  layer.className='loft-playback';layer.setAttribute('aria-hidden','true');
  loft.querySelector('.pixel-floor').append(layer);
  function show(index) {
    if(index===steps.length) { stopReplay();return; }
    const step=steps[index];
    const actor=document.createElement('i');
    actor.className='loft-person pixel-person';actor.dataset.area=step.dataset.area;
    actor.dataset.member=step.dataset.member;
    layer.replaceChildren(actor);
    loft.dispatchEvent(new Event('loft-repaint'));
    loft.querySelector('.loft-caption').textContent='Relecture · '+(index+1)+'/3 · '+step.textContent;
    playbackTimer=setTimeout(()=>show(index+1),2400);
  }
  show(0);
});
const directory=loft.querySelector('.loft-directory');
const profiles=directory.querySelector('.loft-profiles');
const providerFilter=directory.querySelector('[data-provider-filter]');
directory.querySelector('[data-provider-control]').hidden=false;
let selectedProfile=null;
function showFilter(){
  let visible=0;
  for(const profile of profiles.children){
    profile.hidden=Boolean(providerFilter.value && profile.dataset.provider!==providerFilter.value);
    if(!profile.hidden)visible++;
  }
  directory.querySelector('[data-empty-directory]').hidden=visible>0;
}
function markSelection(id){
  selectedProfile=id;
  for(const avatar of loft.querySelectorAll('.loft-people [data-profile-link]')){
    if(avatar.dataset.profileLink===id)avatar.setAttribute('aria-current','true');
    else avatar.removeAttribute('aria-current');
  }
}
providerFilter.addEventListener('change',showFilter);
profiles.addEventListener('toggle',event=>{
  const card=event.target.closest('[data-profile]');
  if(!card)return;
  if(card.open)markSelection(card.id);
  else if(selectedProfile===card.id)markSelection(null);
},true);
loft.addEventListener('click',event=>{
  if(event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
  const link=event.target.closest('a');
  if(!link)return;
  if(link.hasAttribute('data-show-directory')){
    directory.open=true;
    directory.querySelector('summary').focus();
  }
  if(link.dataset.returnAgent){
    const avatar=document.getElementById('visuel-'+link.dataset.returnAgent);
    if(!avatar)return;
    event.preventDefault();
    if(avatar.inert)loft.querySelector('[data-camera="'+avatar.dataset.area+'"]')?.click();
    avatar.focus();
    return;
  }
  const card=document.getElementById(link.dataset.profileLink??'');
  if(!card || !profiles.contains(card))return;
  event.preventDefault();
  directory.open=true;
  if(card.hidden){providerFilter.value='';showFilter();}
  for(const other of profiles.querySelectorAll('details[open]'))if(other!==card)other.open=false;
  card.open=true;
  markSelection(card.id);
  card.querySelector('summary').focus();
});
function filterRooms(){
  for(const section of loft.querySelectorAll('[data-room-occupants]')){
    section.hidden=section.dataset.roomOccupants!==loft.dataset.focus;
  }
}
new MutationObserver(filterRooms).observe(loft,{attributes:true,attributeFilter:['data-focus']});
function replaceContent(current,next){
  if(!current || !next || current.innerHTML===next.innerHTML)return;
  const focused=current.contains(document.activeElement)?document.activeElement.closest('a')?.href:null;
  current.replaceChildren(...next.cloneNode(true).childNodes);
  if(focused)Array.from(current.querySelectorAll('a')).find(a=>a.href===focused)?.focus({preventScroll:true});
}
function syncDirectory(next){
  const source=next.querySelector('.loft-profiles');
  const old=new Map(Array.from(profiles.children,card=>[card.id,card]));
  for(const incoming of source.children){
    const current=old.get(incoming.id);
    if(!current){profiles.append(incoming.cloneNode(true));continue;}
    old.delete(incoming.id);
    current.dataset.location=incoming.dataset.location;
    replaceContent(current.querySelector('summary'),incoming.querySelector('summary'));
    replaceContent(current.querySelector('.loft-profile-body'),incoming.querySelector('.loft-profile-body'));
  }
  for(const card of old.values()){
    if(card.contains(document.activeElement))directory.querySelector('summary').focus({preventScroll:true});
    card.remove();
  }
  if(selectedProfile && !document.getElementById(selectedProfile))markSelection(null);
  directory.querySelector('[data-directory-total]').textContent=String(profiles.children.length);
  showFilter();
}
function updateLoft(next) {
  const crowd=loft.querySelector('.loft-people'),passages=new Map();
  const previous=new Map(Array.from(crowd.children,p=>[p.dataset.member,p]));
  for(const incoming of next.querySelector('.loft-people').children){
    const key=incoming.dataset.member,person=previous.get(key);
    if(!person){crowd.append(incoming.cloneNode(true));continue;}
    previous.delete(key);
    if(person.dataset.recent!==incoming.dataset.recent){
      const known=new Set(JSON.parse(person.dataset.recent).map(r=>r.id));
      known.add(person.dataset.live);
      const newStops=JSON.parse(incoming.dataset.recent).filter(r=>!known.has(r.id)&&Date.now()-r.at<8000);
      passages.set(key,newStops.sort((a,b)=>a.at-b.at));
    }
    replaceContent(person.querySelector('.pixel-label'),incoming.querySelector('.pixel-label'));
    for(const attr of ['data-area','data-pose','data-seat','data-live','data-recent','href','title','aria-label']){
      const value=incoming.getAttribute(attr);
      if(person.getAttribute(attr)!==value)person.setAttribute(attr,value);
    }
  }
  for(const absent of previous.values())absent.remove();
  replaceContent(loft.querySelector('.loft-metrics'),next.querySelector('.loft-metrics'));
  for(const room of loft.querySelectorAll('[data-room-occupants]')){
    replaceContent(room,next.querySelector('[data-room-occupants="'+room.dataset.roomOccupants+'"]'));
  }
  syncDirectory(next);
  markSelection(selectedProfile);
  let changed=false;
  for(const count of loft.querySelectorAll('[data-count]')){
    const value=next.querySelector('[data-count="'+count.dataset.count+'"]').textContent;
    if(count.textContent!==value){count.textContent=value;changed=true;}
  }
  if(changed)loft.dispatchEvent(new Event('loft-occupancy'));
  loft.dispatchEvent(new CustomEvent('loft-repaint',{detail:passages}));
  const history=next.querySelector('.loft-history');
  if(!loft.hasAttribute('data-replay') && history.dataset.mission!==historyPanel.dataset.mission) {
    historyPanel.replaceChildren(...history.cloneNode(true).childNodes);
    historyPanel.dataset.mission=history.dataset.mission;
    enableReplay();
  }
}
if (plan?.dataset.follow === 'on') {
  const status = document.querySelector('#office-live');
  let timer;
  let loading = false;
  let nextFull=performance.now()+6500;

  function updateContent(current, next) {
    if(!current || !next)return;
    if (current.innerHTML === next.innerHTML) return;
    const focused = current.contains(document.activeElement) ? document.activeElement.closest('a')?.href : null;
    current.replaceChildren(...next.cloneNode(true).childNodes);
    if (focused) Array.from(current.querySelectorAll('a')).find(link => link.href === focused)?.focus({preventScroll:true});
  }

  function updateRoom(room, next) {
    const desks = Array.from(room.querySelectorAll('.office-station'));
    const incoming = Array.from(next.querySelectorAll('.office-station'));
    if (desks.length !== incoming.length || desks.some((desk, i) => desk.getAttribute('href') !== incoming[i].getAttribute('href'))) {
      updateContent(room, next);
      return;
    }
    desks.forEach((desk, i) => {
      desk.dataset.state = incoming[i].dataset.state;
      desk.classList.toggle('occupied', incoming[i].classList.contains('occupied'));
      updateContent(desk.querySelector('.station-text'), incoming[i].querySelector('.station-text'));
    });
  }

  async function refresh() {
    clearTimeout(timer);
    if (document.hidden || loading) return;
    loading = true;
    try {
      const endpoint=new URL(location.href);
      const full=performance.now()>=nextFull;
      if(!full)endpoint.searchParams.set('loft','1');
      const response = await fetch(endpoint, {cache:'no-store', signal:AbortSignal.timeout(6500)});
      if ([401,403,404].includes(response.status)) { location.reload(); return; }
      if (!response.ok) throw new Error();
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!next.querySelector('.loft')) { location.reload(); return; }
      updateLoft(next.querySelector('.loft'));
      if(full){
        for (const room of plan.querySelectorAll('[data-room]')) {
          updateRoom(room, next.querySelector('[data-room="'+room.dataset.room+'"]'));
        }
        for (const selector of ['#office-reading','.office-supervision','#poste']) {
          updateContent(document.querySelector(selector), next.querySelector(selector));
        }
        nextFull=performance.now()+6500;
      }
      delete plan.dataset.stale;
      delete loft.dataset.stale;
      status.textContent = 'En direct';
    } catch {
      plan.dataset.stale = '';
      loft.dataset.stale = '';
      status.textContent = 'Connexion interrompue · dernier relevé affiché';
    } finally {
      loading = false;
      if (!document.hidden) timer = setTimeout(refresh, 1400);
    }
  }
  status.textContent = 'En direct';
  timer = setTimeout(refresh, 1400);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) void refresh();
  });
}

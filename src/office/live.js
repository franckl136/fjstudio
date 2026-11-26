const plan = document.querySelector('.office-plan');
const loft=document.querySelector('.loft');
const pixels=loft.classList.contains('pixel-loft');
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
  loft.querySelector('.room-playing')?.classList.remove('room-playing');
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
  button.textContent='Terminer la relecture';
  const layer=document.createElement('div');
  layer.className='loft-playback';layer.setAttribute('aria-hidden','true');
  if(!pixels) loft.querySelector('.loft-floor').append(layer);
  const actor=document.createElement('i');
  if(!pixels) {
    const sprite=document.createElement('i');sprite.className='walker';actor.append(sprite);
  }
  layer.append(actor);
  function show(index) {
    if(index===steps.length) { stopReplay();return; }
    const step=steps[index];
    actor.className='loft-person '+(pixels?'pixel-person ':'')+'look-'+step.dataset.look;
    actor.dataset.area=step.dataset.area;actor.dataset.seat='0';
    if(pixels) {
      const room=loft.querySelector('[data-office-room="'+step.dataset.area+'"]');
      if(!room) {stopReplay();return;}
      loft.querySelector('.room-playing')?.classList.remove('room-playing');
      room.classList.add('room-playing');
      room.querySelector('.pixel-floor').append(layer);
      delete actor.dataset.drawn;actor.replaceChildren();loft.dispatchEvent(new Event('loft-repaint'));
    }
    loft.querySelector('.loft-caption').textContent='Relecture · '+(index+1)+'/3 · '+step.textContent;
    playbackTimer=setTimeout(()=>show(index+1),2400);
  }
  show(0);
});
function updateLoft(next) {
  const previous=new Map(Array.from(loft.querySelectorAll('.loft-people > [data-member]'),p=>[p.dataset.member,p]));
  for(const incomingRoom of next.querySelectorAll('.loft-people')) {
    const crowd=pixels?loft.querySelector('[data-crowd="'+incomingRoom.dataset.crowd+'"]'):loft.querySelector('.loft-people');
    for(const incoming of incomingRoom.children) {
      const person=previous.get(incoming.dataset.member);
      if(!person) { crowd.append(incoming.cloneNode(true));continue; }
      previous.delete(incoming.dataset.member);
      if(person.parentElement!==crowd) {
        const focused=document.activeElement===person;
        crowd.append(person);
        if(focused)person.focus({preventScroll:true});
        person.classList.remove('pixel-arrived');
        requestAnimationFrame(()=>person.classList.add('pixel-arrived'));
      }
      for(const attr of ['data-area','data-seat','href','title','aria-label']) person.setAttribute(attr,incoming.getAttribute(attr));
    }
  }
  for(const count of loft.querySelectorAll('[data-count]')) {
    count.textContent=next.querySelector('[data-count="'+count.dataset.count+'"]').textContent;
  }
  for(const surface of loft.querySelectorAll('canvas[data-room-art]')){
    const incoming=next.querySelector('canvas[data-room-art="'+surface.dataset.roomArt+'"]');
    if(incoming && surface.dataset.occupants!==incoming.dataset.occupants) {
      surface.dataset.occupants=incoming.dataset.occupants;
      surface.dispatchEvent(new Event('loft-occupancy',{bubbles:true}));
    }
  }
  for(const absent of previous.values()) absent.remove();
  const presence=loft.querySelector('.loft-presence'),snapshot=next.querySelector('.loft-presence');
  if(presence.innerHTML!==snapshot.innerHTML) presence.replaceChildren(...snapshot.cloneNode(true).childNodes);
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

  function updateContent(current, next) {
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
      const response = await fetch(location.href, {cache:'no-store', signal:AbortSignal.timeout(6500)});
      if ([401,403,404].includes(response.status)) { location.reload(); return; }
      if (!response.ok) throw new Error();
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!next.querySelector('.office-plan')) { location.reload(); return; }
      updateLoft(next.querySelector('.loft'));
      for (const room of plan.querySelectorAll('[data-room]')) {
        updateRoom(room, next.querySelector('[data-room="'+room.dataset.room+'"]'));
      }
      for (const selector of ['#office-reading','.office-supervision','#poste']) {
        updateContent(document.querySelector(selector), next.querySelector(selector));
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
      if (!document.hidden) timer = setTimeout(refresh, 5000);
    }
  }
  status.textContent = 'En direct';
  timer = setTimeout(refresh, 5000);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) void refresh();
  });
}

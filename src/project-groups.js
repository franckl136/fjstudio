const nav=document.querySelector('.sidebar[data-preferences]');
if(nav?.dataset.preferences){
  const groups=[...nav.querySelectorAll('details[data-group]')];
  for(const group of groups){
    const key='fjstudio.menu.'+nav.dataset.preferences+'.'+group.dataset.group;
    try{
      const value=localStorage.getItem(key);
      if(value!==null)group.open=value==='open';
    }catch{}
    group.addEventListener('toggle',()=>{
      for(const peer of groups)if(peer.dataset.group===group.dataset.group && peer.open!==group.open)peer.open=group.open;
      try{localStorage.setItem(key,group.open?'open':'closed');}catch{}
    });
  }
}

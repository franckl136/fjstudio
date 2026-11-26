// Leaving a mission form requires only its DOM values and the initial server-rendered values.
for (const form of document.querySelectorAll('form[data-form-guard]')) {
  const values = () => {
    const current = Object.create(null);
    for (const name of form.dataset.draftFields.split(' ')) {
      const field = form.elements.namedItem(name);
      if (field?.value) current[name] = field.value;
    }
    const details = {};
    form.dispatchEvent(new CustomEvent('draft-collect', {detail:details}));
    for (const [purpose,fields] of Object.entries(details.variants ?? {}).sort()) {
      for (const [name,value] of Object.entries(fields)) if(value) current[purpose + '/' + name] = value;
    }
    return JSON.stringify(current);
  };
  const initial = values();
  let persistence, leaving = false, submitting = false, approvedSubmit = false;
  form.addEventListener('draft-persistence', event => {persistence = event.detail;});
  const changed = () => values() !== initial;

  function askBeforeLeaving(leave) {
    if (submitting || document.querySelector('dialog[data-draft-dialog][open]')) return;
    const box = document.createElement('dialog');
    box.dataset.draftDialog = '';
    box.setAttribute('aria-label','Quitter la saisie de mission');
    const title = document.createElement('h2');
    title.textContent = 'Quitter la saisie de mission ?';
    const message = document.createElement('p');
    message.textContent = 'Les modifications de ce formulaire attendent votre confirmation.';
    const actions = document.createElement('div');
    actions.className = 'actions';
    function option(label, action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', async () => {
        actions.inert = true;
        try { await action(); }
        catch { message.textContent = 'Opération impossible. Votre saisie reste disponible. Vous pouvez rester pour réessayer.'; }
        finally { actions.inert = false; }
      });
      actions.append(button);
      return button;
    }
    const stay = option('Rester sur le formulaire', () => box.close());
    function depart() {
      box.close();
      leaving = true;
      leave();
    }
    if (persistence) option('Enregistrer et continuer', async () => {await persistence.keep();depart();});
    option('Abandonner et quitter', async () => {await persistence?.abandon();depart();});
    box.append(title,message,actions);
    box.addEventListener('close', () => box.remove(), {once:true});
    document.body.append(box);
    box.showModal();
    stay.focus();
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
        || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) return;
    if (!changed()) return;
    event.preventDefault();
    askBeforeLeaving(() => location.assign(url.href));
  });
  document.addEventListener('submit', event => {
    if (event.target === form || approvedSubmit || event.defaultPrevented || !changed()) return;
    event.preventDefault();
    askBeforeLeaving(() => {
      approvedSubmit = true;
      try {event.target.requestSubmit(event.submitter);} finally {approvedSubmit = false;}
    });
  });
  window.addEventListener('beforeunload', event => {
    if (!leaving && changed() && (!persistence || persistence.pending())) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pageshow', event => {if (event.persisted) location.reload();});

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    form.inert = true;
    const error = form.querySelector('[data-draft-submit-error]');
    error.hidden = true;
    error.replaceChildren();
    let destination;
    try {
      // The same command key accompanies a retry if the server accepted a submission but its reply was lost.
      await persistence?.pause();
      const response = await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'},body:new URLSearchParams(new FormData(form))});
      if (!response.ok) {
        const dom = new DOMParser().parseFromString(await response.text(),'text/html');
        throw Error(dom.querySelector('main p')?.textContent?.trim() || 'Vérifiez les champs, la révision et la session.');
      }
      const result = await response.json();
      if(typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/.test(result.id)) throw Error('Réponse de mission inattendue.');
      destination = form.action.split('/control')[0] + '/control/' + result.id;
      leaving = true;
      await persistence?.submitted();
      location.assign(destination);
    } catch (reason) {
      error.hidden = false;
      if (destination) {
        const link = document.createElement('a');
        link.href = destination;
        link.textContent = 'Ouvrir la mission enregistrée';
        error.append('La mission est enregistrée. Le brouillon local n’a pas pu être retiré. ',link);
      } else {
        error.textContent = 'Mission non confirmée. ' + reason.message;
        persistence?.retryPending();
      }
    } finally {
      submitting = false;
      form.inert = false;
    }
  });
}

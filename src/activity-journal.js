// Filtrage et changement de projet rechargent aussi le contexte du menu.
const listId = 'journal-resultats';
let pending;

async function navigate(url, push) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const previous = document.getElementById(listId);
  previous.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(url, {
      headers: {'X-Studio-Fragment': 'activity-results'}, signal: controller.signal,
    });
    if (!response.ok || response.redirected) throw new Error('Navigation requise');
    const content = new DOMParser().parseFromString(await response.text(), 'text/html');
    const section = content.getElementById(listId);
    if (!section) throw new Error('Journal indisponible');
    if (controller.signal.aborted) return;
    if (push) history.pushState(null, '', url);
    previous.replaceWith(section);
    section.focus({preventScroll: true});
    section.scrollIntoView({block: 'start'});
  } catch {
    if (!controller.signal.aborted) location.assign(url);
  } finally {
    if (pending === controller) previous.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('.journal-pages a');
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  navigate(link.href, true);
});
window.addEventListener('popstate', () => navigate(location.href, false));

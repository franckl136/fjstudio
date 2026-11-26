const brief = document.querySelector('#brief');
const selector = brief.querySelector('.brief-selector');
const purpose = selector.elements.purpose;
const form = brief.querySelector('form[method=post]');
const fields = form.querySelector('[data-brief-fields]');
const variants = new Map(Array.from(brief.querySelectorAll('template[data-purpose]'), t => [t.dataset.purpose, t]));
const drafts = new Map();

function adapt() {
  const key = purpose.value;
  const variant = variants.get(key);
  const previous = form.elements.purpose.value;
  if (!variant || previous === key) return;
  drafts.set(previous, Array.from(fields.childNodes));
  fields.replaceChildren(...(drafts.get(key) ?? [variant.content.cloneNode(true)]));
  form.elements.purpose.value = key;
  form.querySelector('[data-purpose-title]').textContent = purpose.selectedOptions[0].textContent;
  form.querySelector('[data-source-label]').textContent = variant.dataset.source;
  const url = new URL(location.href);
  url.searchParams.set('purpose', key);
  history.replaceState(history.state, '', url);
}
selector.querySelector('button').hidden = true;
selector.addEventListener('submit', event => { event.preventDefault(); adapt(); });
purpose.addEventListener('change', adapt);
window.addEventListener('pageshow', adapt);
adapt();

for (const output of document.querySelectorAll('output.lab-scope')) {
  const form=output.closest('form');
  const {selection,commit}=form.elements;
  function describe() {
    const option=selection.selectedOptions[0];
    if (!option?.dataset.file) {
      output.textContent='Aucune révision disponible pour ce lancement.';
    } else {
      const {file,nature,environment,checks}=option.dataset;
      const [source,,sha]=option.value.split(':');
      const revision=commit.value.trim()||sha;
      output.textContent=[nature,source,file,environment,'Commit '+revision,checks].join(' · ');
    }
    output.hidden=false;
  }
  selection.addEventListener('change',describe);
  commit.addEventListener('input',describe);
  describe();
}

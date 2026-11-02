// Lagring i localStorage: innstillinger, leksjonsresultater, tastestatistikk og historikk.
const Store = (() => {
  const KEY = 'touchtrening.v1';

  const defaults = () => ({
    settings: { lang: 'no', length: 'short', stopOnError: true, showKeyboard: true },
    lessons: {},
    keys: {},
    history: [],
    custom: '',
  });

  function load() {
    const d = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved) {
        Object.assign(d, saved);
        d.settings = { ...defaults().settings, ...saved.settings };
      }
    } catch (e) { /* ugyldig lagret data – start på nytt */ }
    return d;
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function reset() {
    const d = defaults();
    save(d);
    return d;
  }

  return { load, save, reset };
})();

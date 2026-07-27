// Lang: display-time localization layer.
// English is the canonical language used for all internal logic and answer
// checking. This module only affects what is *shown* to the user. Any name
// without a translation falls back to English, so partial data is safe.
const Lang = (() => {
  const GLOBAL_KEY = 'geoquiz-langs';

  // Ordered list of supported languages. Add more here later.
  const LANGS = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'no', label: 'Norsk', flag: '🇳🇴' }
  ];
  // Fixed display order (English always first when multiple are active).
  const ORDER = LANGS.map(l => l.code);

  const DICTS = { en: {}, no: {} };
  let _loaded = false;
  let _rx = null;         // compiled regex of translatable English names
  let _rxKeys = [];

  async function load() {
    if (_loaded) return;
    try {
      const res = await fetch('data/i18n-no.json');
      const raw = await res.json();
      const map = {};
      for (const k of Object.keys(raw)) {
        if (k.startsWith('_')) continue; // skip metadata like "_comment"
        map[k] = raw[k];
      }
      DICTS.no = map;
    } catch (e) {
      console.warn('Lang: failed to load translations', e);
      DICTS.no = {};
    }
    _loaded = true;
    _buildRegex();
  }

  function _buildRegex() {
    // Longest keys first so multi-word names win over their prefixes.
    _rxKeys = Object.keys(DICTS.no).sort((a, b) => b.length - a.length);
    if (!_rxKeys.length) { _rx = null; return; }
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use letter-boundaries so we do not match inside larger words.
    _rx = new RegExp('(?<![\\p{L}])(' + _rxKeys.map(esc).join('|') + ')(?![\\p{L}])', 'gu');
  }

  function _toLang(en, code) {
    if (code === 'en') return en;
    const d = DICTS[code];
    return (d && d[en]) || null;
  }

  // Norwegian form of an English name, or null.
  function toNo(en) {
    return DICTS.no[en] || null;
  }

  function normActive(active) {
    if (!Array.isArray(active) || !active.length) return ['en'];
    const set = active.slice();
    return ORDER.filter(c => set.includes(c));
  }

  // Display a single English name in the active languages.
  function name(en, active) {
    if (en == null) return en;
    const langs = normActive(active);
    const parts = [];
    for (const code of langs) {
      const v = _toLang(en, code);
      if (v && !parts.includes(v)) parts.push(v);
    }
    if (!parts.length) return en; // e.g. only 'no' active but no translation
    if (parts.length === 1) return parts[0];
    return parts[0] + ' (' + parts.slice(1).join(' / ') + ')';
  }

  // Replace every known English name inside a free-text string.
  function dispText(text, active) {
    if (typeof text !== 'string') return text;
    const langs = normActive(active);
    if (langs.length === 1 && langs[0] === 'en') return text; // fast path
    if (!_rx) return text;
    _rx.lastIndex = 0;
    return text.replace(_rx, (m) => name(m, langs));
  }

  function getGlobal() {
    try {
      const v = JSON.parse(localStorage.getItem(GLOBAL_KEY));
      const n = normActive(v);
      if (n.length) return n;
    } catch (_) { /* ignore */ }
    return ['en'];
  }

  function setGlobal(active) {
    const n = normActive(active);
    try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(n)); } catch (_) { /* ignore */ }
  }

  // Render a checkbox group into a container. `active` is the current array,
  // `onChange(next)` is called with the new normalized array on every change.
  // At least one language is always kept selected.
  function renderChecks(container, active, onChange) {
    if (!container) return;
    container.innerHTML = '';
    let current = normActive(active);
    LANGS.forEach(({ code, label, flag }) => {
      const wrap = document.createElement('label');
      wrap.className = 'lang-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = current.includes(code);
      cb.addEventListener('change', () => {
        let next = current.slice();
        if (cb.checked) {
          if (!next.includes(code)) next.push(code);
        } else {
          next = next.filter(c => c !== code);
        }
        if (!next.length) { cb.checked = true; return; } // keep at least one
        current = normActive(next);
        // keep every checkbox in this group in sync
        Array.from(container.querySelectorAll('input[type=checkbox]')).forEach((el, i) => {
          el.checked = current.includes(LANGS[i].code);
        });
        onChange(current);
      });
      const span = document.createElement('span');
      span.textContent = ' ' + flag + ' ' + label;
      wrap.appendChild(cb);
      wrap.appendChild(span);
      container.appendChild(wrap);
    });
  }

  return { load, name, dispText, toNo, getGlobal, setGlobal, renderChecks, normActive, LANGS };
})();

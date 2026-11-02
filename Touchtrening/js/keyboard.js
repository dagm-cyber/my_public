// Norsk (nb-NO, ISO) tastaturoppsett med fingerplassering for touch-metoden.
const Keyboard = (() => {
  const FINGER_NAMES = {
    lp: 'venstre lillefinger', lr: 'venstre ringfinger', lm: 'venstre langfinger', li: 'venstre pekefinger',
    th: 'tommel',
    ri: 'høyre pekefinger', rm: 'høyre langfinger', rr: 'høyre ringfinger', rp: 'høyre lillefinger',
  };

  // code, normal, shift, altgr, finger, width, label (for spesialtaster)
  const K = (code, n, s, a, f, w = 1, label = null) => ({ code, n, s, a, f, w, label });

  const ROWS = [
    [
      K('Backquote', '|', '§', null, 'lp'), K('Digit1', '1', '!', null, 'lp'), K('Digit2', '2', '"', '@', 'lr'),
      K('Digit3', '3', '#', '£', 'lm'), K('Digit4', '4', '¤', '$', 'li'), K('Digit5', '5', '%', '€', 'li'),
      K('Digit6', '6', '&', null, 'li'), K('Digit7', '7', '/', '{', 'ri'), K('Digit8', '8', '(', '[', 'rm'),
      K('Digit9', '9', ')', ']', 'rr'), K('Digit0', '0', '=', '}', 'rp'), K('Minus', '+', '?', null, 'rp'),
      K('Equal', '\\', '`', '´', 'rp'), K('Backspace', null, null, null, 'rp', 2, '⌫'),
    ],
    [
      K('Tab', null, null, null, 'lp', 1.5, 'Tab'),
      K('KeyQ', 'q', 'Q', null, 'lp'), K('KeyW', 'w', 'W', null, 'lr'), K('KeyE', 'e', 'E', '€', 'lm'),
      K('KeyR', 'r', 'R', null, 'li'), K('KeyT', 't', 'T', null, 'li'), K('KeyY', 'y', 'Y', null, 'ri'),
      K('KeyU', 'u', 'U', null, 'ri'), K('KeyI', 'i', 'I', null, 'rm'), K('KeyO', 'o', 'O', null, 'rr'),
      K('KeyP', 'p', 'P', null, 'rp'), K('BracketLeft', 'å', 'Å', null, 'rp'), K('BracketRight', '¨', '^', '~', 'rp'),
      K('Enter', null, null, null, 'rp', 1.5, 'Enter'),
    ],
    [
      K('CapsLock', null, null, null, 'lp', 1.75, 'Caps'),
      K('KeyA', 'a', 'A', null, 'lp'), K('KeyS', 's', 'S', null, 'lr'), K('KeyD', 'd', 'D', null, 'lm'),
      K('KeyF', 'f', 'F', null, 'li'), K('KeyG', 'g', 'G', null, 'li'), K('KeyH', 'h', 'H', null, 'ri'),
      K('KeyJ', 'j', 'J', null, 'ri'), K('KeyK', 'k', 'K', null, 'rm'), K('KeyL', 'l', 'L', null, 'rr'),
      K('Semicolon', 'ø', 'Ø', null, 'rp'), K('Quote', 'æ', 'Æ', null, 'rp'), K('Backslash', "'", '*', null, 'rp'),
      K('EnterLower', null, null, null, 'rp', 1.25, ''),
    ],
    [
      K('ShiftLeft', null, null, null, 'lp', 1.25, '⇧'), K('IntlBackslash', '<', '>', null, 'lp'),
      K('KeyZ', 'z', 'Z', null, 'lp'), K('KeyX', 'x', 'X', null, 'lr'), K('KeyC', 'c', 'C', null, 'lm'),
      K('KeyV', 'v', 'V', null, 'li'), K('KeyB', 'b', 'B', null, 'li'), K('KeyN', 'n', 'N', null, 'ri'),
      K('KeyM', 'm', 'M', null, 'ri'), K('Comma', ',', ';', null, 'rm'), K('Period', '.', ':', null, 'rr'),
      K('Slash', '-', '_', null, 'rp'), K('ShiftRight', null, null, null, 'rp', 2.75, '⇧ Shift'),
    ],
    [
      K('ControlLeft', null, null, null, null, 1.25, 'Ctrl'), K('MetaLeft', null, null, null, null, 1.25, 'Win'),
      K('AltLeft', null, null, null, null, 1.25, 'Alt'), K('Space', ' ', null, null, 'th', 6.25, ''),
      K('AltRight', null, null, null, 'th', 1.25, 'AltGr'), K('MetaRight', null, null, null, null, 1.25, 'Win'),
      K('ContextMenu', null, null, null, null, 1.25, 'Meny'), K('ControlRight', null, null, null, null, 1.25, 'Ctrl'),
    ],
  ];

  const DEAD = new Set(['¨', '^', '~', '`', '´']);
  const KEYS = {};
  const CHAR_MAP = {};
  ROWS.flat().forEach((k) => {
    KEYS[k.code] = k;
    if (k.label !== null) return;
    [['n', null], ['s', 'shift'], ['a', 'altgr']].forEach(([prop, mod]) => {
      const ch = k[prop];
      if (ch && !DEAD.has(ch) && !CHAR_MAP[ch]) CHAR_MAP[ch] = { code: k.code, mod };
    });
  });
  CHAR_MAP[' '] = { code: 'Space', mod: null };

  const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase();

  function locate(ch) {
    const loc = CHAR_MAP[ch];
    if (!loc) return null;
    const key = KEYS[loc.code];
    let modCode = null;
    let modFinger = null;
    if (loc.mod === 'shift') {
      // Shift tas med lillefingeren på motsatt hånd.
      const leftHand = key.f && key.f.startsWith('l');
      modCode = leftHand ? 'ShiftRight' : 'ShiftLeft';
      modFinger = leftHand ? 'rp' : 'lp';
    } else if (loc.mod === 'altgr') {
      modCode = 'AltRight';
      modFinger = 'th';
    }
    return { code: loc.code, finger: key.f, mod: loc.mod, modCode, modFinger };
  }

  function describe(ch) {
    const shown = ch === ' ' ? 'mellomrom' : `«${ch}»`;
    const loc = locate(ch);
    if (!loc) return `${shown} – ingen tastehjelp for dette tegnet`;
    let text = `${shown} – ${FINGER_NAMES[loc.finger]}`;
    if (loc.mod === 'shift') text += ` + ${loc.modCode === 'ShiftLeft' ? 'venstre' : 'høyre'} Shift (${FINGER_NAMES[loc.modFinger]})`;
    if (loc.mod === 'altgr') text += ' + AltGr (høyre tommel)';
    return text;
  }

  function create(container) {
    const els = new Map();
    container.innerHTML = '';
    container.classList.add('kb');
    ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach((k) => {
        const el = document.createElement('div');
        el.className = 'key' + (k.f ? ` f-${k.f}` : ' f-none');
        el.style.flexGrow = k.w;
        el.dataset.code = k.code;
        if (k.label !== null) {
          el.classList.add('special');
          el.innerHTML = `<span class="lbl">${k.label}</span>`;
        } else if (k.code === 'Space') {
          el.innerHTML = '';
        } else if (isLetter(k.n)) {
          el.innerHTML = `<span class="main">${k.s}</span>${k.a ? `<span class="alt">${k.a}</span>` : ''}`;
        } else {
          el.innerHTML = `<span class="top">${k.s ?? ''}</span><span class="bot">${k.n}</span>${k.a ? `<span class="alt">${k.a}</span>` : ''}`;
        }
        if (k.code === 'KeyF' || k.code === 'KeyJ') el.classList.add('bump');
        rowEl.appendChild(el);
        els.set(k.code, el);
      });
      container.appendChild(rowEl);
    });

    let highlighted = [];

    function highlight(ch) {
      highlighted.forEach((el) => el.classList.remove('next'));
      highlighted = [];
      if (ch === null || ch === undefined) return null;
      const loc = locate(ch);
      if (!loc) return null;
      [loc.code, loc.modCode].filter(Boolean).forEach((code) => {
        const el = els.get(code);
        if (el) { el.classList.add('next'); highlighted.push(el); }
      });
      return loc;
    }

    function flash(code, cls) {
      const el = els.get(code);
      if (!el) return;
      el.classList.remove('hit', 'miss');
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 160);
    }

    // rates: { code: { n, e } }
    function heat(rates) {
      els.forEach((el, code) => {
        const r = rates[code];
        el.style.removeProperty('--heat');
        el.classList.remove('heat');
        el.removeAttribute('title');
        if (!r || r.n === 0) return;
        const rate = r.e / r.n;
        el.classList.add('heat');
        el.style.setProperty('--heat', Math.min(1, rate / 0.15).toFixed(2));
        el.title = `${Math.round(rate * 100)} % feil (${r.e} av ${r.n})`;
      });
    }

    return { highlight, flash, heat };
  }

  return { create, locate, describe, isLetter, FINGER_NAMES };
})();

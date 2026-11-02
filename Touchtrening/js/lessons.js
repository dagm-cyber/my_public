// Leksjoner og generering av øvingstekst.
const Gen = (() => {
  const LESSONS = [
    { title: 'F og J', keys: 'fj', tip: 'Legg pekefingrene på F og J – kjenn etter de små kulene. Tomlene hviler på mellomromstasten.' },
    { title: 'D og K', keys: 'dk', tip: 'Langfingrene hviler på D og K.' },
    { title: 'S og L', keys: 'sl', tip: 'Ringfingrene hviler på S og L.' },
    { title: 'A og Ø', keys: 'aø', tip: 'Lillefingrene hviler på A og Ø. Nå kan du hele grunnstillingen!' },
    { title: 'G, H og Æ', keys: 'ghæ', tip: 'Pekefingrene strekker seg innover til G og H. Høyre lillefinger tar Æ.' },
    { title: 'E og I', keys: 'ei', tip: 'Langfingrene går rett opp – og tilbake til grunnstilling.' },
    { title: 'R og U', keys: 'ru', tip: 'Pekefingrene går opp til R og U.' },
    { title: 'T og O', keys: 'to', tip: 'Venstre pekefinger strekker seg til T, høyre ringfinger går opp til O.' },
    { title: 'N og M', keys: 'nm', tip: 'Høyre pekefinger går ned til N og M.' },
    { title: 'V og B', keys: 'vb', tip: 'Venstre pekefinger går ned til V og B.' },
    { title: 'C, komma og punktum', keys: 'c,.', tip: 'Venstre langfinger tar C. Komma med høyre langfinger, punktum med høyre ringfinger.' },
    { title: 'W og Y', keys: 'wy', tip: 'Venstre ringfinger går opp til W, høyre pekefinger til Y.' },
    { title: 'P og Å', keys: 'på', tip: 'Høyre lillefinger går opp til P og Å.' },
    { title: 'Q, X og Z', keys: 'qxz', tip: 'Venstre lillefinger tar Q og Z, venstre ringfinger tar X.' },
    { title: 'Store bokstaver', special: 'caps', tip: 'Hold inne Shift med lillefingeren på motsatt hånd av bokstaven.' },
    { title: 'Tall', special: 'numbers', tip: 'Strekk fingeren rett opp fra grunnstillingen, og gå tilbake etterpå.' },
    { title: 'Setninger med tegn', special: 'punct', tip: 'Hele setninger med store bokstaver og tegnsetting.' },
  ];

  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const wordPool = (lang) => (lang === 'mix' ? [...new Set([...WORDS.no, ...WORDS.en])] : WORDS[lang]);
  const textPool = (lang) => (lang === 'mix' ? [...TEXTS.no, ...TEXTS.en] : TEXTS[lang]);

  function drill(focus, letters) {
    const len = 2 + rand(4);
    let s = '';
    for (let i = 0; i < len; i++) s += Math.random() < 0.5 ? pick(focus) : pick(letters);
    return s;
  }

  function lesson(index, lang) {
    const L = LESSONS[index];
    if (L.special === 'caps') return caps(lang);
    if (L.special === 'numbers') return numbers(lang);
    if (L.special === 'punct') return sentences(3, lang);

    let allowed = '';
    for (let i = 0; i <= index; i++) allowed += LESSONS[i].keys || '';
    const letters = [...allowed].filter(Keyboard.isLetter);
    const hasComma = allowed.includes(',');
    const hasPeriod = allowed.includes('.');
    const focus = [...L.keys].filter(Keyboard.isLetter);
    const set = new Set(letters);
    const words = wordPool(lang).filter((w) => [...w].every((c) => set.has(c)));
    const preferred = words.filter((w) => focus.some((c) => w.includes(c)));

    const tokens = focus.map((c) => c.repeat(3));
    if (focus.length > 1) tokens.push(focus.join(''), [...focus].reverse().join(''));
    while (tokens.length < 32) {
      const r = Math.random();
      if (preferred.length >= 3 && r < 0.55) tokens.push(pick(preferred));
      else if (words.length >= 6 && r < 0.75) tokens.push(pick(words));
      else tokens.push(drill(focus, letters));
    }

    const punctChance = L.keys.includes(',') ? 0.15 : 0.08;
    return tokens.map((t, i) => {
      if (i === tokens.length - 1) return hasPeriod ? `${t}.` : t;
      if (hasComma && Math.random() < punctChance) return `${t},`;
      if (hasPeriod && Math.random() < punctChance) return `${t}.`;
      return t;
    }).join(' ');
  }

  function caps(lang) {
    const pool = wordPool(lang).filter((w) => w.length >= 2);
    const out = [];
    for (let i = 0; i < 28; i++) {
      const w = pick(pool);
      out.push(Math.random() < 0.55 ? w[0].toUpperCase() + w.slice(1) : w);
    }
    return out.join(' ');
  }

  function numbers(lang) {
    const pool = wordPool(lang);
    const out = ['12345', '67890'];
    while (out.length < 28) {
      if (Math.random() < 0.6) {
        const len = 1 + rand(4);
        let n = String(1 + rand(9));
        for (let i = 1; i < len; i++) n += rand(10);
        out.push(n);
      } else {
        out.push(pick(pool));
      }
    }
    return out.join(' ');
  }

  function words(n, lang) {
    const pool = wordPool(lang).filter((w) => w.length >= 2);
    return Array.from({ length: n }, () => pick(pool)).join(' ');
  }

  function sentences(n, lang) {
    let pool = [];
    const out = [];
    while (out.length < n) {
      if (pool.length === 0) pool = shuffle(textPool(lang));
      out.push(pool.pop());
    }
    return out.join(' ');
  }

  function weak(chars, n, lang) {
    const pool = wordPool(lang).filter((w) => chars.some((c) => w.includes(c)));
    const letters = [...'asdfghjkløæ'];
    const out = [];
    while (out.length < n) {
      if (pool.length >= 5 && Math.random() < 0.65) out.push(pick(pool));
      else out.push(drill(chars, [...chars, ...letters]));
    }
    return out.join(' ');
  }

  return { LESSONS, lesson, words, sentences, weak };
})();

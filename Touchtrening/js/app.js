const App = (() => {
  const $ = (id) => document.getElementById(id);
  const LENGTHS = {
    short: { words: 25, sentences: 2 },
    long: { words: 60, sentences: 5 },
    t60: { limit: 60 },
    t120: { limit: 120 },
  };
  const FINGER_ORDER = [
    ['lp', 'Lille'], ['lr', 'Ring'], ['lm', 'Lang'], ['li', 'Peke'], ['th', 'Tomler'],
    ['ri', 'Peke'], ['rm', 'Lang'], ['rr', 'Ring'], ['rp', 'Lille'],
  ];

  let data = Store.load();
  let runKb = null;
  let statsKb = null;
  let exercise = null;
  let run = null;
  let timer = null;
  let current = 'start';

  // ── Skjermer ──────────────────────────────────────────────
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`screen-${name}`).classList.add('active');
    current = name;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function goHome() {
    stopTimer();
    run = null;
    show('start');
  }

  // ── Innstillinger ─────────────────────────────────────────
  function renderSettings() {
    document.querySelectorAll('.pill-group[data-setting]').forEach((group) => {
      const value = String(data.settings[group.dataset.setting]);
      group.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p.dataset.value === value));
    });
  }

  function bindSettings() {
    document.querySelectorAll('.pill-group[data-setting]').forEach((group) => {
      group.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        let v = pill.dataset.value;
        if (v === 'true' || v === 'false') v = v === 'true';
        data.settings[group.dataset.setting] = v;
        Store.save(data);
        renderSettings();
      });
    });
  }

  // ── Leksjonsliste ─────────────────────────────────────────
  function starsText(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function renderLessons() {
    const grid = $('lesson-grid');
    grid.innerHTML = '';
    const recommended = Gen.LESSONS.findIndex((_, i) => !((data.lessons[i] || {}).stars >= 2));
    Gen.LESSONS.forEach((L, i) => {
      const r = data.lessons[i] || {};
      const btn = document.createElement('button');
      btn.className = 'lesson-card' + (i === recommended ? ' recommended' : '');
      const keys = L.keys ? [...L.keys].map((k) => `<kbd>${k.toUpperCase()}</kbd>`).join('') : '';
      btn.innerHTML = `
        <span class="lesson-num">${i + 1}</span>
        <span class="lesson-body">
          <span class="lesson-title">${L.title}</span>
          <span class="lesson-keys">${keys}</span>
        </span>
        <span class="lesson-meta">
          <span class="lesson-stars">${starsText(r.stars || 0)}</span>
          <span class="lesson-best">${r.bestWpm ? `${r.bestWpm} ord/min` : ''}</span>
        </span>`;
      btn.addEventListener('click', () => startExercise({ kind: 'lesson', index: i }));
      grid.appendChild(btn);
    });
  }

  // ── Øvelser ───────────────────────────────────────────────
  function weakestKeys(count, minAttempts = 15) {
    return Object.entries(data.keys)
      .filter(([ch, s]) => ch !== ' ' && s.n >= minAttempts && s.e > 0)
      .map(([ch, s]) => ({ ch, n: s.n, e: s.e, rate: s.e / s.n }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, count);
  }

  function normalizeCustom(text) {
    return text
      .replace(/[“”„«»]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function build(ex) {
    const { lang, length } = data.settings;
    const len = LENGTHS[length] || LENGTHS.short;
    switch (ex.kind) {
      case 'lesson': {
        const L = Gen.LESSONS[ex.index];
        return { title: `Leksjon ${ex.index + 1}: ${L.title}`, tip: L.tip, text: Gen.lesson(ex.index, lang) };
      }
      case 'words':
        return len.limit
          ? { title: 'Ordøving', text: Gen.words(40, lang), more: () => Gen.words(20, lang), limit: len.limit }
          : { title: 'Ordøving', text: Gen.words(len.words, lang) };
      case 'text':
        return len.limit
          ? { title: 'Setninger', text: Gen.sentences(4, lang), more: () => Gen.sentences(2, lang), limit: len.limit }
          : { title: 'Setninger', text: Gen.sentences(len.sentences, lang) };
      case 'weak': {
        const title = `Svake taster: ${ex.chars.join(' ')}`;
        const tip = 'Ordene og øvelsene inneholder tastene du oftest bommer på.';
        return len.limit
          ? { title, tip, text: Gen.weak(ex.chars, 40, lang), more: () => Gen.weak(ex.chars, 20, lang), limit: len.limit }
          : { title, tip, text: Gen.weak(ex.chars, len.words, lang) };
      }
      case 'custom':
        return { title: 'Egen tekst', text: ex.text };
      default:
        return null;
    }
  }

  function startExercise(ex) {
    exercise = ex;
    beginRun(build(ex));
  }

  // ── Skriveøkt ─────────────────────────────────────────────
  function beginRun(cfg) {
    stopTimer();
    run = {
      cfg,
      target: cfg.text,
      pos: 0,
      status: [],
      spans: [],
      keystrokes: 0,
      wrong: 0,
      posErr: false,
      start: 0,
      end: 0,
      done: false,
      missed: {},
      keyStats: {},
      stop: data.settings.stopOnError,
    };
    $('run-title').textContent = cfg.title;
    $('run-tip').textContent = cfg.tip || '';
    $('run-tip').hidden = !cfg.tip;
    $('run-keyboard-wrap').hidden = !data.settings.showKeyboard;
    $('stat-time-label').textContent = cfg.limit ? 'igjen' : 'tid';
    $('start-overlay').classList.remove('hidden');
    $('progress-fill').parentElement.hidden = !!cfg.limit;
    const inner = $('typeinner');
    inner.innerHTML = '';
    inner.style.transform = '';
    appendSpans(0);
    show('run');
    refresh();
    updateStats();
  }

  function appendSpans(from) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < run.target.length; i++) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = run.target[i];
      run.spans.push(s);
      frag.appendChild(s);
    }
    $('typeinner').appendChild(frag);
  }

  function paint(i) {
    const s = run.spans[i];
    if (!s) return;
    let cls = 'ch';
    if (run.status[i]) cls += ` ${run.status[i]}`;
    if (i === run.pos) {
      cls += ' cur';
      if (run.posErr) cls += ' wrong';
    }
    if (run.target[i] === ' ') cls += ' sp';
    s.className = cls;
  }

  function refresh() {
    const expected = run.done ? null : run.target[run.pos];
    const loc = runKb.highlight(expected);
    document.querySelectorAll('#fingers .finger').forEach((f) => {
      f.classList.toggle('active', !!loc && (f.dataset.f === loc.finger || f.dataset.f === loc.modFinger));
    });
    $('next-hint').textContent = expected !== undefined && expected !== null ? `Neste: ${Keyboard.describe(expected)}` : '';
    scrollToCursor();
    if (!run.cfg.limit) $('progress-fill').style.width = `${(run.pos / run.target.length) * 100}%`;
  }

  function scrollToCursor() {
    const inner = $('typeinner');
    const span = run.spans[Math.min(run.pos, run.spans.length - 1)];
    if (!span) return;
    const lineH = parseFloat(getComputedStyle(inner).lineHeight) || 40;
    const offset = Math.max(0, span.offsetTop - lineH);
    inner.style.transform = `translateY(${-offset}px)`;
  }

  function recordKey(ch, hadError) {
    const ks = run.keyStats[ch] || (run.keyStats[ch] = { n: 0, e: 0 });
    ks.n++;
    if (hadError) ks.e++;
  }

  function startClock() {
    if (run.start) return;
    run.start = performance.now();
    $('start-overlay').classList.add('hidden');
    timer = setInterval(tick, 200);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function type(ch) {
    startClock();
    const expected = run.target[run.pos];
    const prev = run.pos;
    run.keystrokes++;
    const ok = ch === expected;

    if (run.stop) {
      if (ok) {
        run.status[run.pos] = run.posErr ? 'fixed' : 'ok';
        recordKey(expected, run.posErr);
        run.posErr = false;
        run.pos++;
      } else {
        run.wrong++;
        if (!run.posErr) run.missed[expected] = (run.missed[expected] || 0) + 1;
        run.posErr = true;
      }
    } else {
      run.status[run.pos] = ok ? 'ok' : 'err';
      recordKey(expected, !ok);
      if (!ok) {
        run.wrong++;
        run.missed[expected] = (run.missed[expected] || 0) + 1;
      }
      run.pos++;
    }

    if (run.cfg.more && run.target.length - run.pos < 120) {
      const from = run.target.length;
      run.target += ` ${run.cfg.more()}`;
      appendSpans(from);
    }

    paint(prev);
    paint(run.pos);
    if (!run.cfg.limit && run.pos >= run.target.length) {
      finish();
      return ok;
    }
    refresh();
    return ok;
  }

  function backspace() {
    if (run.stop || run.pos === 0) return;
    run.pos--;
    run.status[run.pos] = undefined;
    paint(run.pos + 1);
    paint(run.pos);
    refresh();
  }

  function elapsedMs() {
    if (!run.start) return 0;
    const end = run.end || performance.now();
    const ms = end - run.start;
    return run.cfg.limit ? Math.min(ms, run.cfg.limit * 1000) : ms;
  }

  function metrics() {
    const ms = elapsedMs();
    let correct = 0;
    for (let i = 0; i < run.pos; i++) if (run.status[i] === 'ok' || run.status[i] === 'fixed') correct++;
    const minutes = ms / 60000;
    const wpm = minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
    const acc = run.keystrokes ? Math.round(((run.keystrokes - run.wrong) / run.keystrokes) * 1000) / 10 : 100;
    return { ms, wpm, acc, correct, errors: run.wrong };
  }

  const fmtTime = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function updateStats() {
    const m = metrics();
    $('stat-wpm').textContent = m.ms > 2000 ? m.wpm : '–';
    $('stat-acc').textContent = `${m.acc.toLocaleString('nb-NO')} %`;
    $('stat-time').textContent = run.cfg.limit ? fmtTime(run.cfg.limit * 1000 - m.ms) : fmtTime(m.ms);
  }

  function tick() {
    if (!run || run.done) return;
    updateStats();
    if (run.cfg.limit && elapsedMs() >= run.cfg.limit * 1000) finish();
  }

  function finish() {
    run.done = true;
    run.end = performance.now();
    stopTimer();
    runKb.highlight(null);
    const m = metrics();

    Object.entries(run.keyStats).forEach(([ch, s]) => {
      const k = data.keys[ch] || (data.keys[ch] = { n: 0, e: 0 });
      k.n += s.n;
      k.e += s.e;
    });
    data.history.push({ t: Date.now(), title: run.cfg.title, wpm: m.wpm, acc: m.acc, ms: Math.round(m.ms) });
    if (data.history.length > 200) data.history = data.history.slice(-200);

    let stars = null;
    let improved = false;
    if (exercise.kind === 'lesson') {
      stars = m.acc >= 98 ? 3 : m.acc >= 95 ? 2 : m.acc >= 90 ? 1 : 0;
      const r = data.lessons[exercise.index] || (data.lessons[exercise.index] = { stars: 0, bestWpm: 0, bestAcc: 0 });
      improved = stars > r.stars || (stars >= 1 && m.wpm > r.bestWpm);
      r.stars = Math.max(r.stars, stars);
      if (stars >= 1) r.bestWpm = Math.max(r.bestWpm, m.wpm);
      r.bestAcc = Math.max(r.bestAcc, m.acc);
    }
    Store.save(data);
    showResults(m, stars, improved);
  }

  // ── Resultat ──────────────────────────────────────────────
  function keyChip(ch, extra) {
    const label = ch === ' ' ? '␣' : ch;
    return `<span class="miss-chip"><kbd>${escapeHtml(label)}</kbd>${extra}</span>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showResults(m, stars, improved) {
    $('res-title').textContent = run.cfg.title;
    $('res-wpm').textContent = m.wpm;
    $('res-acc').textContent = `${m.acc.toLocaleString('nb-NO')} %`;
    $('res-time').textContent = fmtTime(m.ms);
    $('res-errors').textContent = m.errors;
    $('res-stars').textContent = stars === null ? '' : starsText(stars);

    let msg;
    if (stars === 0) msg = 'Målet er minst 90 % nøyaktighet. Senk farten og prøv igjen – presisjon først!';
    else if (m.acc < 95) msg = 'Bra! Prøv å holde nøyaktigheten over 95 % før du øker farten.';
    else if (m.wpm < 25) msg = 'Godt jobbet! Nøyaktigheten er god – farten kommer med øving.';
    else msg = 'Strålende! Fortsett slik.';
    if (improved) msg = `Ny personlig rekord! ${msg}`;
    $('res-msg').textContent = msg;

    const missed = Object.entries(run.missed).sort((a, b) => b[1] - a[1]).slice(0, 8);
    $('res-missed').innerHTML = missed.length
      ? `<span class="missed-label">Bommet på:</span>${missed.map(([ch, n]) => keyChip(ch, `×${n}`)).join('')}`
      : '<span class="missed-label">Ingen feil – perfekt! 🎉</span>';

    const actions = $('res-actions');
    actions.innerHTML = '';
    const hasNext = exercise.kind === 'lesson' && stars >= 1 && exercise.index < Gen.LESSONS.length - 1;
    const addBtn = (text, cls, fn) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = text;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    if (hasNext) addBtn('Neste leksjon →', 'btn-primary', nextLesson);
    addBtn('Prøv igjen', hasNext ? 'btn-ghost' : 'btn-primary', retry);
    if (exercise.kind === 'lesson') addBtn('Leksjoner', 'btn-ghost', openLessons);
    addBtn('Meny', 'btn-ghost', goHome);
    $('res-enter-hint').textContent = hasNext ? 'neste leksjon' : 'prøv igjen';
    results.enter = hasNext ? nextLesson : retry;
    show('results');
  }
  const results = { enter: null };

  function retry() {
    startExercise(exercise);
  }

  function nextLesson() {
    startExercise({ kind: 'lesson', index: exercise.index + 1 });
  }

  function openLessons() {
    renderLessons();
    show('lessons');
  }

  // ── Statistikk ────────────────────────────────────────────
  function openStats() {
    const h = data.history;
    const last = h.slice(-10);
    const avg = (arr, f) => (arr.length ? Math.round(arr.reduce((s, x) => s + f(x), 0) / arr.length * 10) / 10 : 0);
    const totalMs = h.reduce((s, x) => s + (x.ms || 0), 0);
    const stat = (v, l) => `<div class="result-stat"><span class="result-value">${v}</span><span class="result-label">${l}</span></div>`;
    $('stats-summary').innerHTML =
      stat(h.length, 'økter') +
      stat(fmtTime(totalMs), 'total tid') +
      stat(h.length ? Math.max(...h.map((x) => x.wpm)) : 0, 'beste ord/min') +
      stat(Math.round(avg(last, (x) => x.wpm)), 'snitt ord/min (siste 10)') +
      stat(`${avg(last, (x) => x.acc).toLocaleString('nb-NO')} %`, 'snitt nøyaktighet (siste 10)');

    const rates = {};
    Object.entries(data.keys).forEach(([ch, s]) => {
      const loc = Keyboard.locate(ch);
      if (!loc) return;
      const r = rates[loc.code] || (rates[loc.code] = { n: 0, e: 0 });
      r.n += s.n;
      r.e += s.e;
    });
    statsKb.heat(rates);

    const weak = weakestKeys(10, 10);
    $('stats-weak').innerHTML = weak.length
      ? weak.map((w) => keyChip(w.ch, `${Math.round(w.rate * 100)} %`)).join('')
      : '<span class="missed-label">Ikke nok data ennå – fullfør noen økter først.</span>';

    const rows = h.slice(-15).reverse().map((x) => {
      const d = new Date(x.t);
      const date = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
      const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
      return `<tr><td>${date} ${time}</td><td>${escapeHtml(x.title)}</td><td>${x.wpm} ord/min</td><td>${x.acc.toLocaleString('nb-NO')} %</td></tr>`;
    });
    $('stats-history').innerHTML = rows.length ? rows.join('') : '<tr><td>Ingen økter ennå.</td></tr>';
    show('stats');
  }

  function resetStats() {
    if (!confirm('Vil du slette all statistikk og alle leksjonsresultater?')) return;
    const settings = data.settings;
    data = Store.reset();
    data.settings = settings;
    Store.save(data);
    openStats();
  }

  // ── Handlinger og tastatur ────────────────────────────────
  const ACTIONS = {
    home: goHome,
    lessons: openLessons,
    stats: openStats,
    reset: resetStats,
    restart: () => exercise && startExercise(exercise),
    words: () => startExercise({ kind: 'words' }),
    text: () => startExercise({ kind: 'text' }),
    weak: () => {
      const weak = weakestKeys(4);
      if (weak.length === 0) {
        toast('Ikke nok data ennå – fullfør noen leksjoner eller ordøvinger først.');
        return;
      }
      startExercise({ kind: 'weak', chars: weak.map((w) => w.ch) });
    },
    custom: () => {
      $('custom-text').value = data.custom || '';
      show('custom');
      $('custom-text').focus();
    },
    'start-custom': () => {
      const text = normalizeCustom($('custom-text').value);
      if (!text) {
        toast('Skriv eller lim inn en tekst først.');
        return;
      }
      data.custom = $('custom-text').value;
      Store.save(data);
      startExercise({ kind: 'custom', text });
    },
  };

  function onKeyDown(e) {
    if (current === 'run' && run) {
      if (e.key === 'Escape') { e.preventDefault(); goHome(); return; }
      if (e.key === 'Tab') { e.preventDefault(); startExercise(exercise); return; }
      if (run.done) return;
      const altGr = e.getModifierState && e.getModifierState('AltGraph');
      if ((e.ctrlKey || e.metaKey) && !altGr && !(e.ctrlKey && e.altKey)) return;
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
      if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      if (e.key.length !== 1) return; // Shift, dødtaster osv.
      e.preventDefault();
      const ok = type(e.key);
      runKb.flash(e.code, ok ? 'hit' : 'miss');
      return;
    }
    if (current === 'results') {
      if (e.key === 'Enter') { e.preventDefault(); results.enter && results.enter(); }
      else if (e.key === 'Tab') { e.preventDefault(); retry(); }
      else if (e.key === 'Escape') goHome();
      return;
    }
    if (e.key === 'Escape' && current !== 'start') goHome();
  }

  function renderFingers() {
    $('fingers').innerHTML = FINGER_ORDER
      .map(([f, label]) => `<span class="finger f-${f}" data-f="${f}">${label}</span>`)
      .join('');
  }

  function init() {
    runKb = Keyboard.create($('run-keyboard'));
    statsKb = Keyboard.create($('stats-keyboard'));
    renderFingers();
    bindSettings();
    renderSettings();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && ACTIONS[btn.dataset.action]) ACTIONS[btn.dataset.action]();
    });
    window.addEventListener('keydown', onKeyDown);
    // Hindrer at nettleseren mister fokus/viser hurtigsøk når man skriver apostrof.
    window.addEventListener('keypress', (e) => { if (current === 'run') e.preventDefault(); });
  }

  init();
  return { show };
})();

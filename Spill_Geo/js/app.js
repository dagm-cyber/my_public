/* ─────────────────────────────────────────────────────────
   app.js  –  Main application controller
   ───────────────────────────────────────────────────────── */
const App = (() => {

  // ── State ───────────────────────────────────────────────
  const state = {
    mode:          null,    // 'world' | 'norway'
    categories:    new Set(),
    difficulty:    'medium',
    questionCount: 20,
    continent:     null,    // null = all continents; 'Europe', 'Asia', etc.
    timerSeconds:  0,       // 0 = off; 15 or 30
    data:          null,
    session:       null,
  };

  // ── Category definitions per mode ───────────────────────
  const WORLD_CATS = [
    { id: 'capitals',   label: '🗺️ Countries & Capitals' },
    { id: 'flags',      label: '🚩 Flags' },
    { id: 'currencies', label: '💰 Currencies' },
    { id: 'languages',  label: '🗣️ Languages' },
    { id: 'mountains',  label: '⛰️ Mountains & Rivers' },
    { id: 'lakes',      label: '💧 Lakes' },
    { id: 'map',        label: '📍 Locate on Map' },
  ];

  const NORWAY_CATS = [
    { id: 'counties',  label: '🏛️ Counties (Fylker)' },
    { id: 'mountains', label: '⛰️ Mountains' },
    { id: 'lakes',     label: '💧 Lakes' },
    { id: 'fjords',    label: '🌊 Fjords' },
    { id: 'cities',    label: '🏙️ Cities' },
  ];
  const USA_CATS = [
    { id: 'states', label: '🏖️ States & Capitals' },
    { id: 'cities', label: '🏙️ Major Cities' },
    { id: 'map',    label: '📍 Locate on Map' },
  ];
  const DIFF_HINTS = {
    easy:   'Easy: well-known countries and landmarks.',
    medium: 'Medium: common countries and landmarks.',
    hard:   'Hard: all countries, free-text capitals.',
  };

  // ── Screen management ────────────────────────────────────

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');

    if (id === 'screen-map') {
      // Leaflet must be told the container size changed
      requestAnimationFrame(() => MapModule.invalidateSize());
    }
  }

  // ── Mode selection ────────────────────────────────────────

  async function selectMode(mode) {
    state.mode = mode;
    state.categories.clear();

    // Show loading state on start button
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.textContent = 'Loading…';

    try {
      state.data = await Data.load(mode);
    } catch (err) {
      alert('Failed to load data. Please check your internet connection and try again.');
      console.error(err);
      return;
    }

    const cats = mode === 'world' ? WORLD_CATS
                : mode === 'usa'   ? USA_CATS
                :                    NORWAY_CATS;
    // Default: select all categories
    cats.forEach(c => state.categories.add(c.id));

    const title = document.getElementById('settings-title');
    if (title) title.textContent = mode === 'norway' ? '🇳🇴 Norway Settings'
                                 : mode === 'usa'    ? '🇺🇸 United States Settings'
                                 :                    '🌍 World Settings';

    _renderCategories(cats);
    _syncDiffPills();
    _syncCountPills();

    // Continent selector: World mode only; reset to 'all' on each mode switch
    state.continent = null;
    const contSection = document.getElementById('continent-section');
    if (contSection) contSection.style.display = mode === 'world' ? '' : 'none';
    _syncContinentPills();
    _syncTimerPills();

    if (startBtn) startBtn.textContent = 'Start Quiz →';

    showScreen('screen-settings');
  }

  function _renderCategories(cats) {
    const container = document.getElementById('categories-container');
    if (!container) return;
    container.innerHTML = '';

    for (const cat of cats) {
      const chip = document.createElement('div');
      chip.className = 'category-chip';

      const cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.id      = `cat-${cat.id}`;
      cb.checked = state.categories.has(cat.id);
      cb.addEventListener('change', () => {
        if (cb.checked) state.categories.add(cat.id);
        else            state.categories.delete(cat.id);
        _syncToggleAllBtn();
      });

      const lbl = document.createElement('label');
      lbl.htmlFor   = cb.id;
      lbl.textContent = cat.label;

      chip.appendChild(cb);
      chip.appendChild(lbl);
      container.appendChild(chip);
    }
    _syncToggleAllBtn();
  }

  function toggleAllCategories() {
    const cats = state.mode === 'world' ? WORLD_CATS
               : state.mode === 'usa'   ? USA_CATS
               :                          NORWAY_CATS;
    const allSelected = cats.every(c => state.categories.has(c.id));

    if (allSelected) {
      // Deselect all
      state.categories.clear();
    } else {
      // Select all
      cats.forEach(c => state.categories.add(c.id));
    }

    // Sync checkboxes in DOM
    cats.forEach(cat => {
      const cb = document.getElementById(`cat-${cat.id}`);
      if (cb) cb.checked = state.categories.has(cat.id);
    });
    _syncToggleAllBtn();
  }

  function _syncToggleAllBtn() {
    const btn = document.getElementById('cat-toggle-all');
    if (!btn) return;
    const cats = state.mode === 'world' ? WORLD_CATS
               : state.mode === 'usa'   ? USA_CATS
               :                          NORWAY_CATS;
    const allSelected = cats.every(c => state.categories.has(c.id));
    btn.textContent = allSelected ? 'Deselect All' : 'Select All';
  }

  // ── Difficulty & Count ────────────────────────────────────

  function setDifficulty(diff) {
    state.difficulty = diff;
    _syncDiffPills();
    const hint = document.getElementById('diff-hint');
    if (hint) hint.textContent = DIFF_HINTS[diff] || '';
  }

  function setCount(n) {
    state.questionCount = n;
    _syncCountPills();
  }

  function setTimer(s) {
    state.timerSeconds = s;
    _syncTimerPills();
  }

  function _syncTimerPills() {
    document.querySelectorAll('#timer-group .pill-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.timer) === state.timerSeconds);
    });
  }

  function setContinent(c) {
    state.continent = (c === 'all') ? null : c;
    _syncContinentPills();
  }

  function _syncContinentPills() {
    const current = state.continent || 'all';
    document.querySelectorAll('#continent-group .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.continent === current);
    });
  }

  function _syncDiffPills() {
    document.querySelectorAll('#diff-group .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === state.difficulty);
    });
  }

  function _syncCountPills() {
    document.querySelectorAll('#count-group .pill-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.count) === state.questionCount);
    });
  }
  // ── Timer ──────────────────────────────────────────────

  let _timerHandle = null;

  function _startTimer() {
    if (!state.timerSeconds) { const t = _el('countdown-text'); if (t) t.textContent = ''; return; }
    _stopTimer();

    let remaining = state.timerSeconds;
    const bar  = _el('countdown-bar');
    const wrap = _el('countdown-bar-wrap');
    const txt  = _el('countdown-text');

    bar.style.transition  = 'none';
    bar.style.width       = '100%';
    bar.style.background  = 'var(--success)';
    txt.style.color       = 'var(--accent)';
    wrap.classList.add('active');
    txt.textContent = `⏱ ${remaining}`;
    void bar.offsetWidth;   // force reflow before transition starts

    _timerHandle = setInterval(() => {
      remaining--;
      bar.style.transition = 'width 1s linear';
      bar.style.width      = `${(remaining / state.timerSeconds) * 100}%`;

      if (remaining <= 5) {
        bar.style.background = 'var(--error)';
        txt.style.color      = 'var(--error)';
      } else if (remaining <= 10) {
        bar.style.background = 'var(--gold)';
        txt.style.color      = 'var(--gold)';
      }

      txt.textContent = `⏱ ${remaining}`;

      if (remaining <= 0) { _stopTimer(); _handleTimerExpired(); }
    }, 1000);
  }

  function _stopTimer() {
    clearInterval(_timerHandle);
    _timerHandle = null;
    const wrap = _el('countdown-bar-wrap');
    if (wrap) wrap.classList.remove('active');
    const txt = _el('countdown-text');
    if (txt) txt.textContent = '';
  }

  function _handleTimerExpired() {
    const session = state.session;
    if (!session || session.isComplete) return;
    const q = session.currentQuestion;
    if (q.type === 'map') return;

    session.checkAnswer('__timeout__');

    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.textContent === q.correctAnswer) btn.classList.add('correct');
    });
    const inp = _el('text-answer-input');  if (inp)    inp.disabled    = true;
    const sub = _el('text-answer-submit'); if (sub)    sub.disabled    = true;

    _showFeedback(false, q.correctAnswer, q, true);
    setTimeout(() => {
      session.advance();
      if (state.session.isComplete) _showResults(); else _renderCurrentQuestion();
    }, 1600);
  }
  // ── Game start ────────────────────────────────────────────

  async function startGame() {
    if (state.categories.size === 0) {
      alert('Please select at least one category.');
      return;
    }

    const questions = Questions.buildPool(
      state.data,
      state.mode,
      [...state.categories],
      state.difficulty,
      state.questionCount,
      state.continent        // null = all continents
    );

    if (questions.length === 0) {
      alert('Not enough questions for the selected options. Try adding more categories or changing difficulty.');
      return;
    }

    state.session = new QuizSession(questions);

    // Pre-init map if map questions exist (world or USA)
    if (questions.some(q => q.type === 'map' || q.type === 'usa-map')) {
      MapModule.startNewGame(state.continent);
      MapModule.init().catch(console.error);
    }

    showScreen('screen-quiz');
    _renderCurrentQuestion();
  }

  // ── Question rendering ────────────────────────────────────

  function _renderCurrentQuestion() {
    const session = state.session;
    if (session.isComplete) {
      _showResults();
      return;
    }

    const q = session.currentQuestion;

    // Update header
    _el('question-counter').textContent = `${session.index + 1} / ${session.total}`;
    _el('score-badge').textContent      = `${session.score} pts`;
    _el('progress-fill').style.width    = `${session.progressPct}%`;

    if (q.type === 'map') {
      _stopTimer();
      _renderMapQuestion(q);
      return;
    }

    if (q.type === 'usa-map') {
      _stopTimer();
      _renderUSAMapQuestion(q);
      return;
    }

    // Reset card state
    _el('question-image-wrap').classList.remove('visible');
    _el('options-grid').innerHTML = '';
    _el('text-answer-wrap').classList.remove('visible');
    _el('feedback-box').classList.remove('visible', 'correct-fb', 'wrong-fb');
    const _hintEl = _el('feedback-hint'); if (_hintEl) _hintEl.innerHTML = '';

    _el('question-category-tag').textContent = q.category;
    _el('question-text').textContent         = q.text;

    if (q.type === 'mcq-image' && q.imageUrl) {
      _el('question-image').src = q.imageUrl;
      _el('question-image-wrap').classList.add('visible');
    }

    if (q.type === 'text') {
      _el('text-answer-wrap').classList.add('visible');
      const input = _el('text-answer-input');
      input.value = '';
      input.disabled = false;
      _el('text-answer-submit').disabled = false;
      input.focus();
    } else {
      // MCQ or mcq-image
      _renderOptions(q.options, q.correctAnswer);
    }

    showScreen('screen-quiz');
    _startTimer();
  }

  function _renderOptions(options, correctAnswer) {
    const grid = _el('options-grid');
    grid.innerHTML = '';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className   = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => _handleMCQAnswer(opt));
      grid.appendChild(btn);
    }
  }

  // ── Answer handling ───────────────────────────────────────

  function _handleMCQAnswer(chosen) {
    const session  = state.session;
    const q        = session.currentQuestion;
    const correct  = session.checkAnswer(chosen);

    _stopTimer();

    // Lock all buttons
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.textContent === q.correctAnswer) btn.classList.add('correct');
      else if (btn.textContent === chosen && !correct) btn.classList.add('wrong');
    });

    _showFeedback(correct, q.correctAnswer, q);
    setTimeout(() => {
      session.advance();
      if (state.session.isComplete) _showResults(); else _renderCurrentQuestion();
    }, 1600);
  }

  function submitTextAnswer() {
    const input = _el('text-answer-input');
    const value = input.value.trim();
    if (!value) return;

    const session = state.session;
    const q       = session.currentQuestion;
    const correct = session.checkAnswer(value);

    input.disabled = true;
    _el('text-answer-submit').disabled = true;

    _stopTimer();
    _showFeedback(correct, q.correctAnswer, q);
    setTimeout(() => {
      session.advance();
      if (state.session.isComplete) _showResults(); else _renderCurrentQuestion();
    }, 1600);
  }

  function _showFeedback(correct, correctAnswer, question = null, timeout = false) {
    const box = _el('feedback-box');
    box.className = 'feedback-box visible ' + (correct ? 'correct-fb' : 'wrong-fb');
    _el('feedback-icon').textContent = correct ? '✓' : (timeout ? '⏱' : '✗');
    _el('feedback-text').textContent = correct
      ? 'Correct!'
      : `${timeout ? 'Time up!' : 'Wrong.'} The answer is: ${correctAnswer}`;

    const hintEl = _el('feedback-hint');
    if (hintEl) hintEl.innerHTML = (!correct && question) ? _getAnswerHint(question) : '';

    _el('score-badge').textContent = `${state.session.score} pts`;
  }

  function _getAnswerHint(question) {
    if (!state.data) return '';
    const ans = question.correctAnswer;
    const cat = question.category;
    try {
      if (state.mode === 'world') {
        if (['Capitals', 'Flags', 'Currencies', 'Languages'].includes(cat)) {
          const c = (state.data.countries || []).find(x =>
            x.name === ans || x.capital === ans ||
            (x.currency && x.currency === ans) || (x.language && x.language === ans)
          );
          if (c) return `<img src="https://flagcdn.com/w40/${c.iso2}.png" alt="" class="feedback-flag"> `
            + `${_escHtml(c.name)} · ${_escHtml(c.continent)}`;
        }
        if (cat === 'Mountains') {
          const m = (state.data.geography.mountains || []).find(x => x.name === ans);
          if (m) return `${m.height.toLocaleString()} m · ${_escHtml(m.country)}`;
          const r = (state.data.geography.rivers || []).find(x => x.name === ans);
          if (r) return `${r.length.toLocaleString()} km · ${_escHtml(r.continent)}`;
        }
        if (cat === 'Lakes') {
          const l = (state.data.geography.lakes || []).find(x => x.name === ans);
          if (l) return `${_escHtml(l.continent)} · ${l.area.toLocaleString()} km²`;
        }
      }
      if (state.mode === 'norway') {
        if (cat === 'Counties') {
          const c = (state.data.counties || []).find(x => x.name === ans || x.center === ans);
          if (c) return `${_escHtml(c.name)} · ${_escHtml(c.region)}`;
        }
        if (cat === 'Mountains') {
          const m = (state.data.geography.mountains || []).find(x => x.name === ans);
          if (m) return `${m.height} m · ${_escHtml(m.range)}`;
        }
        if (cat === 'Lakes') {
          const l = (state.data.geography.lakes || []).find(x => x.name === ans);
          if (l) return `${_escHtml(l.county)} · ${l.area} km²`;
        }
        if (cat === 'Fjords') {
          const f = (state.data.geography.fjords || []).find(x => x.name === ans);
          if (f) return `${_escHtml(f.county)} · ${f.length} km`;
        }
        if (cat === 'Cities') {
          const c = (state.data.geography.cities || []).find(x => x.name === ans || x.county === ans);
          if (c) return `${_escHtml(c.county)}`;
        }
      }
      if (state.mode === 'usa') {
        if (cat === 'States') {
          const st = (state.data.states || []).find(x => x.name === ans || x.capital === ans);
          if (st) return `${_escHtml(st.name)} (${_escHtml(st.abbr)}) · ${_escHtml(st.region)}`;
        }
        if (cat === 'Cities') {
          // correctAnswer is a state name for "In which state is [City]?" questions
          const st = (state.data.states || []).find(x => x.name === ans);
          if (st) return `${_escHtml(st.name)} (${_escHtml(st.abbr)})`;
        }
      }
    } catch (e) { console.warn('Hint error:', e); }
    return '';
  }

  // ── Map questions ─────────────────────────────────────────

  function _renderMapQuestion(q) {
    _el('map-question-text').textContent = q.text;
    _el('map-feedback-toast').classList.remove('visible', 'correct-fb', 'wrong-fb');
    _el('map-score-pill').textContent = `${state.session.score} pts`;

    showScreen('screen-map');

    MapModule.init().then(() => {
      MapModule.showQuestion(q.targetIso2, (isCorrect, clickedName) => {
        state.session.checkAnswer(isCorrect ? q.correctAnswer : clickedName);
        _showMapFeedback(isCorrect, q.targetName, clickedName);
        _el('map-score-pill').textContent = `${state.session.score} pts`;
      });
    }).catch(console.error);
  }

  function _renderUSAMapQuestion(q) {
    _el('map-question-text').textContent = q.text;
    const capSec = _el('map-capital-section');
    if (capSec) capSec.style.display = 'none';
    _el('map-feedback-toast').classList.remove('visible', 'correct-fb', 'wrong-fb');
    _el('map-score-pill').textContent = `${state.session.score} pts`;

    showScreen('screen-map');

    MapModule.init().then(() => {
      MapModule.showUSQuestion(q.targetStateName, (isCorrect, clickedName) => {
        if (isCorrect) {
          if (q.hasCapitalFollowUp) {
            // Both categories selected: ask capital as second phase
            _showUSMapCapitalPhase(q);
          } else {
            // Map-only: mark correct and show Next
            state.session.checkAnswer(q.correctAnswer);
            _el('map-score-pill').textContent = `${state.session.score} pts`;
            _showMapFeedback(true, q.correctStateName, q.correctStateName);
          }
        } else {
          // Wrong state: fail the question and show feedback
          state.session.checkAnswer('');
          const toast = _el('map-feedback-toast');
          toast.className = 'map-feedback-toast visible wrong-fb';
          _el('map-feedback-icon').textContent = '\u2717';
          _el('map-feedback-text').textContent = clickedName
            ? `Wrong \u2014 you clicked ${clickedName}. The correct state was ${q.correctStateName}.`
            : `Wrong. The correct state was ${q.correctStateName}.`;
          _el('map-score-pill').textContent = `${state.session.score} pts`;
        }
      });
    }).catch(console.error);
  }

  function _showUSMapCapitalPhase(q) {
    _el('map-question-text').textContent = '\u2713 Found it! Now answer:';

    _el('map-capital-prompt').textContent = q.capitalText;

    const grid = _el('map-capital-options');
    grid.innerHTML = '';

    for (const opt of q.capitalOptions) {
      const btn = document.createElement('button');
      btn.className   = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        // Lock all buttons
        grid.querySelectorAll('.option-btn').forEach(b => {
          b.disabled = true;
          if (b.textContent === q.correctAnswer) b.classList.add('correct');
          else if (b.textContent === opt && opt !== q.correctAnswer) b.classList.add('wrong');
        });

        const correct = opt === q.correctAnswer;
        state.session.checkAnswer(opt);
        _el('map-score-pill').textContent = `${state.session.score} pts`;

        // Show feedback toast with Next button
        const toast = _el('map-feedback-toast');
        toast.className = `map-feedback-toast visible ${correct ? 'correct-fb' : 'wrong-fb'}`;
        _el('map-feedback-icon').textContent = correct ? '\u2713' : '\u2717';
        _el('map-feedback-text').textContent = correct
          ? `Correct \u2014 the capital is ${q.correctAnswer}!`
          : `Wrong. The capital is ${q.correctAnswer}.`;
      });
      grid.appendChild(btn);
    }

    _el('map-capital-section').style.display = '';
  }

  function _showMapFeedback(correct, targetName, clickedName) {
    const toast = _el('map-feedback-toast');
    toast.className = 'map-feedback-toast visible ' + (correct ? 'correct-fb' : 'wrong-fb');
    _el('map-feedback-icon').textContent = correct ? '✓' : '✗';
    _el('map-feedback-text').textContent = correct
      ? `Correct! That is ${targetName}.`
      : `Wrong. You clicked ${clickedName}. The correct answer is ${targetName}.`;
  }

  function advanceFromMap() {
    state.session.advance();
    if (state.session.isComplete) _showResults(); else _renderCurrentQuestion();
  }

  function quitGame() {
    _stopTimer();
    state.session = null;
    showScreen('screen-settings');
  }

  // ── Results ───────────────────────────────────────────────

  function _showResults() {
    _stopTimer();
    // Switch screen immediately — do this first so the user always leaves the quiz screen
    showScreen('screen-results');

    const session = state.session;
    const pct     = session.total ? Math.round((session.correctCount / session.total) * 100) : 0;
    const grade   = _grade(pct);

    try {

    const circle = _el('grade-circle');
    circle.className = `grade-circle grade-${grade.cls}`;
    circle.textContent = grade.label;

    _el('results-score-label').textContent = `${session.score} / ${session.maxScore} points`;
    _el('results-accuracy').textContent    = `${session.correctCount} of ${session.total} correct (${pct}%)`;

    // Stats row
    const statsRow = _el('results-stats-row');
    statsRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${pct}%</div>
        <div class="stat-label">Accuracy</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${session.correctCount}</div>
        <div class="stat-label">Correct</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${session.score}</div>
        <div class="stat-label">Points</div>
      </div>
    `;

    // Missed questions
    _renderMissed(session.missed);

    // High scores
    _saveHighScore(session);
    _renderHighScores();

    } catch (err) {
      console.error('Error rendering results:', err);
    }
  }

  function _grade(pct) {
    if (pct >= 95) return { label: 'S',  cls: 's' };
    if (pct >= 80) return { label: 'A',  cls: 'a' };
    if (pct >= 65) return { label: 'B',  cls: 'b' };
    if (pct >= 50) return { label: 'C',  cls: 'c' };
    return              { label: 'D',  cls: 'd' };
  }

  function _renderMissed(missed) {
    const list = _el('missed-list');
    list.innerHTML = '';
    list.classList.remove('open');

    const toggle = _el('missed-toggle');
    if (missed.length === 0) {
      toggle.textContent = '▶ Missed Questions (none — perfect!)';
      return;
    }

    toggle.textContent = `▶ Missed Questions (${missed.length})`;

    for (const a of missed) {
      const item = document.createElement('div');
      item.className = 'missed-item';
      item.innerHTML = `
        <div class="missed-q">${_escHtml(a.question.text)}</div>
        <div class="missed-ua">Your answer: ${_escHtml(String(a.userAnswer))}</div>
        <div class="missed-ca">Correct: ${_escHtml(a.question.correctAnswer)}</div>
      `;
      list.appendChild(item);
    }
  }

  function toggleMissed() {
    const list = _el('missed-list');
    const toggle = _el('missed-toggle');
    const open = list.classList.toggle('open');
    toggle.textContent = toggle.textContent.replace(/^[▶▼]/, open ? '▼' : '▶');
  }

  // ── High Scores (localStorage) ────────────────────────────

  const HS_KEY = 'geoquiz-highscores';

  function _saveHighScore(session) {
    const pct = session.total
      ? Math.round((session.correctCount / session.total) * 100)
      : 0;

    const entry = {
      mode:       state.mode,
      difficulty: state.difficulty,
      score:      session.score,
      maxScore:   session.maxScore,
      pct,
      date: new Date().toLocaleDateString(),
    };

    let scores = [];
    try { scores = JSON.parse(localStorage.getItem(HS_KEY) || '[]'); } catch (_) {}
    scores.push(entry);
    // Keep top 10 globally
    scores.sort((a, b) => b.pct - a.pct || b.score - a.score);
    scores = scores.slice(0, 10);
    try { localStorage.setItem(HS_KEY, JSON.stringify(scores)); } catch (_) {}
  }

  function _renderHighScores() {
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem(HS_KEY) || '[]'); } catch (_) {}

    const list = _el('highscore-list');
    const section = _el('highscore-section');
    if (!scores.length) { section.style.display = 'none'; return; }
    section.style.display = '';

    list.innerHTML = scores.slice(0, 5).map((s, i) => `
      <div class="hs-row">
        <span class="hs-rank">#${i + 1}</span>
        <span class="hs-meta">${s.mode} · ${s.difficulty} · ${s.date}</span>
        <span class="hs-score">${s.pct}% · ${s.score} pts</span>
      </div>
    `).join('');
  }

  // ── Play Again ────────────────────────────────────────────

  function playAgain() {
    showScreen('screen-settings');
  }

  // ── Utilities ─────────────────────────────────────────────

  function _el(id) {
    return document.getElementById(id);
  }

  function _escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Keyboard support ──────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const screen = document.querySelector('.screen.active');
      if (screen?.id === 'screen-quiz') {
        const wrap = _el('text-answer-wrap');
        if (wrap?.classList.contains('visible')) submitTextAnswer();
      }
    }
  });

  // ── Init ─────────────────────────────────────────────────

  function init() {
    showScreen('screen-start');
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    selectMode,
    setDifficulty,
    setCount,
    setTimer,
    setContinent,
    toggleAllCategories,
    startGame,
    submitTextAnswer,
    advanceFromMap,
    quitGame,
    toggleMissed,
    playAgain,
    showScreen,
  };
})();

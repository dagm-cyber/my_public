// ── Main application controller ─────────────────────────────

const App = (() => {

  const TIMER_OPTIONS = [0, 5, 10, 15, 20];
  const DEFAULT_TIMER = 10;

  // ── State ─────────────────────────────────────────────────
  const state = {
    gameId: null,
    timerSeconds: DEFAULT_TIMER,
    shuffle: true,
    session: null,
    entry: '',
    locked: false,
  };

  let _timerHandle = null;
  let _advanceHandle = null;

  const _el = id => document.getElementById(id);

  // ── Screens ───────────────────────────────────────────────
  const _showScreen = id => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    _el(id).classList.add('active');
    window.scrollTo(0, 0);
  };

  const _formatTime = ms => {
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  // ── Settings ──────────────────────────────────────────────
  const _renderTimerPills = () => {
    const wrap = _el('timer-pills');
    wrap.innerHTML = '';
    TIMER_OPTIONS.forEach(sec => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (sec === state.timerSeconds ? ' active' : '');
      btn.textContent = sec === 0 ? 'Av' : `${sec} s`;
      btn.onclick = () => setTimer(sec);
      wrap.appendChild(btn);
    });
  };

  const _renderShufflePills = () => {
    document.querySelectorAll('#shuffle-pills .pill').forEach(p => {
      p.classList.toggle('active', (p.dataset.shuffle === 'true') === state.shuffle);
    });
  };

  const setTimer = sec => {
    state.timerSeconds = sec;
    _renderTimerPills();
    _persistSettings();
  };

  const setShuffle = value => {
    state.shuffle = value;
    _renderShufflePills();
    _persistSettings();
  };

  const _persistSettings = () => {
    Store.saveSettings({ timerSeconds: state.timerSeconds, shuffle: state.shuffle });
  };

  const openSettings = () => {
    _renderTimerPills();
    _renderShufflePills();
    _showScreen('screen-settings');
  };

  // ── Start screen personal bests ───────────────────────────
  const _renderBestList = () => {
    const wrap = _el('start-best-list');
    const all = Store.getAllBest();
    const rows = Tables.GAMES
      .filter(g => all[g.id])
      .map(g => {
        const b = all[g.id];
        return `<div class="best-row"><span>${g.title}</span>` +
               `<span>${b.correct}/${b.total} · ${_formatTime(b.timeMs)}</span></div>`;
      });
    wrap.innerHTML = rows.length
      ? `<span class="best-heading">Din rekord</span>${rows.join('')}`
      : '';
  };

  // ── Game flow ─────────────────────────────────────────────
  const startGame = gameId => {
    const tasks = Tables.buildTasks(gameId, { shuffle: state.shuffle });
    if (!tasks.length) return;
    state.gameId = gameId;
    state.session = new GameSession(gameId, tasks);
    state.entry = '';
    state.locked = false;
    _showScreen('screen-game');
    _renderTask();
  };

  const _renderTask = () => {
    const s = state.session;
    const task = s.currentTask;
    if (!task) return _finish();

    state.entry = '';
    state.locked = false;

    _el('task-text').textContent = `${task.a} × ${task.b}`;
    _el('task-counter').textContent = `${s.index + 1} / ${s.total}`;
    _el('score-badge').textContent = `${s.correctCount} riktige`;
    _el('progress-fill').style.width = `${s.progressPct}%`;

    const card = _el('task-card');
    card.classList.remove('correct', 'wrong');
    _el('feedback-text').textContent = '';
    _renderEntry();

    _startTimer();
  };

  const _renderEntry = () => {
    _el('answer-display').textContent = state.entry || '?';
  };

  // ── Keypad ────────────────────────────────────────────────
  const pressKey = digit => {
    if (state.locked || state.entry.length >= 3) return;
    if (state.entry === '' && digit === '0') return;
    state.entry += digit;
    _renderEntry();
  };

  const backspace = () => {
    if (state.locked) return;
    state.entry = state.entry.slice(0, -1);
    _renderEntry();
  };

  const submitAnswer = () => {
    if (state.locked || state.entry === '') return;
    _stopTimer();
    state.locked = true;

    const s = state.session;
    const task = s.currentTask;
    const correct = s.submit(state.entry);

    const card = _el('task-card');
    card.classList.add(correct ? 'correct' : 'wrong');
    _el('score-badge').textContent = `${s.correctCount} riktige`;
    _el('feedback-text').textContent = correct
      ? 'Riktig!'
      : `Riktig svar: ${task.a} × ${task.b} = ${task.answer}`;

    _scheduleNext(correct ? 600 : 1600);
  };

  const _scheduleNext = delay => {
    clearTimeout(_advanceHandle);
    _advanceHandle = setTimeout(() => {
      state.session.next();
      if (state.session.isDone) _finish();
      else _renderTask();
    }, delay);
  };

  // ── Timer ─────────────────────────────────────────────────
  const _startTimer = () => {
    _stopTimer();
    const bar = _el('countdown-bar');
    const wrap = _el('countdown-bar-wrap');
    const txt = _el('countdown-text');

    if (!state.timerSeconds) {
      wrap.classList.remove('active');
      txt.textContent = '';
      return;
    }

    let remaining = state.timerSeconds;
    bar.style.transition = 'none';
    bar.style.width = '100%';
    bar.style.background = 'var(--success)';
    txt.style.color = 'var(--accent)';
    txt.textContent = `⏱ ${remaining}`;
    wrap.classList.add('active');
    void bar.offsetWidth; // force reflow before the transition starts

    _timerHandle = setInterval(() => {
      remaining--;
      bar.style.transition = 'width 1s linear';
      bar.style.width = `${(remaining / state.timerSeconds) * 100}%`;

      if (remaining <= 2) {
        bar.style.background = 'var(--error)';
        txt.style.color = 'var(--error)';
      } else if (remaining <= 5) {
        bar.style.background = 'var(--gold)';
        txt.style.color = 'var(--gold)';
      }

      txt.textContent = `⏱ ${Math.max(remaining, 0)}`;

      if (remaining <= 0) {
        _stopTimer();
        _handleTimerExpired();
      }
    }, 1000);
  };

  const _stopTimer = () => {
    clearInterval(_timerHandle);
    _timerHandle = null;
  };

  const _handleTimerExpired = () => {
    if (state.locked) return;
    state.locked = true;

    const s = state.session;
    const task = s.currentTask;
    s.timeout();

    _el('task-card').classList.add('wrong');
    _el('feedback-text').textContent = `Tiden gikk ut! ${task.a} × ${task.b} = ${task.answer}`;
    _scheduleNext(1600);
  };

  // ── Results ───────────────────────────────────────────────
  const _finish = () => {
    _stopTimer();
    const s = state.session;
    if (!s.finishedAt) s.finishedAt = Date.now();

    const game = Tables.get(s.gameId);
    const timeMs = s.elapsedMs;
    const allCorrect = s.correctCount === s.total;

    _el('results-title').textContent = allCorrect ? 'Alt riktig! 🏆' : 'Ferdig!';
    _el('result-score').textContent = `${s.correctCount} / ${s.total}`;
    _el('result-time').textContent = _formatTime(timeMs);

    const { isRecord, best } = Store.saveResult(s.gameId, {
      correct: s.correctCount,
      total: s.total,
      timeMs,
    });
    _el('result-best').textContent = isRecord
      ? `🎉 Ny rekord i ${game.title}!`
      : `Rekord: ${best.correct}/${best.total} på ${_formatTime(best.timeMs)}`;

    const wrong = s.wrongAnswers;
    _el('wrong-list').innerHTML = wrong.length
      ? `<span class="wrong-heading">Disse må du øve på</span>` + wrong.map(a =>
          `<div class="wrong-row">` +
          `<span class="wrong-task">${a.task.a} × ${a.task.b} = ${a.task.answer}</span>` +
          `<span class="wrong-given">${a.timedOut ? 'tiden gikk ut' : `du svarte ${a.userAnswer}`}</span>` +
          `</div>`).join('')
      : '<span class="wrong-heading">Ingen feil — flott jobba!</span>';

    _showScreen('screen-results');
  };

  const playAgain = () => startGame(state.gameId);

  const quitGame = () => {
    _stopTimer();
    clearTimeout(_advanceHandle);
    goHome();
  };

  const goHome = () => {
    _renderBestList();
    _showScreen('screen-start');
  };

  // ── Desktop keyboard support ──────────────────────────────
  const _onKeyDown = e => {
    if (!_el('screen-game').classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9') pressKey(e.key);
    else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (e.key === 'Enter') submitAnswer();
  };

  // ── Init ──────────────────────────────────────────────────
  const init = () => {
    const saved = Store.getSettings();
    if (TIMER_OPTIONS.includes(saved.timerSeconds)) state.timerSeconds = saved.timerSeconds;
    if (typeof saved.shuffle === 'boolean') state.shuffle = saved.shuffle;

    _renderTimerPills();
    _renderShufflePills();
    _renderBestList();
    document.addEventListener('keydown', _onKeyDown);
  };

  document.addEventListener('DOMContentLoaded', init);

  return {
    startGame, playAgain, quitGame, goHome,
    openSettings, setTimer, setShuffle,
    pressKey, backspace, submitAnswer,
  };
})();

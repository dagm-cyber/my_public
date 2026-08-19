const PREP_SECONDS = 3;
const RING_CIRCUMFERENCE = 691.15;
const HISTORY_KEY = 'meditationHistory';

const els = {
  chips: document.getElementById('duration-chips'),
  customMinutes: document.getElementById('custom-minutes'),
  ringProgress: document.getElementById('ring-progress'),
  ringTime: document.getElementById('ring-time'),
  ringPhase: document.getElementById('ring-phase'),
  controlBtn: document.getElementById('control-btn'),
  controlBtnLabel: document.getElementById('control-btn-label'),
  historyList: document.getElementById('history-list'),
  historyStats: document.getElementById('history-stats'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  soundStart: document.getElementById('sound-start'),
  soundEnd: document.getElementById('sound-end'),
};

// phase: 'idle' | 'preparing' | 'running' | 'finished'
let phase = 'idle';
let selectedMinutes = 30;
let prepStartedAt = null;
let sessionStartedAt = null;
let sessionDurationMs = null;
let tickHandle = null;

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function setSelectedMinutes(minutes) {
  selectedMinutes = minutes;
  els.ringTime.textContent = formatTime(minutes * 60);
  els.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function highlightChip(minutes) {
  [...els.chips.children].forEach((chip) => {
    chip.classList.toggle('chip--active', Number(chip.dataset.minutes) === minutes);
  });
}

els.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip || phase !== 'idle') return;
  els.customMinutes.value = '';
  highlightChip(Number(chip.dataset.minutes));
  setSelectedMinutes(Number(chip.dataset.minutes));
});

els.customMinutes.addEventListener('input', () => {
  if (phase !== 'idle') return;
  const value = Number(els.customMinutes.value);
  if (value > 0) {
    highlightChip(-1);
    setSelectedMinutes(value);
  }
});

function playSound(audioEl) {
  audioEl.currentTime = 0;
  audioEl.play().catch(() => {}); // autoplay may be blocked before first user gesture
}

function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function startPreparing() {
  phase = 'preparing';
  prepStartedAt = Date.now();
  els.controlBtnLabel.textContent = 'Avbryt';
  els.controlBtn.classList.add('control-btn--stop');
  els.customMinutes.disabled = true;
  [...els.chips.children].forEach((c) => (c.disabled = true));
  tickHandle = setInterval(tickPreparing, 200);
  tickPreparing();
}

function tickPreparing() {
  const elapsed = (Date.now() - prepStartedAt) / 1000;
  const remaining = PREP_SECONDS - elapsed;
  if (remaining <= 0) {
    startRunning();
    return;
  }
  els.ringPhase.textContent = 'Forbereder';
  els.ringTime.textContent = String(Math.ceil(remaining));
}

function startRunning() {
  phase = 'running';
  sessionStartedAt = Date.now();
  sessionDurationMs = selectedMinutes * 60 * 1000;
  playSound(els.soundStart);
  els.ringPhase.textContent = 'Mediterer';
  stopTick();
  tickHandle = setInterval(tickRunning, 250);
  tickRunning();
}

function tickRunning() {
  const elapsedMs = Date.now() - sessionStartedAt;
  const remainingMs = sessionDurationMs - elapsedMs;
  if (remainingMs <= 0) {
    finishSession(true);
    return;
  }
  els.ringTime.textContent = formatTime(remainingMs / 1000);
  const fraction = elapsedMs / sessionDurationMs;
  els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
}

function finishSession(completed) {
  stopTick();
  playSound(els.soundEnd);
  const actualSeconds = completed
    ? selectedMinutes * 60
    : Math.round((Date.now() - sessionStartedAt) / 1000);
  saveSession({
    date: new Date().toISOString(),
    plannedMinutes: selectedMinutes,
    actualSeconds,
    completed,
  });
  renderHistory();
  resetToIdle();
}

function resetToIdle() {
  phase = 'idle';
  sessionStartedAt = null;
  sessionDurationMs = null;
  els.controlBtnLabel.textContent = 'Start';
  els.controlBtn.classList.remove('control-btn--stop');
  els.customMinutes.disabled = false;
  [...els.chips.children].forEach((c) => (c.disabled = false));
  els.ringPhase.textContent = 'Klar';
  els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  els.ringTime.textContent = formatTime(selectedMinutes * 60);
}

els.controlBtn.addEventListener('click', () => {
  if (phase === 'idle') {
    startPreparing();
  } else if (phase === 'preparing') {
    stopTick();
    resetToIdle();
  } else if (phase === 'running') {
    finishSession(false);
  }
});

// Recompute remaining time from timestamps on return, instead of relying on tick accumulation.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (phase === 'preparing') tickPreparing();
    else if (phase === 'running') tickRunning();
  }
});

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSession(session) {
  const history = loadHistory();
  history.unshift(session);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const history = loadHistory();

  const totalSessions = history.length;
  const totalMinutes = Math.round(history.reduce((sum, s) => sum + s.actualSeconds, 0) / 60);
  els.historyStats.innerHTML = `
    <div><strong>${totalSessions}</strong>økter</div>
    <div><strong>${totalMinutes} min</strong>total tid</div>
  `;

  if (history.length === 0) {
    els.historyList.innerHTML = '<li class="history-empty">Ingen økter enda</li>';
    return;
  }

  els.historyList.innerHTML = history
    .map((s) => {
      const date = new Date(s.date);
      const dateStr = date.toLocaleDateString('no-NO', { day: '2-digit', month: 'short' });
      const timeStr = date.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
      const statusClass = s.completed ? 'history-item__status--completed' : 'history-item__status--aborted';
      const statusLabel = s.completed ? 'Fullført' : 'Avbrutt';
      return `
        <li class="history-item">
          <div>
            <div>${formatTime(s.actualSeconds)} <span class="${statusClass}">· ${statusLabel}</span></div>
            <div class="history-item__meta">${dateStr} ${timeStr} · planlagt ${s.plannedMinutes} min</div>
          </div>
        </li>
      `;
    })
    .join('');
}

els.clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Slette all historikk?')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

setSelectedMinutes(selectedMinutes);
resetToIdle();
renderHistory();

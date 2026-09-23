const PREP_SECONDS = 3;
const RING_CIRCUMFERENCE = 691.15;
const HISTORY_KEY = 'meditationHistory';
const PREFS_KEY = 'meditationPrefs';
const END_BELL_GAP_SECONDS = 30;
const INTERVAL_BELL_LATE_SECONDS = 10;
const SOUND_START_OFFSETS = {
  'sound/freesound_community-tibetan-singing-bowl-55786.mp3': 15,
};

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
  soundSelect: document.getElementById('sound-select'),
  soundBowl: document.getElementById('sound-bowl'),
  soundInterval: document.getElementById('sound-interval'),
  intervalSelect: document.getElementById('interval-select'),
  intervalCustom: document.getElementById('interval-custom'),
  intervalCustomLabel: document.getElementById('interval-custom-label'),
  modeToggle: document.getElementById('mode-toggle'),
  timerOptions: document.getElementById('timer-options'),
  guidedOptions: document.getElementById('guided-options'),
  guidedSelect: document.getElementById('guided-select'),
  guidedSort: document.getElementById('guided-sort'),
  guidedSource: document.getElementById('guided-source'),
  guidedAudio: document.getElementById('guided-audio'),
};

// phase: 'idle' | 'preparing' | 'running' | 'finished'
let phase = 'idle';
// mode: 'timer' (silent, bell at start/end) | 'guided' (plays a recording)
let mode = 'timer';
let selectedMinutes = 30;
let guidedUnlock = null;
let intervalBells = [];
let nextIntervalBell = 0;
let prepStartedAt = null;
let sessionStartedAt = null;
let sessionDurationMs = null;
let tickHandle = null;
let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null; // e.g. battery saver or unsupported context blocked the request
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

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

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs() {
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      mode,
      minutes: selectedMinutes,
      sound: els.soundSelect.value,
      interval: els.intervalSelect.value,
      intervalCustom: Number(els.intervalCustom.value),
      guidedSort: els.guidedSort.value,
      guidedSrc: selectedGuided().src,
    })
  );
}

els.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip || phase !== 'idle') return;
  els.customMinutes.value = '';
  highlightChip(Number(chip.dataset.minutes));
  setSelectedMinutes(Number(chip.dataset.minutes));
  savePrefs();
});

els.customMinutes.addEventListener('input', () => {
  if (phase !== 'idle') return;
  const value = Number(els.customMinutes.value);
  if (value > 0) {
    highlightChip(-1);
    setSelectedMinutes(value);
    savePrefs();
  }
});

function selectedGuided() {
  return GUIDED_MEDITATIONS[Number(els.guidedSelect.value)] || GUIDED_MEDITATIONS[0];
}

function guidedLabel(g) {
  const date = new Date(`${g.date}T12:00:00`).toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${g.teacher} · ${date}`;
}

function guidedDurationSeconds() {
  const d = els.guidedAudio.duration;
  return Number.isFinite(d) && d > 0 ? d : selectedGuided().seconds;
}

function heardGuidedSrcs() {
  return new Set(loadHistory().filter((s) => s.completed && s.guidedSrc).map((s) => s.guidedSrc));
}

function guidedOption(g, heard) {
  const i = GUIDED_MEDITATIONS.indexOf(g);
  const mark = heard.has(g.src) ? '✓ ' : '';
  return `<option value="${i}">${mark}${guidedLabel(g)} (${Math.round(g.seconds / 60)} min)</option>`;
}

// sort: 'length' (shortest first) | 'year' (grouped by year, newest first)
function populateGuidedSelect() {
  const previous = els.guidedSelect.value;
  const heard = heardGuidedSrcs();
  const toOption = (g) => guidedOption(g, heard);
  const byNewest = (a, b) => b.date.localeCompare(a.date);
  const list = [...GUIDED_MEDITATIONS];

  if (els.guidedSort.value === 'year') {
    list.sort(byNewest);
    const years = [...new Set(list.map((g) => g.date.slice(0, 4)))];
    els.guidedSelect.innerHTML = years
      .map((year) => {
        const options = list.filter((g) => g.date.startsWith(year)).map(toOption).join('');
        return `<optgroup label="${year}">${options}</optgroup>`;
      })
      .join('');
  } else {
    list.sort((a, b) => a.seconds - b.seconds || byNewest(a, b));
    els.guidedSelect.innerHTML = list.map(toOption).join('');
  }

  if (previous !== '') els.guidedSelect.value = previous;
}

function showSelectedGuided() {
  const g = selectedGuided();
  els.guidedSource.href = g.page;
  els.guidedSource.textContent = `${g.title} – BSWA`;
  els.ringTime.textContent = formatTime(g.seconds);
  els.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function setMode(newMode) {
  mode = newMode;
  [...els.modeToggle.children].forEach((b) => b.classList.toggle('chip--active', b.dataset.mode === mode));
  els.timerOptions.hidden = mode !== 'timer';
  els.guidedOptions.hidden = mode !== 'guided';
  if (mode === 'guided') showSelectedGuided();
  else setSelectedMinutes(selectedMinutes);
}

els.modeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn || phase !== 'idle') return;
  setMode(btn.dataset.mode);
  savePrefs();
});

els.guidedSelect.addEventListener('change', () => {
  if (phase !== 'idle') return;
  showSelectedGuided();
  savePrefs();
});

els.guidedSort.addEventListener('change', () => {
  if (phase !== 'idle') return;
  populateGuidedSelect();
  showSelectedGuided();
  savePrefs();
});

// iOS/Safari only allow play() inside a user gesture, so start the element muted on the Start tap
// and resume it for real after the preparation countdown.
function unlockGuidedAudio() {
  const audio = els.guidedAudio;
  const g = selectedGuided();
  if (audio.getAttribute('src') !== g.src) audio.src = g.src;
  audio.muted = true;
  guidedUnlock = audio
    .play()
    .then(() => audio.pause())
    .catch(() => {});
}

async function startGuidedAudio() {
  const audio = els.guidedAudio;
  await guidedUnlock;
  if (phase !== 'running' || mode !== 'guided') return;
  audio.currentTime = 0;
  audio.muted = false;
  const g = selectedGuided();
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: g.title,
      artist: g.teacher,
      album: 'Buddhist Society of Western Australia',
    });
  }
  try {
    await audio.play();
  } catch {
    handleGuidedError();
  }
}

function stopGuidedAudio() {
  const audio = els.guidedAudio;
  audio.pause();
  audio.muted = false;
}

function handleGuidedError() {
  if (mode !== 'guided' || (phase !== 'running' && phase !== 'preparing')) return;
  stopTick();
  stopGuidedAudio();
  resetToIdle();
  els.ringPhase.textContent = 'Kunne ikke spille av';
}

els.guidedAudio.addEventListener('ended', () => {
  if (phase === 'running' && mode === 'guided') finishSession(true);
});
els.guidedAudio.addEventListener('waiting', () => {
  if (phase === 'running' && mode === 'guided') els.ringPhase.textContent = 'Laster …';
});
els.guidedAudio.addEventListener('playing', () => {
  if (phase === 'running' && mode === 'guided') els.ringPhase.textContent = 'Mediterer';
});
els.guidedAudio.addEventListener('pause', () => {
  // e.g. paused from the lock screen / headphones
  if (phase === 'running' && mode === 'guided' && !els.guidedAudio.ended && !els.guidedAudio.muted) {
    els.ringPhase.textContent = 'Pause';
  }
});
els.guidedAudio.addEventListener('error', handleGuidedError);

els.soundSelect.addEventListener('change', () => {
  els.soundBowl.src = els.soundSelect.value;
  els.soundBowl.load(); // start buffering the new sound immediately, not on first play
  savePrefs();
});

function showIntervalCustom() {
  els.intervalCustomLabel.hidden = els.intervalSelect.value !== 'custom';
}

els.intervalSelect.addEventListener('change', () => {
  showIntervalCustom();
  savePrefs();
});

els.intervalCustom.addEventListener('input', () => {
  if (Number(els.intervalCustom.value) > 0) savePrefs();
});

async function playBowl() {
  if (els.soundBowl.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((resolve) => {
      const finishLoading = () => {
        els.soundBowl.removeEventListener('loadedmetadata', finishLoading);
        els.soundBowl.removeEventListener('error', finishLoading);
        resolve();
      };
      els.soundBowl.addEventListener('loadedmetadata', finishLoading);
      els.soundBowl.addEventListener('error', finishLoading);
    });
  }

  els.soundBowl.currentTime = SOUND_START_OFFSETS[els.soundSelect.value] || 0;
  els.soundBowl.play().catch(() => {}); // autoplay may be blocked before first user gesture
}

function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function setControlsDisabled(disabled) {
  els.customMinutes.disabled = disabled;
  els.soundSelect.disabled = disabled;
  els.intervalSelect.disabled = disabled;
  els.intervalCustom.disabled = disabled;
  els.guidedSelect.disabled = disabled;
  els.guidedSort.disabled = disabled;
  [...els.chips.children].forEach((c) => (c.disabled = disabled));
  [...els.modeToggle.children].forEach((c) => (c.disabled = disabled));
}

// Returns the seconds into the session at which the soft interval bell rings.
// Bells that would land within END_BELL_GAP_SECONDS of the end are dropped so they never blur into the end bell.
function computeIntervalBells(totalSeconds) {
  const choice = els.intervalSelect.value;
  if (choice === 'off') return [];
  if (choice === 'half') return [totalSeconds / 2];
  const minutes = choice === 'custom' ? Number(els.intervalCustom.value) : Number(choice);
  if (!(minutes > 0)) return [];
  const bells = [];
  for (let t = minutes * 60; t < totalSeconds - END_BELL_GAP_SECONDS; t += minutes * 60) bells.push(t);
  return bells;
}

function playIntervalBell() {
  const bell = els.soundInterval;
  bell.muted = false;
  bell.currentTime = 0;
  bell.play().catch(() => {});
}

function startPreparing() {
  phase = 'preparing';
  prepStartedAt = Date.now();
  if (mode === 'guided') unlockGuidedAudio();
  else if (els.intervalSelect.value !== 'off') {
    // iOS/Safari: allow later interval bells by starting the element inside the Start tap.
    const bell = els.soundInterval;
    bell.muted = true;
    bell
      .play()
      .then(() => {
        bell.pause();
        bell.muted = false;
      })
      .catch(() => {});
  }
  acquireWakeLock();
  els.controlBtnLabel.textContent = 'Avbryt';
  els.controlBtn.classList.add('control-btn--stop');
  setControlsDisabled(true);
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
  stopTick();
  if (mode === 'guided') {
    els.ringPhase.textContent = 'Laster …';
    startGuidedAudio();
  } else {
    sessionDurationMs = selectedMinutes * 60 * 1000;
    intervalBells = computeIntervalBells(selectedMinutes * 60);
    nextIntervalBell = 0;
    playBowl();
    els.ringPhase.textContent = 'Mediterer';
  }
  tickHandle = setInterval(tickRunning, 250);
  tickRunning();
}

function tickRunning() {
  let elapsedSeconds;
  let totalSeconds;
  if (mode === 'guided') {
    // Progress follows the recording itself, so buffering and lock-screen pauses are reflected.
    elapsedSeconds = els.guidedAudio.muted ? 0 : els.guidedAudio.currentTime;
    totalSeconds = guidedDurationSeconds();
  } else {
    elapsedSeconds = (Date.now() - sessionStartedAt) / 1000;
    totalSeconds = sessionDurationMs / 1000;
    if (elapsedSeconds >= totalSeconds) {
      finishSession(true);
      return;
    }
    let due = false;
    while (nextIntervalBell < intervalBells.length && elapsedSeconds >= intervalBells[nextIntervalBell]) {
      // After a throttled/background gap, skip bells that are long overdue instead of ringing late.
      due = elapsedSeconds - intervalBells[nextIntervalBell] < INTERVAL_BELL_LATE_SECONDS;
      nextIntervalBell += 1;
    }
    if (due) playIntervalBell();
  }
  els.ringTime.textContent = formatTime(totalSeconds - elapsedSeconds);
  const fraction = Math.min(1, elapsedSeconds / totalSeconds);
  els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
}

function finishSession(completed) {
  stopTick();
  let session;
  if (mode === 'guided') {
    const g = selectedGuided();
    const total = guidedDurationSeconds();
    const played = els.guidedAudio.muted ? 0 : els.guidedAudio.currentTime;
    stopGuidedAudio();
    session = {
      plannedMinutes: Math.round(total / 60),
      actualSeconds: Math.round(completed ? total : played),
      guided: `${g.title} · ${guidedLabel(g)}`,
      guidedSrc: g.src,
    };
  } else {
    playBowl();
    session = {
      plannedMinutes: selectedMinutes,
      actualSeconds: completed
        ? selectedMinutes * 60
        : Math.round((Date.now() - sessionStartedAt) / 1000),
    };
  }
  saveSession({ date: new Date().toISOString(), ...session, completed });
  renderHistory();
  if (mode === 'guided' && completed) populateGuidedSelect();
  resetToIdle();
}

function resetToIdle() {
  phase = 'idle';
  sessionStartedAt = null;
  sessionDurationMs = null;
  releaseWakeLock();
  els.controlBtnLabel.textContent = 'Start';
  els.controlBtn.classList.remove('control-btn--stop');
  setControlsDisabled(false);
  els.ringPhase.textContent = 'Klar';
  els.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  els.ringTime.textContent = formatTime(mode === 'guided' ? selectedGuided().seconds : selectedMinutes * 60);
}

els.controlBtn.addEventListener('click', () => {
  if (phase === 'idle') {
    startPreparing();
  } else if (phase === 'preparing') {
    stopTick();
    if (mode === 'guided') stopGuidedAudio();
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
    // wake lock is auto-released by the browser when the tab is hidden, so re-acquire it
    if (phase === 'preparing' || phase === 'running') acquireWakeLock();
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
      const kind = s.guided ? `guidet: ${s.guided}` : `planlagt ${s.plannedMinutes} min`;
      return `
        <li class="history-item">
          <div>
            <div>${formatTime(s.actualSeconds)} <span class="${statusClass}">· ${statusLabel}</span></div>
            <div class="history-item__meta">${dateStr} ${timeStr} · ${kind}</div>
          </div>
        </li>
      `;
    })
    .join('');
}

els.clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Slette all historikk? Merkene for hørte opptak forsvinner også.')) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    populateGuidedSelect();
  }
});

function restorePrefs() {
  const prefs = loadPrefs();

  if ([...els.soundSelect.options].some((o) => o.value === prefs.sound)) {
    els.soundSelect.value = prefs.sound;
    els.soundBowl.src = prefs.sound;
  }

  if ([...els.intervalSelect.options].some((o) => o.value === prefs.interval)) {
    els.intervalSelect.value = prefs.interval;
  }
  if (prefs.intervalCustom > 0 && prefs.intervalCustom <= 180) els.intervalCustom.value = String(prefs.intervalCustom);
  showIntervalCustom();

  if (prefs.guidedSort === 'length' || prefs.guidedSort === 'year') els.guidedSort.value = prefs.guidedSort;
  populateGuidedSelect();
  const guidedIndex = GUIDED_MEDITATIONS.findIndex((g) => g.src === prefs.guidedSrc);
  if (guidedIndex >= 0) els.guidedSelect.value = String(guidedIndex);

  const minutes = Number(prefs.minutes);
  if (minutes > 0 && minutes <= 180) {
    selectedMinutes = minutes;
    const isChip = [...els.chips.children].some((c) => Number(c.dataset.minutes) === minutes);
    els.customMinutes.value = isChip ? '' : String(minutes);
  }
  highlightChip(selectedMinutes);

  setMode(prefs.mode === 'guided' ? 'guided' : 'timer');
}

restorePrefs();
resetToIdle();
renderHistory();

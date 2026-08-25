// ── localStorage wrapper for settings and personal bests ────

const Store = (() => {

  const BEST_KEY = 'matte.highscores.v2';
  const SETTINGS_KEY = 'matte.settings.v1';

  const _read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const _write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage may be unavailable (private mode / quota) — play on without saving.
    }
  };

  const getBest = gameId => _read(BEST_KEY, {})[gameId] || null;

  const getAllBest = () => _read(BEST_KEY, {});

  // Keeps the record only when more correct, or equally correct but faster.
  const saveResult = (gameId, { correct, total, timeMs }) => {
    const all = _read(BEST_KEY, {});
    const prev = all[gameId];
    const better = !prev
      || correct > prev.correct
      || (correct === prev.correct && timeMs < prev.timeMs);
    if (!better) return { isRecord: false, best: prev };

    all[gameId] = { correct, total, timeMs, savedAt: Date.now() };
    _write(BEST_KEY, all);
    return { isRecord: true, best: all[gameId] };
  };

  const getSettings = () => _read(SETTINGS_KEY, {});

  const saveSettings = settings => _write(SETTINGS_KEY, settings);

  return { getBest, getAllBest, saveResult, getSettings, saveSettings };
})();

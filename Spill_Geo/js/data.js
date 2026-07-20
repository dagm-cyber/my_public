/* ─────────────────────────────────────────────────────────
   data.js  –  Async data loader with in-memory cache
   ───────────────────────────────────────────────────────── */
const Data = (() => {
  const _cache = {};

  async function _fetchJSON(path) {
    if (_cache[path]) return _cache[path];
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const data = await res.json();
    _cache[path] = data;
    return data;
  }

  /**
   * Load all data needed for the given mode.
   * Returns: { countries?, geography, counties? }
   */
  async function load(mode) {
    if (mode === 'world') {
      const [countries, geography, extras] = await Promise.all([
        _fetchJSON('data/world-countries.json'),
        _fetchJSON('data/world-geography.json'),
        _fetchJSON('data/world-extras.json'),
      ]);
      // Merge extras (currency, language) into each country by ISO2 code
      const merged = countries.map(c => extras[c.iso2] ? { ...c, ...extras[c.iso2] } : c);
      return { countries: merged, geography };
    }

    if (mode === 'norway') {
      const [counties, geography] = await Promise.all([
        _fetchJSON('data/norway-counties.json'),
        _fetchJSON('data/norway-geography.json'),
      ]);
      return { counties, geography };
    }

    if (mode === 'usa') {
      const [states, cities] = await Promise.all([
        _fetchJSON('data/us-states.json'),
        _fetchJSON('data/us-cities.json'),
      ]);
      return { states, cities };
    }

    throw new Error(`Unknown mode: ${mode}`);
  }

  return { load };
})();

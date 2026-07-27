/* ─────────────────────────────────────────────────────────
   fillmap.js  –  "Fill the Map" game
   Colour every country / state one at a time until the whole
   map is filled. Correct picks turn green permanently; a wrong
   pick reveals the target in red and asks to continue or restart.
   ───────────────────────────────────────────────────────── */
const FillMap = (() => {

  const GEOJSON_URL =
    'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson';
  const US_STATES_URL =
    'https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI/data/geojson/us-states.json';

  // Approximate bounding boxes per continent [southWest, northEast]
  const CONTINENT_BOUNDS = {
    'Europe':        [[ 34, -25], [ 72,  45]],
    'Asia':          [[  5,  25], [ 75, 150]],
    'Africa':        [[-36, -18], [ 38,  52]],
    'North America': [[  5,-170], [ 72, -50]],
    'South America': [[-56, -82], [ 15, -33]],
    'Oceania':       [[-50, 110], [ 20, 180]],
  };

  const STYLE_DEFAULT = { fillColor: '#1a3a5c', fillOpacity: 0.45, color: '#3b6fa0', weight: 1 };
  const STYLE_HOVER   = { fillColor: '#2a5280', fillOpacity: 0.70, color: '#5aaff0', weight: 1.5 };
  const STYLE_CORRECT = { fillColor: '#16a34a', fillOpacity: 0.9,  color: '#22c55e', weight: 1.5 };
  // Older mistakes: muted dark red. Newest mistake: bright red with a thick glowing border.
  const STYLE_WRONG        = { fillColor: '#7f1d1d', fillOpacity: 0.7,  color: '#991b1b', weight: 1 };
  const STYLE_WRONG_LATEST = { fillColor: '#ef4444', fillOpacity: 0.95, color: '#fecaca', weight: 3 };

  // Natural Earth country names that differ from our data set → ISO2 code
  const NAME_ALIASES = {
    'unitedstatesofamerica':        'us',
    'unitedrepublicoftanzania':     'tz',
    'republicofserbia':             'rs',
    'czechia':                      'cz',
    'demrepcongo':                  'cd',
    'democraticrepublicofthecongo': 'cd',
    'republicofthecongo':           'cg',
    'bosniaandherz':                'ba',
    'northmacedonia':               'mk',
    'macedonia':                    'mk',
    'cotedivoire':                  'ci',
    'ivorycoast':                   'ci',
    'ssudan':                       'ss',
    'eswatini':                     'sz',
    'swaziland':                    'sz',
    'timorleste':                   'tl',
    'easttimor':                    'tl',
  };

  let map        = null;
  let worldLayer = null;
  let usLayer    = null;

  // ── Setup screen state ───────────────────────────────────
  const setup = { scope: 'world', continent: 'Europe', langs: ['en'] };

  // ── Live game state ──────────────────────────────────────
  const S = {
    scope:      'world',   // 'world' | 'continent' | 'usa'
    continent:  null,
    layer:      null,      // active Leaflet geoJSON layer
    layerByKey: new Map(), // key → layer for the current target pool
    allTargets: [],        // full target list (for restart)
    queue:      [],        // remaining targets this round
    current:    null,      // { key, name }
    total:      0,
    doneCount:  0,         // filled regions (green + red)
    mistakes:   0,
    finished:   false,
    dialogOpen: false,
    dialogShown: false,   // dialog is shown only on the first wrong pick
    lastWrongLayer: null, // most recent wrong region (kept brightly highlighted)
    missed:     [],       // targets picked wrong this round { key, name }
    pendingView: null,
    langs:      ['en'],   // active display languages for names
  };

  const _el = id => document.getElementById(id);

  function _normName(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Setup screen ─────────────────────────────────────────

  function openSetup() {
    App.showScreen('screen-fillmap-setup');
    Lang.load().then(() => {
      setup.langs = Lang.getGlobal();
      Lang.renderChecks(_el('fm-lang-group'), setup.langs, next => { setup.langs = next; });
    });
    _syncSetup();
  }

  function setScope(scope)         { setup.scope = scope; _syncSetup(); }
  function setContinent(continent) { setup.continent = continent; _syncSetup(); }

  function _syncSetup() {
    document.querySelectorAll('#fm-scope-group .pill-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.scope === setup.scope));
    document.querySelectorAll('#fm-continent-group .pill-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.continent === setup.continent));
    const contSection = _el('fm-continent-section');
    if (contSection) contSection.style.display = setup.scope === 'continent' ? '' : 'none';
  }

  function startFromSetup() {
    const btn = _el('fm-start-btn');
    if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }
    start(setup.scope, setup.continent)
      .catch(err => {
        console.error('Fill the Map failed to start:', err);
        alert('Failed to load map data. Please check your connection and try again.');
      })
      .finally(() => { if (btn) { btn.textContent = 'Start →'; btn.disabled = false; } });
  }

  // ── Map / layer building ─────────────────────────────────

  async function _ensureMap() {
    if (map) return;
    map = L.map('fillmap-map', {
      zoomControl: true,
      attributionControl: true,
      minZoom: 1,
      maxZoom: 8,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
  }

  function _bindFeature(layer) {
    layer.on('mouseover', () => {
      if (S.finished || S.dialogOpen || layer.__fmDone || !layer.__fmKey) return;
      layer.setStyle(STYLE_HOVER);
    });
    layer.on('mouseout', () => {
      if (layer.__fmDone) return;
      layer.setStyle(STYLE_DEFAULT);
    });
    layer.on('click', () => _onClick(layer));
  }

  function _worldKey(props, byIso2, byName) {
    const iso = (props.iso_a2 || props.ISO_A2 || '').toUpperCase();
    if (iso && iso.length === 2 && iso !== '-9' && byIso2.has(iso)) return iso;
    const nm   = props.admin || props.ADMIN || props.name || props.NAME || '';
    const norm = _normName(nm);
    if (byName.has(norm)) return byName.get(norm);
    return null;
  }

  async function _setupWorld(continent) {
    const data   = await Data.load('world');
    const byIso2 = new Map(); // ISO2 → country
    const byName = new Map(); // normalised name → ISO2
    for (const c of data.countries) {
      const iso = c.iso2.toUpperCase();
      byIso2.set(iso, c);
      byName.set(_normName(c.name), iso);
    }
    for (const [alias, iso] of Object.entries(NAME_ALIASES)) byName.set(alias, iso.toUpperCase());

    if (!worldLayer) {
      const res = await fetch(GEOJSON_URL);
      const geo = await res.json();
      worldLayer = L.geoJSON(geo, {
        style: () => ({ ...STYLE_DEFAULT }),
        onEachFeature: (f, layer) => _bindFeature(layer),
      });
    }

    S.layerByKey = new Map();
    const targets = [];
    worldLayer.eachLayer(layer => {
      const key = _worldKey(layer.feature.properties || {}, byIso2, byName);
      layer.__fmKey = null;
      if (!key) return;
      const country = byIso2.get(key);
      if (!country) return;
      if (continent && country.continent !== continent) return;
      layer.__fmKey = key;
      S.layerByKey.set(key, layer);
      targets.push({ key, name: country.name });
    });
    S.layer = worldLayer;
    return targets;
  }

  async function _setupUSA() {
    const data       = await Data.load('usa');
    const validNames = new Set(data.states.map(s => s.name));

    if (!usLayer) {
      const res = await fetch(US_STATES_URL);
      const geo = await res.json();
      usLayer = L.geoJSON(geo, {
        style: () => ({ ...STYLE_DEFAULT }),
        onEachFeature: (f, layer) => {
          const nm = f.properties?.name || f.properties?.NAME || '';
          layer.__fmName = nm;
          _bindFeature(layer);
        },
      });
    }

    S.layerByKey = new Map();
    const targets = [];
    usLayer.eachLayer(layer => {
      const nm = layer.__fmName || '';
      layer.__fmKey = validNames.has(nm) ? nm : null;
      if (!layer.__fmKey) return;
      S.layerByKey.set(nm, layer);
      targets.push({ key: nm, name: nm });
    });
    S.layer = usLayer;
    return targets;
  }

  function _removeLayer(layer) {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  }

  function _layerName(layer) {
    const p = layer.feature?.properties || {};
    return layer.__fmName || p.admin || p.ADMIN || p.name || p.NAME || '?';
  }

  // ── Game flow ────────────────────────────────────────────

  async function start(scope, continent) {
    await _ensureMap();
    await Lang.load();

    S.scope      = scope;
    S.continent  = continent || null;
    S.langs      = (setup.langs && setup.langs.length) ? setup.langs : ['en'];

    let targets;
    if (scope === 'usa') {
      targets = await _setupUSA();
      _removeLayer(worldLayer);
      if (!map.hasLayer(usLayer)) usLayer.addTo(map);
    } else {
      targets = await _setupWorld(scope === 'continent' ? continent : null);
      _removeLayer(usLayer);
      if (!map.hasLayer(worldLayer)) worldLayer.addTo(map);
    }

    _beginRound(targets);
  }

  /** Compute the map view for the current scope/continent. */
  function _computeView() {
    if (S.scope === 'usa') return { type: 'bounds', bounds: [[24, -125], [50, -66]] };
    if (S.scope === 'continent' && CONTINENT_BOUNDS[S.continent]) {
      return { type: 'bounds', bounds: CONTINENT_BOUNDS[S.continent] };
    }
    return { type: 'view', center: [20, 10], zoom: 2 };
  }

  /** Start a round on the active layer with the given target list. */
  function _beginRound(targets) {
    S.doneCount      = 0;
    S.mistakes       = 0;
    S.finished       = false;
    S.dialogOpen     = false;
    S.dialogShown    = false;
    S.lastWrongLayer = null;
    S.missed         = [];
    S.current        = null;
    S.pendingView    = _computeView();

    _el('fillmap-dialog').classList.remove('visible');
    _el('fillmap-complete').classList.remove('visible');

    // Reset styles & "done" flags on the active layer
    S.layer.eachLayer(l => { l.__fmDone = false; l.setStyle(STYLE_DEFAULT); });

    S.allTargets = targets;
    S.total      = targets.length;
    S.queue      = _shuffle(targets.slice());

    _updateStats();
    App.showScreen('screen-fillmap');
    requestAnimationFrame(() => {
      map.invalidateSize();
      _applyPendingView();
      _nextTarget();
    });
  }

  /** Replay a round using only the targets missed in the previous round. */
  function practiceMissed() {
    if (!S.missed.length) return;
    _beginRound(S.missed.slice());
  }

  function _applyPendingView() {
    const v = S.pendingView;
    if (!v) return;
    if (v.type === 'bounds') map.fitBounds(v.bounds, { padding: [20, 20] });
    else                     map.setView(v.center, v.zoom);
    S.pendingView = null;
  }

  function restart() {
    _el('fillmap-dialog').classList.remove('visible');
    _el('fillmap-complete').classList.remove('visible');
    start(S.scope, S.continent).catch(console.error);
  }

  function _nextTarget() {
    S.dialogOpen = false;
    _el('fillmap-dialog').classList.remove('visible');
    if (S.queue.length === 0) { _finish(); return; }
    S.current = S.queue.shift();
    _el('fillmap-target').textContent = Lang.name(S.current.name, S.langs);
  }

  function continueGame() {
    _nextTarget();
  }

  function _onClick(layer) {
    if (S.finished || S.dialogOpen || !S.current) return;
    if (layer.__fmDone) return;         // already resolved region
    if (!layer.__fmKey) return;         // not a scorable region

    if (layer.__fmKey === S.current.key) {
      // Correct → colour green permanently
      layer.__fmDone = true;
      layer.setStyle(STYLE_CORRECT);
      S.doneCount++;
      _updateStats();
      _nextTarget();
    } else {
      // Wrong → reveal the target in red, then ask continue / restart
      const targetLayer = S.layerByKey.get(S.current.key);
      if (targetLayer) {
        // Dim the previous newest mistake so only the latest one stands out
        if (S.lastWrongLayer) S.lastWrongLayer.setStyle(STYLE_WRONG);
        targetLayer.__fmDone = true;
        targetLayer.setStyle(STYLE_WRONG_LATEST);
        targetLayer.bringToFront();
        S.lastWrongLayer = targetLayer;
      }
      S.missed.push({ key: S.current.key, name: S.current.name });
      S.mistakes++;
      S.doneCount++;
      _updateStats();
      if (!S.dialogShown) {
        // Ask to continue / restart only the very first time a pick is wrong
        S.dialogShown = true;
        _openDialog(_layerName(layer));
      } else {
        // Later mistakes: just reveal in red and move on automatically
        _nextTarget();
      }
    }
  }

  function _openDialog(clickedName) {
    S.dialogOpen = true;
    _el('fillmap-dialog-text').innerHTML =
      `You picked <b>${_escHtml(Lang.name(clickedName, S.langs))}</b>. ` +
      `<b>${_escHtml(Lang.name(S.current.name, S.langs))}</b> is shown in <span style="color:var(--error)">red</span>.`;
    _el('fillmap-dialog').classList.add('visible');
  }

  function _updateStats() {
    _el('fillmap-progress').textContent  = `${S.doneCount} / ${S.total}`;
    _el('fillmap-mistakes').textContent  = `✗ ${S.mistakes}`;
    _el('fillmap-score-pill').textContent = `${S.doneCount} / ${S.total} filled`;
    const pct = S.total ? (S.doneCount / S.total) * 100 : 0;
    _el('fillmap-progress-fill').style.width = `${pct}%`;
  }

  function _finish() {
    S.finished = true;
    S.current  = null;
    _el('fillmap-target').textContent = '✓ Done!';
    const correct = S.doneCount - S.mistakes;
    const pct     = S.total ? Math.round((correct / S.total) * 100) : 0;
    _el('fillmap-complete-stats').innerHTML =
      `<b>${correct}</b> of <b>${S.total}</b> found on the first try (${pct}%)<br>` +
      `<span style="color:var(--text-muted)">${S.mistakes} revealed after a wrong pick</span>`;

    const practiceBtn = _el('fillmap-practice-btn');
    if (practiceBtn) {
      if (S.missed.length > 0) {
        practiceBtn.style.display = '';
        _el('fillmap-practice-count').textContent = S.missed.length;
      } else {
        practiceBtn.style.display = 'none';
      }
    }

    _el('fillmap-complete').classList.add('visible');
  }

  function quit() {
    if (map && S.layer) S.layer.eachLayer(l => { l.__fmDone = false; l.setStyle(STYLE_DEFAULT); });
    S.finished   = true;
    S.dialogOpen = false;
    _el('fillmap-dialog').classList.remove('visible');
    _el('fillmap-complete').classList.remove('visible');
    App.showScreen('screen-start');
  }

  return {
    openSetup, setScope, setContinent, startFromSetup,
    start, restart, continueGame, practiceMissed, quit,
  };
})();

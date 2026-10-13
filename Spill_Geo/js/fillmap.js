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

  // Older mistakes: muted dark red. Newest mistake: bright red with a thick glowing border.
  const AREA_STYLES = {
    default:     { fillColor: '#1a3a5c', fillOpacity: 0.45, color: '#3b6fa0', weight: 1 },
    hover:       { fillColor: '#2a5280', fillOpacity: 0.70, color: '#5aaff0', weight: 1.5 },
    correct:     { fillColor: '#16a34a', fillOpacity: 0.9,  color: '#22c55e', weight: 1.5 },
    wrong:       { fillColor: '#7f1d1d', fillOpacity: 0.7,  color: '#991b1b', weight: 1 },
    wrongLatest: { fillColor: '#ef4444', fillOpacity: 0.95, color: '#fecaca', weight: 3 },
  };
  const LINE_STYLES = {
    default:     { color: '#3b82c4', opacity: 0.75, weight: 4 },
    hover:       { color: '#93c5fd', opacity: 1,    weight: 7 },
    correct:     { color: '#22c55e', opacity: 1,    weight: 5 },
    wrong:       { color: '#b91c1c', opacity: 0.9,  weight: 5 },
    wrongLatest: { color: '#ef4444', opacity: 1,    weight: 8 },
  };

  // Street scopes: static GeoJSON built by tools/build_haugesund_streets.py (OSM data)
  const STREET_SCOPES = {
    'haugesund-sentrum': 'data/haugesund-streets-sentrum.json',
    'haugesund-kommune': 'data/haugesund-streets-kommune.json',
  };
  const ZOOM_AREA   = { min: 1,  max: 8 };
  const ZOOM_STREET = { min: 11, max: 18 };
  // Clicks/hovers snap to the nearest street within this many pixels
  const STREET_HIT_PX = 12;

  // Background for street scopes (land, water, green areas, buildings, place names)
  const CONTEXT_URL = 'data/haugesund-context.json';
  const CONTEXT_STYLES = {
    land:      { stroke: false, fillColor: '#1a2638', fillOpacity: 1 },
    water:     { stroke: false, fillColor: '#0a2440', fillOpacity: 1 },
    green:     { stroke: false, fillColor: '#173226', fillOpacity: 0.9 },
    buildings: { color: '#3c4b63', weight: 0.6, fillColor: '#2c3a50', fillOpacity: 1, smoothFactor: 0.5 },
  };

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
  let tileLayer  = null;
  let worldLayer = null;
  let usLayer    = null;
  const streetLayers = {}; // scope → Leaflet geoJSON layer
  let streetRenderer = null;
  let streetHover    = null; // street layer currently highlighted by the pointer
  let contextLayer   = null; // L.layerGroup with the street-scope background
  let contextBounds  = null; // area covered by the drawn background
  let contextLabels  = [];   // [{ marker, minZoom, latlng, w, h }]

  // ── Setup screen state ───────────────────────────────────
  const setup = { scope: 'world', continent: 'Europe', langs: ['en'], showLabels: false };

  // ── Live game state ──────────────────────────────────────
  const S = {
    scope:      'world',   // 'world' | 'continent' | 'usa' | 'haugesund-sentrum' | 'haugesund-kommune'
    continent:  null,
    styles:     AREA_STYLES,
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
    showLabels: false,    // draw region names on the map (practice mode)
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
  function setShowLabels(on)       { setup.showLabels = !!on; }

  function _syncSetup() {
    document.querySelectorAll('#fm-scope-group .pill-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.scope === setup.scope));
    document.querySelectorAll('#fm-continent-group .pill-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.continent === setup.continent));
    const contSection = _el('fm-continent-section');
    if (contSection) contSection.style.display = setup.scope === 'continent' ? '' : 'none';
    const streetHint = _el('fm-street-hint');
    if (streetHint) streetHint.style.display = STREET_SCOPES[setup.scope] ? '' : 'none';
    const labelsCb = _el('fm-show-labels');
    if (labelsCb) labelsCb.checked = setup.showLabels;
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
    tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    map.createPane('fmContext').style.zIndex = 350;  // below the street lines (overlayPane = 400)
    const labelPane = map.createPane('fmContextLabels');
    labelPane.style.zIndex = 450;
    labelPane.style.pointerEvents = 'none';
    map.on('zoomend', _updateContextLabels);
    map.on('zoomend', () => {
      if (_isStreetScope()) S.layer.eachLayer(l => _paint(l, l.__fmState || 'default'));
    });

    // Street layers are non-interactive; the map resolves the nearest street itself
    // (canvas hit-testing would pick the topmost line, not the closest one).
    map.on('mousemove', e => { if (_isStreetScope()) _setStreetHover(_nearestStreet(e.layerPoint)); });
    map.on('mouseout',  () => { if (_isStreetScope()) _setStreetHover(null); });
    map.on('click', e => {
      if (!_isStreetScope()) return;
      const layer = _nearestStreet(e.layerPoint);
      if (!layer) return;
      _onClick(layer);
      _setStreetHover(layer); // clears the highlight if the wrong-pick dialog opened
    });
  }

  function _isStreetScope() {
    return !!STREET_SCOPES[S.scope] && !!S.layer && map.hasLayer(S.layer);
  }

  /** Apply a named style ('default' | 'hover' | 'correct' | 'wrong' | 'wrongLatest'). */
  function _paint(layer, state) {
    layer.__fmState = state;
    const st = S.styles[state];
    layer.setStyle(S.styles === LINE_STYLES ? { ...st, weight: st.weight * _lineScale() } : st);
  }

  /** Street lines get thinner when zoomed out so the network stays readable. */
  function _lineScale() {
    const z = map.getZoom();
    return z >= 15 ? 1 : z >= 14 ? 0.75 : z >= 13 ? 0.55 : 0.4;
  }

  async function _ensureContext() {
    if (contextLayer) return;
    const res = await fetch(CONTEXT_URL);
    if (!res.ok) throw new Error(`Failed to load ${CONTEXT_URL}: ${res.status}`);
    const ctx = await res.json();
    contextBounds = L.latLngBounds(ctx.bounds);

    const renderer = L.canvas({ pane: 'fmContext' });
    const polys = (geoms, style) => L.geoJSON(geoms, {
      renderer, pane: 'fmContext', interactive: false, style: () => ({ ...style }),
    });

    // Buildings are delta-encoded integer rings (see tools/build_haugesund_map.py)
    const b = ctx.buildings;
    const rings = b.rings.map(r => {
      let x = r[0], y = r[1];
      const ring = [[b.origin[1] + y / b.scale, b.origin[0] + x / b.scale]];
      for (let i = 2; i < r.length; i += 2) {
        x += r[i]; y += r[i + 1];
        ring.push([b.origin[1] + y / b.scale, b.origin[0] + x / b.scale]);
      }
      return [ring];
    });
    const buildings = L.polygon(rings, {
      ...CONTEXT_STYLES.buildings, renderer, pane: 'fmContext', interactive: false,
    });

    contextLabels = ctx.labels.map(l => ({
      minZoom: l.minZoom,
      latlng: L.latLng(l.lat, l.lon),
      // Rough on-screen size, used to keep labels from overlapping
      w: l.name.length * (/^(village|suburb|strait|bay)$/.test(l.kind) ? 9.5 : 6.6) + 12,
      h: /^(village|suburb|strait|bay)$/.test(l.kind) ? 18 : 15,
      marker: L.marker([l.lat, l.lon], {
        pane: 'fmContextLabels',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'fm-ctx-label-anchor',
          iconSize: null,
          html: `<span class="fm-ctx-label fm-ctx-${l.kind}">${_escHtml(l.name)}</span>`,
        }),
      }),
    }));

    contextLayer = L.layerGroup([
      polys(ctx.land, CONTEXT_STYLES.land),
      polys(ctx.water, CONTEXT_STYLES.water),
      polys(ctx.green, CONTEXT_STYLES.green),
      buildings,
    ], {
      attribution: 'Haugesund map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
  }

  /** Show the place names that suit the current zoom level, skipping any that would
   *  overlap a more important one (labels are pre-sorted by importance). */
  function _updateContextLabels() {
    const on = !!contextLayer && map.hasLayer(contextLayer);
    const z  = map.getZoom();
    const placed = [];
    contextLabels.forEach(lab => {
      let show = on && z >= lab.minZoom;
      if (show) {
        const p = map.project(lab.latlng, z);
        const box = { x1: p.x - lab.w / 2, x2: p.x + lab.w / 2, y1: p.y - lab.h / 2, y2: p.y + lab.h / 2 };
        show = !placed.some(o => box.x1 < o.x2 && box.x2 > o.x1 && box.y1 < o.y2 && box.y2 > o.y1);
        if (show) placed.push(box);
      }
      const { marker } = lab;
      if (show && !map.hasLayer(marker)) marker.addTo(map);
      else if (!show && map.hasLayer(marker)) map.removeLayer(marker);
    });
  }

  /** Switch between the tile basemap (countries/states) and the drawn Haugesund background. */
  function _setBackground(streets) {
    map.getContainer().classList.toggle('fm-street-mode', streets);
    map.setMaxBounds(streets ? contextBounds : null);
    if (streets) {
      if (map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
      if (!map.hasLayer(contextLayer)) contextLayer.addTo(map);
    } else {
      if (contextLayer && map.hasLayer(contextLayer)) map.removeLayer(contextLayer);
      if (!map.hasLayer(tileLayer)) tileLayer.addTo(map);
    }
    _updateContextLabels();
  }

  function _nearestStreet(layerPoint) {
    let best = null;
    let bestDist = STREET_HIT_PX;
    S.layer.eachLayer(l => {
      if (!l.__fmKey) return;
      const p = l.closestLayerPoint(layerPoint);
      if (p && p.distance <= bestDist) { best = l; bestDist = p.distance; }
    });
    return best;
  }

  function _setStreetHover(layer) {
    if (S.finished || S.dialogOpen) layer = null;
    if (streetHover && streetHover !== layer && !streetHover.__fmDone) {
      _paint(streetHover, 'default');
    }
    if (layer && !layer.__fmDone) _paint(layer, 'hover');
    streetHover = layer;
    map.getContainer().style.cursor = layer && !layer.__fmDone ? 'pointer' : '';
  }

  function _bindFeature(layer) {
    layer.on('mouseover', () => {
      if (S.finished || S.dialogOpen || layer.__fmDone || !layer.__fmKey) return;
      _paint(layer, 'hover');
    });
    layer.on('mouseout', () => {
      if (layer.__fmDone) return;
      _paint(layer, 'default');
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
        style: () => ({ ...AREA_STYLES.default }),
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
      layer.__fmLabel = country.name;
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
        style: () => ({ ...AREA_STYLES.default }),
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
      layer.__fmLabel = nm;
      targets.push({ key: nm, name: nm });
    });
    S.layer = usLayer;
    return targets;
  }

  async function _setupStreets(scope) {
    if (!streetLayers[scope]) {
      const res = await fetch(STREET_SCOPES[scope]);
      if (!res.ok) throw new Error(`Failed to load ${STREET_SCOPES[scope]}: ${res.status}`);
      const geo = await res.json();
      if (!streetRenderer) streetRenderer = L.canvas();
      streetLayers[scope] = L.geoJSON(geo, {
        renderer: streetRenderer,
        interactive: false,
        style: () => ({ ...LINE_STYLES.default }),
        onEachFeature: (f, layer) => { layer.__fmName = f.properties?.name || ''; },
      });
    }

    const layer = streetLayers[scope];
    S.layerByKey = new Map();
    const targets = [];
    layer.eachLayer(l => {
      const nm = l.__fmName;
      l.__fmKey = nm || null;
      if (!nm) return;
      S.layerByKey.set(nm, l);
      l.__fmLabel = nm;
      targets.push({ key: nm, name: nm });
    });
    S.layer = layer;
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
    S.showLabels = !!setup.showLabels;

    const isStreets = !!STREET_SCOPES[scope];
    S.styles = isStreets ? LINE_STYLES : AREA_STYLES;

    let targets;
    if (scope === 'usa')  targets = await _setupUSA();
    else if (isStreets)   { await _ensureContext(); targets = await _setupStreets(scope); }
    else                  targets = await _setupWorld(scope === 'continent' ? continent : null);

    [worldLayer, usLayer, ...Object.values(streetLayers)].forEach(l => {
      if (l !== S.layer) _removeLayer(l);
    });

    const zoom = isStreets ? ZOOM_STREET : ZOOM_AREA;
    map.setMinZoom(zoom.min);
    map.setMaxZoom(zoom.max);
    _setBackground(isStreets);
    if (!map.hasLayer(S.layer)) S.layer.addTo(map);

    _beginRound(targets);
  }

  /** Compute the map view for the current scope/continent. */
  function _computeView() {
    if (STREET_SCOPES[S.scope]) return { type: 'bounds', bounds: S.layer.getBounds() };
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
    streetHover      = null;

    _el('fillmap-dialog').classList.remove('visible');
    _el('fillmap-complete').classList.remove('visible');

    // Reset styles & "done" flags on the active layer
    S.layer.eachLayer(l => { l.__fmDone = false; _paint(l, 'default'); });
    _applyLabels();

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

  /** Clear all name labels — used when a round starts or restarts. */
  function _applyLabels() {
    if (!S.layer) return;
    S.layer.eachLayer(l => {
      if (l.getTooltip && l.getTooltip()) l.unbindTooltip();
    });
  }

  /** Reveal the name label on a single region once it has been resolved. */
  function _labelLayer(layer) {
    if (!S.showLabels || !layer || !layer.__fmKey || !layer.__fmLabel) return;
    if (layer.getTooltip && layer.getTooltip()) return;
    layer.bindTooltip(Lang.name(layer.__fmLabel, S.langs), {
      permanent: true, direction: 'center', className: 'fillmap-label', opacity: 1,
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
      _paint(layer, 'correct');
      _labelLayer(layer);
      S.doneCount++;
      _updateStats();
      _nextTarget();
    } else {
      // Wrong → reveal the target in red, then ask continue / restart
      const targetLayer = S.layerByKey.get(S.current.key);
      if (targetLayer) {
        // Dim the previous newest mistake so only the latest one stands out
        if (S.lastWrongLayer) _paint(S.lastWrongLayer, 'wrong');
        targetLayer.__fmDone = true;
        _paint(targetLayer, 'wrongLatest');
        targetLayer.bringToFront();
        _labelLayer(targetLayer);
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
    if (map && S.layer) S.layer.eachLayer(l => { l.__fmDone = false; _paint(l, 'default'); });
    S.finished   = true;
    S.dialogOpen = false;
    _el('fillmap-dialog').classList.remove('visible');
    _el('fillmap-complete').classList.remove('visible');
    App.showScreen('screen-start');
  }

  return {
    openSetup, setScope, setContinent, setShowLabels, startFromSetup,
    start, restart, continueGame, practiceMissed, quit,
  };
})();

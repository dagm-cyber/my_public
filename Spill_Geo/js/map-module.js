/* ─────────────────────────────────────────────────────────
   map-module.js  –  Leaflet map integration
   ───────────────────────────────────────────────────────── */
const MapModule = (() => {
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

  const STYLE_DEFAULT  = { fillColor: '#1a3a5c', fillOpacity: 0.45, color: '#3b6fa0', weight: 1 };
  const STYLE_HOVER    = { fillColor: '#2a5280', fillOpacity: 0.70, color: '#5aaff0', weight: 1.5 };
  const STYLE_CORRECT  = { fillColor: '#166534', fillOpacity: 0.85, color: '#22c55e', weight: 2 };
  const STYLE_WRONG    = { fillColor: '#7f1d1d', fillOpacity: 0.85, color: '#ef4444', weight: 2 };

  let map         = null;
  let geoLayer    = null;
  let answered    = false;
  let _callback   = null;
  let _targetIso2 = null;
  let _correctLayer = null;
  let _sessionContinent = null;
  let _sessionViewSet   = false;

  // ── US states layer ──────────────────────────────────────
  let usGeoLayer    = null;
  let _usAnswered   = false;
  let _usCallback   = null;
  let _usTarget     = null;
  let _usCorrectLayer = null;

  // ── Init ────────────────────────────────────────────────

  async function init() {
    if (map) return;

    map = L.map('leaflet-map', {
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

    try {
      const res  = await fetch(GEOJSON_URL);
      const data = await res.json();
      _buildGeoLayer(data);
    } catch (err) {
      console.error('GeoJSON load failed:', err);
    }
  }

  function _buildGeoLayer(geojson) {
    geoLayer = L.geoJSON(geojson, {
      style: () => ({ ...STYLE_DEFAULT }),
      onEachFeature(feature, layer) {
        layer.on('mouseover', () => {
          if (!answered && layer !== _correctLayer) {
            layer.setStyle(STYLE_HOVER);
          }
        });
        layer.on('mouseout', () => {
          if (!answered && layer !== _correctLayer) {
            layer.setStyle(STYLE_DEFAULT);
          }
        });
        layer.on('click', () => _onCountryClick(feature, layer));
      },
    });

    // Only add to map if the US states layer is NOT currently active.
    // The US states layer may already be showing (async race condition guard).
    if (!usGeoLayer || !map.hasLayer(usGeoLayer)) {
      geoLayer.addTo(map);
      map.fitBounds(geoLayer.getBounds());
    }
  }

  // ── Question flow ────────────────────────────────────────

  /** Call once at the start of each game so the map zooms to the right region. */
  function startNewGame(continent) {
    _sessionContinent = continent || null;
    _sessionViewSet   = false;
  }

  function showQuestion(targetIso2, callback) {
    // Ensure world layer is active (not US states)
    if (usGeoLayer && map.hasLayer(usGeoLayer)) map.removeLayer(usGeoLayer);
    if (geoLayer && !map.hasLayer(geoLayer))    geoLayer.addTo(map);

    _targetIso2   = targetIso2.toUpperCase();
    _callback     = callback;
    answered      = false;
    _correctLayer = null;

    if (geoLayer) geoLayer.resetStyle();

    // Set the map view only once per game session (not on every question)
    if (!_sessionViewSet) {
      _sessionViewSet = true;
      if (_sessionContinent && CONTINENT_BOUNDS[_sessionContinent]) {
        map.fitBounds(CONTINENT_BOUNDS[_sessionContinent], { padding: [20, 20] });
      } else {
        map.setView([20, 10], 2);
      }
    }
  }

  function _onCountryClick(feature, layer) {
    if (answered) return;
    answered = true;

    // geojson.xyz CDN serves Natural Earth with lowercase property keys
    // (iso_a2, admin, name). Fall back to uppercase for other GeoJSON sources.
    const props = feature.properties || {};
    const iso   = (props.iso_a2 || props.ISO_A2 || '').toUpperCase();
    const isCorrect = iso !== '' && iso === _targetIso2;

    layer.setStyle(isCorrect ? STYLE_CORRECT : STYLE_WRONG);

    // If wrong, also highlight where the correct country is
    if (!isCorrect && geoLayer) {
      geoLayer.eachLayer(l => {
        const lProps = l.feature?.properties || {};
        const lIso   = (lProps.iso_a2 || lProps.ISO_A2 || '').toUpperCase();
        if (lIso === _targetIso2) {
          l.setStyle(STYLE_CORRECT);
          _correctLayer = l;
        }
      });
    }

    if (_callback) {
      const clickedName = props.admin || props.ADMIN || props.name || props.NAME || iso;
      _callback(isCorrect, clickedName);
    }
  }

  // ── US States question flow ──────────────────────────────

  async function _loadUSLayer() {
    if (usGeoLayer) return;
    const res  = await fetch(US_STATES_URL);
    const data = await res.json();

    usGeoLayer = L.geoJSON(data, {
      style: () => ({ ...STYLE_DEFAULT }),
      onEachFeature(feature, layer) {
        layer.on('mouseover', () => {
          if (!_usAnswered && layer !== _usCorrectLayer) layer.setStyle(STYLE_HOVER);
        });
        layer.on('mouseout', () => {
          if (!_usAnswered && layer !== _usCorrectLayer) layer.setStyle(STYLE_DEFAULT);
        });
        layer.on('click', () => _onUSStateClick(feature, layer));
      },
    });
  }

  function _onUSStateClick(feature, layer) {
    if (_usAnswered) return;
    _usAnswered = true;

    const props = feature.properties || {};
    const name  = props.name || props.NAME || '';
    const isCorrect = name === _usTarget;

    layer.setStyle(isCorrect ? STYLE_CORRECT : STYLE_WRONG);

    if (!isCorrect && usGeoLayer) {
      usGeoLayer.eachLayer(l => {
        const lName = l.feature?.properties?.name || l.feature?.properties?.NAME || '';
        if (lName === _usTarget) {
          l.setStyle(STYLE_CORRECT);
          _usCorrectLayer = l;
        }
      });
    }

    if (_usCallback) _usCallback(isCorrect, name);
  }

  async function showUSQuestion(targetStateName, callback) {
    _usTarget       = targetStateName;
    _usCallback     = callback;
    _usAnswered     = false;
    _usCorrectLayer = null;

    // Swap: hide world layer, show US layer
    if (geoLayer && map.hasLayer(geoLayer)) map.removeLayer(geoLayer);

    await _loadUSLayer();
    if (!map.hasLayer(usGeoLayer)) usGeoLayer.addTo(map);
    usGeoLayer.resetStyle();

    // Zoom to continental US (users can scroll to find AK / HI)
    map.fitBounds([[24, -125], [50, -66]], { padding: [20, 20] });
  }

  // ── Invalidate size after screen becomes visible ─────────

  function invalidateSize() {
    if (map) map.invalidateSize();
  }

  return { init, startNewGame, showQuestion, showUSQuestion, invalidateSize };
})();

/* ─────────────────────────────────────────────────────────
   study.js – Study / Browse / Flashcard module
   ───────────────────────────────────────────────────────── */
const Study = (() => {

  // ── State ───────────────────────────────────────────────
  let _data         = null;
  let _mode         = 'world';    // 'world' | 'usa' | 'norway'
  let _view         = 'browse';   // 'browse' | 'flash'
  let _browseFilter = 'all';
  let _browseSearch = '';
  let _norwayCat    = 'counties';
  let _flashType    = 'flag-name';
  let _cards        = [];
  let _cardIndex    = 0;
  let _cardFlipped  = false;

  // ── Open ────────────────────────────────────────────────

  async function open() {
    App.showScreen('screen-study');
    _showLoading(true);
    try {
      _data = await Data.load(_mode);
    } catch (e) {
      _showLoading(false);
      alert('Failed to load data. Please check your connection.');
      return;
    }
    _buildCards();
    _renderAll();
    _showLoading(false);
  }

  // ── Public setters ────────────────────────────────────────

  async function setMode(mode) {
    if (_mode === mode) return;
    _mode         = mode;
    _browseFilter = 'all';
    _browseSearch = '';
    _norwayCat    = 'counties';
    _cardIndex    = 0;
    _cardFlipped  = false;
    _flashType    = mode === 'usa' ? 'state-capital' : 'flag-name';

    _showLoading(true);
    try {
      _data = await Data.load(mode);
    } catch (e) {
      _showLoading(false);
      alert('Failed to load data. Please check your connection.');
      return;
    }
    _buildCards();
    _renderAll();
    _showLoading(false);
  }

  function setView(view) {
    _view = view;
    _syncViewBtns();
    _renderViewPanel();
  }

  function setFlashType(type) {
    _flashType   = type;
    _cardIndex   = 0;
    _cardFlipped = false;
    _buildCards();
    _renderFlashcard();
  }

  function setNorwayCategory(cat) {
    _norwayCat    = cat;
    _cardIndex    = 0;
    _cardFlipped  = false;
    _browseSearch = '';
    const srch = document.getElementById('study-search');
    if (srch) srch.value = '';
    _buildCards();
    _syncNorwayTabs();
    _renderBrowseGrid();
    _renderFlashcard();
  }

  function onSearch(val) {
    _browseSearch = val.toLowerCase();
    _renderBrowseGrid();
  }

  function onFilter(val) {
    _browseFilter = val;
    _renderBrowseGrid();
  }

  // ── Flashcard controls ────────────────────────────────────

  function flip() {
    _cardFlipped = !_cardFlipped;
    _renderFlashcard();
  }

  function next() {
    if (!_cards.length) return;
    _cardIndex   = (_cardIndex + 1) % _cards.length;
    _cardFlipped = false;
    _renderFlashcard();
  }

  function prev() {
    if (!_cards.length) return;
    _cardIndex   = (_cardIndex - 1 + _cards.length) % _cards.length;
    _cardFlipped = false;
    _renderFlashcard();
  }

  function shuffle() {
    for (let i = _cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_cards[i], _cards[j]] = [_cards[j], _cards[i]];
    }
    _cardIndex   = 0;
    _cardFlipped = false;
    _renderFlashcard();
  }

  // ── Build flashcard deck ──────────────────────────────────

  function _buildCards() {
    _cards = [];
    if (!_data) return;

    if (_mode === 'world') {
      const countries = _data.countries || [];
      if (_flashType === 'flag-name') {
        _cards = countries.map(c => ({
          front: { type: 'flag', iso2: c.iso2, label: 'Which country?' },
          back:  { type: 'text', main: c.name, sub: c.continent }
        }));
      } else if (_flashType === 'name-capital') {
        _cards = countries.filter(c => c.capital).map(c => ({
          front: { type: 'text', main: c.name, sub: c.continent },
          back:  { type: 'text', main: c.capital, sub: 'Capital' }
        }));
      } else if (_flashType === 'flag-capital') {
        _cards = countries.filter(c => c.capital).map(c => ({
          front: { type: 'flag', iso2: c.iso2, label: 'What is the capital?' },
          back:  { type: 'text', main: c.capital, sub: c.name }
        }));
      } else if (_flashType === 'name-currency') {
        _cards = countries.filter(c => c.currency).map(c => ({
          front: { type: 'text', main: c.name, sub: c.continent },
          back:  { type: 'text', main: c.currency, sub: 'Currency' }
        }));
      }

    } else if (_mode === 'usa') {
      const states = _data.states || [];
      if (_flashType === 'state-capital') {
        _cards = states.map(s => ({
          front: { type: 'text', main: s.name, sub: s.region },
          back:  { type: 'text', main: s.capital, sub: 'Capital' }
        }));
      } else if (_flashType === 'capital-state') {
        _cards = states.map(s => ({
          front: { type: 'text', main: s.capital, sub: 'Capital of which state?' },
          back:  { type: 'text', main: s.name, sub: s.region }
        }));
      } else if (_flashType === 'state-abbr') {
        _cards = states.map(s => ({
          front: { type: 'text', main: s.name, sub: s.region },
          back:  { type: 'text', main: s.abbr, sub: 'Abbreviation' }
        }));
      }

    } else if (_mode === 'norway') {
      const geo     = _data.geography || {};
      const counties = _data.counties  || [];

      if (_norwayCat === 'counties') {
        _cards = counties.map(c => ({
          front: { type: 'text', main: c.name,   sub: 'Which region?' },
          back:  { type: 'text', main: c.region, sub: 'Center: ' + c.center }
        }));
      } else if (_norwayCat === 'mountains') {
        _cards = (geo.mountains || []).map(m => ({
          front: { type: 'text', main: m.name,          sub: m.range },
          back:  { type: 'text', main: m.height + ' m', sub: m.county }
        }));
      } else if (_norwayCat === 'lakes') {
        _cards = (geo.lakes || []).map(l => ({
          front: { type: 'text', main: l.name,           sub: l.county },
          back:  { type: 'text', main: l.area + ' km²',  sub: 'Depth: ' + l.depth + ' m' }
        }));
      } else if (_norwayCat === 'fjords') {
        _cards = (geo.fjords || []).map(f => ({
          front: { type: 'text', main: f.name,             sub: f.county },
          back:  { type: 'text', main: f.length + ' km',   sub: 'Max depth: ' + f.maxDepth + ' m' }
        }));
      } else if (_norwayCat === 'cities') {
        _cards = (geo.cities || []).map(c => ({
          front: { type: 'text', main: c.name,    sub: c.county },
          back:  { type: 'text', main: c.population ? c.population.toLocaleString() : '—', sub: 'Population' }
        }));
      }
    }
  }

  // ── Render ────────────────────────────────────────────────

  function _renderAll() {
    _syncModeTabs();
    _syncViewBtns();
    _syncNorwayTabs();
    _renderNorwayTabsVisibility();
    _renderFilterOptions();
    _renderFlashTypeOptions();
    _renderBrowseGrid();
    _renderFlashcard();
    _renderViewPanel();
    const srch = document.getElementById('study-search');
    if (srch) srch.value = _browseSearch;
  }

  function _syncModeTabs() {
    document.querySelectorAll('.study-tab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.mode === _mode)
    );
  }

  function _syncViewBtns() {
    const b = document.getElementById('view-browse');
    const f = document.getElementById('view-flash');
    if (b) b.classList.toggle('active', _view === 'browse');
    if (f) f.classList.toggle('active', _view === 'flash');
  }

  function _syncNorwayTabs() {
    document.querySelectorAll('.norway-sub-tab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.cat === _norwayCat)
    );
  }

  function _renderNorwayTabsVisibility() {
    const wrap = document.getElementById('norway-sub-tabs');
    if (wrap) wrap.style.display = _mode === 'norway' ? '' : 'none';
  }

  function _renderViewPanel() {
    const b = document.getElementById('study-browse');
    const f = document.getElementById('study-flash');
    if (b) b.style.display = _view === 'browse' ? '' : 'none';
    if (f) f.style.display = _view === 'flash'  ? '' : 'none';
  }

  function _renderFilterOptions() {
    const sel = document.getElementById('study-filter');
    if (!sel) return;
    sel.innerHTML = '';

    if (_mode === 'norway') { sel.style.display = 'none'; return; }
    sel.style.display = '';

    const opts = _mode === 'world'
      ? ['all', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']
      : ['all', 'Northeast', 'South', 'Midwest', 'West'];

    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o === 'all'
        ? (_mode === 'world' ? '🌍 All Continents' : '🇺🇸 All Regions')
        : o;
      if (o === _browseFilter) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function _renderFlashTypeOptions() {
    const sel = document.getElementById('flash-type');
    const row = document.getElementById('flash-type-row');
    if (!sel || !row) return;

    if (_mode === 'norway') { row.style.display = 'none'; return; }
    row.style.display = '';
    sel.innerHTML = '';

    const opts = _mode === 'world'
      ? [
          { value: 'flag-name',     label: '🚩 Flag → Country' },
          { value: 'name-capital',  label: '🗺️ Country → Capital' },
          { value: 'flag-capital',  label: '🚩 Flag → Capital' },
          { value: 'name-currency', label: '💰 Country → Currency' },
        ]
      : [
          { value: 'state-capital', label: '🏛️ State → Capital' },
          { value: 'capital-state', label: '🏛️ Capital → State' },
          { value: 'state-abbr',    label: '🔤 State → Abbreviation' },
        ];

    if (!opts.find(o => o.value === _flashType)) {
      _flashType = opts[0].value;
      _buildCards();
    }

    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === _flashType) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ── Browse grid ───────────────────────────────────────────

  function _renderBrowseGrid() {
    const grid = document.getElementById('study-grid');
    if (!grid || !_data) return;
    const q = _browseSearch;

    if (_mode === 'world') {
      let list = [...(_data.countries || [])];
      if (_browseFilter !== 'all') list = list.filter(c => c.continent === _browseFilter);
      if (q) list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.capital || '').toLowerCase().includes(q)
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      grid.innerHTML = list.map(c => `
        <div class="study-card">
          <div class="study-card-flag">
            <img src="https://flagcdn.com/48x36/${_esc(c.iso2)}.png"
                 alt="${_esc(c.name)}" loading="lazy"
                 onerror="this.style.display='none'">
          </div>
          <div class="study-card-body">
            <div class="study-card-name">${_esc(c.name)}</div>
            <div class="study-card-meta">
              ${c.capital  ? `<span>🏙️ ${_esc(c.capital)}</span>`  : ''}
              <span>🌍 ${_esc(c.continent)}</span>
              ${c.currency ? `<span>💰 ${_esc(c.currency)}</span>` : ''}
              ${c.language ? `<span>🗣️ ${_esc(c.language)}</span>` : ''}
            </div>
          </div>
        </div>
      `).join('');

    } else if (_mode === 'usa') {
      let list = [...(_data.states || [])];
      if (_browseFilter !== 'all') list = list.filter(s => s.region === _browseFilter);
      if (q) list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.capital.toLowerCase().includes(q) ||
        s.abbr.toLowerCase().includes(q)
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      grid.innerHTML = list.map(s => `
        <div class="study-card">
          <div class="study-card-abbr">${_esc(s.abbr)}</div>
          <div class="study-card-body">
            <div class="study-card-name">${_esc(s.name)}</div>
            <div class="study-card-meta">
              <span>🏛️ ${_esc(s.capital)}</span>
              <span>📍 ${_esc(s.region)}</span>
            </div>
          </div>
        </div>
      `).join('');

    } else if (_mode === 'norway') {
      const geo     = _data.geography || {};
      const counties = _data.counties  || [];

      if (_norwayCat === 'counties') {
        let list = counties;
        if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
        grid.innerHTML = list.map(c => `
          <div class="study-card">
            <div class="study-card-emoji">🏛️</div>
            <div class="study-card-body">
              <div class="study-card-name">${_esc(c.name)}</div>
              <div class="study-card-meta">
                <span>📍 ${_esc(c.region)}</span>
                <span>🏙️ ${_esc(c.center)}</span>
              </div>
            </div>
          </div>
        `).join('');

      } else if (_norwayCat === 'mountains') {
        let list = geo.mountains || [];
        if (q) list = list.filter(m => m.name.toLowerCase().includes(q));
        grid.innerHTML = list.map(m => `
          <div class="study-card">
            <div class="study-card-emoji">⛰️</div>
            <div class="study-card-body">
              <div class="study-card-name">${_esc(m.name)}</div>
              <div class="study-card-meta">
                <span>📏 ${m.height} m</span>
                <span>📍 ${_esc(m.county)}</span>
                <span>🗺️ ${_esc(m.range)}</span>
              </div>
            </div>
          </div>
        `).join('');

      } else if (_norwayCat === 'lakes') {
        let list = geo.lakes || [];
        if (q) list = list.filter(l => l.name.toLowerCase().includes(q));
        grid.innerHTML = list.map(l => `
          <div class="study-card">
            <div class="study-card-emoji">💧</div>
            <div class="study-card-body">
              <div class="study-card-name">${_esc(l.name)}</div>
              <div class="study-card-meta">
                <span>📏 ${l.area} km²</span>
                <span>🔱 ${l.depth} m depth</span>
                <span>📍 ${_esc(l.county)}</span>
              </div>
            </div>
          </div>
        `).join('');

      } else if (_norwayCat === 'fjords') {
        let list = geo.fjords || [];
        if (q) list = list.filter(f => f.name.toLowerCase().includes(q));
        grid.innerHTML = list.map(f => `
          <div class="study-card">
            <div class="study-card-emoji">🌊</div>
            <div class="study-card-body">
              <div class="study-card-name">${_esc(f.name)}</div>
              <div class="study-card-meta">
                <span>📏 ${f.length} km</span>
                <span>🔱 ${f.maxDepth} m depth</span>
                <span>📍 ${_esc(f.county)}</span>
              </div>
            </div>
          </div>
        `).join('');

      } else if (_norwayCat === 'cities') {
        let list = geo.cities || [];
        if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
        grid.innerHTML = list.map(c => `
          <div class="study-card">
            <div class="study-card-emoji">🏙️</div>
            <div class="study-card-body">
              <div class="study-card-name">${_esc(c.name)}</div>
              <div class="study-card-meta">
                <span>📍 ${_esc(c.county)}</span>
                ${c.population ? `<span>👥 ${c.population.toLocaleString()}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  // ── Flashcard render ──────────────────────────────────────

  function _renderFlashcard() {
    const counterEl = document.getElementById('flash-counter');
    const frontEl   = document.getElementById('flash-front');
    const backEl    = document.getElementById('flash-back');
    const cardEl    = document.getElementById('flashcard');
    const hintEl    = document.getElementById('flash-hint');
    if (!frontEl || !backEl || !cardEl) return;

    if (!_cards.length) {
      frontEl.innerHTML = '<div class="flash-main-text">No cards</div>';
      backEl.innerHTML  = '';
      if (counterEl) counterEl.textContent = '0 / 0';
      return;
    }

    if (counterEl) counterEl.textContent = `${_cardIndex + 1} / ${_cards.length}`;

    const card = _cards[_cardIndex];
    _renderSide(frontEl, card.front);
    _renderSide(backEl,  card.back);

    frontEl.style.display = _cardFlipped ? 'none' : 'flex';
    backEl.style.display  = _cardFlipped ? 'flex'  : 'none';
    cardEl.classList.toggle('flipped', _cardFlipped);

    if (hintEl) {
      hintEl.textContent = _cardFlipped ? 'Tap card to show question' : 'Tap card to reveal answer';
    }
  }

  function _renderSide(el, data) {
    if (data.type === 'flag') {
      el.innerHTML = `
        <div class="flash-label">${_esc(data.label)}</div>
        <img class="flash-flag" src="https://flagcdn.com/160x120/${_esc(data.iso2)}.png"
             alt="flag" loading="lazy">
      `;
    } else {
      el.innerHTML = `
        <div class="flash-main-text">${_esc(data.main)}</div>
        ${data.sub ? `<div class="flash-sub-text">${_esc(data.sub)}</div>` : ''}
      `;
    }
  }

  function _showLoading(show) {
    const loadEl    = document.getElementById('study-loading');
    const contentEl = document.getElementById('study-content');
    if (loadEl)    loadEl.style.display    = show ? '' : 'none';
    if (contentEl) contentEl.style.display = show ? 'none' : '';
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    open, setMode, setView, setFlashType, setNorwayCategory,
    onSearch, onFilter, flip, next, prev, shuffle
  };
})();

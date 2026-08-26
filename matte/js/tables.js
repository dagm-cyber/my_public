// ── Game definitions and task builder ───────────────────────

const Tables = (() => {

  const _range = (from, to, factor) => {
    const out = [];
    for (let a = from; a <= to; a++) out.push({ a, b: factor });
    return out;
  };

  const _grid = (from, to) => {
    const out = [];
    for (let a = from; a <= to; a++) {
      for (let b = from; b <= to; b++) out.push({ a, b });
    }
    return out;
  };

  const GAMES = [
    {
      id: 'ti-gangen',
      title: 'Den lille gangetabellen',
      description: '1 × 1 til 10 × 10',
      tasks: _grid(1, 10),
    },
    {
      id: 'de-vanskelige',
      title: 'De vanskelige',
      description: '6-, 7- og 8-gangen',
      tasks: [
        ..._range(3, 9, 6),
        ..._range(3, 9, 7),
        ..._range(2, 9, 8),
      ],
    },
  ];

  const get = id => GAMES.find(g => g.id === id) || null;

  const _shuffled = arr => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const buildTasks = (id, { shuffle = true } = {}) => {
    const game = get(id);
    if (!game) return [];
    const base = game.tasks.map(t => ({ a: t.a, b: t.b, answer: t.a * t.b }));
    return shuffle ? _shuffled(base) : base;
  };

  return { GAMES, get, buildTasks };
})();

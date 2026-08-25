# Mattemesteren

A small mobile-first web app for practising multiplication tables. Norwegian UI, no
build step, no dependencies — plain HTML, CSS and JavaScript, same setup as `Spill_Geo`.

## Games

| Game | Tasks |
| --- | --- |
| **10-gangen** | the whole table, 1 × 1 … 10 × 10 (100 tasks) |
| **De vanskelige** | 3 × 6 … 9 × 6, 3 × 7 … 9 × 7, 2 × 8 … 9 × 8 (22 tasks) |

## Features

- On-screen numeric keypad (no OS keyboard); desktop keyboard also works (0–9, Backspace, Enter)
- Countdown per task — 5 / 10 / 15 / 20 seconds, or off for practice mode
- Random or fixed task order
- Results screen listing every task answered wrong, with the correct answer
- Personal best (score and time) per game, stored in `localStorage`

## Run

Open `index.html` directly in a browser, or serve the folder:

```powershell
python -m http.server 8000
```

Then browse to <http://localhost:8000>.

## Layout

```
matte/
├── index.html
├── css/style.css
└── js/
    ├── tables.js    game definitions and task builder
    ├── session.js   GameSession — one play-through
    ├── storage.js   localStorage wrapper (settings + personal bests)
    └── app.js       screens, keypad, timer, results
```

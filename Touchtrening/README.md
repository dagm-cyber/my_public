# Touchtrening

A small web app for learning touch typing on a **Norwegian keyboard** (nb-NO, ISO),
with practice texts in Norwegian, English, or both. Norwegian UI, no build step, no
dependencies — plain HTML, CSS and JavaScript, same setup as `matte` and `Spill_Geo`.

A plain web app is used (rather than e.g. Streamlit) because touch-typing practice needs
instant per-keystroke feedback in the browser.

## Modes

| Mode | Content |
| --- | --- |
| **Leksjoner** | 17 lessons introducing keys gradually from the home row (F J → D K → … → Æ Ø Å, capitals, numbers, punctuation) |
| **Ordøving** | random common words |
| **Setninger** | real sentences with capitals and punctuation |
| **Svake taster** | words and drills built from the keys you miss most often |
| **Egen tekst** | paste any text (smart quotes and dashes are normalised) |
| **Statistikk** | sessions, best/average WPM, accuracy, error heat map, recent sessions |

## Features

- On-screen Norwegian keyboard, colour-coded per finger, highlighting the next key —
  including the correct Shift key (opposite hand) and AltGr
- Hint line telling which finger to use, plus finger indicator
- Two error modes: *stop until correct key* or *continue and fix with Backspace*
- Length: short, long, 1 minute or 2 minutes
- Live WPM (5 characters = 1 word), accuracy and time
- Lesson stars: ★ ≥ 90 %, ★★ ≥ 95 %, ★★★ ≥ 98 % accuracy
- Per-key statistics, history and lesson progress stored in `localStorage`
- Shortcuts: `Tab` new round, `Esc` menu, `Enter` on the result screen = next/retry

## Run

Open `index.html` directly in a browser, or serve the folder:

```powershell
python -m http.server 8000
```

Then browse to <http://localhost:8000>.

## Layout

```
Touchtrening/
├── index.html
├── css/style.css
└── js/
    ├── keyboard.js  Norwegian layout, finger map, on-screen keyboard
    ├── words.js     Norwegian/English word lists and sentences
    ├── lessons.js   lesson definitions and practice-text generation
    ├── storage.js   localStorage wrapper
    └── app.js       screens, typing engine, results and statistics
```

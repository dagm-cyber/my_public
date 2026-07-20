/* ─────────────────────────────────────────────────────────
   questions.js  –  Question builders for every category
   ───────────────────────────────────────────────────────── */
const Questions = (() => {

  // ── Utilities ────────────────────────────────────────────

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr, n) { return shuffle(arr).slice(0, n); }

  /**
   * Pick `count` distinct distractor VALUES from `pool`.
   * @param {object} correctItem  – The correct item object.
   * @param {function} getVal     – Maps an item to its display value.
   * @param {function} [getRegion]– Maps an item to a region key for smart grouping.
   * Same-region items are preferred as distractors.  Duplicate values are skipped.
   */
  function distractors(pool, correctItem, count, getVal, getRegion) {
    const correctVal    = getVal(correctItem);
    const correctRegion = getRegion ? getRegion(correctItem) : null;

    // Interleave: same-region items first, then the rest – all shuffled
    const shuffledPool = shuffle([...pool]);
    const ordered = (getRegion && correctRegion != null)
      ? [
          ...shuffledPool.filter(i => getRegion(i) === correctRegion),
          ...shuffledPool.filter(i => getRegion(i) !== correctRegion),
        ]
      : shuffledPool;

    // Collect unique values that differ from the correct answer
    const seen  = new Set([correctVal]);
    const picks = [];
    for (const item of ordered) {
      const val = getVal(item);
      if (!seen.has(val)) {
        seen.add(val);
        picks.push(val);
        if (picks.length === count) break;
      }
    }
    return picks;
  }

  function makeOptions(correctAnswer, wrongAnswers) {
    return shuffle([correctAnswer, ...wrongAnswers]);
  }

  const POINTS = { easy: 1, medium: 2, hard: 3 };

  // ── WORLD: Capitals ───────────────────────────────────────

  function genCapitalQuestion(country, allCountries, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'capitalOf' : 'countryOf';

    if (variant === 'capitalOf') {
      const wrong = distractors(
        allCountries, country, 3,
        c => c.capital,
        c => c.continent
      );
      return {
        type: 'mcq',
        category: 'Capitals',
        text: `What is the capital of ${country.name}?`,
        options: makeOptions(country.capital, wrong),
        correctAnswer: country.capital,
        points: pts,
      };
    } else {
      const wrong = distractors(
        allCountries, country, 3,
        c => c.name,
        c => c.continent
      );
      return {
        type: 'mcq',
        category: 'Capitals',
        text: `Which country has "${country.capital}" as its capital?`,
        options: makeOptions(country.name, wrong),
        correctAnswer: country.name,
        points: pts,
      };
    }
  }

  // Hard capital question: free-text
  function genCapitalTextQuestion(country, gameDifficulty) {
    return {
      type: 'text',
      category: 'Capitals',
      text: `Name the capital of ${country.name}.`,
      correctAnswer: country.capital,
      aliases: country.capitalAliases || [],
      points: POINTS[gameDifficulty],
    };
  }

  // ── WORLD: Flags ──────────────────────────────────────────

  function genFlagQuestion(country, allCountries, gameDifficulty) {
    const wrong = distractors(
      allCountries, country, 3,
      c => c.name,
      c => c.continent
    );
    return {
      type: 'mcq-image',
      category: 'Flags',
      text: 'Which country does this flag belong to?',
      imageUrl: `https://flagcdn.com/w320/${country.iso2}.png`,
      options: makeOptions(country.name, wrong),
      correctAnswer: country.name,
      points: POINTS[gameDifficulty],
    };
  }
  // ── WORLD: Currencies ──────────────────────────────────────────

  function genCurrencyQuestion(country, distPool, gameDifficulty) {
    const wrong = distractors(distPool, country, 3, c => c.currency, c => c.continent);
    return {
      type: 'mcq',
      category: 'Currencies',
      text: `What is the currency of ${country.name}?`,
      options: makeOptions(country.currency, wrong),
      correctAnswer: country.currency,
      points: POINTS[gameDifficulty],
    };
  }

  // ── WORLD: Languages ──────────────────────────────────────────

  function genLanguageQuestion(country, distPool, gameDifficulty) {
    const wrong = distractors(distPool, country, 3, c => c.language, c => c.continent);
    return {
      type: 'mcq',
      category: 'Languages',
      text: `What is the official language of ${country.name}?`,
      options: makeOptions(country.language, wrong),
      correctAnswer: country.language,
      points: POINTS[gameDifficulty],
    };
  }
  // ── WORLD: Mountains ──────────────────────────────────────

  function genMountainQuestion(mountain, allMountains, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'inWhichCountry' : 'whichMountain';

    if (variant === 'inWhichCountry') {
      const allCountryVals = [...new Set(allMountains.map(m => m.country))];
      const wrong = pick(
        allCountryVals.filter(v => v !== mountain.country),
        3
      );
      return {
        type: 'mcq',
        category: 'Mountains',
        text: `In which country (or countries) is ${mountain.name} located?`,
        options: makeOptions(mountain.country, wrong),
        correctAnswer: mountain.country,
        points: pts,
      };
    } else {
      // "Which is the highest mountain in [continent]?"
      const sameContinent = allMountains.filter(m => m.continent === mountain.continent);
      const tallest = sameContinent.reduce((a, b) => a.height > b.height ? a : b);

      if (tallest.name === mountain.name) {
        const wrongNames = pick(
          allMountains.filter(m => m.name !== mountain.name).map(m => m.name),
          3
        );
        return {
          type: 'mcq',
          category: 'Mountains',
          text: `What is the highest mountain in ${mountain.continent}?`,
          options: makeOptions(mountain.name, wrongNames),
          correctAnswer: mountain.name,
          points: pts,
        };
      }

      // Fall back to country variant
      const allCountryVals = [...new Set(allMountains.map(m => m.country))];
      const wrong = pick(
        allCountryVals.filter(v => v !== mountain.country),
        3
      );
      return {
        type: 'mcq',
        category: 'Mountains',
        text: `In which country is ${mountain.name} located?`,
        options: makeOptions(mountain.country, wrong),
        correctAnswer: mountain.country,
        points: pts,
      };
    }
  }

  // ── WORLD: Lakes ─────────────────────────────────────────

  function genLakeQuestion(lake, allLakes, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'largest' : 'inWhich';

    if (variant === 'largest') {
      const sameContinent = allLakes.filter(l => l.continent === lake.continent);
      const largest = sameContinent.reduce((a, b) => a.area > b.area ? a : b);

      if (largest.name === lake.name) {
        const wrongNames = pick(
          allLakes.filter(l => l.name !== lake.name).map(l => l.name),
          3
        );
        return {
          type: 'mcq',
          category: 'Lakes',
          text: `What is the largest lake in ${lake.continent}?`,
          options: makeOptions(lake.name, wrongNames),
          correctAnswer: lake.name,
          points: pts,
        };
      }
    }

    // "In which continent is [lake]?"
    const allContinents = [...new Set(allLakes.map(l => l.continent))];
    const wrong = pick(
      allContinents.filter(c => c !== lake.continent),
      Math.min(3, allContinents.length - 1)
    );
    return {
      type: 'mcq',
      category: 'Lakes',
      text: `On which continent is ${lake.name} located?`,
      options: makeOptions(lake.continent, wrong),
      correctAnswer: lake.continent,
      points: pts,
    };
  }

  // ── WORLD: Rivers ─────────────────────────────────────────

  function genRiverQuestion(river, allRivers, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'longest' : 'inWhich';

    if (variant === 'longest') {
      const sameContinent = allRivers.filter(r => r.continent === river.continent);
      const longest = sameContinent.reduce((a, b) => a.length > b.length ? a : b);

      if (longest.name === river.name) {
        const wrongNames = pick(
          allRivers.filter(r => r.name !== river.name).map(r => r.name),
          3
        );
        return {
          type: 'mcq',
          category: 'Rivers',
          text: `What is the longest river in ${river.continent}?`,
          options: makeOptions(river.name, wrongNames),
          correctAnswer: river.name,
          points: pts,
        };
      }
    }

    const allContinents = [...new Set(allRivers.map(r => r.continent))];
    const wrong = pick(
      allContinents.filter(c => c !== river.continent),
      Math.min(3, allContinents.length - 1)
    );
    return {
      type: 'mcq',
      category: 'Rivers',
      text: `On which continent does the ${river.name} flow?`,
      options: makeOptions(river.continent, wrong),
      correctAnswer: river.continent,
      points: pts,
    };
  }

  // ── WORLD: Map ────────────────────────────────────────────

  function genMapQuestion(country, gameDifficulty) {
    return {
      type: 'map',
      category: 'Map',
      text: `Click on ${country.name} on the map.`,
      targetIso2: country.iso2.toUpperCase(),
      targetName: country.name,
      points: POINTS[gameDifficulty],
    };
  }

  // ── NORWAY: Counties ──────────────────────────────────────

  function genCountyQuestion(county, allCounties, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'centerOf' : 'countyOf';

    if (variant === 'centerOf') {
      const wrong = distractors(
        allCounties, county, 3,
        c => c.center,
        c => c.region
      );
      return {
        type: 'mcq',
        category: 'Counties',
        text: `What is the administrative center of ${county.name}?`,
        options: makeOptions(county.center, wrong),
        correctAnswer: county.center,
        points: pts,
      };
    } else {
      const wrong = distractors(
        allCounties, county, 3,
        c => c.name,
        c => c.region
      );
      return {
        type: 'mcq',
        category: 'Counties',
        text: `Which county has "${county.center}" as its administrative center?`,
        options: makeOptions(county.name, wrong),
        correctAnswer: county.name,
        points: pts,
      };
    }
  }

  // ── NORWAY: Mountains ────────────────────────────────────

  function genNorwayMountainQuestion(mountain, allMountains, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'inCounty' : 'tallest';

    if (variant === 'tallest') {
      const tallest = allMountains.reduce((a, b) => a.height > b.height ? a : b);
      if (tallest.name === mountain.name) {
        const wrongNames = pick(
          allMountains.filter(m => m.name !== mountain.name).map(m => m.name),
          3
        );
        return {
          type: 'mcq',
          category: 'Mountains',
          text: 'What is the highest mountain in Norway?',
          options: makeOptions(mountain.name, wrongNames),
          correctAnswer: mountain.name,
          points: pts,
        };
      }
    }

    // Height question: how tall is [mountain]?
    const heights = [...new Set(allMountains.map(m => m.height))].filter(h => h !== mountain.height);
    const wrongHeights = pick(heights, 3).map(h => `${h} m`);
    return {
      type: 'mcq',
      category: 'Mountains',
      text: `How tall is ${mountain.name}?`,
      options: makeOptions(`${mountain.height} m`, wrongHeights),
      correctAnswer: `${mountain.height} m`,
      points: pts,
    };
  }

  // ── NORWAY: Lakes ─────────────────────────────────────────

  function genNorwayLakeQuestion(lake, allLakes, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const largest = allLakes.reduce((a, b) => a.area > b.area ? a : b);

    if (largest.name === lake.name) {
      const wrongNames = pick(
        allLakes.filter(l => l.name !== lake.name).map(l => l.name),
        3
      );
      return {
        type: 'mcq',
        category: 'Lakes',
        text: 'What is the largest lake in Norway?',
        options: makeOptions(lake.name, wrongNames),
        correctAnswer: lake.name,
        points: pts,
      };
    }

    // County question
    const wrong = distractors(allLakes, lake, 3, l => l.county);
    return {
      type: 'mcq',
      category: 'Lakes',
      text: `In which county is the lake ${lake.name} located?`,
      options: makeOptions(lake.county, wrong),
      correctAnswer: lake.county,
      points: pts,
    };
  }

  // ── NORWAY: Fjords ────────────────────────────────────────

  function genFjordQuestion(fjord, allFjords, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const longest = allFjords.reduce((a, b) => a.length > b.length ? a : b);

    if (longest.name === fjord.name) {
      const wrongNames = pick(
        allFjords.filter(f => f.name !== fjord.name).map(f => f.name),
        3
      );
      return {
        type: 'mcq',
        category: 'Fjords',
        text: 'What is the longest fjord in Norway?',
        options: makeOptions(fjord.name, wrongNames),
        correctAnswer: fjord.name,
        points: pts,
      };
    }

    const wrong = distractors(allFjords, fjord, 3, f => f.county);
    return {
      type: 'mcq',
      category: 'Fjords',
      text: `In which county is ${fjord.name} located?`,
      options: makeOptions(fjord.county, wrong),
      correctAnswer: fjord.county,
      points: pts,
    };
  }

  // ── NORWAY: Cities ────────────────────────────────────────

  function genNorwayCityQuestion(city, allCities, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'inCounty' : 'largestCity';

    if (variant === 'inCounty') {
      const wrong = distractors(allCities, city, 3, c => c.county);
      return {
        type: 'mcq',
        category: 'Cities',
        text: `In which county is ${city.name} located?`,
        options: makeOptions(city.county, wrong),
        correctAnswer: city.county,
        points: pts,
      };
    } else {
      const wrong = distractors(allCities, city, 3, c => c.name);
      return {
        type: 'mcq',
        category: 'Cities',
        text: `Which city is the largest in ${city.county}?`,
        options: makeOptions(city.name, wrong),
        correctAnswer: city.name,
        points: pts,
      };
    }
  }
  // ── USA: States ────────────────────────────────────────────

  function genUSStateQuestion(state, allStates, gameDifficulty) {
    const pts = POINTS[gameDifficulty];
    const variant = Math.random() < 0.5 ? 'capitalOf' : 'stateOf';

    if (variant === 'capitalOf') {
      const wrong = distractors(allStates, state, 3, s => s.capital, s => s.region);
      return {
        type: 'mcq',
        category: 'States',
        text: `What is the capital of ${state.name}?`,
        options: makeOptions(state.capital, wrong),
        correctAnswer: state.capital,
        points: pts,
      };
    } else {
      const wrong = distractors(allStates, state, 3, s => s.name, s => s.region);
      return {
        type: 'mcq',
        category: 'States',
        text: `Which state has "${state.capital}" as its capital?`,
        options: makeOptions(state.name, wrong),
        correctAnswer: state.name,
        points: pts,
      };
    }
  }

  // ── USA: Cities ────────────────────────────────────────────

  function genUSCityQuestion(city, allCities, gameDifficulty) {
    // Distractors are other state names (never the same state)
    const otherStates = [...new Set(
      allCities.filter(c => c.state !== city.state).map(c => c.state)
    )];
    const wrong = pick(otherStates, 3);
    return {
      type: 'mcq',
      category: 'Cities',
      text: `In which state is ${city.name} located?`,
      options: makeOptions(city.state, wrong),
      correctAnswer: city.state,
      points: POINTS[gameDifficulty],
    };
  }  // ── USA: State Map ──────────────────────────────────────────

  function genUSStateMapQuestion(state, allStates, gameDifficulty) {
    const wrongCapitals = distractors(allStates, state, 3, s => s.capital, s => s.region);
    return {
      type: 'usa-map',
      category: 'Map',
      text: `Click on ${state.name} on the map.`,
      targetStateName: state.name,
      capitalText:    `What is the capital of ${state.name}?`,
      capitalOptions: shuffle([state.capital, ...wrongCapitals]),
      correctAnswer:  state.capital,   // used for session.checkAnswer comparison
      correctStateName: state.name,    // used for display when wrong state is clicked
      points: POINTS[gameDifficulty],
    };
  }
  // ── Pool Builder ──────────────────────────────────────────

  const DIFFICULTY_POOL = {
    easy:   ['easy'],
    medium: ['easy', 'medium'],
    hard:   ['easy', 'medium', 'hard'],
  };

  function buildPool(data, mode, categories, gameDifficulty, count, continent = null) {
    const allowedDiffs = DIFFICULTY_POOL[gameDifficulty];
    let pool = [];

    if (mode === 'world') {
      // ── Filter by difficulty ──
      let eligibleCountries = data.countries.filter(c => allowedDiffs.includes(c.difficulty));
      let eligibleMountains = data.geography.mountains.filter(m => allowedDiffs.includes(m.difficulty));
      let eligibleLakes     = data.geography.lakes.filter(l => allowedDiffs.includes(l.difficulty));
      let eligibleRivers    = data.geography.rivers.filter(r => allowedDiffs.includes(r.difficulty));

      // ── Filter by continent ──
      if (continent) {
        eligibleCountries = eligibleCountries.filter(c => c.continent === continent);
        eligibleMountains = eligibleMountains.filter(m => m.continent === continent);
        eligibleLakes     = eligibleLakes.filter(l => l.continent === continent);
        eligibleRivers    = eligibleRivers.filter(r => r.continent === continent);
      }

      // ── Distractor pools: use continent-filtered when large enough, else fall back to full ──
      const fullCountries = data.countries.filter(c => allowedDiffs.includes(c.difficulty));
      const fullMountains = data.geography.mountains;
      const fullLakes     = data.geography.lakes;
      const fullRivers    = data.geography.rivers;
      const cntryDistPool = eligibleCountries.length >= 5 ? eligibleCountries : fullCountries;
      const mountDistPool = eligibleMountains.length >= 4 ? eligibleMountains : fullMountains;
      const lakeDistPool  = eligibleLakes.length  >= 4 ? eligibleLakes  : fullLakes;
      const riverDistPool = eligibleRivers.length >= 4 ? eligibleRivers : fullRivers;

      for (const cat of categories) {
        switch (cat) {
          case 'capitals':
            for (const country of eligibleCountries) {
              const q = gameDifficulty === 'hard'
                ? genCapitalTextQuestion(country, gameDifficulty)
                : genCapitalQuestion(country, cntryDistPool, gameDifficulty);
              pool.push({ ...q, subject: country.name });
            }
            break;
          case 'flags':
            for (const country of eligibleCountries) {
              pool.push({ ...genFlagQuestion(country, cntryDistPool, gameDifficulty), subject: country.name });
            }
            break;
          case 'currencies': {
            const withCurr = eligibleCountries.filter(c => c.currency);
            const currDist = cntryDistPool.filter(c => c.currency);
            const currPool = currDist.length >= 5 ? currDist : withCurr;
            for (const country of withCurr) {
              pool.push({ ...genCurrencyQuestion(country, currPool, gameDifficulty), subject: country.name });
            }
            break;
          }
          case 'languages': {
            const withLang = eligibleCountries.filter(c => c.language);
            const langDist = cntryDistPool.filter(c => c.language);
            const langPool = langDist.length >= 5 ? langDist : withLang;
            for (const country of withLang) {
              pool.push({ ...genLanguageQuestion(country, langPool, gameDifficulty), subject: country.name });
            }
            break;
          }
          case 'mountains':
            for (const mountain of eligibleMountains) {
              pool.push({ ...genMountainQuestion(mountain, mountDistPool, gameDifficulty), subject: mountain.name });
            }
            for (const river of eligibleRivers) {
              pool.push({ ...genRiverQuestion(river, riverDistPool, gameDifficulty), subject: river.name });
            }
            break;
          case 'lakes':
            for (const lake of eligibleLakes) {
              pool.push({ ...genLakeQuestion(lake, lakeDistPool, gameDifficulty), subject: lake.name });
            }
            break;
          case 'map': {
            const mappable = eligibleCountries.filter(c => c.mappable);
            for (const country of mappable) {
              pool.push({ ...genMapQuestion(country, gameDifficulty), subject: country.name });
            }
            break;
          }
        }
      }
    }

    if (mode === 'norway') {
      const eligibleMountains = data.geography.mountains.filter(m => allowedDiffs.includes(m.difficulty));
      const eligibleLakes     = data.geography.lakes.filter(l => allowedDiffs.includes(l.difficulty));
      const eligibleFjords    = data.geography.fjords.filter(f => allowedDiffs.includes(f.difficulty));
      const eligibleCities    = data.geography.cities.filter(c => allowedDiffs.includes(c.difficulty));

      for (const cat of categories) {
        switch (cat) {
          case 'counties':
            for (const county of data.counties) {
              pool.push({ ...genCountyQuestion(county, data.counties, gameDifficulty), subject: county.name });
            }
            break;
          case 'mountains':
            for (const mountain of eligibleMountains) {
              pool.push({ ...genNorwayMountainQuestion(mountain, data.geography.mountains, gameDifficulty), subject: mountain.name });
            }
            break;
          case 'lakes':
            for (const lake of eligibleLakes) {
              pool.push({ ...genNorwayLakeQuestion(lake, data.geography.lakes, gameDifficulty), subject: lake.name });
            }
            break;
          case 'fjords':
            for (const fjord of eligibleFjords) {
              pool.push({ ...genFjordQuestion(fjord, data.geography.fjords, gameDifficulty), subject: fjord.name });
            }
            break;
          case 'cities':
            for (const city of eligibleCities) {
              pool.push({ ...genNorwayCityQuestion(city, data.geography.cities, gameDifficulty), subject: city.name });
            }
            break;
        }
      }
    }

    if (mode === 'usa') {
      const eligibleStates = data.states.filter(s => allowedDiffs.includes(s.difficulty));
      const eligibleCities = data.cities.filter(c => allowedDiffs.includes(c.difficulty));

      for (const cat of categories) {
        switch (cat) {
          case 'states':
            // If 'map' is also selected, map questions already include the capital follow-up.
            // Skip generating separate MCQ questions to avoid double-counting states.
            if (!categories.includes('map')) {
              for (const state of eligibleStates) {
                pool.push({ ...genUSStateQuestion(state, data.states, gameDifficulty), subject: state.name });
              }
            }
            break;
          case 'cities':
            for (const city of eligibleCities) {
              pool.push({ ...genUSCityQuestion(city, data.cities, gameDifficulty), subject: city.name });
            }
            break;
          case 'map': {
            // Show capital follow-up only when States & Capitals is also selected
            const hasCapitalFollowUp = categories.includes('states');
            // Continental US only (AK/HI are off-screen at default zoom)
            const mapStates = eligibleStates.filter(s => s.abbr !== 'AK' && s.abbr !== 'HI');
            for (const state of mapStates) {
              const q = genUSStateMapQuestion(state, data.states, gameDifficulty);
              pool.push({
                ...q,
                subject: state.name,
                hasCapitalFollowUp,
                // correctAnswer = capital if there's a follow-up, state name otherwise
                correctAnswer: hasCapitalFollowUp ? state.capital : state.name,
              });
            }
            break;
          }
        }
      }
    }

    // Shuffle then select — each subject (country/mountain/lake) appears at most once per game
    const shuffled = shuffle(pool);
    const selected = [];
    const usedSubjects = new Set();

    for (const q of shuffled) {
      if (selected.length >= count) break;
      if (!usedSubjects.has(q.subject)) {
        usedSubjects.add(q.subject);
        selected.push(q);
      }
    }

    // If unique subjects run out before reaching count, fill the rest
    for (const q of shuffled) {
      if (selected.length >= count) break;
      if (!selected.includes(q)) selected.push(q);
    }

    return selected;
  }

  return { buildPool };
})();

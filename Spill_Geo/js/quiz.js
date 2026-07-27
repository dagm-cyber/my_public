/* ─────────────────────────────────────────────────────────
   quiz.js  –  QuizSession class
   ───────────────────────────────────────────────────────── */
class QuizSession {
  constructor(questions) {
    this.questions  = questions;
    this.index      = 0;
    this.score      = 0;
    this.maxScore   = questions.reduce((s, q) => s + q.points, 0);
    this.answers    = [];   // { question, userAnswer, correct }
  }

  get total()           { return this.questions.length; }
  get currentQuestion() { return this.questions[this.index]; }
  get correctCount()    { return this.answers.filter(a => a.correct).length; }
  get progressPct()     { return this.total ? (this.index / this.total) * 100 : 0; }
  get isComplete()      { return this.index >= this.total; }

  /** Check an answer and record it. Returns true if correct. */
  checkAnswer(userAnswer) {
    const q = this.currentQuestion;
    const correct = this._evaluate(q, userAnswer);

    if (correct) this.score += q.points;

    this.answers.push({ question: q, userAnswer, correct });
    return correct;
  }

  advance() {
    this.index++;
  }

  /** Missed questions (for results screen). */
  get missed() {
    return this.answers.filter(a => !a.correct);
  }

  // ── Private ────────────────────────────────────────────

  _evaluate(question, userAnswer) {
    if (question.type === 'text') {
      const norm = str => (str || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // strip accents
      const correct  = norm(question.correctAnswer);
      const answer   = norm(userAnswer);
      const aliases  = (question.aliases || []).map(norm);
      // Also accept the Norwegian form of the answer when available.
      if (typeof Lang !== 'undefined') {
        const no = Lang.toNo(question.correctAnswer);
        if (no) aliases.push(norm(no));
      }
      return answer === correct || aliases.includes(answer);
    }
    // mcq, mcq-image, map
    return userAnswer === question.correctAnswer;
  }
}

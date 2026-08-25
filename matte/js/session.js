// ── One play-through of a game ──────────────────────────────

class GameSession {
  constructor(gameId, tasks) {
    this.gameId = gameId;
    this.tasks = tasks;
    this.index = 0;
    this.correctCount = 0;
    this.answers = []; // { task, userAnswer, correct, timedOut }
    this.startedAt = Date.now();
    this.finishedAt = null;
  }

  get currentTask() { return this.tasks[this.index] || null; }
  get total() { return this.tasks.length; }
  get isDone() { return this.index >= this.total; }
  get progressPct() { return this.total ? (this.index / this.total) * 100 : 0; }
  get wrongAnswers() { return this.answers.filter(a => !a.correct); }

  get elapsedMs() {
    return (this.finishedAt || Date.now()) - this.startedAt;
  }

  submit(value) {
    const task = this.currentTask;
    if (!task) return false;
    const correct = Number(value) === task.answer;
    if (correct) this.correctCount++;
    this.answers.push({ task, userAnswer: value, correct, timedOut: false });
    return correct;
  }

  timeout() {
    const task = this.currentTask;
    if (!task) return;
    this.answers.push({ task, userAnswer: null, correct: false, timedOut: true });
  }

  next() {
    this.index++;
    if (this.isDone && !this.finishedAt) this.finishedAt = Date.now();
  }
}

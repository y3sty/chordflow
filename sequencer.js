const BAR_UNITS = 16;

export class Sequencer {
  constructor(audio, onStep) {
    this.audio = audio;
    this.onStep = onStep;
    this.timer = null;
    this.running = false;
    this.paused = false;
    this.events = [];
    this.eventIndex = 0;
    this.cycleStartTime = 0;
    this.totalUnits = 0;
    this.bpm = 90;
  }

  buildEvents(state) {
    const events = [];
    let cursor = 0;
    const pattern = state.pattern;
    const addStrokes = (block, from, to, base) => {
      pattern.strokes.slice(from, to + 1).forEach((stroke, index) => {
        const patternPosition = from + index;
        events.push({ block: { ...block, patternPosition }, stroke, patternPosition, offsetUnits: base + (stroke.time ?? patternPosition * 2) });
      });
    };

    state.sequence.forEach((block, index) => {
      const segment = pattern.id === 'vosmyorka' ? block.strumPart || 'full' : 'full';
      const previous = state.sequence[index - 1];
      const next = state.sequence[index + 1];

      if (pattern.id === 'vosmyorka' && segment === 'first') {
        addStrokes(block, 0, 1, cursor);
        cursor += next?.strumPart === 'second' ? 6 : BAR_UNITS;
        return;
      }

      if (pattern.id === 'vosmyorka' && segment === 'second') {
        const paired = previous?.strumPart === 'first';
        const pairBase = paired ? cursor - 6 : cursor;
        addStrokes(block, 2, 7, pairBase);
        cursor = paired ? pairBase + BAR_UNITS : cursor + BAR_UNITS;
        return;
      }

      const bars = Math.max(1, Number(block.bars) || 1);
      for (let bar = 0; bar < bars; bar += 1) addStrokes(block, 0, pattern.strokes.length - 1, cursor + bar * BAR_UNITS);
      cursor += bars * BAR_UNITS;
    });

    return { events, totalUnits: Math.max(cursor, BAR_UNITS) };
  }

  async start(state) {
    if (!state.sequence.length) return;
    await this.audio.resume();
    if (!this.running) {
      this.bpm = state.bpm;
      const built = this.buildEvents(state);
      this.events = built.events;
      this.totalUnits = built.totalUnits;
      this.eventIndex = 0;
      this.cycleStartTime = this.audio.context.currentTime + 0.06;
      this.running = true;
      this.paused = false;
    }
    this.schedule(state);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(state), 25);
  }

  schedule(state) {
    const ctx = this.audio.context;
    const lookahead = 0.12;
    const sixteenth = 60 / this.bpm / 4;
    while (this.running && this.eventIndex < this.events.length) {
      const event = this.events[this.eventIndex];
      const when = this.cycleStartTime + event.offsetUnits * sixteenth;
      if (when >= ctx.currentTime + lookahead) break;
      const { block, stroke, patternPosition } = event;
      if (stroke.sound) this.audio.playChord(block.chord, stroke.dir, when, stroke);
      else if (stroke.mute && state.mutedStrikes) this.audio.playMute(when);
      const visualDelay = Math.max(0, (when - ctx.currentTime) * 1000);
      setTimeout(() => this.onStep(block, patternPosition), visualDelay);
      this.eventIndex += 1;
    }
    if (this.running && this.eventIndex >= this.events.length) {
      if (state.loop) {
        this.eventIndex = 0;
        this.cycleStartTime += this.totalUnits * sixteenth;
        this.schedule(state);
      } else this.stop();
    }
  }

  setTempo(bpm) {
    this.bpm = Math.max(40, Math.min(200, Number(bpm) || 90));
    if (this.running && this.events.length && this.eventIndex < this.events.length) {
      const nextOffset = this.events[this.eventIndex].offsetUnits;
      const sixteenth = 60 / this.bpm / 4;
      this.cycleStartTime = this.audio.context.currentTime + 0.02 - nextOffset * sixteenth;
    }
  }
  pause() { this.running = false; clearInterval(this.timer); this.paused = true; }
  stop() { this.running = false; this.paused = false; clearInterval(this.timer); this.eventIndex = 0; this.onStep(null, -1); }
}

const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];
const PLAYER_URL = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';
const INSTRUMENT_URL = 'https://surikov.github.io/webaudiofontdata/sound/0250_LK_AcousticSteel_SF2_file.js';
const INSTRUMENT_NAME = '_tone_0250_LK_AcousticSteel_SF2_file';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url; script.onload = resolve; script.onerror = () => reject(new Error(`Не удалось загрузить ${url}`));
    document.head.appendChild(script);
  });
}

export class AudioEngine {
  constructor(onStatus = () => {}) { this.context = null; this.master = null; this.player = null; this.instrument = null; this.readyPromise = null; this.iosAudio = null; this.onStatus = onStatus; }

  unlockIosSilentMode() {
    const isIosSafari = navigator.maxTouchPoints > 0 && window.webkitAudioContext;
    if (!isIosSafari || this.iosAudio) return;
    const sampleRate = 44100;
    const header = new ArrayBuffer(10); const view = new DataView(header);
    view.setUint32(0, sampleRate, true); view.setUint32(4, sampleRate, true); view.setUint16(8, 1, true);
    const missing = window.btoa(String.fromCharCode(...new Uint8Array(header))).slice(0, 13);
    const silentWav = `data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEA${missing}AgAZGF0YQcAAACAgICAgICAAAA=`;
    const audio = document.createElement('audio');
    audio.setAttribute('x-webkit-airplay', 'deny'); audio.setAttribute('playsinline', ''); audio.preload = 'auto'; audio.loop = true; audio.src = silentWav;
    audio.load();
    this.iosAudio = audio;
    audio.play().catch(() => { audio.pause(); audio.removeAttribute('src'); audio.load(); this.iosAudio = null; });
  }

  ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API не поддерживается этим браузером');
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.58;
      this.master.connect(this.context.destination);
      this.onStatus('Загрузка стальной гитары…');
      this.readyPromise = this.loadSteelGuitar();
    }
  }

  unlock() {
    this.unlockIosSilentMode();
    this.ensureContext();
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.02), this.context.sampleRate);
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.master); source.start(0);
    void this.context.resume();
  }

  async resume() {
    this.ensureContext();
    if (this.context.state !== 'running') await this.context.resume();
    await this.readyPromise;
  }

  async loadSteelGuitar() {
    try {
      if (!window.WebAudioFontPlayer) await loadScript(PLAYER_URL);
      if (!window[INSTRUMENT_NAME]) await loadScript(INSTRUMENT_URL);
      this.player = new window.WebAudioFontPlayer();
      this.player.loader.decodeAfterLoading(this.context, INSTRUMENT_NAME);
      this.instrument = window[INSTRUMENT_NAME];
      this.onStatus('Стальная акустика');
    } catch (error) {
      console.warn('WebAudioFont не загрузился, включён резервный синтез:', error);
      this.player = null;
      this.onStatus('Резервный синтез');
    }
  }

  playChord(chord, direction, when, stroke = {}) {
    const range = stroke.stringRange || (direction === 'up' ? [2, 5] : [0, 5]);
    const notes = chord.frets.map((fret, index) => fret === null || index < range[0] || index > range[1] ? null : { pitch: OPEN_STRING_MIDI[index] + fret, stringIndex: index }).filter(Boolean);
    if (this.player && this.instrument) {
      const ordered = direction === 'up' ? [...notes].reverse() : notes;
      const baseVelocity = stroke.velocity ?? (stroke.accent ? 1 : 0.72);
      const spread = direction === 'up' ? 0.006 : 0.008;
      const duration = direction === 'up' ? 1.0 : 1.25;
      ordered.forEach((note, position) => {
        const humanTime = when + position * spread + (Math.random() - 0.5) * 0.003;
        const humanVelocity = Math.max(0.25, Math.min(1, baseVelocity * (0.94 + Math.random() * 0.12)));
        this.player.queueWaveTable(this.context, this.master, this.instrument, humanTime, note.pitch, duration, humanVelocity);
      });
      return;
    }
    this.playFallback(chord, direction, when, stroke);
  }

  playMute(when) {
    if (!this.context) return;
    const duration = 0.065;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate); const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) { const decay = 1 - i / data.length; data[i] = (Math.random() * 2 - 1) * decay * decay; }
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1250; filter.Q.value = 0.7;
    const gain = this.context.createGain(); gain.gain.setValueAtTime(0.34, when); gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(this.master); source.start(when);
  }

  playFallback(chord, direction, when, stroke = {}) {
    const range = stroke.stringRange || (direction === 'up' ? [2, 5] : [0, 5]);
    const notes = chord.frets.map((fret, index) => fret === null || index < range[0] || index > range[1] ? null : { frequency: [82.41, 110, 146.83, 196, 246.94, 329.63][index] * Math.pow(2, fret / 12) }).filter(Boolean);
    const ordered = direction === 'up' ? [...notes].reverse() : notes;
    ordered.forEach((note, position) => { const duration = direction === 'up' ? 1 : 1.2; const oscillator = this.context.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = note.frequency; const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = Math.min(3800, note.frequency * 7); const gain = this.context.createGain(); const volume = ((stroke.velocity ?? 0.7) * 0.055) / Math.sqrt(note.frequency / 110); const start = when + position * (direction === 'up' ? 0.006 : 0.008); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); oscillator.connect(filter).connect(gain).connect(this.master); oscillator.start(start); oscillator.stop(start + duration + 0.03); });
  }
}

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
  constructor(onStatus = () => {}) { this.context = null; this.master = null; this.recordDestination = null; this.player = null; this.instrument = null; this.readyPromise = null; this.iosAudio = null; this.onStatus = onStatus; }

  unlockIosSilentMode() {
    const isIosSafari = navigator.maxTouchPoints > 0 && window.webkitAudioContext;
    if (!isIosSafari) return;
    if (this.iosAudio) { this.iosAudio.play().catch(() => {}); return; }
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
      if (this.context.createMediaStreamDestination) {
        this.recordDestination = this.context.createMediaStreamDestination();
        this.master.connect(this.recordDestination);
      }
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
    this.unlockIosSilentMode();
    if (this.context.state !== 'running') await this.context.resume();
    await this.readyPromise;
  }

  startRecording() {
    if (!this.recordDestination || !window.MediaRecorder) throw new Error('Запись аудио не поддерживается этим браузером');
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
    const chunks = [];
    const recorder = new MediaRecorder(this.recordDestination.stream, mimeType ? { mimeType } : undefined);
    this.recorder = recorder;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.start(100);
    return { recorder, mimeType, done: new Promise(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/mp4' })); }) };
  }

  async waitForInstrument(timeoutMs = 8000) {
    if (!this.instrument || !this.instrument.zones) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const allReady = this.instrument.zones.every(zone => zone.buffer);
      if (allReady) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Истёк таймаут — продолжаем с тем, что есть (часть зон может быть не декодирована)
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

  async renderWavBlob(events, totalUnits, bpm, mutedStrikes = false, isLoop = true, targetDurationSeconds = 60) {
    await this.readyPromise;
    await this.waitForInstrument();

    // Идея 2: 22050 Гц — в 2 раза меньше данных, звук гитары на слух идентичен
    const sampleRate = 22050;
    const sixteenth = 60 / bpm / 4;
    const singleCycleDuration = totalUnits * sixteenth;

    const desiredDuration = Math.max(30, Number(targetDurationSeconds) || 60);
    const numCycles = isLoop ? Math.max(1, Math.ceil(desiredDuration / singleCycleDuration)) : 1;
    const tailDuration = 2.5; // хвост затухания струн

    const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtxClass) throw new Error('OfflineAudioContext не поддерживается');

    // Идея 1: рендерим только ОДИН цикл + хвост (независимо от numCycles)
    const renderDuration = singleCycleDuration + tailDuration;
    const offlineCtx = new OfflineCtxClass(2, Math.ceil(sampleRate * renderDuration), sampleRate);
    const offlineMaster = offlineCtx.createGain();
    offlineMaster.gain.value = 0.65;
    offlineMaster.connect(offlineCtx.destination);

    events.forEach(event => {
      const when = event.offsetUnits * sixteenth;
      const { block, stroke } = event;
      if (stroke.sound) {
        this.renderChordToContext(offlineCtx, offlineMaster, block.chord, stroke.dir, when, stroke);
      } else if (stroke.mute && mutedStrikes) {
        this.renderMuteToContext(offlineCtx, offlineMaster, when);
      }
    });

    const renderedBuffer = await offlineCtx.startRendering();

    if (isLoop) {
      const loopFrames = Math.round(sampleRate * singleCycleDuration);

      // Строим один бесшовный цикл: тело + хвост подмешан в начало
      const cycleChannels = [];
      for (let ch = 0; ch < 2; ch++) {
        const srcData = renderedBuffer.getChannelData(ch);
        const cycleData = new Float32Array(loopFrames);
        for (let i = 0; i < loopFrames; i++) cycleData[i] = srcData[i];
        const tailFrames = Math.min(srcData.length - loopFrames, loopFrames);
        for (let i = 0; i < tailFrames; i++) cycleData[i] += srcData[loopFrames + i];
        cycleChannels.push(cycleData);
      }

      // Идея 1: тиражируем цикл N раз через TypedArray.set() — мгновенно
      const totalFrames = loopFrames * numCycles;
      const tiledChannels = cycleChannels.map(cycleData => {
        const tiled = new Float32Array(totalFrames);
        for (let c = 0; c < numCycles; c++) tiled.set(cycleData, c * loopFrames);
        return tiled;
      });

      return channelsToWavBlob(tiledChannels, sampleRate, totalFrames);
    }

    return audioBufferToWavBlob(renderedBuffer);
  }

  renderChordToContext(ctx, master, chord, direction, when, stroke = {}) {
    const range = stroke.stringRange || (direction === 'up' ? [2, 5] : [0, 5]);
    const notes = chord.frets.map((fret, index) => fret === null || index < range[0] || index > range[1] ? null : { pitch: OPEN_STRING_MIDI[index] + fret, frequency: [82.41, 110, 146.83, 196, 246.94, 329.63][index] * Math.pow(2, fret / 12), stringIndex: index }).filter(Boolean);
    const ordered = direction === 'up' ? [...notes].reverse() : notes;
    const baseVelocity = stroke.velocity ?? (stroke.accent ? 1 : 0.72);
    const spread = direction === 'up' ? 0.006 : 0.008;

    if (this.player && this.instrument) {
      const duration = direction === 'up' ? 1.0 : 1.25;
      ordered.forEach((note, position) => {
        const humanTime = when + position * spread + (Math.random() - 0.5) * 0.003;
        const humanVelocity = Math.max(0.25, Math.min(1, baseVelocity * (0.94 + Math.random() * 0.12)));
        this.player.queueWaveTable(ctx, master, this.instrument, humanTime, note.pitch, duration, humanVelocity);
      });
      return;
    }

    ordered.forEach((note, position) => {
      const duration = direction === 'up' ? 1 : 1.2;
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = note.frequency;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(3800, note.frequency * 7);
      const gain = ctx.createGain();
      const volume = ((stroke.velocity ?? 0.7) * 0.055) / Math.sqrt(note.frequency / 110);
      const start = when + position * (direction === 'up' ? 0.006 : 0.008);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(filter).connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    });
  }

  renderMuteToContext(ctx, master, when) {
    const duration = 0.065;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) { const decay = 1 - i / data.length; data[i] = (Math.random() * 2 - 1) * decay * decay; }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1250;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.34, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
  }

  playFallback(chord, direction, when, stroke = {}) {
    const range = stroke.stringRange || (direction === 'up' ? [2, 5] : [0, 5]);
    const notes = chord.frets.map((fret, index) => fret === null || index < range[0] || index > range[1] ? null : { frequency: [82.41, 110, 146.83, 196, 246.94, 329.63][index] * Math.pow(2, fret / 12) }).filter(Boolean);
    const ordered = direction === 'up' ? [...notes].reverse() : notes;
    ordered.forEach((note, position) => { const duration = direction === 'up' ? 1 : 1.2; const oscillator = this.context.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = note.frequency; const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = Math.min(3800, note.frequency * 7); const gain = this.context.createGain(); const volume = ((stroke.velocity ?? 0.7) * 0.055) / Math.sqrt(note.frequency / 110); const start = when + position * (direction === 'up' ? 0.006 : 0.008); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); oscillator.connect(filter).connect(gain).connect(this.master); oscillator.start(start); oscillator.stop(start + duration + 0.03); });
  }
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = Math.max(-1, Math.min(1, channels[ch][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function channelsToWavBlob(channels, sampleRate, numFrames) {
  const numChannels = channels.length;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = Math.max(-1, Math.min(1, channels[ch][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

import { CHORDS, PATTERNS } from './ui.js?v=chords-4';
import { AudioEngine } from './audio-engine.js?v=eighth-12';
import { Sequencer } from './sequencer.js?v=eighth-10';
import { createInitialState, persist, renderPalette, renderSections, renderTimeline, setupControls, setTransportState, updatePlayhead, applyLanguage, $ } from './ui.js?v=chords-4';

const state = createInitialState();
const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbzoNGnjZD05oRdKJJCqSOUEMy31uibqpCdI_OExG-B8iWRDFtFHCEkDkGTsR_HSKzo/exec';
const audio = new AudioEngine(status => { $('#audio-status').textContent = status; });
const backgroundAudio = $('#background-audio');
let backgroundAudioUrl = null;
const lyricsOverlay = $('#lyrics-overlay');
const lyricsText = $('#lyrics-text');
const lyricsAutoscroll = $('#lyrics-autoscroll');
const lyricsSpeed = $('#lyrics-speed');
const lyricsSpeedValue = $('#lyrics-speed-value');
let lyricsScrollTimer = null;
let lyricsScrollPosition = 0;
const lyricsStorageKey = 'guitar-constructor-lyrics-v1';
lyricsText.value = localStorage.getItem(lyricsStorageKey) || '';
let isUserInteractingWithLyrics = false;
let userInteractionTimeout = null;

const stopLyricsAutoscroll = () => { if (lyricsScrollTimer) clearInterval(lyricsScrollTimer); lyricsScrollTimer = null; };

const scrollLyrics = () => {
  if (!lyricsAutoscroll.checked || lyricsOverlay.hidden) { stopLyricsAutoscroll(); return; }
  if (isUserInteractingWithLyrics) return;

  // Если пользователь руками прокрутил колесиком/тачем, подхватываем текущую позицию
  if (Math.abs(lyricsText.scrollTop - lyricsScrollPosition) > 2) {
    lyricsScrollPosition = lyricsText.scrollTop;
  }

  // Скорости 1..5 точно откалиброваны:
  // 1 = как старая 8 (0.600)
  // 2 = как старая 9 (0.675)
  // 3 = как старая 10 (0.750)
  // 4 = ускоренная ступень (0.825)
  // 5 = максимальная ступень (0.900)
  const speedMultiplier = (7 + Number(lyricsSpeed.value)) * 0.075;
  lyricsScrollPosition += speedMultiplier;
  lyricsText.scrollTop = lyricsScrollPosition;

  if (lyricsText.scrollTop + lyricsText.clientHeight >= lyricsText.scrollHeight - 2) {
    lyricsAutoscroll.checked = false;
    stopLyricsAutoscroll();
    return;
  }
};

const notifyUserScrollActivity = () => {
  if (!lyricsAutoscroll.checked) return;
  isUserInteractingWithLyrics = true;
  lyricsScrollPosition = lyricsText.scrollTop;
  if (userInteractionTimeout) clearTimeout(userInteractionTimeout);
  // Через 800мс после окончания касания/скролла пользователя плавно продолжаем автоскролл с нового места
  userInteractionTimeout = setTimeout(() => {
    isUserInteractingWithLyrics = false;
    lyricsScrollPosition = lyricsText.scrollTop;
  }, 800);
};

const startLyricsAutoscroll = () => {
  stopLyricsAutoscroll();
  isUserInteractingWithLyrics = false;
  lyricsScrollPosition = lyricsText.scrollTop;
  lyricsScrollTimer = setInterval(scrollLyrics, 50);
};

const openLyrics = () => { lyricsOverlay.hidden = false; document.body.classList.add('lyrics-open'); lyricsText.focus(); };
const closeLyrics = () => {
  lyricsAutoscroll.checked = false;
  stopLyricsAutoscroll();
  isUserInteractingWithLyrics = false;
  lyricsOverlay.hidden = true;
  document.body.classList.remove('lyrics-open');
};

$('#lyrics-open').onclick = openLyrics;
$('#lyrics-close').onclick = closeLyrics;
lyricsOverlay.addEventListener('click', event => { if (event.target === lyricsOverlay) closeLyrics(); });
lyricsText.addEventListener('input', () => localStorage.setItem(lyricsStorageKey, lyricsText.value));

// Отслеживаем действия пользователя: скролл колесиком/трекпадом, свайп пальцем на телефоне
lyricsText.addEventListener('wheel', notifyUserScrollActivity, { passive: true });
lyricsText.addEventListener('touchstart', notifyUserScrollActivity, { passive: true });
lyricsText.addEventListener('touchmove', notifyUserScrollActivity, { passive: true });
lyricsText.addEventListener('pointerdown', notifyUserScrollActivity, { passive: true });
lyricsText.addEventListener('scroll', () => {
  if (isUserInteractingWithLyrics) {
    lyricsScrollPosition = lyricsText.scrollTop;
  }
}, { passive: true });

lyricsAutoscroll.onchange = () => lyricsAutoscroll.checked ? startLyricsAutoscroll() : stopLyricsAutoscroll();
lyricsSpeed.oninput = () => { lyricsSpeedValue.textContent = lyricsSpeed.value; };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !lyricsOverlay.hidden) closeLyrics(); });
backgroundAudio.loop = true;
const sequencer = new Sequencer(audio, (item, step) => {
  if (item?.sectionId && item.sectionId !== state.currentSectionId) { state.currentSectionId = item.sectionId; refresh(); }
  updatePlayhead(item, step, state.currentSectionId);
  if (!item) setTransportState(false);
});
const currentSection = () => state.sections.find(section => section.id === state.currentSectionId) || state.sections[0];
const playbackSequence = () => state.songOrder.flatMap(sectionId => { const section = state.sections.find(item => item.id === sectionId); return (section?.sequence || []).map((item, localIndex) => ({ ...item, sectionId, sectionName: section.name, localIndex, strumPart: item.strumPart || 'full' })); });
function refresh() { persist(state); renderSections(state, handlers); renderTimeline(state, handlers); setupControls(state, handlers); applyLanguage(state.language); }

function songData() {
  return { format: 'chordflow-song', version: 1, name: state.songName, language: state.language, bpm: state.bpm, patternId: state.pattern.id, loop: state.loop, mutedStrikes: state.mutedStrikes, currentSectionId: state.currentSectionId, songOrder: state.songOrder, sections: state.sections.map(section => ({ id: section.id, name: section.name, sequence: section.sequence.map(item => ({ chord: { id: item.chord.id }, bars: item.bars, strumPart: item.strumPart || 'full' })) })) };
}

function saveSong() {
  const requestedName = window.prompt('Название мелодии:', state.songName || 'Моя мелодия');
  if (requestedName === null) return;
  state.songName = requestedName.trim() || 'Моя мелодия';
  persist(state);
  const blob = new Blob([JSON.stringify(songData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `${state.songName.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'melody'}.chordflow.json`; link.click(); URL.revokeObjectURL(url);
}

function applySongData(data, fallbackName = 'Моя мелодия') {
  if (!Array.isArray(data.sections)) throw new Error('В данных нет разделов песни');
  const validSections = data.sections.map(section => ({ id: section.id, name: section.name, sequence: (section.sequence || []).map(item => ({ ...item, chord: CHORDS.find(chord => chord.id === item.chord?.id) || CHORDS[0] })) })).filter(section => section.id && section.name);
  if (!validSections.length) throw new Error('В данных нет разделов');
  const validIds = new Set(validSections.map(section => section.id));
  state.songName = data.name || fallbackName; state.language = data.language === 'cs' ? 'cs' : state.language;
  state.bpm = Number(data.bpm) || 90; state.pattern = PATTERNS.find(pattern => pattern.id === data.patternId) || PATTERNS[0]; state.loop = data.loop ?? true; state.mutedStrikes = data.mutedStrikes ?? false;
  state.sections = validSections; state.songOrder = (data.songOrder || validSections.map(section => section.id)).filter(id => validIds.has(id)); state.currentSectionId = validIds.has(data.currentSectionId) ? data.currentSectionId : validSections[0].id;
  refresh();
}

function loadSong(file) {
  const reader = new FileReader();
  reader.onload = () => { try { applySongData(JSON.parse(reader.result), file.name.replace(/\.chordflow\.json$|\.json$/i, '') || 'Моя мелодия'); } catch (error) { window.alert(`Не удалось открыть мелодию: ${error.message}`); } };
  reader.readAsText(file);
}

function setCloudStatus(message, kind = '') { const element = $('#cloud-status'); element.textContent = message; element.className = `cloud-status ${kind}`; }
function setLyricsCloudStatus(message, kind = '') { const element = $('#lyrics-cloud-status'); if (!element) return; element.textContent = message; element.className = `cloud-status ${kind}`; }

async function saveCloudSong() {
  const code = $('#cloud-code').value.trim();
  if (!/^\d{4,12}$/.test(code)) { setCloudStatus(state.language === 'cs' ? 'Zadejte 4–12 číslic' : 'Введите от 4 до 12 цифр', 'error'); return; }
  setCloudStatus(state.language === 'cs' ? 'Ukládám…' : 'Сохраняю…');
  try {
    const response = await fetch(CLOUD_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'save', code, songName: state.songName, song: songData(), lyrics: lyricsText.value }) });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Ошибка сохранения');
    setCloudStatus(state.language === 'cs' ? 'Píseň uložena' : 'Песня сохранена', 'ok');
  } catch (error) { setCloudStatus(state.language === 'cs' ? 'Nepodařilo se uložit' : `Не удалось сохранить: ${error.message}`, 'error'); }
}

async function saveCloudLyrics() {
  const code = $('#cloud-code').value.trim();
  if (!/^\d{4,12}$/.test(code)) {
    setLyricsCloudStatus(state.language === 'cs' ? 'Nejprve zadejte kód písně v horním panelu' : 'Сначала введите код песни на панели', 'error');
    return;
  }
  setLyricsCloudStatus(state.language === 'cs' ? 'Ukládám text…' : 'Сохраняю текст…');
  try {
    const response = await fetch(CLOUD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'save_lyrics', code, lyrics: lyricsText.value })
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Ошибка сохранения');
    setLyricsCloudStatus(state.language === 'cs' ? 'Text uložen' : 'Текст сохранён', 'ok');
    setTimeout(() => { if ($('#lyrics-cloud-status')?.textContent === (state.language === 'cs' ? 'Text uložen' : 'Текст сохранён')) setLyricsCloudStatus(''); }, 4000);
  } catch (error) {
    setLyricsCloudStatus(state.language === 'cs' ? 'Nepodařilo se uložit text' : `Не удалось сохранить: ${error.message}`, 'error');
  }
}

async function loadCloudSong() {
  const code = $('#cloud-code').value.trim();
  if (!/^\d{4,12}$/.test(code)) { setCloudStatus(state.language === 'cs' ? 'Zadejte 4–12 číslic' : 'Введите от 4 до 12 цифр', 'error'); return; }
  setCloudStatus(state.language === 'cs' ? 'Načítám…' : 'Загружаю…');
  try {
    const response = await fetch(`${CLOUD_URL}?action=load&code=${encodeURIComponent(code)}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Песня не найдена');
    applySongData(result.song, result.songName || 'Моя мелодия');
    if (typeof result.lyrics === 'string') {
      lyricsText.value = result.lyrics;
      localStorage.setItem(lyricsStorageKey, result.lyrics);
    }
    setCloudStatus(state.language === 'cs' ? 'Píseň načtena' : 'Песня загружена', 'ok');
  } catch (error) { setCloudStatus(state.language === 'cs' ? 'Píseň nebyla nalezena' : `Не удалось загрузить: ${error.message}`, 'error'); }
}

const handlers = {
  add(id) { const chord = CHORDS.find(c => c.id === id); if (chord) currentSection().sequence.push({ chord, bars: 1, patternId: state.pattern.id }); refresh(); },
  action(action, index) { const sequence = currentSection().sequence; if (action === 'remove') sequence.splice(index, 1); if (action === 'duplicate') sequence.splice(index + 1, 0, { ...sequence[index] }); if (action === 'split' && state.pattern.id === 'vosmyorka' && sequence[index + 1]) { sequence[index].strumPart = 'first'; sequence[index + 1].strumPart = 'second'; } refresh(); },
  bars(index, value) { currentSection().sequence[index].bars = Math.max(1, Math.min(16, value || 1)); refresh(); },
  reorder(from, to) { const sequence = currentSection().sequence; const [item] = sequence.splice(from, 1); sequence.splice(to, 0, item); refresh(); },
  duplicateAll() { const sequence = currentSection().sequence; if (sequence.length) currentSection().sequence.push(...sequence.map(item => ({ ...item }))); refresh(); },
  clearSection() { const section = currentSection(); if (section.sequence.length && window.confirm(`Стереть все аккорды из раздела «${section.name}»?`)) { section.sequence = []; refresh(); } },
  clearAll() { if (!state.sections.some(section => section.sequence.length) && state.songOrder.length === 1 && state.songOrder[0] === 'verse') return; if (!window.confirm('Очистить все аккорды и оставить только «1. Куплет»?')) return; state.sections.forEach(section => { section.sequence = []; }); const verse = state.sections.find(section => section.id === 'verse') || state.sections.find(section => section.name === 'Куплет') || state.sections[0]; state.currentSectionId = verse.id; state.songOrder = [verse.id]; refresh(); },
  segment(index, value) { currentSection().sequence[index].strumPart = value; refresh(); },
  section(id) { if (state.sections.some(section => section.id === id)) { state.currentSectionId = id; refresh(); } },
  addOrder(id) { state.songOrder.push(id); refresh(); },
  removeOrder(index) { if (state.songOrder.length > 1) state.songOrder.splice(index, 1); refresh(); },
  pattern(id) { state.pattern = PATTERNS.find(p => p.id === id) || PATTERNS[0]; refresh(); },
  bpm(value) { state.bpm = value; sequencer.setTempo(value); $('#bpm-value').textContent = `${value} BPM`; persist(state); },
  loop(value) { state.loop = value; backgroundAudio.loop = value; persist(state); },
  muted(value) { state.mutedStrikes = value; persist(state); },
  showStructure(value) { state.showSongStructure = value; persist(state); $('#section-switcher').classList.toggle('hidden', !value); },
  bgDuration(value) { state.bgDuration = value; persist(state); },
  language() { state.language = state.language === 'ru' ? 'cs' : 'ru'; refresh(); },
};

renderPalette(handlers.add); refresh();
$('#play').onclick = async () => { stopBackgroundAudio(); if (sequencer.running) { sequencer.pause(); setTransportState(false); } else { const sequence = playbackSequence(); if (!sequence.length) return; audio.unlock(); await sequencer.start({ ...state, sequence }); setTransportState(true); } };
function stopBackgroundAudio() {
  backgroundAudio.pause();
  backgroundAudio.removeAttribute('src');
  backgroundAudio.load();
  if (backgroundAudioUrl) { URL.revokeObjectURL(backgroundAudioUrl); backgroundAudioUrl = null; }
  const button = $('#background-play');
  if (button) {
    button.classList.remove('loading', 'active');
    button.textContent = state.language === 'cs' ? '♫  Přehrávat na pozadí' : '♫  Играть в фоне';
  }
}

function setMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.songName || 'Chordflow Мелодия',
      artist: 'Chordflow',
      album: `${state.bpm} BPM · ${state.pattern.name.split('·')[0].trim()}`
    });
  } catch {}
  const actions = {
    play: () => backgroundAudio.play().catch(() => {}),
    pause: () => backgroundAudio.pause(),
    seekbackward: () => { backgroundAudio.currentTime = Math.max(0, backgroundAudio.currentTime - 5); },
    seekforward: () => { backgroundAudio.currentTime = Math.min(backgroundAudio.duration || Infinity, backgroundAudio.currentTime + 5); },
  };
  Object.entries(actions).forEach(([action, handler]) => { try { navigator.mediaSession.setActionHandler?.(action, handler); } catch {} });
}

$('#stop').onclick = () => { sequencer.stop(); stopBackgroundAudio(); setTransportState(false); };

$('#background-play').onclick = async () => {
  const sequence = playbackSequence();
  if (!sequence.length) return;
  const button = $('#background-play');

  // Разблокируем AudioContext немедленно, пока ещё действует жест пользователя
  audio.unlock();

  // Если фоновое аудио уже играет — пауза/остановка
  if (!backgroundAudio.paused && backgroundAudio.src) {
    stopBackgroundAudio();
    $('#audio-status').textContent = state.language === 'cs' ? 'Přehrávání na pozadí zastaveno' : 'Фоновое воспроизведение остановлено';
    return;
  }

  button.disabled = true;
  button.classList.remove('active');
  button.classList.add('loading');
  button.textContent = state.language === 'cs' ? '⏳  Příprava audia…' : '⏳  Сборка аудиофайла…';
  $('#audio-status').textContent = state.language === 'cs' ? 'Generuji audio pro pozadí…' : 'Синтезирую аудиодорожку песни…';

  try {
    sequencer.stop();
    setTransportState(false);
    stopBackgroundAudio();
    await audio.resume();

    const recordState = { ...state, sequence, loop: false };
    const built = sequencer.buildEvents(recordState);

    // Мгновенный аппаратный синтез WAV через OfflineAudioContext (с бесшовным сведением лупа)
    const targetSeconds = Number($('#bg-duration-select')?.value) || 60;
    const wavBlob = await audio.renderWavBlob(built.events, built.totalUnits, state.bpm, state.mutedStrikes, state.loop, targetSeconds);
    backgroundAudioUrl = URL.createObjectURL(wavBlob);
    backgroundAudio.src = backgroundAudioUrl;
    backgroundAudio.load();
    backgroundAudio.loop = state.loop;
    setMediaSession();

    await backgroundAudio.play();
    button.classList.remove('loading');
    button.classList.add('active');
    button.textContent = state.language === 'cs' ? '■  Zastavit pozadí' : '■  Остановить фон';
    $('#audio-status').textContent = state.language === 'cs' ? 'Přehrávání na pozadí aktivní' : 'Фоновое воспроизведение активно';
  } catch (error) {
    console.warn('Ошибка запуска фонового аудио:', error);
    button.classList.remove('loading', 'active');
    button.textContent = state.language === 'cs' ? '♫  Přehrávat na pozadí' : '♫  Играть в фоне';
    $('#audio-status').textContent = `Ошибка: ${error.message}`;
  } finally {
    button.disabled = false;
  }
};
const resumeAfterBackground = () => { if (audio.context) audio.resume().catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAfterBackground(); });
window.addEventListener('pageshow', resumeAfterBackground);
$('#save-song').onclick = saveSong;
$('#open-song').onclick = () => $('#song-file').click();
$('#song-file').onchange = event => { if (event.target.files[0]) loadSong(event.target.files[0]); event.target.value = ''; };
$('#language-toggle').onclick = handlers.language;
$('#cloud-save').onclick = saveCloudSong;
$('#cloud-load').onclick = loadCloudSong;
$('#lyrics-save-cloud').onclick = saveCloudLyrics;

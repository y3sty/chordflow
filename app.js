import { CHORDS, PATTERNS } from './ui.js?v=chords-4';
import { AudioEngine } from './audio-engine.js?v=eighth-10';
import { Sequencer } from './sequencer.js?v=eighth-10';
import { createInitialState, persist, renderPalette, renderSections, renderTimeline, setupControls, setTransportState, updatePlayhead, applyLanguage, $ } from './ui.js?v=chords-4';

const state = createInitialState();
const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbzoNGnjZD05oRdKJJCqSOUEMy31uibqpCdI_OExG-B8iWRDFtFHCEkDkGTsR_HSKzo/exec';
const audio = new AudioEngine(status => { $('#audio-status').textContent = status; });
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

async function saveCloudSong() {
  const code = $('#cloud-code').value.trim();
  if (!/^\d{4,12}$/.test(code)) { setCloudStatus(state.language === 'cs' ? 'Zadejte 4–12 číslic' : 'Введите от 4 до 12 цифр', 'error'); return; }
  setCloudStatus(state.language === 'cs' ? 'Ukládám…' : 'Сохраняю…');
  try {
    const response = await fetch(CLOUD_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'save', code, songName: state.songName, song: songData() }) });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Ошибка сохранения');
    setCloudStatus(state.language === 'cs' ? 'Píseň uložena' : 'Песня сохранена', 'ok');
  } catch (error) { setCloudStatus(state.language === 'cs' ? 'Nepodařilo se uložit' : `Не удалось сохранить: ${error.message}`, 'error'); }
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
  loop(value) { state.loop = value; persist(state); },
  muted(value) { state.mutedStrikes = value; persist(state); },
  showStructure(value) { state.showSongStructure = value; persist(state); $('#section-switcher').classList.toggle('hidden', !value); },
  language() { state.language = state.language === 'ru' ? 'cs' : 'ru'; refresh(); },
};

renderPalette(handlers.add); refresh();
$('#play').onclick = async () => { if (sequencer.running) { sequencer.pause(); setTransportState(false); } else { const sequence = playbackSequence(); if (!sequence.length) return; audio.unlock(); await sequencer.start({ ...state, sequence }); setTransportState(true); } };
$('#stop').onclick = () => { sequencer.stop(); setTransportState(false); };
$('#save-song').onclick = saveSong;
$('#open-song').onclick = () => $('#song-file').click();
$('#song-file').onchange = event => { if (event.target.files[0]) loadSong(event.target.files[0]); event.target.value = ''; };
$('#language-toggle').onclick = handlers.language;
$('#cloud-save').onclick = saveCloudSong;
$('#cloud-load').onclick = loadCloudSong;

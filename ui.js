import { CHORDS, STRING_NAMES } from './chords-data.js';
import { PATTERNS } from './patterns-data.js?v=eighth-10';

const $ = selector => document.querySelector(selector);
const appKey = 'guitar-constructor-session-v1';
let draggedId = null;

const LANGUAGE_PAIRS = [
  ['Chordflow — конструктор боя', 'Chordflow — konstruktér rytmu'],
  ['конструктор аккордов и боя', 'konstruktér akordů a rytmu'],
  ['Локальная сессия', 'Lokální relace'],
  ['аудио готово', 'audio připraveno'],
  ['Стальная акустика', 'ocelová akustická kytara'],
  ['Загрузка стальной гитары…', 'Načítání ocelové kytary…'],
  ['Резервный синтез', 'záložní syntéza'],
  ['▶  Играть', '▶  Přehrát'],
  ['Ⅱ  Пауза', 'Ⅱ  Pauza'],
  ['■  Стоп', '■  Stop'],
  ['Зациклить', 'Opakovat'],
  ['Сохранить', 'Uložit'],
  ['Открыть', 'Otevřít'],
  ['Код песни', 'Kód písně'],
  ['Сохранить онлайн', 'Uložit online'],
  ['Открыть по коду', 'Otevřít podle kódu'],
  ['Бой', 'Rytmus'],
  ['Темп', 'Tempo'],
  ['Готово к игре', 'Připraveno ke hře'],
  ['Восьмёрка · DDUUUDDU', 'Osmička · DDUUUDDU'],
  ['Шестёрка · D-DU-UDU', 'Šestka · D-DU-UDU'],
  ['Шестёрка · D-D-DUDU', 'Šestka · D-D-DUDU'],
  ['блок', 'blok'],
  ['удар', 'úder'],
  ['Библиотека', 'Knihovna'],
  ['Аккорды', 'Akordy'],
  ['Нажмите на карточку, чтобы добавить аккорд', 'Kliknutím na kartu přidáte akord'],
  ['или перетащите её на таймлайн', 'nebo ji přetáhněte na časovou osu'],
  ['Аранжировка', 'Aranžmá'],
  ['Таймлайн', 'Časová osa'],
  ['Дублировать все', 'Duplikovat vše'],
  ['Стереть куплет', 'Smazat sloku'],
  ['Стереть припев', 'Smazat refrén'],
  ['Стереть бридж', 'Smazat bridge'],
  ['вниз', 'dolů'],
  ['вверх', 'nahoru'],
  ['Порядок песни', 'Pořadí písně'],
  ['+ Добавить часть', '+ Přidat část'],
  ['Разделить бой с соседним аккордом', 'Rozdělit rytmus mezi sousední akordy'],
  ['Такты', 'Takty'],
  ['Часть боя', 'Část rytmu'],
  ['Весь DDUUUDDU', 'Celý DDUUUDDU'],
  ['Начало · DD', 'Začátek · DD'],
  ['Продолжение · UUUDDU', 'Pokračování · UUUDDU'],
  ['Глушение в «шестёрке»', 'Tlumení v „šestce“'],
  ['Каждый блок = один такт боя × заданное число тактов', 'Každý blok = jeden takt rytmu × zvolený počet taktů'],
  ['Web Audio · без сервера · данные сохраняются в браузере', 'Web Audio · bez serveru · data se ukládají v prohlížeči'],
  ['Эта часть пока пустая', 'Tato část je zatím prázdná'],
  ['Добавьте сюда аккорды из палитры', 'Přidejte sem akordy z knihovny'],
  ['Куплет', 'Sloka'],
  ['Припев', 'Refrén'],
  ['Бридж', 'Bridge'],
];

export function applyLanguage(language = 'ru') {
  const pairs = language === 'cs' ? LANGUAGE_PAIRS : LANGUAGE_PAIRS.map(([ru, cs]) => [cs, ru]);
  const replaceText = value => pairs.slice().sort((a, b) => b[0].length - a[0].length).reduce((text, [from, to]) => text.split(from).join(to), value);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.nodeValue = replaceText(node.nodeValue); });
  document.querySelectorAll('[title], [aria-label]').forEach(element => { if (element.title) element.title = replaceText(element.title); if (element.getAttribute('aria-label')) element.setAttribute('aria-label', replaceText(element.getAttribute('aria-label'))); });
  const toggle = $('#language-toggle'); if (toggle) toggle.textContent = language === 'ru' ? 'Čeština' : 'Русский';
  document.documentElement.lang = language === 'cs' ? 'cs' : 'ru';
  document.title = language === 'cs' ? 'Chordflow — konstruktér rytmu' : 'Chordflow — конструктор боя';
}

export function renderChordDiagram(chord, large = false) {
  return `<div class="diagram ${large ? 'large' : ''}"><div class="open-notes">${chord.frets.map(f => f === null ? '×' : f === 0 ? '○' : '·').map(v => `<span>${v}</span>`).join('')}</div><div class="strings">${chord.frets.map((fret, i) => `<div class="string"><span class="string-name">${STRING_NAMES[i]}</span>${[0,1,2,3,4].map(n => `<i class="${fret === n && fret !== 0 ? 'pressed' : ''}">${fret === n && fret !== 0 ? '●' : ''}</i>`).join('')}</div>`).join('')}</div></div>`;
}

export function createInitialState() {
  const saved = JSON.parse(localStorage.getItem(appKey) || 'null');
  const restore = sequence => (sequence || []).map(item => ({ ...item, chord: CHORDS.find(c => c.id === item.chord?.id) || CHORDS[0] }));
  const sections = saved?.sections?.length ? saved.sections.map(section => ({ ...section, sequence: restore(section.sequence) })) : [
    { id: 'verse', name: 'Куплет', sequence: restore(saved?.sequence) },
    { id: 'chorus', name: 'Припев', sequence: [] },
    { id: 'bridge', name: 'Бридж', sequence: [] },
  ];
  const validIds = new Set(sections.map(section => section.id));
  const songOrder = (saved?.songOrder || ['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus']).filter(id => validIds.has(id));
  return { songName: saved?.songName || 'Моя мелодия', language: saved?.language || 'ru', bpm: saved?.bpm || 90, pattern: PATTERNS.find(p => p.id === saved?.patternId) || PATTERNS[0], loop: saved?.loop ?? true, mutedStrikes: saved?.mutedStrikes ?? false, sections, songOrder: songOrder.length ? songOrder : ['verse'], currentSectionId: validIds.has(saved?.currentSectionId) ? saved.currentSectionId : sections[0].id };
}

export function persist(state) { localStorage.setItem(appKey, JSON.stringify({ songName: state.songName, language: state.language, bpm: state.bpm, patternId: state.pattern.id, loop: state.loop, mutedStrikes: state.mutedStrikes, currentSectionId: state.currentSectionId, songOrder: state.songOrder, sections: state.sections.map(section => ({ id: section.id, name: section.name, sequence: section.sequence.map(({ chord, bars, strumPart }) => ({ chord: { id: chord.id }, bars, strumPart: strumPart || 'full' })) })) })); }

export function renderPalette(onAdd) {
  const palette = $('#palette'); palette.innerHTML = CHORDS.map(chord => `<article class="chord-card" draggable="true" data-id="${chord.id}"><div class="card-top"><strong>${chord.name}</strong><button class="add-button" aria-label="Добавить ${chord.name}">+</button></div>${renderChordDiagram(chord)}</article>`).join('');
  palette.querySelectorAll('.chord-card').forEach(card => { card.addEventListener('dragstart', () => draggedId = card.dataset.id); card.addEventListener('click', event => { if (!event.target.closest('button')) onAdd(card.dataset.id); }); card.querySelector('.add-button').addEventListener('click', event => { event.stopPropagation(); onAdd(card.dataset.id); }); });
}

export function renderSections(state, handlers) {
  $('#section-tabs').innerHTML = state.sections.map(section => `<button class="section-tab ${section.id === state.currentSectionId ? 'active' : ''}" data-section="${section.id}">${section.name}<span>${section.sequence.length}</span></button>`).join('');
  $('#section-tabs').querySelectorAll('button').forEach(button => button.addEventListener('click', () => handlers.section(button.dataset.section)));
  $('#song-order').innerHTML = `<div class="order-label">Порядок песни</div><div class="order-chips">${state.songOrder.map((id, index) => { const section = state.sections.find(item => item.id === id); return `<button class="order-chip" data-order-section="${id}">${index + 1}. ${section?.name || id}<i data-remove-order="${index}">×</i></button>`; }).join('')}</div><div class="order-add"><select id="order-section-select">${state.sections.map(section => `<option value="${section.id}">${section.name}</option>`).join('')}</select><button id="add-order">+ Добавить часть</button></div>`;
  $('#song-order').querySelectorAll('[data-order-section]').forEach(button => button.addEventListener('click', () => handlers.section(button.dataset.orderSection)));
  $('#song-order').querySelectorAll('[data-remove-order]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); handlers.removeOrder(Number(button.dataset.removeOrder)); }));
  $('#add-order').onclick = () => handlers.addOrder($('#order-section-select').value);
}

export function renderTimeline(state, handlers) {
  const section = state.sections.find(item => item.id === state.currentSectionId) || state.sections[0];
  const sequence = section.sequence;
  const timeline = $('#timeline'); timeline.innerHTML = sequence.length ? sequence.map((item, index) => `<article class="timeline-block" draggable="true" data-index="${index}"><div class="block-head"><span class="block-number">${String(index + 1).padStart(2, '0')}</span><strong>${item.chord.name}</strong><div class="block-actions">${state.pattern.id === 'vosmyorka' ? '<button data-action="split" title="Разделить бой с соседним аккордом">⇄</button>' : ''}<button data-action="duplicate">⧉</button><button data-action="remove">×</button></div></div>${renderChordDiagram(item.chord)}<label>Такты <input type="number" min="1" max="16" value="${item.bars}" data-action="bars"></label>${state.pattern.id === 'vosmyorka' ? `<label class="segment-control">Часть боя <select data-action="segment"><option value="full" ${item.strumPart === 'full' || !item.strumPart ? 'selected' : ''}>Весь DDUUUDDU</option><option value="first" ${item.strumPart === 'first' ? 'selected' : ''}>Начало · DD</option><option value="second" ${item.strumPart === 'second' ? 'selected' : ''}>Продолжение · UUUDDU</option></select></label>` : ''}<div class="block-pattern">${state.pattern.strokes.map(s => `<span class="${s.sound ? 'sound' : 'silent'}">${s.dir === 'down' ? '↓' : '↑'}</span>`).join('')}</div></article>`).join('') : '<div class="empty-state"><span>＋</span><p>Эта часть пока пустая<br>Добавьте сюда аккорды из палитры</p></div>';
  $('#duplicate-all').onclick = handlers.duplicateAll;
  $('#clear-section').textContent = `⌫ Стереть ${section.name.toLowerCase()}`;
  $('#clear-section').onclick = handlers.clearSection;
  timeline.ondragover = e => e.preventDefault(); timeline.ondrop = e => { e.preventDefault(); if (draggedId) handlers.add(draggedId); draggedId = null; };
  timeline.querySelectorAll('.timeline-block').forEach(block => { block.addEventListener('dragstart', () => draggedId = `index:${block.dataset.index}`); block.addEventListener('drop', e => { e.stopPropagation(); if (draggedId?.startsWith('index:')) handlers.reorder(Number(draggedId.slice(6)), Number(block.dataset.index)); }); block.querySelectorAll('button').forEach(el => el.addEventListener('click', () => handlers.action(el.dataset.action, Number(block.dataset.index)))); block.querySelector('input').addEventListener('change', e => handlers.bars(Number(block.dataset.index), Number(e.target.value))); const segment = block.querySelector('select[data-action="segment"]'); if (segment) segment.value = sequence[Number(block.dataset.index)].strumPart || 'full'; if (segment) segment.addEventListener('change', e => handlers.segment(Number(block.dataset.index), e.target.value)); });
}

export function setupControls(state, handlers) {
  $('#pattern-select').innerHTML = PATTERNS.map(p => `<option value="${p.id}">${p.name}</option>`).join(''); $('#pattern-select').value = state.pattern.id;
  const muteAvailable = state.pattern.id.startsWith('shestyorka');
  const muteControl = $('#mute-strikes').closest('label');
  $('#bpm').value = state.bpm; $('#bpm-value').textContent = `${state.bpm} BPM`; $('#loop').checked = state.loop; $('#mute-strikes').checked = state.mutedStrikes; $('#mute-strikes').disabled = !muteAvailable; muteControl.classList.toggle('disabled', !muteAvailable); muteControl.title = 'Работает только с вариантами боя «Шестёрка»';
  $('#pattern-select').onchange = e => handlers.pattern(e.target.value); $('#bpm').oninput = e => handlers.bpm(Number(e.target.value)); $('#loop').onchange = e => handlers.loop(e.target.checked); $('#mute-strikes').onchange = e => handlers.muted(e.target.checked);
}

export function setTransportState(running) { $('#play').classList.toggle('active', running); $('#play').textContent = running ? 'Ⅱ  Пауза' : '▶  Играть'; }
export function updatePlayhead(item, step, visibleSectionId) {
  const visible = item?.sectionId === visibleSectionId;
  document.querySelectorAll('.timeline-block').forEach((el, i) => el.classList.toggle('playing', visible && i === item.localIndex));
  document.querySelectorAll('.timeline-block .block-pattern').forEach((row, i) => row.querySelectorAll('span').forEach((s, j) => s.classList.toggle('current', visible && i === item.localIndex && j === step % 8)));
  if (visible) {
    const active = document.querySelectorAll('.timeline-block')[item.localIndex];
    const timeline = $('#timeline');
    if (active && timeline) {
      const timelineBounds = timeline.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      const leftEdge = activeBounds.left - timelineBounds.left + timeline.scrollLeft;
      const rightEdge = leftEdge + active.offsetWidth;
      const visibleLeft = timeline.scrollLeft;
      const visibleRight = visibleLeft + timeline.clientWidth;
      if (leftEdge < visibleLeft || rightEdge > visibleRight) timeline.scrollTo({ left: Math.max(0, leftEdge - (timeline.clientWidth - active.offsetWidth) / 2), behavior: 'smooth' });
    }
  }
  $('#current-position').textContent = item ? `${item.sectionName} · блок ${item.localIndex + 1} · удар ${(step % 8) + 1}` : 'Готово к игре';
}

export { $, CHORDS, PATTERNS };

export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
export const OPEN_STRING_FREQUENCIES = [82.41, 110, 146.83, 196, 246.94, 329.63];

const makeChords = chords => chords.map(([id, type, frets]) => ({ id, name: id === 'F' ? 'F (упр.)' : id, type, frets }));

export const MAIN_CHORDS = makeChords([
  ['Am', 'minor', [null, 0, 2, 2, 1, 0]], ['C', 'major', [null, 3, 2, 0, 1, 0]],
  ['D', 'major', [null, null, 0, 2, 3, 2]], ['Dm', 'minor', [null, null, 0, 2, 3, 1]],
  ['E', 'major', [0, 2, 2, 1, 0, 0]], ['Em', 'minor', [0, 2, 2, 0, 0, 0]],
  ['G', 'major', [3, 2, 0, 0, 0, 3]], ['A', 'major', [null, 0, 2, 2, 2, 0]],
  ['F', 'major', [null, null, 3, 2, 1, 1]], ['A7', 'dominant7', [null, 0, 2, 0, 2, 0]],
  ['D7', 'dominant7', [null, null, 0, 2, 1, 2]], ['E7', 'dominant7', [0, 2, 0, 1, 0, 0]],
]);

export const ADDITIONAL_CHORDS = makeChords([
  ['Bm', 'minor', [null, 2, 4, 4, 3, 2]], ['B7', 'dominant7', [null, 2, 1, 2, 0, 2]],
  ['C7', 'dominant7', [null, 3, 2, 3, 1, 0]], ['G7', 'dominant7', [3, 2, 0, 0, 0, 1]],
  ['Am7', 'minor7', [null, 0, 2, 0, 1, 0]], ['Dm7', 'minor7', [null, null, 0, 2, 1, 1]],
  ['Em7', 'minor7', [0, 2, 2, 0, 3, 0]], ['Cmaj7', 'major7', [null, 3, 2, 0, 0, 0]],
  ['Fmaj7', 'major7', [null, null, 3, 2, 1, 0]], ['Asus2', 'sus2', [null, 0, 2, 2, 0, 0]],
  ['Dsus4', 'sus4', [null, null, 0, 2, 3, 3]], ['Esus4', 'sus4', [0, 2, 2, 2, 0, 0]],
  ['A7sus4', 'sus4', [null, 0, 2, 0, 3, 0]], ['Eadd9', 'add9', [0, 2, 4, 1, 0, 0]],
]);

export const CHORDS = [...MAIN_CHORDS, ...ADDITIONAL_CHORDS];

export function chordNotes(chord) {
  return chord.frets.map((fret, stringIndex) => fret === null ? null : {
    stringIndex,
    frequency: OPEN_STRING_FREQUENCIES[stringIndex] * Math.pow(2, fret / 12),
  }).filter(Boolean);
}

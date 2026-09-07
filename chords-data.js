export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
export const OPEN_STRING_FREQUENCIES = [82.41, 110, 146.83, 196, 246.94, 329.63];

export const CHORDS = [
  ['Am', 'minor', [null, 0, 2, 2, 1, 0]], ['C', 'major', [null, 3, 2, 0, 1, 0]],
  ['D', 'major', [null, null, 0, 2, 3, 2]], ['Dm', 'minor', [null, null, 0, 2, 3, 1]],
  ['E', 'major', [0, 2, 2, 1, 0, 0]], ['Em', 'minor', [0, 2, 2, 0, 0, 0]],
  ['G', 'major', [3, 2, 0, 0, 0, 3]], ['A', 'major', [null, 0, 2, 2, 2, 0]],
  ['F', 'major', [null, null, 3, 2, 1, 1]], ['A7', 'dominant7', [null, 0, 2, 0, 2, 0]],
  ['D7', 'dominant7', [null, null, 0, 2, 1, 2]], ['E7', 'dominant7', [0, 2, 0, 1, 0, 0]],
].map(([id, type, frets]) => ({ id, name: id === 'F' ? 'F (упр.)' : id, type, frets }));

export function chordNotes(chord) {
  return chord.frets.map((fret, stringIndex) => fret === null ? null : {
    stringIndex,
    frequency: OPEN_STRING_FREQUENCIES[stringIndex] * Math.pow(2, fret / 12),
  }).filter(Boolean);
}

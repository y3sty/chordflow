const directions = ['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up'];
const makePattern = (id, name, silent = [], sequence = directions, times = sequence.map((_, index) => index * 2)) => ({
  id, name, beatsPerBar: 4, subdivisionsPerBeat: 2,
  strokes: sequence.map((dir, index) => ({
    pos: index + 1, dir, sound: !silent.includes(index + 1), mute: silent.includes(index + 1),
    accent: index === 0 || index === 4, velocity: index === 0 || index === 4 ? 1 : dir === 'up' ? 0.52 : 0.72,
    stringRange: dir === 'up' ? [2, 5] : [0, 5], time: times[index],
  })),
});

export const PATTERNS = [
  makePattern('vosmyorka', 'Восьмёрка · DDUUUDDU', [], ['down', 'down', 'up', 'up', 'up', 'down', 'down', 'up'], [0, 4, 6, 8, 10, 11, 13, 14]),
  makePattern('shestyorka', 'Шестёрка · D-DU-UDU', [2, 5]),
  makePattern('shestyorka-old', 'Шестёрка · D-D-DUDU', [2, 4]),
];

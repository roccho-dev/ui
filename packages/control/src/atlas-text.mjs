// Screen-text estimates for World labels drawn at a fixed 13 px. The same
// per-character estimate as the renderer's label decision. Pure.
export const LABEL_FONT_PX = 13;
export const LABEL_LINE_PX = 18;
export const LABEL_MAX_PX = 340;

const charPx = character => (/\s/u.test(character) ? 0.34 : character.codePointAt(0) > 0xff ? 1 : 0.59) * LABEL_FONT_PX;
export const linePx = line => [...line].reduce((sum, character) => sum + charPx(character), 0);

// Break a label into lines no wider than `max`, at spaces when a line has
// one, else between characters. Every supplied character is kept in order.
// A word broken between characters (a digest, a long id) runs on one glyph
// kind, where the estimate errs most (a run of `a` draws 4% wider), so its
// pieces keep a margin.
const WORD_BREAK_MARGIN = 0.92;
export const wrapLabel = (label, max = LABEL_MAX_PX) => String(label).split(/\r?\n/u).flatMap(line => {
  if (linePx(line) <= max) return [line];
  const lines = [];
  let current = '';
  for (const word of line.split(/(?<=\s)/u)) {
    if (current && linePx(current + word) > max) { lines.push(current.trimEnd()); current = ''; }
    if (linePx(word) <= max) { current += word; continue; }
    for (const character of word) {
      if (current && linePx(current + character) > max * WORD_BREAK_MARGIN) { lines.push(current); current = ''; }
      current += character;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines;
}).join('\n');

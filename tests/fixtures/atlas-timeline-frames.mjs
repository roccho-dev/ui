// An N-frame World for timeline checks, made from the bundled two-frame World
// by repeating its last frame under new frame ids and revisions. Only frame
// identity changes; the records stay the supplied ones.
import { readFileSync } from 'node:fs';

export const bundledWorld = () => JSON.parse(readFileSync(new URL('../../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'));

export const worldWithFrames = count => {
  const world = bundledWorld();
  const [first, last] = [world.frames[0], world.frames.at(-1)];
  const frames = [first];
  for (let index = 1; index < count; index += 1) {
    const frame = structuredClone(last);
    if (count > 2) {
      frame.id = last.id + '-t' + (index + 1);
      frame.rev = first.rev + index;
    }
    frames.push(frame);
  }
  world.frames = frames.slice(0, count);
  // Owner comparisons name exact frame pairs; repeated frames have none.
  if (count !== 2) world.comparisons = [];
  return world;
};

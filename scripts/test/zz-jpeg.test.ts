import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decode } from 'jpeg-js';

const J = '/private/tmp/claude-501/-Users-evan-Coding-Claude-Plugins/91f994bd-42b5-4885-913a-67e4febcadad/scratchpad/still224.jpg';

test('jpeg probe: what the report road actually feeds the model', () => {
  const raw = decode(readFileSync(J), { useTArray: true });
  console.log(`  decoded ${raw.width}x${raw.height}  bytes ${raw.data.length}  expected RGBA ${raw.width * raw.height * 4}`);

  // The exact loop `resampleTensor` runs, on what jpeg-js returned.
  const side = 224;
  const channels = 3;
  const tensor = new Float32Array(side * side * channels);
  for (let y = 0; y < side; y += 1) {
    const sy = Math.min(raw.height - 1, Math.floor(((y + 0.5) * raw.height) / side));
    const row = sy * raw.width * 4;
    for (let x = 0; x < side; x += 1) {
      const sx = Math.min(raw.width - 1, Math.floor(((x + 0.5) * raw.width) / side));
      const i = row + sx * 4;
      const o = (y * side + x) * channels;
      tensor[o] = raw.data[i] / 255;
      tensor[o + 1] = raw.data[i + 1] / 255;
      tensor[o + 2] = raw.data[i + 2] / 255;
    }
  }
  let sum = 0;
  let peak = 0;
  let nan = 0;
  for (const v of tensor) {
    if (!Number.isFinite(v)) { nan += 1; continue; }
    sum += v;
    if (v > peak) peak = v;
  }
  console.log(`  tensor mean ${(sum / tensor.length).toFixed(3)}  peak ${peak.toFixed(3)}  non-finite ${nan}`);
});

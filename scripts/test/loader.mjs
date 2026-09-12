/**
 * Resolves the app's `@/` alias and extensionless imports for the test run.
 *
 * The source is written for Metro, which resolves both. Node does neither,
 * and the alternative — a bundler in the test path — would mean the tests
 * exercise a differently-compiled copy of the logic than the app ships.
 * Node 24 strips the types itself, so this hook is all that stands between
 * `node --test` and the real source files.
 */

import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = pathToFileURL(resolvePath('src') + '/').href;
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export function resolve(specifier, context, next) {
  let target = specifier;

  if (target.startsWith('@/')) target = SRC + target.slice(2);
  else if (target.startsWith('.') && context.parentURL) {
    target = new URL(target, context.parentURL).href;
  } else {
    return next(specifier, context);
  }

  if (!/\.(ts|tsx|mjs|js|json)$/.test(target)) {
    for (const ext of EXTENSIONS) {
      if (existsSync(fileURLToPath(target + ext))) {
        target += ext;
        break;
      }
    }
  }

  return next(target, context);
}

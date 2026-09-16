/**
 * The globals Metro defines and Node does not.
 *
 * `__DEV__` is compiled into the bundle by Metro, so app modules can read
 * it at the top level — `src/features/subscription/entitlement.ts` resolves
 * `TESTER_BUILD` from it the moment it is imported. Under `node --test`
 * nothing defines it and that import throws before a single assertion runs.
 *
 * False is the right stand-in: it is what a release build compiles, and a
 * test that reasons about who gets Premium should reason about the build
 * that ships rather than the one on a developer's machine.
 *
 * Import this before the module under test — ES modules evaluate in the
 * order they are imported, so a bare import on the first line runs first.
 */

const globals = globalThis as { __DEV__?: boolean };
globals.__DEV__ ??= false;

export {};

/**
 * How a scanned product reaches the routine form.
 *
 * The scanner is a full-screen modal over the routine sheet. Dismissing it
 * returns to that sheet, whose form is the one place a RoutineItem is
 * built — so the scanner leaves the prefill here and the sheet picks it up
 * on focus. In memory on purpose: it is a hand-off, not a record, and
 * nothing about it should survive a relaunch.
 */
export type ProductPrefill = {
  barcode: string;
  /** The database's name or the typed one; the form lets the person edit it. */
  name: string;
  brand?: string;
  source: 'openBeautyFacts' | 'manual';
};

let pending: ProductPrefill | null = null;

export function stagePrefill(prefill: ProductPrefill): void {
  pending = prefill;
}

/** Returns the staged prefill once, then clears it. */
export function takePrefill(): ProductPrefill | null {
  const taken = pending;
  pending = null;
  return taken;
}

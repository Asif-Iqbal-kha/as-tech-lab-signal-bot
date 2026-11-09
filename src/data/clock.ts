let offset = 0;

/** Current time on the exchange clock (corrects a wrong phone clock). */
export const serverNow = (): number => Date.now() + offset;

export function setServerOffset(ms: number): void {
  offset = Number.isFinite(ms) ? ms : 0;
}

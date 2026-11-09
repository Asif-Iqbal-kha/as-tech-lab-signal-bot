/* Alerts for Watch mode: sound, vibration, system notification, tab title, screen wake lock. */

let ctx: AudioContext | null = null;

/** Must be called from a click/tap: browsers only allow audio after a user gesture. */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    void ctx?.resume();
  } catch {
    /* no audio */
  }
}

/** Rising tones for BUY, falling for SELL. */
export function beep(dir: 'BUY' | 'SELL'): void {
  if (!ctx) return;
  const tones = dir === 'BUY' ? [660, 880, 1100] : [1100, 830, 620];
  const t0 = ctx.currentTime;
  tones.forEach((f, k) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const s = t0 + k * 0.16;
    gain.gain.setValueAtTime(0.0001, s);
    gain.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.14);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(s);
    osc.stop(s + 0.15);
  });
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    /* unsupported */
  }
}

let swReg: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) swReg = await navigator.serviceWorker.register('/sw.js');
  } catch {
    swReg = null;
  }
}

export type NotifyState = NotificationPermission | 'unsupported';

export const notifyState = (): NotifyState => ('Notification' in window ? Notification.permission : 'unsupported');

export async function requestNotifications(): Promise<NotifyState> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

/** Android Chrome only supports notifications through a service worker, so try that first. */
export async function notify(title: string, body: string, tag: string): Promise<void> {
  if (notifyState() !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/favicon.svg', badge: '/favicon.svg', requireInteraction: false };
  try {
    if (swReg) {
      await swReg.showNotification(title, { ...opts, renotify: true } as NotificationOptions);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* unsupported */
  }
}

/* ---------- tab title flash ---------- */

const BASE_TITLE = 'AS Signal Bot';
let titleTimer: ReturnType<typeof setInterval> | null = null;

export function flashTitle(text: string): void {
  if (document.visibilityState === 'visible') return;
  if (titleTimer) clearInterval(titleTimer);
  let on = true;
  titleTimer = setInterval(() => {
    document.title = on ? text : BASE_TITLE;
    on = !on;
  }, 900);
  const stop = () => {
    if (document.visibilityState !== 'visible') return;
    if (titleTimer) clearInterval(titleTimer);
    titleTimer = null;
    document.title = BASE_TITLE;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}

/* ---------- screen wake lock ---------- */

let lock: { release(): Promise<void> } | null = null;
let wantLock = false;

async function acquireLock() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && document.visibilityState === 'visible') lock = await wl.request('screen');
  } catch {
    lock = null;
  }
}

const onVisible = () => {
  if (wantLock && document.visibilityState === 'visible') void acquireLock();
};

export async function keepScreenOn(on: boolean): Promise<boolean> {
  wantLock = on;
  if (on) {
    document.addEventListener('visibilitychange', onVisible);
    await acquireLock();
    return !!lock;
  }
  document.removeEventListener('visibilitychange', onVisible);
  try {
    await lock?.release();
  } catch {
    /* ignore */
  }
  lock = null;
  return false;
}

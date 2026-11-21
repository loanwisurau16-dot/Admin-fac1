export function sanitizeText(str: unknown): string {
  return String(str || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/[<>"'`]/g, '');
}

export function calculateDistanceKm(
  lat1: unknown,
  lon1: unknown,
  lat2: unknown,
  lon2: unknown
): number {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLon) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLon)
  ) {
    return Infinity;
  }
  const R = 6371;
  const dLat = (bLat - aLat) * (Math.PI / 180);
  const dLon = (bLon - aLon) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * (Math.PI / 180)) *
      Math.cos(bLat * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function playOrderChime(soundEnabled: boolean): void {
  if (!soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    // ignore Web Audio restriction before interaction
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const inp = document.createElement('input');
      inp.value = text;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      document.body.removeChild(inp);
      return true;
    } catch {
      return false;
    }
  }
}

export function buildWhatsAppUrl(
  phone?: string | null,
  message?: string
): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `91${digits}`;
  }
  const base = `https://wa.me/${digits}`;
  if (message && message.trim()) {
    return `${base}?text=${encodeURIComponent(message.trim())}`;
  }
  return base;
}


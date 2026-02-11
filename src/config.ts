const DEFAULT_ONECLICK_BASE = 'https://1click.chaindefuser.com';

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONFIG = {
  oneClickBaseUrl: import.meta.env.VITE_ONECLICK_BASE_URL ?? DEFAULT_ONECLICK_BASE,
  oneClickJwt: import.meta.env.VITE_ONECLICK_JWT ?? '',
  defaultSlippageBps: numberFromEnv(import.meta.env.VITE_SLIPPAGE_BPS, 100),
  quoteExpiryMinutes: numberFromEnv(import.meta.env.VITE_QUOTE_EXPIRY_MINUTES, 30),
  pollIntervalMs: numberFromEnv(import.meta.env.VITE_POLL_INTERVAL_MS, 10000),
};

/**
 * User-agent minimization. Raw user agents are quasi-identifiers (they
 * fingerprint); sessions store only a coarse "family on OS" summary, derived
 * here, so the raw string never persists. The summary exists for exactly one
 * purpose: letting an account owner recognize their own sessions in the
 * session list.
 */

const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFxiOS\//, 'Firefox'],
  [/\bFirefox\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
  [/\bcurl\//, 'curl'],
  [/\bPostmanRuntime\//, 'Postman'],
  [/\bokhttp\//, 'okhttp'],
  [/\bDart\//, 'Dart client'],
];

const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bWindows NT\b/, 'Windows'],
  [/\biPhone\b|\biPad\b|\biOS\b/, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

const MAX_SUMMARY_LENGTH = 60;

/** Coarse family/os summary, or null when there is nothing to summarize. */
export function summarizeUserAgent(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(raw))?.[1];
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(raw))?.[1];
  let summary: string;
  if (browser !== undefined && os !== undefined) summary = `${browser} on ${os}`;
  else if (browser !== undefined) summary = browser;
  else if (os !== undefined) summary = `unknown client on ${os}`;
  else summary = 'unknown client';
  return summary.slice(0, MAX_SUMMARY_LENGTH);
}

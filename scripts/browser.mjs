// Startoptionen für Chromium: vorinstallierter Browser, falls vorhanden, sonst der von Playwright
import { existsSync } from 'node:fs';

export function launchOpts() {
  const local = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSync(local) ? { executablePath: local } : {};
}

import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

/** Spielversion für Feedback-Meldungen: Datum und Git-Stand (Netlify setzt COMMIT_REF) */
function appVersion(): string {
  let ref = process.env.COMMIT_REF?.slice(0, 7) ?? '';
  if (!ref) {
    try { ref = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { ref = 'lokal'; }
  }
  return `${new Date().toISOString().slice(0, 10)} · ${ref}`;
}

// Normal: Code und Bilder als getrennte Dateien in dist/ (dist/index.html + dist/assets/…) – das Spiel startet
// schnell, Bilder werden erst geladen, wenn sie gebraucht werden, und bleiben im Zwischenspeicher des Handys.
// „npm run build:einzeldatei“: alles in einer einzigen HTML-Datei (offline teilbar, z. B. als Sicherung).
export default defineConfig(({ mode }) => {
  const single = mode === 'einzeldatei';
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: single ? [viteSingleFile()] : [],
    build: single
      ? { target: 'es2020', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000, outDir: 'dist-einzeldatei' }
      : { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
    // Langsimulationen (12 h Spielzeit) brauchen unter Last mehr als die üblichen 5 s
    test: { environment: 'node', testTimeout: 20_000 },
  };
});

import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Normal: Code und Bilder als getrennte Dateien in dist/ (dist/index.html + dist/assets/…) – das Spiel startet
// schnell, Bilder werden erst geladen, wenn sie gebraucht werden, und bleiben im Zwischenspeicher des Handys.
// „npm run build:einzeldatei“: alles in einer einzigen HTML-Datei (offline teilbar, z. B. als Sicherung).
export default defineConfig(({ mode }) => {
  const single = mode === 'einzeldatei';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: single
      ? { target: 'es2020', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000, outDir: 'dist-einzeldatei' }
      : { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
    // Langsimulationen (12 h Spielzeit) brauchen unter Last mehr als die üblichen 5 s
    test: { environment: 'node', testTimeout: 20_000 },
  };
});

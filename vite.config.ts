import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Das Spiel wird als eine einzige HTML-Datei gebaut: läuft offline,
// lässt sich direkt auf dem Handy öffnen und ohne Server teilen.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
});

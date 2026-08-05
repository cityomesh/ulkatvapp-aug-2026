import { defineConfig }   from 'vite';
import { svelte }          from '@sveltejs/vite-plugin-svelte';
import { createHash }      from 'crypto';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

// App identity — read once at config time so the values are baked into the
// generated manifest.json on every production build.
import {
  APP_NAME,
  VERSION_NAME,
  VERSION_CODE,
  BUILD_TYPE,
} from './src/lib/app_manifest.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Recursively collect all file paths under `dir`. */
function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ─── Vite plugin ────────────────────────────────────────────────────────────

/**
 * otaManifestPlugin
 *
 * Runs when `vite build --mode prod` or `vite build --mode stb` is executed.
 * After all assets are written to the output directory, it:
 *   1. Walks every file in the output dir (excluding manifest.json itself)
 *   2. Computes sha256 + byte size for each file
 *   3. Writes manifest.json with full app identity + file inventory
 *
 * prod  → output goes to dist/   → manifest used by create-release.js to build the ZIP
 * stb   → output goes to ../launcher/app/  → manifest written in place, no ZIP created
 */
function otaManifestPlugin() {
  let resolvedMode = '';
  let outDir       = '';

  return {
    name: 'ota-manifest',

    configResolved(config) {
      resolvedMode = config.mode;
      // Resolve outDir to an absolute path regardless of whether it is
      // relative (dist) or points outside the project root (../launcher/app).
      outDir = resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      if (resolvedMode !== 'prod' && resolvedMode !== 'stb') return;

      const fileMap = {};
      for (const filePath of walkDir(outDir)) {
        // Normalise to forward slashes so the manifest is cross-platform.
        const relPath = relative(outDir, filePath).split('\\').join('/');

        // Skip any stale manifest from a previous run.
        if (relPath === 'manifest.json') continue;

        const content = readFileSync(filePath);
        fileMap[relPath] = {
          hash: 'sha256:' + createHash('sha256').update(content).digest('hex'),
          size: content.length,
        };
      }

      const manifest = {
        app_name:     APP_NAME,
        version_name: VERSION_NAME,
        version_code: VERSION_CODE,
        build_type:   BUILD_TYPE,
        generated_at: new Date().toISOString(),
        file_count:   Object.keys(fileMap).length,
        files:        fileMap,
      };

      writeFileSync(
        join(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      console.log(
        `\n[OTA] manifest.json written — ${manifest.file_count} files` +
        ` | v${VERSION_NAME} (code ${VERSION_CODE}) | build: ${BUILD_TYPE}\n`,
      );
    },
  };
}

// ─── Vite config ────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => {
  // stb  → build directly into the launcher's app/ directory on the dev machine
  // prod → build into dist/ so create-release.js can package it as a ZIP
  // (default / dev) → dist/
  const outDir = mode === 'stb' ? '../launcher/app' : 'dist';

  return {
    plugins: [svelte(), otaManifestPlugin()],
    publicDir: 'public',
    build: {
      outDir,
      // emptyOutDir must be explicit when outDir is outside the project root
      emptyOutDir: true,
      target: 'es2015',
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: false },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['svelte-spa-router'],
          },
        },
      },
    },
  };
});

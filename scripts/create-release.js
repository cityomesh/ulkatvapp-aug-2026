#!/usr/bin/env node
/**
 * scripts/create-release.js
 *
 * Run automatically by `npm run build:prod` right after `vite build --mode prod`.
 * Packages the entire dist/ directory — including the generated manifest.json —
 * into a single ZIP archive and places it in the project-root releases/ directory.
 *
 * Output:
 *   <project-root>/releases/<version_name>-<version_code>.<build_type>.zip
 *   e.g.  releases/1.0.0-1.live.zip
 *
 * Upload the resulting ZIP to the middleware OTA panel and mark it as active.
 */

import archiver   from 'archiver';
import { createWriteStream, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve paths ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);   // svelte-app/scripts/

// process.cwd() is svelte-app/ (npm run build:prod runs from there)
const distDir     = join(process.cwd(), 'dist');

// releases/ sits at project root — two levels up from svelte-app/scripts/
const releasesDir = join(__dir, '..', '..', 'releases');

// ── Read version info from the generated manifest ─────────────────────────────

let manifestData;
try {
  manifestData = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
} catch {
  console.error('\n[create-release] ERROR: dist/manifest.json not found.');
  console.error('  Run "npm run build:prod" to generate it first.\n');
  process.exit(1);
}

const { version_name, version_code, build_type } = manifestData;
const zipName = `${version_name}-${version_code}.${build_type}.zip`;
const zipPath = join(releasesDir, zipName);

// ── Ensure releases/ directory exists ────────────────────────────────────────

mkdirSync(releasesDir, { recursive: true });

// ── Create ZIP ────────────────────────────────────────────────────────────────

console.log(`\n[create-release] Packaging dist/ → releases/${zipName}`);

const output  = createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn('[create-release] Warning:', err.message);
  else throw err;
});

archive.on('error', (err) => { throw err; });

output.on('close', () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`[create-release] Done — ${zipName} (${mb} MB)`);
  console.log(`[create-release] Upload this file to the middleware OTA panel.\n`);
});

archive.pipe(output);

// Add the entire dist/ folder as the root of the ZIP so extracting it
// directly into the app directory works without a subdirectory wrapper.
archive.directory(distDir, false);

archive.finalize();

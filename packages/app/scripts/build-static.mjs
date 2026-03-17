#!/usr/bin/env node
/**
 * Static build orchestrator.
 *
 * Produces a fully client-renderable static export suitable for hosting
 * on IPFS, S3, Cloudflare Pages, or any static file server.
 *
 * 1. Swaps *.static.tsx overrides into place
 * 2. Removes server-only route handlers and dynamic route pages
 * 3. Runs `next build` with NEXT_BUILD_TARGET=static
 * 4. Restores all files (guaranteed via finally)
 * 5. Post-processes the `out/` directory for SPA hosting
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_APP = path.join(APP_ROOT, 'src', 'app');
const OUT_DIR = path.join(APP_ROOT, 'out');

/** Backup store: originalPath → tempBackupPath */
const backups = new Map();

function backup(filePath) {
  if (!fs.existsSync(filePath)) return;
  const tmp = filePath + '.__static_backup__';
  fs.copyFileSync(filePath, tmp);
  backups.set(filePath, tmp);
}

function restore(filePath) {
  const tmp = backups.get(filePath);
  if (!tmp) return;
  if (fs.existsSync(tmp)) {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
  backups.delete(filePath);
}

function removeWithBackup(filePath) {
  if (!fs.existsSync(filePath)) return;
  backup(filePath);
  fs.unlinkSync(filePath);
}

function restoreAll() {
  for (const filePath of backups.keys()) {
    restore(filePath);
  }
}

/**
 * Recursively find files matching a pattern under a directory.
 */
function findFiles(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

try {
  console.log('[static] Starting static build...\n');

  // ── Step 1: Swap *.static.tsx / *.static.ts overrides ─────────────
  const staticOverrides = findFiles(SRC_APP, /\.static\.tsx?$/);
  for (const override of staticOverrides) {
    const target = override.replace(/\.static\.(tsx?)$/, '.$1');
    const basename = path.basename(target);
    if (!['page.tsx', 'not-found.tsx', 'manifest.ts'].includes(basename)) continue;
    if (fs.existsSync(target)) {
      backup(target);
    }
    fs.copyFileSync(override, target);
    console.log(`[static]   swapped ${path.relative(APP_ROOT, override)} → ${path.relative(APP_ROOT, target)}`);
  }

  // ── Step 2: Remove route handlers ──────────────────────────────────
  const routeHandlers = [
    path.join(SRC_APP, 'api', 'permit', 'route.ts'),
    path.join(SRC_APP, 'api', 'openrouter', 'route.ts'),
  ];

  // OG route handlers (keep helper files like _prediction-helpers.ts)
  const ogDir = path.join(SRC_APP, 'og');
  if (fs.existsSync(ogDir)) {
    for (const entry of fs.readdirSync(ogDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const routeFile = path.join(ogDir, entry.name, 'route.tsx');
        if (fs.existsSync(routeFile)) {
          routeHandlers.push(routeFile);
        }
        const routeFileTs = path.join(ogDir, entry.name, 'route.ts');
        if (fs.existsSync(routeFileTs)) {
          routeHandlers.push(routeFileTs);
        }
      }
    }
  }

  for (const handler of routeHandlers) {
    removeWithBackup(handler);
    console.log(`[static]   removed ${path.relative(APP_ROOT, handler)}`);
  }

  // ── Step 3: Remove Sentry configs (not needed for static build) ────
  const sentryFiles = [
    path.join(APP_ROOT, 'sentry.server.config.ts'),
    path.join(APP_ROOT, 'sentry.edge.config.ts'),
    path.join(APP_ROOT, 'sentry.client.config.ts'),
    path.join(SRC_APP, '..', 'instrumentation.ts'),
    path.join(SRC_APP, 'global-error.tsx'),
  ];
  for (const f of sentryFiles) {
    removeWithBackup(f);
    console.log(`[static]   removed ${path.relative(APP_ROOT, f)}`);
  }

  // ── Step 4: Remove dynamic route pages ─────────────────────────────
  const dynamicPages = [
    path.join(SRC_APP, 'predictions', '[predictionId]', 'page.tsx'),
    path.join(SRC_APP, 'forecast', '[uid]', 'page.tsx'),
    path.join(SRC_APP, 'questions', '[...parts]', 'page.tsx'),
    path.join(SRC_APP, 'profile', '[address]', 'page.tsx'),
  ];

  for (const page of dynamicPages) {
    removeWithBackup(page);
    console.log(`[static]   removed ${path.relative(APP_ROOT, page)}`);
  }

  // ── Step 5: Run next build ─────────────────────────────────────────
  console.log('\n[static] Running next build...\n');
  execSync('npx next build', {
    cwd: APP_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_BUILD_TARGET: 'static',
      // Disable Sentry completely for static builds
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
    },
  });

  // ── Step 6: Post-process out/ (file restoration handled by finally block)

  console.log('[static] Post-processing output...');

  // Copy 404.html → 200.html (SPA fallback)
  const html404 = path.join(OUT_DIR, '404.html');
  const html200 = path.join(OUT_DIR, '200.html');
  if (fs.existsSync(html404)) {
    fs.copyFileSync(html404, html200);
    console.log('[static]   copied 404.html → 200.html');
  }

  // Write _redirects (Fleek / 4EVERLAND SPA fallback)
  fs.writeFileSync(path.join(OUT_DIR, '_redirects'), '/* /200.html 200\n');
  console.log('[static]   wrote _redirects');

  // Write _headers
  fs.writeFileSync(
    path.join(OUT_DIR, '_headers'),
    `/*
  X-Frame-Options: SAMEORIGIN
  Access-Control-Allow-Origin: *
`
  );
  console.log('[static]   wrote _headers');

  console.log('\n[static] Static build complete! Output at packages/app/out/');
} catch (err) {
  console.error('\n[static] Build failed:', err.message);
  process.exitCode = 1;
} finally {
  // Guarantee restoration even on failure
  restoreAll();
}

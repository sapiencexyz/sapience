import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SRC_APP = path.join(APP_ROOT, 'src', 'app');

/**
 * Find all dynamic route directories (containing `[`) that have a page.tsx.
 * Returns the route segment path relative to src/app, e.g. "predictions/[predictionId]".
 */
function findDynamicRoutes(dir: string, prefix = ''): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.name.includes('[')) {
      if (fs.existsSync(path.join(full, 'page.tsx'))) {
        results.push(rel);
      }
    }
    results.push(...findDynamicRoutes(full, rel));
  }
  return results;
}

describe('static build invariants', () => {
  const dynamicRoutes = findDynamicRoutes(SRC_APP);

  const buildScript = fs.readFileSync(
    path.join(APP_ROOT, 'scripts', 'build-static.mjs'),
    'utf-8'
  );
  const spaRouter = fs.readFileSync(
    path.join(APP_ROOT, 'src', 'components', 'static', 'SpaFallbackRouter.tsx'),
    'utf-8'
  );

  it('every dynamic route is listed in build-static.mjs dynamicPages for removal', () => {
    const missing = dynamicRoutes.filter(
      (route) =>
        !buildScript.includes(route.replace(/\//g, "', '")) &&
        !buildScript.includes(route)
    );
    expect(
      missing,
      `Dynamic route(s) not listed in build-static.mjs dynamicPages — ` +
        `the static build will fail because Next.js cannot statically export dynamic routes. ` +
        `Add these to the dynamicPages array in scripts/build-static.mjs: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('every dynamic route has a matching pattern in SpaFallbackRouter matchRoute()', () => {
    // Map directory param syntax to the regex fragments used in matchRoute
    // e.g. "predictions/[predictionId]" → /predictions/ must appear in the router
    const missing = dynamicRoutes.filter((route) => {
      const routePrefix = '/' + route.split('/')[0] + '/';
      return !spaRouter.includes(routePrefix);
    });
    expect(
      missing,
      `Dynamic route(s) not handled in SpaFallbackRouter — ` +
        `these paths will show a 404 in the static build instead of rendering the client component. ` +
        `Add a matchRoute case and lazy import for: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('SpaFallbackRouter does not reference routes that no longer exist', () => {
    // Extract route prefixes from matchRoute regex patterns like /^\/predictions\//
    const routePrefixPattern = /p\.match\(\/\^\\\/(\w+)\\\//g;
    const routerPrefixes: string[] = [];
    let match;
    while ((match = routePrefixPattern.exec(spaRouter)) !== null) {
      routerPrefixes.push(match[1]);
    }

    const dynamicPrefixes = dynamicRoutes.map((r) => r.split('/')[0]);
    const stale = routerPrefixes.filter(
      (prefix) => !dynamicPrefixes.includes(prefix)
    );
    expect(
      stale,
      `SpaFallbackRouter references route(s) that have no dynamic page.tsx: ${stale.join(', ')}`
    ).toEqual([]);
  });
});

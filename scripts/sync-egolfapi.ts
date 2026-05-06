#!/usr/bin/env -S npx tsx
// Usage: npx tsx scripts/sync-egolfapi.ts [--from <path-to-egolfapi-repo>]
//
// Copies typescript/src/{client,endpoints,parsers,normalize,types,index}.ts
// from the upstream egolfapi repo into src/lib/egolfapi/, rewrites
// `.js` import suffixes (Next.js resolves bare paths), and records the
// upstream git SHA in _VERSION.txt.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FILES = ['client', 'endpoints', 'parsers', 'normalize', 'types', 'index'] as const;
const DEFAULT_SOURCE = resolve(__dirname, '..', '..', 'egolfapi', 'egolfapi');

function parseArgs(argv: string[]): { from: string } {
  const fromIdx = argv.indexOf('--from');
  if (fromIdx >= 0 && argv[fromIdx + 1]) {
    return { from: resolve(argv[fromIdx + 1]) };
  }
  return { from: DEFAULT_SOURCE };
}

function rewriteJsImports(source: string): string {
  // `from "./client.js"` -> `from "./client"`
  return source.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\.js\1/g, 'from $1$2$1');
}

function main(): void {
  const { from } = parseArgs(process.argv.slice(2));
  const srcDir = join(from, 'typescript', 'src');
  const destDir = resolve(__dirname, '..', 'src', 'lib', 'egolfapi');

  mkdirSync(destDir, { recursive: true });

  for (const name of FILES) {
    const srcPath = join(srcDir, `${name}.ts`);
    const destPath = join(destDir, `${name}.ts`);
    const original = readFileSync(srcPath, 'utf8');
    const rewritten = rewriteJsImports(original);
    writeFileSync(destPath, rewritten, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`copied ${name}.ts`);
  }

  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse HEAD', { cwd: from }).toString().trim();
  } catch {
    // upstream may not be a git repo in some environments
  }
  writeFileSync(
    join(destDir, '_VERSION.txt'),
    `source: ${from}\nsha: ${sha}\nsynced: ${new Date().toISOString()}\n`,
  );
  // eslint-disable-next-line no-console
  console.log(`wrote _VERSION.txt (sha=${sha})`);
}

main();

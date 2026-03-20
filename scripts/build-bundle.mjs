import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const outputFile = 'dist/github-tabs.zip';
const bundleEntries = ['manifest.json', 'background.js', 'consolidate.js', 'icons'];

function collectFiles(entry) {
  const stats = statSync(entry);

  if (stats.isDirectory()) {
    return readdirSync(entry, { withFileTypes: true })
      .flatMap((dirent) => collectFiles(join(entry, dirent.name)));
  }

  return [entry];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    return false;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return true;
}

rmSync('dist', { force: true, recursive: true });
mkdirSync(dirname(outputFile), { recursive: true });

const files = bundleEntries.flatMap(collectFiles);

// Prefer the standard zip CLI when present; fall back to Python's stdlib zipfile module.
if (!run('zip', ['-r', outputFile, ...bundleEntries])) {
  if (!run('python3', ['-m', 'zipfile', '-c', outputFile, ...files])) {
    console.error('Unable to create zip archive. Install zip or python3 and retry.');
    process.exit(1);
  }
}

console.log(`Created ${relative(process.cwd(), outputFile)}`);

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

function runPythonZip(outputPath, inputFiles) {
  const script = [
    'from pathlib import Path',
    'import sys',
    'import zipfile',
    '',
    'output = Path(sys.argv[1])',
    'files = [Path(path) for path in sys.argv[2:]]',
    'with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:',
    '    for file_path in files:',
    '        archive.write(file_path, arcname=file_path.as_posix())',
  ].join('\n');

  return run('python3', ['-c', script, outputPath, ...inputFiles]);
}

rmSync('dist', { force: true, recursive: true });
mkdirSync(dirname(outputFile), { recursive: true });

const files = bundleEntries.flatMap(collectFiles);

// Prefer the standard zip CLI when present; fall back to Python's stdlib zipfile module.
if (!run('zip', ['-r', outputFile, ...bundleEntries])) {
  if (!runPythonZip(outputFile, files)) {
    console.error('Unable to create zip archive. Install zip or python3 and retry.');
    process.exit(1);
  }
}

console.log(`Created ${relative(process.cwd(), outputFile)}`);

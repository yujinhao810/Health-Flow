import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(apiRoot, 'prisma/schema.prisma');
const prismaBin = resolve(apiRoot, 'node_modules/.bin', process.platform === 'win32' ? 'prisma.CMD' : 'prisma');
const require = createRequire(import.meta.url);
const clientPackagePath = require.resolve('@prisma/client/package.json', { paths: [apiRoot] });
const generatedTypesPath = resolve(dirname(clientPackagePath), '../../.prisma/client/index.d.ts');

if (!shouldGenerate()) {
  console.log('Prisma Client is up to date.');
  process.exit(0);
}

const result = spawnSync(existsSync(prismaBin) ? prismaBin : 'prisma', ['generate'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);

function shouldGenerate() {
  if (!existsSync(generatedTypesPath)) return true;

  const schemaTime = statSync(schemaPath).mtimeMs;
  const generatedTime = statSync(generatedTypesPath).mtimeMs;
  return schemaTime > generatedTime + 1000;
}

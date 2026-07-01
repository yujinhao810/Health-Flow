import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaBin = resolve(apiRoot, 'node_modules/.bin', process.platform === 'win32' ? 'prisma.CMD' : 'prisma');
const command = existsSync(prismaBin) ? prismaBin : 'prisma';

const result = spawnSync(command, ['migrate', 'deploy'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);

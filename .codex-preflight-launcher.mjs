import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';

const stdout = openSync('.codex-preflight-server.stdout.log', 'a');
const stderr = openSync('.codex-preflight-server.stderr.log', 'a');
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', '3000'],
  {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', stdout, stderr],
  },
);
child.unref();
console.log(child.pid);

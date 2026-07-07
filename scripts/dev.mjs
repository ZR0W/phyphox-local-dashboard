#!/usr/bin/env node
// Runs the backend and frontend dev servers side by side in one terminal,
// prefixing/coloring their output live and also teeing each process's full
// output (ANSI stripped) to logs/<name>.log so it survives after the
// terminal's scrollback is gone. Overwrites those files on every run.
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const logsDir = join(rootDir, 'logs');
mkdirSync(logsDir, { recursive: true });

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const RESET = '\x1b[0m';
const PROCESSES = [
  { name: 'backend', color: '\x1b[34m', args: ['run', 'dev:backend'] },
  { name: 'frontend', color: '\x1b[32m', args: ['run', 'dev:frontend'] },
];

const children = [];
let shuttingDown = false;

function lineWriter(name, color, logStream) {
  let buffer = '';
  const emit = (line) => {
    process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
    logStream.write(`[${name}] ${line.replace(ANSI_RE, '')}\n`);
  };
  return {
    write(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) emit(line);
    },
    flush() {
      if (buffer.length > 0) {
        emit(buffer);
        buffer = '';
      }
    },
  };
}

// On Windows, child.kill() only kills the intermediate cmd.exe shell (spawned
// because of `shell: true`), leaving the actual npm/tsx/vite process running
// and still holding its port. taskkill /T walks the whole process tree.
function killChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // already exited
    }
  } else {
    child.kill();
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killChild(child);
  setTimeout(() => process.exit(code ?? 0), 200);
}

for (const { name, color, args } of PROCESSES) {
  const logPath = join(logsDir, `${name}.log`);
  const logStream = createWriteStream(logPath, { flags: 'w' });
  const writer = lineWriter(name, color, logStream);

  const child = spawn('npm', args, {
    cwd: rootDir,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.push(child);

  child.stdout.on('data', (chunk) => writer.write(chunk));
  child.stderr.on('data', (chunk) => writer.write(chunk));

  child.on('exit', (code) => {
    writer.flush();
    process.stdout.write(`${color}[${name}]${RESET} exited with code ${code}\n`);
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`Logging to ${join(logsDir, 'backend.log')} and ${join(logsDir, 'frontend.log')}`);

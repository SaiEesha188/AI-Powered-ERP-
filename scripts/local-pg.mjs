// Runs a project-only PostgreSQL server (no Docker) using the initdb/pg_ctl binaries on PATH.
// Data lives outside the repo (and outside OneDrive, which locks files Postgres is writing).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.ERP_PG_PORT ?? '5433';
const base = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'erp-dev')
  : join(homedir(), '.erp-dev');
const dataDir = join(base, 'pgdata');
const logFile = join(base, 'postgres.log');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) {
    console.error(`Could not run ${cmd}. Is PostgreSQL's bin directory on your PATH?`);
    process.exit(1);
  }
  return result.status ?? 1;
}

function isReady() {
  return spawnSync('pg_isready', ['-h', 'localhost', '-p', PORT], { windowsHide: true }).status === 0;
}

async function waitFor(ready, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (isReady() === ready) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function init() {
  if (existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log(`Already initialised: ${dataDir}`);
    return;
  }
  mkdirSync(base, { recursive: true });
  // trust auth is acceptable only because the server listens on localhost (see start()).
  const code = run('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C']);
  if (code !== 0) process.exit(code);
  console.log(`Initialised ${dataDir}`);
}

async function start() {
  if (!existsSync(join(dataDir, 'PG_VERSION'))) init();
  if (isReady()) {
    console.log(`Postgres already running on localhost:${PORT}`);
    return;
  }
  const args = ['-D', dataDir, '-l', logFile, '-o', `-p ${PORT} -c listen_addresses=localhost`, 'start'];
  if (process.platform === 'win32') startDetachedOnWindows(args);
  else {
    // pg_ctl's child keeps inherited stdio handles open, so detach and discard them;
    // otherwise this script would never exit.
    spawn('pg_ctl', args, { detached: true, stdio: 'ignore' }).unref();
  }
  if (!(await waitFor(true, 20_000))) {
    console.error(`Postgres did not start; see ${logFile}`);
    process.exit(1);
  }
  console.log(`Postgres running on localhost:${PORT} (data: ${dataDir})`);
}

// A process started from a terminal is killed (Ctrl+C event) when that terminal or its job
// closes. Creating it through WMI gives it no parent console, so the server keeps running.
function startDetachedOnWindows(args) {
  const where = spawnSync('where', ['pg_ctl'], { encoding: 'utf8', windowsHide: true });
  const pgCtl = where.stdout?.split(/\r?\n/)[0]?.trim();
  if (!pgCtl) {
    console.error("pg_ctl not found. Add PostgreSQL's bin directory to your PATH.");
    process.exit(1);
  }
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const commandLine = [pgCtl, ...args].map(quote).join(' ');
  const ps = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${commandLine.replace(/'/g, "''")}' }; exit $r.ReturnValue`;
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.error(`Could not launch pg_ctl (WMI return code ${result.status})`);
    process.exit(1);
  }
}

async function stop() {
  if (!isReady()) {
    console.log('Postgres is not running');
    return;
  }
  run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop']);
}

const command = process.argv[2];
switch (command) {
  case 'init':
    init();
    break;
  case 'start':
    await start();
    break;
  case 'stop':
    await stop();
    break;
  case 'status':
    console.log(isReady() ? `running on localhost:${PORT}` : 'stopped');
    break;
  default:
    console.error('Usage: node scripts/local-pg.mjs <init|start|stop|status>');
    process.exit(1);
}

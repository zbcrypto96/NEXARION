const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const scriptPath = path.resolve(__dirname, '..', 'src', 'index.js');
const restartDelayMs = 3000;
const maxRestarts = Number(process.env.WATCH_MAX_RESTARTS || 5);
const restartWindowMs = Number(process.env.WATCH_RESTART_WINDOW_MINUTES || 10) * 60 * 1000;
const logsFolder = path.join(process.cwd(), 'logs');
const watchLogFile = path.join(logsFolder, 'watchdog.log');

function ensureLogsFolder() {
  try {
    fs.mkdirSync(logsFolder, { recursive: true });
  } catch (error) {
    console.error('[watch] failed to create logs folder', error);
  }
}

function appendWatchLog(message) {
  const timestamp = new Date().toISOString();
  const entry = `${timestamp} ${message}\n`;
  try {
    fs.appendFileSync(watchLogFile, entry);
  } catch (error) {
    console.error('[watch] failed to write watchdog log', error);
  }
}

let restartAttempts = [];

function recordRestartAttempt() {
  const now = Date.now();
  restartAttempts = restartAttempts.filter((ts) => now - ts <= restartWindowMs);
  restartAttempts.push(now);
}

function shouldStopRestarting() {
  const now = Date.now();
  restartAttempts = restartAttempts.filter((ts) => now - ts <= restartWindowMs);
  return restartAttempts.length >= maxRestarts;
}

function startBot() {
  ensureLogsFolder();
  appendWatchLog('[watch] starting NEXARION process');
  console.log(`[watch] starting NEXARION process: ${scriptPath}`);

  const proc = spawn(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { NODE_ENV: process.env.NODE_ENV || 'production' }),
  });

  proc.on('exit', (code, signal) => {
    const message = `[watch] NEXARION stopped with code=${code} signal=${signal}`;
    console.warn(message);
    appendWatchLog(message);

    recordRestartAttempt();
    if (shouldStopRestarting()) {
      const stopMessage = `[watch] repeated failures detected (${restartAttempts.length} restarts within ${restartWindowMs / 60000}m). stopping automatic restarts.`;
      console.error(stopMessage);
      appendWatchLog(stopMessage);
      return;
    }

    setTimeout(() => startBot(), restartDelayMs);
  });

  proc.on('error', (error) => {
    const message = `[watch] process error ${error.message}`;
    console.error(message);
    appendWatchLog(message);

    recordRestartAttempt();
    if (shouldStopRestarting()) {
      const stopMessage = `[watch] repeated process errors detected (${restartAttempts.length} restarts within ${restartWindowMs / 60000}m). stopping automatic restarts.`;
      console.error(stopMessage);
      appendWatchLog(stopMessage);
      return;
    }

    setTimeout(() => startBot(), restartDelayMs);
  });
}

startBot();

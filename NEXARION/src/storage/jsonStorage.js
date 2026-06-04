const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');

function ensureFolderExists(filePath) {
  const folder = path.dirname(filePath);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
}

async function loadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const payload = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(payload);
  } catch (error) {
    logger.error({ event: 'storage_load_error', message: error.message, filePath });
    return fallback;
  }
}

async function saveJson(filePath, data) {
  try {
    ensureFolderExists(filePath);
    const payload = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(filePath, payload, 'utf8');
    return true;
  } catch (error) {
    logger.error({ event: 'storage_save_error', message: error.message, filePath });
    return false;
  }
}

module.exports = {
  loadJson,
  saveJson,
};

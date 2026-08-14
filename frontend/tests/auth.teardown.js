const fs = require('fs');
const { AUTH_FILE, loadTestEnv } = require('./helpers/env.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');

module.exports = async function globalTeardown() {
  loadTestEnv();
  let cleanupError = null;

  try {
    const result = cleanupAll({ includeSessions: true, silent: true });
  } catch (error) {
    cleanupError = error;
  } finally {
    fs.rmSync(AUTH_FILE, { force: true });
  }

  if (cleanupError) throw cleanupError;
};

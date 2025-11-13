/* eslint-disable @typescript-eslint/no-var-requires */
let CapacitorCommunitySqlite;

try {
  // Attempt to load the native SQLite plugin. This requires native dependencies that
  // are unavailable in our Electron shell, so we fall back to a stub if it fails.
  CapacitorCommunitySqlite = require('../../../node_modules/@capacitor-community/sqlite/electron/dist/plugin.js');
} catch (error) {
  console.warn('[Electron] Capacitor SQLite plugin unavailable, falling back to stub implementation:', error);
  class SQLiteStub {
    async init() {
      throw new Error('Capacitor SQLite plugin is not available in the Electron shell. The app uses the web SQL.js fallback instead.');
    }
  }
  CapacitorCommunitySqlite = { CapacitorSQLite: SQLiteStub };
}

module.exports = {
  CapacitorCommunitySqlite,
}

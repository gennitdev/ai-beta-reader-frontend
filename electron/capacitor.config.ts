import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.betareader.app',
  appName: 'AI Beta Reader',
  webDir: 'dist'
  // Remove server.url to use local bundled assets instead of production URL
};

export default config;

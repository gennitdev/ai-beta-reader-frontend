import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.betareader.app',
  appName: 'AI Beta Reader',
  webDir: 'dist',
  server: {
    url: 'https://www.beta-bot.net',
    cleartext: false
  }
};

export default config;

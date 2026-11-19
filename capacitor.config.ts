import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.writersrealm.app',
  appName: "Writer's Realm",
  webDir: 'dist',
  server: {
    url: 'https://onrender.com',
    cleartext: true
  }
};

export default config;

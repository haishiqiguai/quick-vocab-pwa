import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.haishiqiguai.quickvocab',
  appName: '速记单词',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#050505',
    allowMixedContent: false
  }
};

export default config;

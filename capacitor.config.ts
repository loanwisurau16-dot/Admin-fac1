import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gossaigaonbazar.admin',
  appName: 'GB Admin',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_gb_admin',
      iconColor: '#16a34a',
    },
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.pksx.app',
	appName: 'PKSX',
	webDir: 'build',
	experimental: {
		ios: {
			spm: {
				swiftToolsVersion: '6.2'
			}
		}
	}
};

export default config;

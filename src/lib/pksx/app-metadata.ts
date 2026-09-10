import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import packageMetadata from '../../../package.json';

export type AppPlatform = 'web' | 'ios' | 'android';

export async function getAppMetadata() {
	const platform = Capacitor.getPlatform() as AppPlatform;
	const version = platform === 'web' ? packageMetadata.version : (await App.getInfo()).version;

	return { platform, version };
}

export function appPlatformLabel(platform: AppPlatform) {
	return platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';
}

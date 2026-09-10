import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PKSX_E2E_PORT ?? 4173);

export default defineConfig({
	webServer: { command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${port}`, port },
	testMatch: '**/*.e2e.{ts,js}',
	// Engine-backed specs already declare 60s assertion budgets; the 30s default
	// test timeout capped them, so slow CI runs died mid-apply.
	timeout: 120_000,
	use: { baseURL: `http://127.0.0.1:${port}` },
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{
			name: 'firefox-responsive',
			grep: /@responsive-matrix/,
			testMatch: '**/responsive-contract.e2e.ts',
			use: { ...devices['Desktop Firefox'] }
		},
		{
			name: 'webkit-responsive',
			grep: /@responsive-matrix/,
			testMatch: '**/responsive-contract.e2e.ts',
			use: { ...devices['Desktop Safari'] }
		}
	]
});

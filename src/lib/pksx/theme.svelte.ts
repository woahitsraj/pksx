class ThemeState {
	dark = $state(false);

	setDark(dark: boolean) {
		this.dark = dark;
	}

	toggle() {
		this.dark = !this.dark;
	}
}

export const theme = new ThemeState();

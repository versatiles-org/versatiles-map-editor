import { isOwnKeyTarget } from '../common/index.js';

/**
 * The editor in fullscreen, e.g. to look at the map without the rest of the screen. The browser
 * leaves it with Escape. Not every browser has it, e.g. Safari on iPhones.
 */
class Fullscreen {
	/** Whether the editor is in fullscreen; also after the browser left it, e.g. with Escape. */
	public active = $state(false);

	constructor() {
		if (typeof document === 'undefined') return;
		this.active = document.fullscreenElement !== null;
		document.addEventListener('fullscreenchange', () => (this.active = document.fullscreenElement !== null));
	}

	/** Whether the browser can show the page in fullscreen. */
	public get available(): boolean {
		return typeof document !== 'undefined' && document.fullscreenEnabled === true;
	}

	public async toggle(): Promise<void> {
		if (!this.available) return;
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch (error) {
			// e.g. not allowed without a click or a key press
			console.warn('Fullscreen is not possible', error);
		}
	}

	/** F switches fullscreen on and off, but not while typing or with a modifier key. */
	public onKeydown = (e: KeyboardEvent) => {
		if (isOwnKeyTarget(e) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key.toUpperCase() !== 'F' || !this.available) return;
		e.preventDefault();
		void this.toggle();
	};
}

export const fullscreen = new Fullscreen();

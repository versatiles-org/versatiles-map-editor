/**
 * Give the element its natural width, rounded up to a whole pixel, e.g. a text whose width
 * differs by browser and font. The elements after it then start on whole pixels too, which all
 * browsers draw alike, e.g. their icons. Measured again when the fonts have loaded. Returns a
 * function that gives the element its natural width back.
 */
export function wholeWidth(element: HTMLElement): () => void {
	let stopped = false;
	const measure = () => {
		if (stopped) return;
		element.style.width = '';
		const width = element.getBoundingClientRect().width;
		if (width > 0) element.style.width = `${Math.ceil(width)}px`;
	};
	measure();
	void document.fonts?.ready.then(measure);
	return () => {
		stopped = true;
		element.style.width = '';
	};
}

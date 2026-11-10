import { describe, expect, it } from 'vitest';
import {
	elementLayer,
	labelFont,
	labelLayout,
	labelSortKey,
	MAX_LAYERS,
	planLayers,
	type Drawn,
	type LayerPlan
} from './element_layers.js';
import type { SymbolInfo } from './types.js';

describe('planLayers', () => {
	const marker: Drawn = { roles: ['symbol'], label: false };
	const labeled: Drawn = { roles: ['symbol'], label: true };
	const polygon: Drawn = { roles: ['fill', 'stroke'], label: false };
	const area: Drawn = { roles: ['fill'], label: false };
	const line: Drawn = { roles: ['stroke'], label: false };
	const arrowed: Drawn = { roles: ['stroke', 'arrow'], label: false };
	const layers = (plan: LayerPlan) => plan.layers.map(({ role, elements }) => `${role} ${elements.join()}`);

	/**
	 * What the layers draw, in this order: the parts of the elements, e.g. "2 label". A layer of
	 * markers draws all its symbols before all its labels; the labels of the markers in a layer
	 * of their own (`sharedLabels`) come last.
	 */
	function drawn(plan: LayerPlan, elements: Drawn[]): string[] {
		const parts = plan.layers.flatMap(({ role, elements: indices }) => {
			if (role !== 'symbol') return indices.map((i) => `${i} ${role}`);
			const labels = plan.sharedLabels ? [] : indices.filter((i) => elements[i].label).map((i) => `${i} label`);
			return [...indices.map((i) => `${i} symbol`), ...labels];
		});
		const labels = elements.flatMap((e, i) => (e.label ? [`${i} label`] : []));
		return plan.sharedLabels ? [...parts, ...labels] : parts;
	}

	/** What one layer per element draws: each element's area, outline or line, symbol, label. */
	function reference(elements: Drawn[], markersOnTop = false): string[] {
		const parts = (e: Drawn, i: number) => [
			...e.roles.map((role) => `${i} ${role}`),
			...(e.label ? [`${i} label`] : [])
		];
		if (!markersOnTop) return elements.flatMap(parts);
		const isMarker = (e: Drawn) => e.roles.includes('symbol');
		return [
			...elements.flatMap((e, i) => (isMarker(e) ? [] : parts(e, i))),
			...elements.flatMap((e, i) => (isMarker(e) ? parts(e, i) : []))
		];
	}

	it('merges layers in a row that draw the same', () => {
		expect(layers(planLayers([area, area, line, line, marker, marker]))).toStrictEqual([
			'fill 0,1',
			'stroke 2,3',
			'symbol 4,5'
		]);
		// two polygons: area, outline, area, outline
		expect(layers(planLayers([polygon, polygon]))).toStrictEqual(['fill 0', 'stroke 0', 'fill 1', 'stroke 1']);
		// a marker after a label: in a layer of its own
		expect(layers(planLayers([labeled, marker, labeled, marker]))).toStrictEqual([
			'symbol 0',
			'symbol 1,2',
			'symbol 3'
		]);
		expect(layers(planLayers([marker, polygon, marker]))).toStrictEqual(['symbol 0', 'fill 1', 'stroke 1', 'symbol 2']);
	});

	it('draws the arrowheads of lines in a row over all of their lines', () => {
		expect(layers(planLayers([arrowed, line, arrowed, marker, arrowed]))).toStrictEqual([
			'stroke 0,1,2',
			'arrow 0,2',
			'symbol 3',
			'stroke 4',
			'arrow 4'
		]);
		// an outline after an area does not join the lines before it
		expect(layers(planLayers([arrowed, polygon]))).toStrictEqual(['stroke 0', 'arrow 0', 'fill 1', 'stroke 1']);
		// with too many layers, all arrowheads over all lines and outlines
		const many = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => (i % 2 ? polygon : arrowed));
		expect(planLayers(many).layers.map(({ role }) => role)).toStrictEqual(['fill', 'stroke', 'arrow']);
	});

	it('puts the markers over all areas and lines on demand', () => {
		const plan = planLayers([marker, polygon, labeled, marker, polygon], true);
		expect(layers(plan)).toStrictEqual(['fill 1', 'stroke 1', 'fill 4', 'stroke 4', 'symbol 0,2', 'symbol 3']);
		expect(plan.markersOnTop).toBe(true);
	});

	it('draws exactly like one layer per element', () => {
		// random maps of all kinds of elements, the same each run
		let seed = 1;
		const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const kinds = [marker, labeled, polygon, area, line];
		for (let run = 0; run < 500; run++) {
			const elements = Array.from(
				{ length: Math.floor(random() * 30) },
				() => kinds[Math.floor(random() * kinds.length)]
			);
			for (const markersOnTop of [false, true]) {
				const plan = planLayers(elements, markersOnTop);
				expect(plan.sharedLabels).toBe(false);
				expect(drawn(plan, elements)).toStrictEqual(reference(elements, markersOnTop));
				// and no two layers in a row could be one
				plan.layers.slice(1).forEach(({ role, elements: [first] }, i) => {
					const before = plan.layers[i];
					const label = before.elements.some((e) => elements[e].label);
					expect(role === before.role && !(role === 'symbol' && label), `${first}`).toBe(false);
				});
			}
		}
	});

	it('keeps flat markers and upright ones apart, in their order', () => {
		const flat: Drawn = { roles: ['symbol'], label: false, flat: true };
		const plan = planLayers([marker, flat, flat, marker, flat]);
		expect(plan.layers).toStrictEqual([
			{ role: 'symbol', elements: [0] },
			{ role: 'symbol', elements: [1, 2], flat: true },
			{ role: 'symbol', elements: [3] },
			{ role: 'symbol', elements: [4], flat: true }
		]);
		expect(plan).not.toHaveProperty('flatLabels');
		// only markers are flat
		expect(planLayers([{ ...line, flat: true }, line]).layers).toStrictEqual([{ role: 'stroke', elements: [0, 1] }]);
	});

	it('gives the labels of flat markers a layer of their own if the labels share layers', () => {
		const flatLabeled: Drawn = { roles: ['symbol'], label: true, flat: true };
		const many = Array.from({ length: MAX_LAYERS + 1 }, () => labeled);
		expect(planLayers(many)).toMatchObject({ sharedLabels: true });
		expect(planLayers(many)).not.toHaveProperty('flatLabels');
		expect(planLayers([...many, flatLabeled])).toMatchObject({ sharedLabels: true, flatLabels: true });
		// not for a flat marker without a label, nor while every marker has its label in its layer
		expect(planLayers([...many, { ...flatLabeled, label: false }])).not.toHaveProperty('flatLabels');
		expect(planLayers([labeled, flatLabeled])).not.toHaveProperty('flatLabels');
	});

	it('draws with fewer layers if there are too many, step by step', () => {
		// 1. the labels of all markers in a layer of their own, over all markers
		const labels = Array.from({ length: MAX_LAYERS + 1 }, () => labeled);
		const shared = planLayers([polygon, ...labels]);
		expect(layers(shared)).toStrictEqual(['fill 0', 'stroke 0', `symbol ${labels.map((_, i) => i + 1).join()}`]);
		expect(shared).toMatchObject({ sharedLabels: true, markersOnTop: false });

		// 2. the markers over all areas and lines, which keep their order
		const mixed = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => (i % 2 ? marker : line));
		const onTop = planLayers(mixed);
		expect(onTop).toMatchObject({ sharedLabels: true, markersOnTop: true });
		expect(onTop.layers).toHaveLength(2);
		expect(drawn(onTop, mixed)).toStrictEqual(reference(mixed, true));

		// 3. all areas under all lines and outlines
		const polygons = Array.from({ length: MAX_LAYERS / 2 + 1 }, () => polygon);
		expect(planLayers(polygons).layers.map(({ role }) => role)).toStrictEqual(['fill', 'stroke']);
		// up to the limit, each in layers of its own
		expect(planLayers(polygons.slice(1)).layers).toHaveLength(MAX_LAYERS);
	});
});

describe('labelLayout', () => {
	it('shows all labels at every zoom level by default', () => {
		expect(labelLayout({ overlap: 'show', minZoom: 0 })).toStrictEqual({
			'text-field': ['get', 'label'],
			'text-overlap': 'always',
			'text-optional': false
		});
	});

	it('hides labels that would overlap, keeping their markers, and those below a zoom level', () => {
		expect(labelLayout({ overlap: 'hide', minZoom: 14 })).toStrictEqual({
			'text-field': ['step', ['zoom'], '', 14, ['get', 'label']],
			'text-overlap': 'never',
			'text-optional': true
		});
	});
});

describe('the fonts and the order of labels', () => {
	it('take the font of each marker, else the one of the background map', () => {
		expect(labelFont([], 'noto_sans_regular')).toStrictEqual(['literal', ['noto_sans_regular']]);
		expect(labelFont(['lato_bold'], 'noto_sans_regular')).toStrictEqual([
			'match',
			['get', 'font'],
			'lato_bold',
			['literal', ['lato_bold']],
			['literal', ['noto_sans_regular']]
		]);
	});

	it('place the labels of a layer of their own from the front where overlapping ones are hidden', () => {
		expect(labelSortKey('show')).toStrictEqual(['get', 'order']);
		expect(labelSortKey('hide')).toStrictEqual(['-', 0, ['get', 'order']]);
	});
});

describe('the layer of markers', () => {
	it('has the label places of the symbols that it is given, e.g. beside the head of a pin', () => {
		const pin: SymbolInfo = {
			name: 'extras:pin',
			title: 'Pin',
			aliases: [],
			anchor: 'bottom',
			width: 32,
			height: 38,
			center: [0.5, 1]
		};
		const offsets = (symbols: SymbolInfo[]) =>
			JSON.stringify(
				(elementLayer('symbol', 'elements_symbol', 'noto_sans_regular', symbols) as { layout: Record<string, unknown> })
					.layout['text-variable-anchor-offset']
			);
		expect(offsets([])).not.toContain('auto@');
		expect(offsets([pin])).toContain('auto@0,-1.1875,0,0.1875');
	});
});

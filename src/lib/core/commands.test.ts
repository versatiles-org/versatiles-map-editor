import { beforeEach, describe, expect, it } from 'vitest';
import { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import {
	addLegendEntry,
	canCopyStyle,
	canPasteStyle,
	copyStyle,
	deleteSelection,
	duplicateSelection,
	pasteStyle
} from './commands.js';

describe('commands', () => {
	let manager: GeometryManagerInteractive;

	beforeEach(() => {
		manager = new GeometryManagerInteractive(new MockMap() as unknown as MaplibreMap);
	});

	const types = () => manager.elements.map((e) => e.getState().type);

	it('duplicate the selected elements in one undo step and select the copies', () => {
		const marker = manager.addNewElement('marker');
		const line = manager.addNewElement('line');
		manager.state.log();
		manager.selection.selectElements([marker, line]);

		duplicateSelection(manager);
		expect(types()).toStrictEqual(['marker', 'line', 'marker', 'line']);
		expect(manager.selection.selectedElements).toStrictEqual(manager.elements.slice(2));

		manager.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('delete the selected elements in one undo step', () => {
		const marker = manager.addNewElement('marker');
		manager.addNewElement('line');
		manager.state.log();
		manager.selection.selectElement(marker);

		deleteSelection(manager);
		expect(types()).toStrictEqual(['line']);

		manager.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('do nothing without a selection', () => {
		manager.addNewElement('marker');
		manager.state.log();
		manager.selection.selectElements([]);

		duplicateSelection(manager);
		deleteSelection(manager);
		pasteStyle(manager);
		expect(types()).toStrictEqual(['marker']);
		// no undo step was added: one undo removes the marker
		manager.state.undo();
		expect(types()).toStrictEqual([]);
	});

	it('copy the style of one element and paste it onto the selection', () => {
		const a = manager.addNewElement('marker');
		const b = manager.addNewElement('marker');
		manager.state.log();

		manager.selection.selectElements([a, b]);
		expect(canCopyStyle(manager)).toBe(false);
		expect(canPasteStyle(manager)).toBe(false);

		a.getStyleLayers().symbol!.color = '#123456';
		manager.selection.selectElement(a);
		copyStyle(manager);
		manager.selection.selectElement(b);
		expect(canPasteStyle(manager)).toBe(true);
		pasteStyle(manager);
		expect(b.getStyleLayers().symbol!.color).toBe('#123456');
	});
});

describe('addLegendEntry', () => {
	it('starts a legend, and adds entries with colors of the map that it does not show yet', () => {
		const manager = new GeometryManagerInteractive(new MockMap() as unknown as MaplibreMap);
		const a = manager.addNewElement('marker');
		a.getStyleLayers().symbol!.color = '#111111';
		const b = manager.addNewElement('marker');
		b.getStyleLayers().symbol!.color = '#222222';

		addLegendEntry(manager);
		addLegendEntry(manager);
		expect(manager.legend?.entries.map((entry) => entry.color).sort()).toStrictEqual(['#111111', '#222222']);

		manager.state.undo();
		expect(manager.legend?.entries).toHaveLength(1);
	});
});

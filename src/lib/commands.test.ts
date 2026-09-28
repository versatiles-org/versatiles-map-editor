import { beforeEach, describe, expect, it } from 'vitest';
import { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import { MockMap, type MaplibreMap } from './__mocks__/map.js';
import {
	addLegendEntry,
	canCopyStyle,
	canPasteStyle,
	copyStyle,
	deleteSelection,
	duplicateSelection,
	pasteStyle
} from './commands.js';
import { addElement } from './__mocks__/elements.js';

describe('commands', () => {
	let manager: GeometryManagerInteractive;

	beforeEach(() => {
		manager = new GeometryManagerInteractive(new MockMap() as unknown as MaplibreMap);
	});

	const types = () => manager.elements.map((e) => e.getState().type);

	it('duplicate the selected elements in one undo step and select the copies', () => {
		const marker = addElement(manager, 'marker');
		const line = addElement(manager, 'line');
		manager.state.log();
		manager.selection.selectElements([marker, line]);

		duplicateSelection(manager);
		expect(types()).toStrictEqual(['marker', 'line', 'marker', 'line']);
		expect(manager.selection.selectedElements).toStrictEqual(manager.elements.slice(2));

		manager.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('delete the selected elements in one undo step', () => {
		const marker = addElement(manager, 'marker');
		addElement(manager, 'line');
		manager.state.log();
		manager.selection.selectElement(marker);

		deleteSelection(manager);
		expect(types()).toStrictEqual(['line']);

		manager.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('do nothing without a selection', () => {
		addElement(manager, 'marker');
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
		const a = addElement(manager, 'marker');
		const b = addElement(manager, 'marker');
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
		const a = addElement(manager, 'marker');
		a.getStyleLayers().symbol!.color = '#111111';
		const b = addElement(manager, 'marker');
		b.getStyleLayers().symbol!.color = '#222222';

		addLegendEntry(manager);
		addLegendEntry(manager);
		expect(manager.legend?.entries.map((entry) => entry.color).sort()).toStrictEqual(['#111111', '#222222']);

		manager.state.undo();
		expect(manager.legend?.entries).toHaveLength(1);
	});
});

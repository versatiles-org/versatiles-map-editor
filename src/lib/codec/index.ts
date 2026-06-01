import { StateWriter } from './writer.js';
import { StateReader } from './reader.js';
import type { StateRoot } from './types.js';

// Public types of the codec. `MapState` is the preferred public name for the
// document model; `StateRoot` remains exported for internal continuity.
export * from './types.js';
export type { StateRoot as MapState } from './types.js';

/** Encode a map state document into the compact base64 representation. */
export function encodeState(state: StateRoot): string {
	const writer = new StateWriter();
	writer.writeRoot(state);
	return writer.asBase64();
}

/** Decode the compact base64 representation back into a map state document. */
export function decodeState(base64: string): StateRoot {
	return StateReader.fromBase64(base64).readRoot();
}

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MAP_STATE_PATHS, isReleaseCommit, nextVersion, parseLog } from './plan.mjs';

const commit = (message) => parseLog(`0123456\x1f${message}\x1e`)[0];

describe('parseLog', () => {
	it('reads the commits of git log as conventional commits', () => {
		const commits = parseLog('aaa\x1ffeat(legend): fold it\x1e\nbbb\x1ffix!: no crash\x1e\nccc\x1fv3.0.0\x1e\n');
		expect(commits.map(({ sha, type, scope, breaking }) => ({ sha, type, scope, breaking }))).toStrictEqual([
			{ sha: 'aaa', type: 'feat', scope: 'legend', breaking: false },
			{ sha: 'bbb', type: 'fix', scope: undefined, breaking: true },
			{ sha: 'ccc', type: undefined, scope: undefined, breaking: false }
		]);
	});
});

describe('isReleaseCommit', () => {
	it('is true for features, fixes, faster code, reverts and breaking changes', () => {
		for (const message of ['feat: a', 'fix(map): b', 'perf: c', 'revert: d', 'refactor!: e']) {
			expect(isReleaseCommit(commit(message)), message).toBe(true);
		}
	});

	it('is false for documentation, tests, CI, refactorings, chores and other commits', () => {
		for (const message of [
			'docs: a',
			'test: b',
			'ci: c',
			'refactor: d',
			'chore: e',
			'build: f',
			'v3.0.0',
			'release: g'
		]) {
			expect(isReleaseCommit(commit(message)), message).toBe(false);
		}
	});
});

describe('nextVersion', () => {
	it('raises the major version for a breaking change, the minor for a feature, else the patch', () => {
		expect(nextVersion('3.0.0', [commit('fix: a'), commit('feat!: b')])).toBe('4.0.0');
		expect(nextVersion('3.1.2', [commit('fix: a'), commit('feat: b')])).toBe('3.2.0');
		expect(nextVersion('3.1.2', [commit('fix: a'), commit('perf: b')])).toBe('3.1.3');
	});

	it('is undefined without commits that change what is released', () => {
		expect(nextVersion('3.0.0', [])).toBeUndefined();
		expect(nextVersion('3.0.0', [commit('docs: a'), commit('test: b')])).toBeUndefined();
	});

	it('refuses an invalid version', () => {
		expect(() => nextVersion('3.0', [commit('fix: a')])).toThrow('Invalid version');
	});
});

describe('MAP_STATE_PATHS', () => {
	it('are the published files of the package, without its tests', () => {
		const files = execFileSync('git', ['ls-files', '--', ...MAP_STATE_PATHS], { encoding: 'utf8' }).split('\n');
		expect(files).toContain('packages/map-state/src/writer.ts');
		expect(files).toContain('packages/map-state/MAPJSON.md');
		expect(files).toContain('packages/map-state/schema/mapjson-1.schema.json');
		expect(
			files.filter((file) => /\.test\.ts$|__fixtures__|CHANGELOG|generate\.mjs|tsconfig/.test(file))
		).toStrictEqual([]);
	});
});

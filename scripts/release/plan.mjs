/**
 * What a release contains: the commits since the release before, and the version they lead to.
 * Pure functions, for scripts/release.mjs. Commits are read as conventional commits, the same way
 * as `vrt release-npm` reads them.
 */
import { getSuggestedBump, parseConventionalCommit } from '@versatiles/release-tool/dist/lib/git.js';

/**
 * The types of commits that change what is released: new features, bug fixes, faster code and
 * reverted commits. A breaking change of any type does too. Documentation, tests, CI, refactorings
 * and chores alone need no release.
 */
export const RELEASE_TYPES = ['feat', 'fix', 'perf', 'revert'];

/**
 * The files of @versatiles/map-state that are published, as git pathspecs: those of `files` in its
 * package.json, with the code of dist/ as its sources, without their tests and fixtures, and the
 * package.json itself, e.g. for its dependencies.
 */
export const MAP_STATE_PATHS = [
	'packages/map-state/src',
	':(glob)packages/map-state/schema/*.schema.json',
	'packages/map-state/README.md',
	'packages/map-state/MAPJSON.md',
	'packages/map-state/LICENSE',
	'packages/map-state/package.json',
	':(exclude,glob)packages/map-state/**/*.test.ts',
	':(exclude)packages/map-state/src/__fixtures__'
];

/**
 * The commits of `git log --format=%H%x1f%s%x1e`, the newest first, as conventional commits.
 * @param {string} log
 */
export function parseLog(log) {
	return log
		.split('\x1e')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [sha, message] = line.split('\x1f');
			return parseConventionalCommit({ sha, message });
		});
}

/**
 * Whether a commit changes what is released, see `RELEASE_TYPES`.
 * @param {{ type?: string, breaking: boolean }} commit
 */
export function isReleaseCommit(commit) {
	return commit.breaking || RELEASE_TYPES.includes(commit.type ?? '');
}

/**
 * The version after `version` for these commits: major for a breaking change, minor for a
 * feature, else patch; undefined if none of them changes what is released.
 * @param {string} version
 * @param {{ type?: string, breaking: boolean }[]} commits
 */
export function nextVersion(version, commits) {
	const relevant = commits.filter(isReleaseCommit);
	if (relevant.length === 0) return undefined;
	const [major, minor, patch] = version.split('.').map(Number);
	if ([major, minor, patch].some((part) => !Number.isInteger(part))) throw new Error(`Invalid version "${version}"`);
	switch (getSuggestedBump(relevant)) {
		case 'major':
			return `${major + 1}.0.0`;
		case 'minor':
			return `${major}.${minor + 1}.0`;
		default:
			return `${major}.${minor}.${patch + 1}`;
	}
}

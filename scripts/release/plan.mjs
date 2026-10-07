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

/** Whether a version is a release candidate, e.g. "4.0.0-rc.2". */
export function isCandidate(version) {
	return /-rc\.\d+$/.test(version);
}

const LEVELS = ['patch', 'minor', 'major'];

/** A version raised at a level: major, minor or patch. */
function raised([major, minor, patch], level) {
	if (level === 'major') return [major + 1, 0, 0];
	if (level === 'minor') return [major, minor + 1, 0];
	return [major, minor, patch + 1];
}

/**
 * The version after `version` for these commits: major for a breaking change, minor for a
 * feature, else patch; undefined if none of them changes what is released.
 *
 * With `candidate`, it is a release candidate of that version, e.g. "4.0.0-rc.1" after "3.1.1",
 * and after a candidate the next one of the same version, "4.0.0-rc.2"; of a higher version if the
 * commits ask for more than the candidate raised, e.g. "4.0.0-rc.1" after "3.2.0-rc.1" and a
 * breaking change. Without `candidate`, a candidate is followed by its version, "4.0.0", also
 * without commits: the last candidate becomes the release.
 * @param {string} version
 * @param {{ type?: string, breaking: boolean }[]} commits
 * @param {{ candidate?: boolean }} [options]
 */
export function nextVersion(version, commits, { candidate = false } = {}) {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(version);
	if (!match) throw new Error(`Invalid version "${version}"`);
	const base = match.slice(1, 4).map(Number);
	const count = match[4] === undefined ? undefined : Number(match[4]);
	const relevant = commits.filter(isReleaseCommit);

	if (count === undefined) {
		if (relevant.length === 0) return undefined;
		const target = raised(base, getSuggestedBump(relevant)).join('.');
		return candidate ? `${target}-rc.1` : target;
	}
	// after a candidate
	if (!candidate) return base.join('.');
	if (relevant.length === 0) return undefined;
	// what the candidate raised already: a major version has no minor and no patch, …
	const level = base[2] > 0 ? 'patch' : base[1] > 0 ? 'minor' : 'major';
	const wanted = getSuggestedBump(relevant);
	if (LEVELS.indexOf(wanted) > LEVELS.indexOf(level)) return `${raised(base, wanted).join('.')}-rc.1`;
	return `${base.join('.')}-rc.${count + 1}`;
}

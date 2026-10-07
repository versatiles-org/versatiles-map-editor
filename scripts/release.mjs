#!/usr/bin/env node
/**
 * "npm run release": releases what changed since its last release. It decides what to release, shows
 * it, and asks for confirmation before it changes anything. Run it on `main`, with everything
 * committed, the GitHub CLI logged in. `--dry-run` shows what it would release, and changes
 * nothing; `--yes` releases it without asking, e.g. where no one can answer. `--rc` releases
 * release candidates, e.g. "4.0.0-rc.1": the package on npm under the tag "next" instead of
 * "latest", the editor as a prerelease on GitHub. A release without `--rc` after candidates is
 * their version.
 *
 * - The editor: the commits since the tag of its version ("v…"). The tag starts the workflow
 *   release-editor.yml, which adds the ZIP archive to the GitHub release.
 * - @versatiles/map-state: the commits that change its published files (`MAP_STATE_PATHS`) since
 *   its version on npm. Its tag ("map-state-v…") starts the workflow release-map-state.yml, which
 *   publishes it. The first version is published by hand, since npm trusted publishing can only
 *   be set up for a package that exists.
 *
 * A part is released if one of its commits is a feature, a bug fix, faster code, a revert or a
 * breaking change (see `RELEASE_TYPES`); its version is raised as their conventional commit types
 * say. The editor contains the package, so a release of the package is one of the editor too.
 * Both get the commits in their changelog, and are released in one commit, after `npm run check`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { generateChangelogEntry, updateChangelog } from '@versatiles/release-tool/dist/lib/changelog.js';
import { MAP_STATE_PATHS, isCandidate, nextVersion, parseLog } from './release/plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = resolve(ROOT, 'packages/map-state');
const PACKAGE = '@versatiles/map-state';
const REPO_URL = 'https://github.com/versatiles-org/versatiles-map-editor';
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');
const yes = process.argv.includes('--yes') || process.argv.includes('-y');
const candidate = process.argv.includes('--rc');

/** Stops the release with a message. */
function fail(message) {
	console.error(`Release stopped: ${message}`);
	process.exit(1);
}

/** The output of a command, trimmed; its errors are shown. */
function output(command, args) {
	return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

/** Runs a command with its output shown. */
function run(command, args) {
	execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

/** The output of `npm view`, or undefined if the package or version is not on npm. */
function npmView(args) {
	try {
		return execFileSync('npm', ['view', ...args], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim() || undefined;
	} catch {
		return undefined;
	}
}

function tagExists(tag) {
	try {
		output('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}

/** The commits since `base` that change `paths` (all files without), the newest first. */
function commitsSince(base, paths = []) {
	return parseLog(output('git', ['log', '--format=%H%x1f%s%x1e', `${base}..HEAD`, '--', ...paths]));
}

/** The version in a package.json. */
function versionOf(dir) {
	return JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version;
}

/** Sets the version in a package.json, keeping its formatting. */
function setVersion(dir, version) {
	const path = resolve(dir, 'package.json');
	const text = readFileSync(path, 'utf8');
	const updated = text.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);
	if (updated === text) throw new Error(`No version to set in ${path}`);
	writeFileSync(path, updated);
}

// git: on main, everything committed, up to date
if (output('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') fail('release from the branch main');
if (output('git', ['status', '--porcelain']) !== '') {
	if (!dryRun) fail('commit all changes before releasing');
	console.warn('Not everything is committed: the dry run shows the commits only');
}
// a dry run changes nothing, also not the branch
run('git', dryRun ? ['fetch', '--tags'] : ['pull', '--ff-only', '--tags']);
const start = output('git', ['rev-parse', 'HEAD']);

/** @type {{ name: string, dir: string, tag: string, title: string, from: string, to: string, commits: ReturnType<typeof parseLog> }[]} */
const releases = [];

// the package: since its version on npm, at its tag, or at the commit npm has recorded for it
const published = npmView([PACKAGE, 'version']);
if (!published) {
	console.warn(`${PACKAGE} is not on npm yet, and is not released. Publish its first version by hand, then add the`);
	console.warn('workflow release-map-state.yml as trusted publisher in the package settings on npmjs.com:');
	console.warn('  npm publish --workspace packages/map-state --access public');
} else {
	// its last release: the version in its package.json, if it has a tag, e.g. a release candidate,
	// which npm does not name as the latest version; else the latest version on npm
	const own = versionOf(PACKAGE_DIR);
	const last = tagExists(`map-state-v${own}`) ? own : published;
	const base = tagExists(`map-state-v${last}`) ? `map-state-v${last}` : npmView([`${PACKAGE}@${last}`, 'gitHead']);
	if (!base) fail(`neither the tag map-state-v${last} nor npm knows the commit of ${PACKAGE} ${last}`);
	const commits = commitsSince(base, MAP_STATE_PATHS);
	const version = nextVersion(last, commits, { candidate });
	if (version) {
		releases.push({
			name: PACKAGE,
			dir: PACKAGE_DIR,
			tag: `map-state-v${version}`,
			title: `${PACKAGE} ${version}`,
			from: last,
			to: version,
			commits
		});
	} else console.log(`${PACKAGE} ${last}: nothing to release`);
}

// the editor: since the tag of its version
const editorVersion = versionOf(ROOT);
if (!tagExists(`v${editorVersion}`)) fail(`the tag v${editorVersion} of the version in package.json does not exist`);
const editorCommits = commitsSince(`v${editorVersion}`);
const nextEditor = nextVersion(editorVersion, editorCommits, { candidate });
if (nextEditor) {
	releases.unshift({
		name: 'the editor',
		dir: ROOT,
		tag: `v${nextEditor}`,
		title: `Map Editor ${nextEditor}`,
		from: editorVersion,
		to: nextEditor,
		commits: editorCommits
	});
} else console.log(`the editor ${editorVersion}: nothing to release`);

if (releases.length === 0) {
	console.log('Nothing to release');
	process.exit(0);
}
for (const release of releases) {
	console.log(`\n${release.name}: ${release.from} → ${release.to}, tag ${release.tag}\n`);
	console.log(generateChangelogEntry(release.to, release.commits, new Date(), { repoUrl: REPO_URL }));
}
if (dryRun) {
	console.log('Dry run: nothing was changed');
	process.exit(0);
}
if (!yes) {
	if (!stdin.isTTY) fail('no one can confirm the release here; release it with --yes');
	const prompt = createInterface({ input: stdin, output: stdout });
	// no answer, e.g. the input ended (Ctrl+D), is no
	const answer = await prompt.question(`Release ${releases.map((r) => r.title).join(' and ')}? [y/N] `).catch(() => '');
	prompt.close();
	if (!/^y(es)?$/i.test(answer.trim())) {
		console.log('Nothing was released');
		process.exit(0);
	}
}

run('npm', ['run', 'check']);

// the versions, the lock file and the changelogs, in one commit with the tags
for (const release of releases) {
	setVersion(release.dir, release.to);
	updateChangelog(release.dir, release.to, release.commits, new Date(), { repoUrl: REPO_URL });
}
run('npm', ['install', '--package-lock-only', '--ignore-scripts']);
run('npx', ['prettier', '--write', '--log-level', 'warn', ...releases.map((r) => resolve(r.dir, 'CHANGELOG.md'))]);
const message = `release: ${releases.map((r) => r.title).join(', ')}`;
try {
	run('git', ['add', '-A']);
	run('git', ['commit', '-m', message]);
	for (const release of releases) run('git', ['tag', '-a', release.tag, '-m', release.title]);
	// the branch and only these tags, at once: GitHub starts no workflow for more than three tags
	run('git', ['push', '--atomic', 'origin', 'main', ...releases.map((r) => r.tag)]);
} catch (error) {
	// back to the state before, so the release can be run again
	for (const release of releases) if (tagExists(release.tag)) run('git', ['tag', '-d', release.tag]);
	run('git', ['reset', '--hard', start]);
	throw error;
}

// the GitHub releases, with the changes; the workflow of the editor adds its archive to its release
for (const release of releases) {
	const notes = generateChangelogEntry(release.to, release.commits, new Date(), { repoUrl: REPO_URL }).replace(
		/^## .*\n+/,
		''
	);
	// a release candidate is a prerelease, and never the latest release
	const prerelease = isCandidate(release.to);
	const latest = release.dir === ROOT && !prerelease ? 'true' : 'false';
	const options = ['--title', release.title, '--notes', notes, `--latest=${latest}`, `--prerelease=${prerelease}`];
	// e.g. created by the workflow, if it was faster
	let exists = true;
	try {
		output('gh', ['release', 'view', release.tag, '--json', 'tagName']);
	} catch {
		exists = false;
	}
	if (exists) run('gh', ['release', 'edit', release.tag, ...options]);
	else run('gh', ['release', 'create', release.tag, '--verify-tag', ...options]);
}
console.log(`\nReleased: ${releases.map((r) => r.title).join(', ')}`);

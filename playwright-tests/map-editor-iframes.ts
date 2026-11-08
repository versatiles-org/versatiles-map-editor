import { expect, test } from './lib/test.js';
import { trackServerRequests, waitForMapIsReady } from './lib/utils.js';

test.use({ viewport: { width: 903, height: 903 }, deviceScaleFactor: 1 });

test('works in iframe1', { tag: '@cross-browser' }, async ({ page }) => {
	const tracker = await trackServerRequests(page);

	await page.goto('/iframe-test/');
	await waitForMapIsReady(page, { count: 3 });

	expect(tracker()).toStrictEqual([
		'assets/glyphs/noto_sans_regular/0-255.pbf',
		'assets/glyphs/noto_sans_regular/0-255.pbf',
		'assets/glyphs/noto_sans_regular/0-255.pbf',
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'assets/sprites/base.png',
		'assets/sprites/base.png',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.png',
		'assets/sprites/extras.png',
		'assets/sprites/extras.png',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.png',
		'assets/sprites/icons.png',
		'assets/sprites/icons.png',
		'assets/sprites/index.json',
		'assets/sprites/index.json',
		'assets/sprites/index.json',
		'tiles/landcover-vector/10/549/335',
		'tiles/landcover-vector/10/549/335',
		'tiles/landcover-vector/10/549/335',
		'tiles/landcover-vector/10/549/335',
		'tiles/landcover-vector/10/550/335',
		'tiles/landcover-vector/10/550/335',
		'tiles/landcover-vector/10/550/335',
		'tiles/landcover-vector/10/550/335',
		'tiles/landcover-vector/tiles.json',
		'tiles/landcover-vector/tiles.json',
		'tiles/landcover-vector/tiles.json',
		'tiles/osm-vector/12/2199/1343',
		'tiles/osm-vector/12/2199/1343',
		'tiles/osm-vector/12/2200/1343',
		'tiles/osm-vector/12/2200/1343',
		'tiles/osm-vector/13/4399/2686',
		'tiles/osm-vector/13/4399/2687',
		'tiles/osm-vector/13/4400/2686',
		'tiles/osm-vector/13/4400/2687',
		'tiles/osm-vector/tiles.json',
		'tiles/osm-vector/tiles.json',
		'tiles/osm-vector/tiles.json'
	]);
});

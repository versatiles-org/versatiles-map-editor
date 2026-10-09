# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0-rc.1] - 2026-10-09

### Breaking Changes

- store the background map as its settings, from which the editor builds the map ([1bef4de](https://github.com/versatiles-org/versatiles-map-editor/commit/1bef4de63fb11b7ffac1de9c8164cc844534d1ec))
- let authors decide whether visitors can pan and zoom, and rotate and tilt only if switched on ([9550ad4](https://github.com/versatiles-org/versatiles-map-editor/commit/9550ad42c2d990b861dc0fe7be0bb22b60709460))
- store the settings of a frame as key/value pairs in links, so settings can be added ([77aac0e](https://github.com/versatiles-org/versatiles-map-editor/commit/77aac0eb04727bb1c5dd0a3045a048c5bac4b1fd))
- leave the wheel to the page around an embedded map, unless its author sets it free ([330afaa](https://github.com/versatiles-org/versatiles-map-editor/commit/330afaa3fe62beae91aa1b1e7353651d0fd30686))
- give the navigation buttons of a shared map a section of their own, with one place for all ([81a6a6a](https://github.com/versatiles-org/versatiles-map-editor/commit/81a6a6a3202928be0e833a0c371a2a0be2a663ee))
- write keys, element types and the version as Exp-Golomb codes, and end the elements explicitly so a cut-off link is refused ([430072a](https://github.com/versatiles-org/versatiles-map-editor/commit/430072a3f00241826cf15592b1d58da25c8d798f))
- store the popup of an element in a list of its fields, so elements can get fields later ([a1d7c70](https://github.com/versatiles-org/versatiles-map-editor/commit/a1d7c70975f7ee5ff2e7330a03c8241e787636ce))
- give only black and white a short code in the palette of a link, and move the color schemes to the editor ([b55d15c](https://github.com/versatiles-org/versatiles-map-editor/commit/b55d15c392a91f89ac22ead2a0762781a7b63127))
- give the tilt of a frame 7 bits and write the label density of the background as a varint, so both can grow ([8887e42](https://github.com/versatiles-org/versatiles-map-editor/commit/8887e42b8cc25516e64cd7c27c3e331c4c596224))
- rename strokeStyle of polygons, circles and legend entries to outlineStyle ([d60d6d4](https://github.com/versatiles-org/versatiles-map-editor/commit/d60d6d45b8e3dba060da4597a56f1fc2152eb2b8))
- rename the font of a marker's label to labelFont ([dffadaf](https://github.com/versatiles-org/versatiles-map-editor/commit/dffadaf80a21e1bb3c1d663aa8736997c11f404a))
- rename the viewer's zoom setting to zoomButtons ([1b8cfb9](https://github.com/versatiles-org/versatiles-map-editor/commit/1b8cfb9468044976a4787a9ea9365a7cdf8bf8f2))
- move the labels of the background over the elements from meta.labels.mapOnTop to meta.background.labelsOnTop ([57ce23a](https://github.com/versatiles-org/versatiles-map-editor/commit/57ce23a3ad18e359618be6ab0fdc62427e67fc28))
- rename STROKE_STYLE_NAMES to DASH_NAMES, FILL_DEFAULTS to AREA_DEFAULTS and SYMBOL_DEFAULTS to MARKER_DEFAULTS ([27175db](https://github.com/versatiles-org/versatiles-map-editor/commit/27175db66a50fde9a4a000c0d54b7399275133cf))
- move what visitors can do (pan, zoom, rotate, tilt, confine, zoom limits, scroll protection) from the frame to the viewer settings ([34eb0c0](https://github.com/versatiles-org/versatiles-map-editor/commit/34eb0c0694ede178c0289616ccc7052ddb6a06d8))
- make the pin the default symbol of a marker, so new markers cost a link nothing ([e454b1a](https://github.com/versatiles-org/versatiles-map-editor/commit/e454b1a2b516f970ae80d5adb85fdebf579fe3f1))
- make the default fill of an area translucent ([3b189db](https://github.com/versatiles-org/versatiles-map-editor/commit/3b189db50c7e46f1f83ef4a3d48fa1b8e5a0983a))
- read the values of a map state only with the types of its schema, e.g. no numbers or flags as text ([64e7adc](https://github.com/versatiles-org/versatiles-map-editor/commit/64e7adcc7bb6ab454380c74d777e51e779ada8a8))
- keep the rotation of a symbol above -180° and up to 180°, like the rotation of the map ([cd387df](https://github.com/versatiles-org/versatiles-map-editor/commit/cd387dfac25aea272962bb74a606ebc61b08aa07))
- give lines and outlines their own defaults, so a line has no visibility and GeoJSON cannot hide one ([9cf3784](https://github.com/versatiles-org/versatiles-map-editor/commit/9cf37847034ad6f7cbfa07f939f22e1054606b3d))
- tell the format version of a .mapjson file in a field "version", not by the name of its schema ([e7be279](https://github.com/versatiles-org/versatiles-map-editor/commit/e7be279faa6f3bd6e43dadc728a289d80891975d))
- remove the ids of the editor's color schemes from the words that the string coder knows ([0093113](https://github.com/versatiles-org/versatiles-map-editor/commit/0093113c398b8158924c4fa2668694aec5e886f2))
- write a small size as the smallest one instead of 0, which a link no longer has ([a31c5a3](https://github.com/versatiles-org/versatiles-map-editor/commit/a31c5a384bc289b1307d952c267e548a74be983a))
- leave out the fields of a style that have their default, in files and links alike, so a map has one form ([d06ee4c](https://github.com/versatiles-org/versatiles-map-editor/commit/d06ee4cc5629bfb5763ed00b33717d239b6846f1))
- refuse links that the writer never writes, e.g. padded numbers, repeated keys and values beyond their range, instead of repairing them ([1ef41ee](https://github.com/versatiles-org/versatiles-map-editor/commit/1ef41eea8031f6bdde7a0c9b9c88558306579c96))
- give every number of a map an upper limit, which files and the writer keep and the reader of links checks ([a101c24](https://github.com/versatiles-org/versatiles-map-editor/commit/a101c24d46f8486f79f4ebb0c6406254ee3a4171))
- export the sanitizers of a state, a style and a legend instead of the internal helpers behind them ([923cdac](https://github.com/versatiles-org/versatiles-map-editor/commit/923cdac4d4493f2399d39a1a5cc3207a8a01389f))
- add the sheet "extras:" to the words that the string coder knows ([51aff63](https://github.com/versatiles-org/versatiles-map-editor/commit/51aff631c808ed889a5bd04a79f06d22e9fe55ad))

### Features

- **arrow-heads:** enhance arrow direction handling with zoom levels and add headDirection function ([e90b273](https://github.com/versatiles-org/versatiles-map-editor/commit/e90b2737f7e732f99b83efcc9d3692466dde03b6))
- **arrow-heads:** enhance chevron arrowhead handling with dynamic sizing and thickness adjustments ([f2b840f](https://github.com/versatiles-org/versatiles-map-editor/commit/f2b840fa19ad0a342828ce2cbd77063539f98c08))
- **arrow-heads:** enhance headDirection logic for sharper bends and hooks ([20ca235](https://github.com/versatiles-org/versatiles-map-editor/commit/20ca23571172676b1b5f95101384595cb9b27345))
- **format:** turn the frame into an object with bounds, bearing, pitch and locks for the viewer ([869630e](https://github.com/versatiles-org/versatiles-map-editor/commit/869630ed752b318100066de72c70255eab457b50))
- **viewer:** open a shared map at the rotation and tilt of its frame ([52fd00c](https://github.com/versatiles-org/versatiles-map-editor/commit/52fd00cf381ab2549b266f66116ffef52a2e921d))
- **viewer:** let visitors rotate and tilt the map, with a compass back to the start and locks from the frame ([018b803](https://github.com/versatiles-org/versatiles-map-editor/commit/018b803af947582524a8945c19e4abbbc6f113f1))
- **editor:** set the rotation and tilt of a shared map in the visible area mode, with a live preview ([d6e9efc](https://github.com/versatiles-org/versatiles-map-editor/commit/d6e9efcce9d29beeb3b1e5fb2cfa727b02f22ceb))
- **format:** keep in the view whether the author can turn the editor's map, and how it is turned ([85ce3e7](https://github.com/versatiles-org/versatiles-map-editor/commit/85ce3e7e12b9200c51648bf31d6f5562057c7cf5))
- **editor:** let the author rotate and tilt the map while editing, with a switch that is kept with the view ([105202f](https://github.com/versatiles-org/versatiles-map-editor/commit/105202fdf3a07cce03f33b1342c711c202786754))
- **editor:** turn the shared map by hand while editing the visible area, if the author can turn the map ([1baffe5](https://github.com/versatiles-org/versatiles-map-editor/commit/1baffe519f1fc8618d2f756877fb88d76c1735a0))
- **markers:** lay a marker flat on the map, its symbol and its label, so it turns and tilts with the map ([0697b25](https://github.com/versatiles-org/versatiles-map-editor/commit/0697b25c255d2a00bc993793e58638c6028b0b6b))
- **background:** shade the relief and raise the terrain of the background map, close #37 ([59dd985](https://github.com/versatiles-org/versatiles-map-editor/commit/59dd985d5deeaf23a0d78a3e3deeb11af83f95d8))
- **background:** raise the buildings of the vector map to their heights, close #38 ([68f153d](https://github.com/versatiles-org/versatiles-map-editor/commit/68f153d9564bf1870371c73d0665d8609e1a2c35))
- **release:** implement support for release candidates in versioning and publishing ([a53c830](https://github.com/versatiles-org/versatiles-map-editor/commit/a53c83034d0e8a6455394796a3081bf31e13e8cc))
- **format:** store the background map as bits in links, instead of as text ([9e77da7](https://github.com/versatiles-org/versatiles-map-editor/commit/9e77da74cb23090d74744f82ee616a1865ba9be9))
- **format:** prime the string coder with options of the background instead of its former JSON ([4494f79](https://github.com/versatiles-org/versatiles-map-editor/commit/4494f79acb922827bcc26a63ed697f0f0dc3e7f0))
- **editor:** edit the shared map in a panel of the sidebar instead of a bar on the map ([6cee47b](https://github.com/versatiles-org/versatiles-map-editor/commit/6cee47b6a57d14cd2ae47b9d947a53375debeb03))
- **share:** set the controls of shared maps in the sidebar panel only, the share dialog leads there ([b8d7ebb](https://github.com/versatiles-org/versatiles-map-editor/commit/b8d7ebb9e687626154fb419ae2e1893de0b497a3))
- **editor:** show the controls on the map as visitors see them while the shared map is edited ([b399692](https://github.com/versatiles-org/versatiles-map-editor/commit/b3996929ed594565fb56b6c2eb9740997c57d829))
- **editor:** show all elements when a map is opened, instead of where its author looked last ([cb7d887](https://github.com/versatiles-org/versatiles-map-editor/commit/cb7d88723d7ec39b923784364a83b1bce43717ad))
- **editor:** add a button and the key 0 that show all elements ([664ac45](https://github.com/versatiles-org/versatiles-map-editor/commit/664ac45d80c73fb59c1b0ad238142aa4d386c251))
- **editor:** rotate and tilt the map at any time, with a compass that is faded while it is not turned ([786215d](https://github.com/versatiles-org/versatiles-map-editor/commit/786215d2c8c8bf7f4abe67f222e1bc8c2852bccd))
- **format:** remove the editor's view from maps, which the editor keeps with its session instead ([1180c50](https://github.com/versatiles-org/versatiles-map-editor/commit/1180c5011b31137f31debe7a84721224dbcc3645))
- **map:** update Berlin low-emission zone map with new polygon points and improved styling ([c014044](https://github.com/versatiles-org/versatiles-map-editor/commit/c0140447591b3b37ad23a79f54ddf6b0f2c04879))
- **format:** keep all coordinates on a grid of 5 decimal places, in the editor and in .mapjson files ([1aaccb7](https://github.com/versatiles-org/versatiles-map-editor/commit/1aaccb7fda539169d17b756ae7059824ef539bc8))
- **editor:** keep the editor's controls at places of its own, whatever the shared map says ([55d99d5](https://github.com/versatiles-org/versatiles-map-editor/commit/55d99d56a4da2fcc47e0d384276fede15b6df8ea))
- **share:** run the accuracy slider like a quality slider from low to exact, and show the length of the link ([89dd73e](https://github.com/versatiles-org/versatiles-map-editor/commit/89dd73e7b90db40838c9c36a69de8f1aec6b580b))
- **map-state:** measure where the bits of a link go, with measureLink and measureState ([f43551b](https://github.com/versatiles-org/versatiles-map-editor/commit/f43551b7bda7e46cd0dbf31c83b656737c66c249))
- **share:** show what the link holds, as the shares of its texts, geometry, styles and settings ([b511067](https://github.com/versatiles-org/versatiles-map-editor/commit/b5110673af069e5a05cae89443ae26819ef3d5b5))
- **format:** write color and string indexes of links as Exp-Golomb codes, which are shorter ([9d599d9](https://github.com/versatiles-org/versatiles-map-editor/commit/9d599d95270ffa2e7e892688830ffb61836e9021))
- **share-dialog:** add warning for links exceeding 2000 characters and suggestions for shortening ([c676a06](https://github.com/versatiles-org/versatiles-map-editor/commit/c676a06bbed9943a18aacda4aeb44a3f0b70f693))
- **share:** put the link first in the share dialog, with each warning next to what it is about ([1deca1f](https://github.com/versatiles-org/versatiles-map-editor/commit/1deca1f82ead89fb6178a03927babceaaba3daf8))
- **viewer:** add an optional button that shows a shared map as it opened ([a69b1d7](https://github.com/versatiles-org/versatiles-map-editor/commit/a69b1d757f4cc376a13935cb8e650f5bead373a7))
- **viewer:** let authors keep visitors in the area that a shared map shows when it opens ([a6bbe87](https://github.com/versatiles-org/versatiles-map-editor/commit/a6bbe87c06a0fc873019a4cad50376448ac9c15c))
- **viewer:** let authors limit how far visitors of a shared map can zoom out and in ([ec0d493](https://github.com/versatiles-org/versatiles-map-editor/commit/ec0d49335ce203449463a195b971b1282f6b8324))
- **viewer:** let authors leave the wheel to the page around a shared map ([75e37a4](https://github.com/versatiles-org/versatiles-map-editor/commit/75e37a42f175a8ab4f4e27860b911f6f145168a9))
- **viewer:** add an optional fullscreen button, with the permission for it in the embed code ([80d19f8](https://github.com/versatiles-org/versatiles-map-editor/commit/80d19f8237e8b2d5c55814bb25fa0a588a84e0c8))
- **viewer:** add an optional scale bar to shared maps ([6a75a60](https://github.com/versatiles-org/versatiles-map-editor/commit/6a75a602a460c6eb9ae3ed7c2320a1a6bd22fde9))
- **viewer:** add an optional button that shows where the visitor is and follows them ([1784ef3](https://github.com/versatiles-org/versatiles-map-editor/commit/1784ef363084c78aba40445e18b339291e7476d4))
- **share:** leave the title, the color scheme and a hidden legend out of links, which are for viewing ([94a48b2](https://github.com/versatiles-org/versatiles-map-editor/commit/94a48b26e922fd0b20d165784fb303eb85a14040))
- **labels:** let the label of a marker have several lines, which only its author breaks ([70b7782](https://github.com/versatiles-org/versatiles-map-editor/commit/70b77822408e9529670f87135db184337d861ce4))
- **tools:** show what a link holds with analyse-bits --content, and move the script to the repository ([2f692af](https://github.com/versatiles-org/versatiles-map-editor/commit/2f692af96a5d4564e0e6a306d4bd90a72cabf98a))
- **map-state:** tell which values of a .mapjson file were left out or corrected, and warn about them when a file is opened ([4dfb0c8](https://github.com/versatiles-org/versatiles-map-editor/commit/4dfb0c8a7f162b231a0cc3cddc34080fce5d16d8))
- **map-state:** tell a link of a newer format version apart from a damaged one, and say that a newer editor made it ([66f1a9f](https://github.com/versatiles-org/versatiles-map-editor/commit/66f1a9f37f64993b91f80b0539f9278f4b877b11))
- **release:** let the version of the package be given, to release it as 1.0.1 for version 1 of the formats ([b0f9546](https://github.com/versatiles-org/versatiles-map-editor/commit/b0f95462aadd5cfeb9d0a2a36ce6e8112feadc7e))

### Bug Fixes

- **config:** set reuseExistingServer to false for consistent server behavior ([d86c280](https://github.com/versatiles-org/versatiles-map-editor/commit/d86c2807c78cc2eea8407b6bc7d8558a074112a4))
- **dependencies:** update @versatiles/style to 6.3.0 and maplibre-gl to 6.13.0 ([8e28ec8](https://github.com/versatiles-org/versatiles-map-editor/commit/8e28ec8aba928ad682631e086d388468513a1f0b))
- **dependencies:** update @versatiles/style to 6.3.1 ([662eb83](https://github.com/versatiles-org/versatiles-map-editor/commit/662eb837001f09c75994f36b650af9356885f382))
- **style:** increase maximum stroke width in StyleStroke component ([c7060fe](https://github.com/versatiles-org/versatiles-map-editor/commit/c7060fe6437027d07d09022be1d2d524ffff6d41))
- **editor:** do not turn the editor's map with two fingers or the keyboard ([7baa5b7](https://github.com/versatiles-org/versatiles-map-editor/commit/7baa5b7e835a46773d9ac0ce923b95da9f92c571))
- **viewer:** keep a turned visible area clear of the legend by its real shape, close #36 ([381aea9](https://github.com/versatiles-org/versatiles-map-editor/commit/381aea90ac0366735e74874282154c503dbbc8d4))
- **scripts:** read and write the frame as an object in the analysis and the London example scripts ([9af6288](https://github.com/versatiles-org/versatiles-map-editor/commit/9af6288568233df19d48a75b62280ba11f60a07e))
- **tests:** update expected stroke width for polygon in color picker test ([d50090e](https://github.com/versatiles-org/versatiles-map-editor/commit/d50090eb595c8242c5a3e8bb37c8c9f11ab67c3e))
- **viewer:** start the attribution as its button where its text would cover the legend ([de88105](https://github.com/versatiles-org/versatiles-map-editor/commit/de8810556097ee5cc240e2009e0959fd3f26af4b))
- **editor:** end the shared map mode when a map is opened or created ([1c701b9](https://github.com/versatiles-org/versatiles-map-editor/commit/1c701b957f80d917035aad199be45f5724e1687b))
- **search:** show the results of the address search in the text color of the theme, also in dark mode ([7af4e21](https://github.com/versatiles-org/versatiles-map-editor/commit/7af4e2171562da31970519963b284be274c6cca1))
- **share:** put the places of the address search and the scale bar below their checkbox ([77cc429](https://github.com/versatiles-org/versatiles-map-editor/commit/77cc429ab8741dba160ac9e6ec8348d9b23b86cf))
- **share:** hide the compass with the zoom buttons, and the editor's own button while the shared map is edited ([cb0d572](https://github.com/versatiles-org/versatiles-map-editor/commit/cb0d5724e6ce298eb72545df65eaf894408da13e))
- **map-state:** write only what the reader reads: sanitize the map, keep rounded coordinates on the map, and refuse numbers that do not fit their bits ([17170ee](https://github.com/versatiles-org/versatiles-map-editor/commit/17170eeed3a62d55805c9597af776d02674d1c30))
- **map-state:** write a .mapjson file as it is read: only valid values, without defaults ([28cf02d](https://github.com/versatiles-org/versatiles-map-editor/commit/28cf02d4284d21b0b9892e9fb693300c60ced5eb))
- **map-state:** read a latitude beyond a pole as the pole, and keep longitudes as they are ([0fba50a](https://github.com/versatiles-org/versatiles-map-editor/commit/0fba50a487ba9b21ee0e171582d476f314ea02cf))
- **map-state:** keep the rotation of a map as it is written, instead of changing its last digits ([03042ba](https://github.com/versatiles-org/versatiles-map-editor/commit/03042bab7837f0da65012a2b58c77416714a7f2c))
- **map-state:** keep of the options of a background only what JSON can hold, so its link can always be read ([b99d307](https://github.com/versatiles-org/versatiles-map-editor/commit/b99d307e3c478cbed20a0db87768b057055714b4))
- **map-state:** make the schema of .mapjson files agree with the reader about label zoom levels, the version and positions ([0c8a82b](https://github.com/versatiles-org/versatiles-map-editor/commit/0c8a82bf2f80f7f547c552b0a739aad2b5fe482b))
- **map-state:** treat line breaks alike in all texts, put the defaults of the frame, the viewer and the legend into the schema, and end the zoom of labels at the largest zoom of a map ([3c3a660](https://github.com/versatiles-org/versatiles-map-editor/commit/3c3a66052ab9e7267f1b2010ae2d8b02099dab29))

### Performance Improvements

- **map-state:** find the symbols of the string coder's contexts by an index and a sum tree, with the same bits, so a text of many different characters decodes fast ([3695707](https://github.com/versatiles-org/versatiles-map-editor/commit/36957072ada9aaff1f494d7e500ea393f527ee3d))

### Code Refactoring

- **map-state:** remove encodeGeoJSON and decodeGeoJSON, and keep helpers of the format internal ([762f8ca](https://github.com/versatiles-org/versatiles-map-editor/commit/762f8caea303b2af8b7b5e63f86aabe9d99beb68))

### Documentation

- update diagramms ([31155b4](https://github.com/versatiles-org/versatiles-map-editor/commit/31155b48f29cdd782d815948ec9b771db07d8b4e))
- update graph ([001983c](https://github.com/versatiles-org/versatiles-map-editor/commit/001983cd56d031e10c41c1426e0b9ed1630d709c))
- describe the background settings in the README and what links round ([508682e](https://github.com/versatiles-org/versatiles-map-editor/commit/508682e257b08d338f4a63e97da2d8fcac353e4d))
- **map-state:** generate the API documentation from the sources and publish it with the editor ([432213a](https://github.com/versatiles-org/versatiles-map-editor/commit/432213af2b2e4d2caf7059644953378d2fa133d9))
- **map-state:** group the exports of the API documentation by what they are for ([98fcbc6](https://github.com/versatiles-org/versatiles-map-editor/commit/98fcbc611f0a2e6fa3661f7fdec6e4b6e45173d2))
- **map-state:** open the API documentation with a guide to what the package is for and what to use ([829c26a](https://github.com/versatiles-org/versatiles-map-editor/commit/829c26a5bc4852e0933d5c9afd5bc03f7c289882))
- **map-state:** explain the categories, show the shape of a map and more examples on the start page ([ca95dd9](https://github.com/versatiles-org/versatiles-map-editor/commit/ca95dd9bef7f8dd9647728b48906af3a53096a2d))
- describe what authors can set for the visitors of a shared map ([e31d529](https://github.com/versatiles-org/versatiles-map-editor/commit/e31d529c8302050253386822cdd85896ac8db175))
- **share:** tell in the share dialog that the map is in the link itself, not on a server ([9ae2530](https://github.com/versatiles-org/versatiles-map-editor/commit/9ae2530eadcd57b69fbb7e5c58155e24c0969d57))
- **examples:** leave the label language of the examples at its default, the language of the reader ([9425eb5](https://github.com/versatiles-org/versatiles-map-editor/commit/9425eb552334967382512066252eeeab6efc080c))
- **map-state:** fix stale comments, name the default background, and let the schema allow what the reader reads (no label of a legend entry, no $schema) ([3fdda59](https://github.com/versatiles-org/versatiles-map-editor/commit/3fdda5981ae8518a7c85b8b318f14aafa5a00663))
- **map-state:** state the compatibility promise of the formats, what may be added without a new version, and its limits ([fbbe264](https://github.com/versatiles-org/versatiles-map-editor/commit/fbbe2642ac982d88871575bcd4c4a3b86ecde2a8))
- update the dependency graph ([c29945c](https://github.com/versatiles-org/versatiles-map-editor/commit/c29945c0a1c2238503f2c2568893c9f460c4fa1b))
- **map-state:** correct comments and texts that would mislead a second implementation of the link format ([31ce204](https://github.com/versatiles-org/versatiles-map-editor/commit/31ce204ef666e2feda9bf8940bf37a4968fda940))

### Tests

- wait for the embedded map itself in the scroll protection test, which raced with the page around it ([983ccb9](https://github.com/versatiles-org/versatiles-map-editor/commit/983ccb9b21f5c640a543990b0de42c7fd34ba9c3))
- **map-state:** freeze sample links and files of version 1, which every later version must still read ([f124688](https://github.com/versatiles-org/versatiles-map-editor/commit/f1246883167ba3fb6a8813ab4c7ecec4f77ae544))
- **map-state:** freeze the tables of version 1 of the formats, which may only grow at their end ([32a1c64](https://github.com/versatiles-org/versatiles-map-editor/commit/32a1c64e7cdcf10c21b800f6616904f6cf0a5f54))

### Chores

- **package:** add the GitHub repository, homepage and issue URLs ([785fa1c](https://github.com/versatiles-org/versatiles-map-editor/commit/785fa1ce4c76d753f901ae1ef1d3d4c465950659))
- remove temporary swap file for berlin low emission zone map ([c64f7f7](https://github.com/versatiles-org/versatiles-map-editor/commit/c64f7f7cb8fecbc2ac461b667994d79fe3fdc90c))

## [3.1.1] - 2026-10-06

### Bug Fixes

- **app:** start also without the slash at the end of the editor's folder, e.g. /editor ([894ff8d](https://github.com/versatiles-org/versatiles-map-editor/commit/894ff8d0eb89032adf52d75bb451b6e6669e1f3a))

## [3.1.0] - 2026-10-06

### Features

- **tests:** introduce PREVIEW_TIMEOUT constant for consistent timeout handling in map preview tests ([52ce55e](https://github.com/versatiles-org/versatiles-map-editor/commit/52ce55eac35c40e6f23326d93e4fd966522b0cb4))
- **release:** enhance release workflow with manual trigger and tag validation ([93756ee](https://github.com/versatiles-org/versatiles-map-editor/commit/93756ee2a54d3a6505b1a6e2ed40f24c8b0345b2))
- **release:** update release process to use custom script for npm releases ([b83e9b9](https://github.com/versatiles-org/versatiles-map-editor/commit/b83e9b91a9f6f3df5541d76b5ba9fa24b4e97b99))
- **config:** resolve relative URLs of the tile server and geocoder against the address of the configuration file ([fbf5fda](https://github.com/versatiles-org/versatiles-map-editor/commit/fbf5fda095c3b9b72395ca95282cc6fb09a79e7f))

### Build System

- **release:** release the editor and @versatiles/map-state automatically, by the conventional commits since their last release ([a1b1ca4](https://github.com/versatiles-org/versatiles-map-editor/commit/a1b1ca45a5bf5a7ce40c2e458b575b01db32ab1c))
- **release:** ask for confirmation before releasing, unless --yes ([fd980b6](https://github.com/versatiles-org/versatiles-map-editor/commit/fd980b67c65356b34696a3eab517ee72384068a0))

## [3.0.0] - 2026-10-06

### Breaking Changes

- offer all symbols of the tile server's sprite sheets, stored by image name, with a map pin for new markers
- replace brightness and contrast of the background map with what black and white become
- store the names of the symbols once, front-coded in the metadata, and reference them by index
- keep the map, its undo history and camera in the browser storage instead of the URL, and open links as new maps
- add the visible area (frame) to the map state, GeoJSON and KML, and give the coordinates in links an origin of their own
- read only the current format: drop the upgrades of older links and files (upgradeState, fill opacity, search flag, legend position and color entries, map-wide label font)
- rename the field map to view, in .mapjson, GeoJSON and KML too
- move the label of a marker from its style onto the element
- rename the style fields rotate to rotation and halo to haloWidth
- group the label settings in meta.labels (overlap, minZoom, mapOnTop)
- rename the legend entry type polygon to area
- a style type per role (marker, line, area, outline), also for legend entries
- number the style keys of the link per role, so they are shorter
- refer to earlier styles per role, counted back among the styles of the role
- code the strings with PPM of order 4, escape method D and update exclusion
- one bit per map whether an element has a popup, instead of one per element

### Features

- add Docker package ecosystem to dependabot configuration
- add StateWriter for encoding state data in base64 and bit string formats
- replace BasicMap component with inline map implementation in MapEditor
- add initial HTML and TypeScript declaration files for app structure
- add npm-check-updates to dependencies and update upgrade script
- add StateRoot and StateElement types for state management
- implement GeoJSON encoding and decoding functions with comprehensive tests
- enhance GeometryManagerInteractive with GeoJSON handling and streamline element management
- persist editor state to the URL hash
- **measurements:** add measurement functionality for geometric elements, close #2
- **editor:** duplicate elements via button, Cmd/Ctrl+D and Alt-drag, ref #7
- **editor:** support touch and pencil, select and delete single nodes, read-only view on small screens, close #15, close #33
- **editor:** custom color picker with a palette of used colors, close #13
- **editor:** popups for all elements, close #6
- **editor:** address search with a shared geocoding module, close #9
- **editor:** select multiple elements with Shift+click, edit their shared style, and move, duplicate and delete them together, close #29, close #7
- **editor:** copy and paste styles, also between element types and onto several elements, close #12
- **editor:** style the background map (base map, theme, font, label language and amount), stored in the map state, close #17
- **editor:** add a legend with colors and colored symbols, positions and layouts, close #11
- **editor:** predefined color schemes in the color picker, including colorblind-safe ones, close #31
- **editor:** color schemes and fonts from an optional configuration file, marker labels in the map font, legend font, close #32
- **editor:** import CSV/TSV files and pasted tables as markers, by coordinates or geocoded addresses, close #16
- **editor:** style imported markers by a category column, with a legend of the categories, close #30
- **viewer:** optional address search in embedded maps, enabled in the share dialog, close #14
- **codec:** store colors in a palette in format version 1 (not written yet), ref #5
- **codec:** styles refer to a similar earlier style and store only the differences, in format version 1 (not written yet), ref #4
- **codec:** format version 1 with coordinates relative to the map center and a global resolution, chosen when sharing; the editor now writes version 1, close #3, close #4, close #5
- **codec:** import and export KML, lossless with ExtendedData, and KML of other tools, close #8
- **editor:** show errors as messages in the page instead of alert(), including invalid links and failed imports
- **editor:** add page title and description, correct plurals, format numbers in the browser's locale, and match the GitHub link label to its text
- **editor:** show a loading indicator until the map and its elements have loaded
- **map-state:** return colors as lowercase hex, import GeoJSON types explicitly, export CODEC_VERSION, rename StateRoot to MapState (deprecated alias), add engines, package.json export and test script
- **editor:** list the elements in the sidebar, so they can be chosen with the keyboard and screen readers
- **editor:** follow the dark mode of the system, and switch off transitions for reduced motion
- **editor:** import tables with addresses spread over several columns (street, house number, postcode, city, country)
- **editor:** undo and redo with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y)
- **editor:** let users choose where the table import prefers places: near the map view, in its region, or anywhere
- **editor:** detect table rows whose search result does not match the address, list them, and let users choose whether to import them
- **editor:** hide and show the sidebar with a tab at its edge, keeping the map content in place
- **editor:** add a top bar with a ☰ menu, undo/redo and Share, and move the file, import/export and help commands out of the sidebar
- **editor:** draw elements with tools in a rail at the left: click to place markers and nodes, double-click or Enter to finish, drag for circles
- **editor:** show the map settings, the legend or the selected elements in the sidebar, select the legend with a click on the map, and float the actions of the selection next to it
- **editor:** list the elements in a drawer at the left, opened from the tool rail or with E, with the map and the legend at the top
- **editor:** show the address search on the map at the top left, like in the viewer, instead of in the sidebar
- **editor:** explain the tool and the selection in a status line at the bottom, with the zoom and the mouse position, and list all keyboard shortcuts in a dialog (? or the menu)
- **editor:** choose few options with buttons, patterns and dashes with pictures, positions in a grid, and show the values of sliders
- **editor:** show the satellite imagery without streets and labels, with a switch in the background settings
- **tests:** add example maps and corresponding tests for validation
- **editor:** open the color picker as a popup next to the sidebar, which stays in the viewport, can be moved by its title bar, and opens where it was moved to
- **editor:** choose the font of the map labels as a family and a style (e.g. bold or condensed), from all faces of the tile server
- **editor:** change the saturation, brightness and contrast of the vector map and of the satellite imagery
- **editor:** give the label of a marker a text color and a halo color, stored in links, GeoJSON and KML
- **editor:** show the value of each slider in a number field, where an exact value can be typed
- **editor:** give the labels of all markers one font, which can differ from the font of the background map
- **editor:** show the symbols in a scrollable grid of at most 16 columns, with a filter by title, alias and name
- **editor:** ensure streets and labels inherit colors from the imagery
- **editor:** show or hide the streets and the labels of the satellite map independently
- **editor:** set the size and the halo width of the labels of the background map
- **editor:** name the vector base map "OpenStreetMap"
- keep the legend in its corner, and move the search and the attribution to the other side
- add a viewer page at /view, which shows the map read-only
- share and embed maps with the viewer page, and show the editor also in iframes
- **editor:** optionally draw the labels of the background map over areas and lines, with the labels of markers always on top
- **editor:** add a store for maps in the browser storage, with their undo history and camera
- **editor:** let each tab edit its own map, with locks, a reload keeping the tab's map and duplicated tabs getting a copy
- **editor:** give maps an optional title, for the page title, file names, the viewer and the list of maps
- **editor:** add "Recent maps" to the menu, open files and new maps as new maps, and show in the status line whether the map is saved
- **editor:** take the colors of the VersaTiles logo and website and the system font, as the tokens of the new design
- **editor:** give all fields, checkboxes and sliders the design's style, and every control one focus ring
- **editor:** give buttons the variants of the design (primary, secondary, ghost, danger, link) and two sizes, instead of hand-made ones
- **editor:** give icon buttons four sizes, a chosen state and a floating style, and use them for the tools, every close button and deleting nodes
- **editor:** show the chosen option of switches solid, and chosen pictures and colors with a ring, and use the switch for the aspect ratio of the share preview
- **editor:** show hover, keyboard focus and selection of menus and lists in one way: a gray tint, the ring and the accent tint
- **editor:** give dialogs, popups, messages, bars and panels the corners, shadows and backgrounds of the design, and the top bar the line of versatiles.org
- **editor:** put all font sizes and spacing on the scales of the design, drop the old variable names, and let stylelint keep sizes, corners and colors to the tokens
- **editor:** show the VersaTiles logo in front of the name in the top bar
- **editor:** keep the visible area of a map in its history, show it (else the elements) when a shared map opens, merge it on import, and leave the camera out of share links
- **viewer:** show the visible area again when the size of the viewer changes, until the visitor moves the map
- **editor:** add the mode for editing the visible area, which shows a veil outside the frame and its border, or the bounds of the elements
- **editor:** add 8 handles to the visible area, which move its sides with one undo step per drag
- **editor:** add the bar of the visible area (its size, Use current view, Fit to elements, Done) and open it from the menu and the Map panel
- **editor:** warn in the share dialog about elements outside the visible area and about an empty map, edit the visible area from there, and take the precision from it
- **editor:** move the sides of the visible area with Shift and the arrow keys, inwards with Alt too, one undo step per key
- **editor:** lay out the share dialog like the inspector: the preview with its toolbar at the left, sections for the visible area, the link, the embed code and the options at the right
- **editor:** show the colors of the color picker over a checkerboard, so an opacity is seen, and show the whole value with its alpha
- **editor:** let a slider show a track of its own, e.g. the colors of a channel over a checkerboard, and compute the tracks of the color channels
- **editor:** redesign the color picker: old and new color, RGB or HSV sliders with an opacity, the hex value with its alpha, and the palettes; remove the saturation and brightness field
- **editor:** fade a marker's symbol and label together with their halo when their color has an opacity, also in the legend
- make the opacity of a fill the alpha of its color, and remove the fill's Opacity setting; older links, sessions and files are read with it as the alpha
- **editor:** implement theme-based color handling for editor marks and enhance style functions
- **viewer:** show the text of each legend entry in the color of its symbol or swatch, light colors in the darker shade of the outline
- **background:** let black become −100 % to 100 % and white 0 % to 200 %, for more contrast; the imagery gets it from its raster contrast
- **legend:** let the texts of the legend be bold and italic
- **editor:** show buttons for zooming in the top right corner of the map, or the bottom right one if the legend is at the top or at the right
- **editor:** move elements to the front or the back, or one step, from the menu, the selection bar or with Cmd/Ctrl+↑/↓, and list the element in front first
- **map-state:** store what the viewer shows and where (search, zoom buttons, legend) in meta.viewer, reading the search and the legend position of older links and files into it
- **viewer:** show the search, the zoom buttons and the legend where the map sets them, stacked in their corners, with the attribution in a free bottom corner
- **share:** set the address search, the zoom buttons and the legend of shared maps in a Controls section of the Share dialog, each at a place or off
- **editor:** show the editor in fullscreen with F or from the menu
- **editor:** preview the map as visitors see it, over the editor, with the Preview button of the top bar
- **background:** move black and white together while their sliders move, where the satellite imagery needs it, with a hint
- **editor:** add elements to the selection on the map with Cmd/Ctrl-click instead of Shift-click, and zoom to a box with Shift-drag again
- **map:** draw each element at its place in the drawing order, also across kinds, e.g. an area over a marker, with as few layers as that needs
- **editor:** select in the list of elements like in lists of files: Shift for a range, Cmd/Ctrl to add or remove one, Cmd/Ctrl+A for all
- **editor:** drag elements in the list of elements to change the drawing order
- **examples:** add the 557 pharmacies of Inner London from OpenStreetMap, a map with many markers and labels
- **markers:** per-map settings for the labels of markers: hide those that would overlap, and show them from a zoom level
- **markers:** set the zoom level from which marker labels are shown with one decimal place, with a slider and a button for the current zoom
- **editor:** group the controls of the sidebar in clearly titled and separated sections: map, background map, colors and labels, marker labels, legend; symbol, label and halo of markers; style and entries of the legend
- **editor:** replace all form controls with components of our own (TextField, TextArea, Select, Checkbox) in one consistent look with the buttons, and larger checkboxes
- **map-state:** mark .mapjson files with the URL of the schema of their format version, read older ones upgraded and refuse newer ones
- **map-state:** generate the JSON Schema of .mapjson files from the types, with descriptions, units, ranges and defaults, and test that it fits the types and the examples
- **editor:** name the preview button "Editor", with a pencil, while the preview is shown
- **legend:** set where shared maps show the legend in its panel too, the same setting as in Share
- **legend:** rearrange the entries by dragging their handle, with the mouse or a finger, or with Move up and Move down buttons
- **map-state:** legend entries like elements, a marker, line or polygon with the style of an element, and read older entries as markers and areas
- **legend:** draw entries as small markers, lines and areas like on the map, and edit their style in the panel with the controls of elements
- **legend:** add the look of the selected elements to the legend, one entry per style, with their label or popup text
- **legend:** paste the style copied from an element onto a legend entry, which takes the type of that element
- **legend:** take the style of an element for a legend entry with a pipette: a click on the element on the map, Escape cancels
- **map-state:** round the coordinates of links to steps of 0.00001° × 2^n, n in 4 bits from about 1 m to 36 km, and offer all 16 steps in the share dialog
- **share:** choose the precision of a shared map with a slider from 1 m to 36 km, with "Automatic" as a checkbox
- **map-state:** add a script that shows where the bits of an encoded map go, as a tree of the read calls with their bits
- **map-state:** store the title, labels, legend labels and popups of a link once, in a string table after the palette, and refer to them with 1 bit for the next new string, else by index
- **map-state:** code the string table of a link with an adaptive order-2 model and an arithmetic coder, so links are 8–64 % shorter and text in any script costs 2.5–12 bits per character
- **map-state:** store an element that repeats the type and styles of the one before with 1 bit, and the label of an element apart from its style, so links of many similar markers are about 15 % shorter
- **map-state:** store the background, color scheme and label font of a link in the string table, so small maps are 3–15 % shorter
- **map-state:** store the coordinates of elements in an Exp-Golomb code whose order the writer chooses per map, so links are 1–7 % shorter
- **map-state:** code the background, color scheme and label font of a link with a model that learned the vocabulary of the format before, so small maps are 8–12 % shorter
- **map-state:** store the points of markers and circles as differences to the point before when that is shorter, so links of many markers are about 4 % shorter
- **map-state:** store the names of symbols as words of the format in the string table, in a section with references of its own, so links with symbols are 1–3 % shorter
- **map-state:** store the colors of the built-in color schemes in a palette as their index, with the schemes moved into the codec package, so small maps are about 1–2 % shorter
- **map-state:** leave out the length of the string block, which the decoder knows from the shifts of its interval, so every link with strings is 3 characters shorter
- **map-state:** store style references in an Exp-Golomb code, 1 bit for none and 3 for the latest style, so links with styles are up to 1 % shorter
- **map-state:** add --summary and --json to analyse-bits, a line per map with the shares of strings, coordinates, styles and the other kinds, and both as JSON for diffs
- **map-state:** show each string of the string table with its bits in analyse-bits, grouped by section, from the bits per string that the decoder now reports
- **map-state:** measure links in analyse-bits at the precision of the share dialog by default, with its rule moved into the codec as resolutionForArea
- **map-state:** give longitude and latitude an Exp-Golomb order each when that is shorter, e.g. for markers sorted by latitude, so such links are about 8 % shorter
- **element-list:** show markers without symbol as a letter "A" in the color of their label, also in the header of the inspector
- **background:** offer the dark theme of each color preset as "Mode: Light / Dark", and name the "toner" theme "Toner" instead of "Black & white"
- **share:** set the precision automatically to a thousandth of the larger side of the shared area and end the slider at a hundredth, with the view of the editor for a single point or an empty map
- **inspector:** set the radius or the area of circles by typing it with a unit, also for several circles at once
- **marker:** give the label a size of its own (labelSize, style key 16 after the new extended key 14), with label offsets that follow the size of the symbol; hide color, size and rotation of markers without symbol, and migrate the examples
- **marker:** give each label a font of its own (style key 17), instead of one font for the labels of all markers; older maps give their label font to their markers, and the examples are migrated
- **marker:** place labels also at the corners of their symbol (align 5–8), try the corners after the sides with "Auto", and put the label of a marker without symbol on the point ("Center")
- **legend:** show the entries of the legend in the sidebar closed, as a line with their look and text, and open one to edit it; a new entry opens, and a click on an entry of the legend on the map opens it
- **legend:** add a theme for the background and border of the legend: light (default), dark or glass (blurred over the map)
- **legend:** let legend entries follow when their elements change their style, in the same undo step, and point out entries whose style no element has, or whose text an element has with another style
- **legend:** update glass theme colors for improved visibility
- **background:** add "Borders" for the satellite map, hide the symbols of points of interest with the streets, and keep the streets and borders of the vector map when switching from the satellite map
- **color-picker:** offer every used color, also of labels, halos and the legend; a new legend entry still takes the color of a symbol, an area or a line
- **menu:** open the example maps from the menu (☰ → Open example), encoded as links without their view when the editor is built
- **menu:** open the groups of the menu as submenus beside it, like the menus of an operating system, by hover, click and keyboard
- **map-state:** encode the style keys in an Exp-Golomb code, the most frequent ones shortest
- **map-state:** add arrowheads of lines to the format (arrowStart, arrowEnd, arrowSize)
- **rendering:** draw the arrowheads of lines as SDF images
- **inspector:** choose the arrowheads of lines, swap them, and set their size
- **legend:** draw the arrowheads of lines in the legend, and edit them in its entries
- **inspector:** reverse lines, so their arrowheads point the other way
- **examples:** add Napoleon's Russian campaign of 1812, with arrowheads, and test how arrowheads are drawn
- **dependabot:** add ignore rule for typescript dependency updates
- **geometry:** compute smooth curves through the nodes of lines and polygons
- **map-state:** add smooth lines and polygons to the format
- **elements:** draw smooth lines and polygons as curves, and measure them along the curve
- **elements:** put the handles for new nodes of smooth lines and polygons on the curve
- **inspector:** make lines and polygons smooth in a new section "Shape", with "Reverse line"
- **examples:** draw the lines of Napoleon's Russian campaign smooth, and test how smooth lines are drawn and edited
- **background:** dim the borders and motorways over the satellite imagery with line-layer-opacity
- **config:** read map-editor.config.jsonc, with comments, and check each field on its own
- **config:** set the tile server and the geocoder in the configuration, for the editor and the viewer
- **config:** set the start view, the starting background, the label language and the default color scheme of new maps
- **hosting:** serve the viewer at view/ and support hosting in a subfolder
- **release:** version the editor (1.0.0) and publish its build as a ZIP archive on editor-v tags
- **inspector:** show readable names in the dash and pattern pickers
- add the dash styles long-dash and dash-dot
- **rendering:** draw fill patterns with a scale and an exact coverage
- **map-state:** eight fill patterns by direction, with a size and a coverage
- **inspector:** sliders for the size and the coverage of a fill pattern
- **ui:** a drop-down list with pictures for the fill pattern
- add the fill pattern diagonal-dots
- publish the .mapjson schema at versatiles.org/versatiles-map-editor/schema/
- allow unknown fields in .mapjson files, and warn about them when opening a file
- **background:** show the landcover of low zoom levels, unless the configuration turns it off

### Bug Fixes

- update Dockerfile to use Playwright base image and remove unnecessary dependencies
- update test configuration to include coverage settings and environment
- set worker URL for maplibre-gl in MapEditor and configure worker format in Vite
- change Playwright job to run on macOS for WebGL context compatibility
- **docker:** restore xvfb startup script and derive Playwright image version from package
- **map_layer:** apply falsy style values in setState
- **codec:** sanitize imported GeoJSON style properties
- **codec:** clamp viewport radius to the encodable range
- **codec:** reject unknown element keys and harden GeoJSON import
- **editor:** handle invalid URL hashes and unreadable files gracefully
- **selection:** ignore mousedown when no selection node feature is found
- **map_layer:** unregister map listeners and remove pattern images on destroy
- **history:** skip duplicate entries and do not mutate the pushed state
- **editor:** record style changes in history on change instead of input
- **editor:** record adding an element as an undo step
- **symbol-selector:** guard missing sprite images, drop duplicate action, close on select
- **symbols:** use the "base" sprite of @versatiles/style 6
- **a11y:** unique form control ids, valid input type, no label around buttons
- **MapEditor:** remove hashchange listener and map on destroy
- **geometry_manager:** stop loading the style after destroy
- **geometry_manager:** wait for style.load instead of polling isStyleLoaded
- **editor:** write the URL hash immediately and throttle bursts instead of debouncing
- **editor:** write the URL hash again after the loaded elements appear
- **editor:** show the small-screen hint at the top, so it does not cover the attribution, ref #15
- **editor:** change the background map style with a diff where possible, so no images go missing, ref #17
- **viewer:** stack the search and the small-screen hint, and place a legend at the top below them, ref #11
- **search:** Enter searches at once and goes to the first result, also before the suggestions arrive, ref #9
- **editor:** keep the viewport within the latitudes of the map, so maps near a pole keep their elements
- **editor:** do not write the URL while a map is loading, so a slow network cannot drop its elements
- **editor:** "New" and "Open…" can be undone and are kept in the URL, and "Open…" asks before replacing the map
- **editor:** a newer map state replaces an older one that is still loading, without leaving layers behind
- **editor:** closing a dialog with Escape cancels it, e.g. a running table import
- **editor:** Delete, Backspace and the other element shortcuts do nothing in sliders and open dialogs
- **codec:** encode varints arithmetically instead of with 32-bit bit operators, so large values are not corrupted
- **editor:** draw marker labels as literal text, so "{…}" is not replaced by feature properties
- handle very long strings, large tables and many KML placemarks without a stack overflow, and keep invalid XML character references as text
- **a11y:** hide the content of collapsed sidebar panels from the keyboard and screen readers, and mark panels as expanded or disabled
- **a11y:** readable contrast for buttons, disabled states, hints and focus rings, and larger text in the sidebar and share dialog
- **a11y:** name every dialog, label its close button, focus its first control, and make the preview aspect ratios reachable by keyboard
- **a11y:** announce the state of the address search and copying the share link to screen readers
- **editor:** keep error messages until they are dismissed
- **editor:** keep all controls of the share dialog reachable on small screens
- **xml:** implement walk function for non-recursive traversal and optimize text and descendants functions
- **map-state:** keep the transparency of marker and line colors when reading KML of other tools
- **map-state:** store no metadata if none of its fields has a value, and read empty metadata as none
- **editor:** lines cannot be hidden, also not by a link or file with "visible: false"
- **editor:** list each color of the palette at its newest element, as described
- **editor:** undo and redo do nothing when there is no step to undo or redo
- **editor:** download the map as map.mapjson, like the other exports
- **editor:** number the rows that cannot be imported like the spreadsheet, counting the header and empty rows
- **editor:** name the action on the buttons that confirm a new or opened map, and say that it replaces the current map
- **editor:** keep parentheses that belong to a URL in popup texts, e.g. Wikipedia links
- **editor:** find the country of the time zone with Intl.Locale#getTimeZones instead of a hard-coded, partly broken table
- **map-state:** skip a GeoJSON circle without a positive radius instead of turning it into a default marker
- **editor:** keep house numbers and postcodes that the geocoder sends as numbers in search results
- **location:** update timeZoneCountry tests and refine getCountryBoundingBox logic for EU and US
- **editor:** drop the colons from labels and write the search error as two sentences
- **editor:** stack the menu, panels, bars and messages in one defined order, so the menu is not hidden behind the tools, and test that nothing covers them
- **editor:** scroll only where content needs it: no sideways scrolling of dialogs, the table import and the symbol picker, no needless scrollbar in the sidebar; let Escape close the share dialog; and test it
- **editor:** show the popup text without its Markdown in the inspector's subtitle and the list of elements
- **editor:** adjust halo size for symbol drawing from 3 to 2
- **editor:** place the labels of a map pin around its head instead of beside its tip
- **editor:** bind the color sliders of the background map to reactive values
- **deps:** update @versatiles/style to version 6.0.3
- mark all selected elements on the map when several are selected
- prevent accidental text selection in the elements drawer
- show the legend text in black, not in the gray of the editor's labels
- draw the legend symbols sharper and larger, with an outline, and wait until their sprite is loaded
- update collapse-dir in vrt.config.json to include dialogs and inspector components
- find the user's country also in engines with only Intl.Locale#timeZones, e.g. Node.js 22 in CI
- **editor:** keep only the 10 most recently changed maps in the browser storage, and those that tabs have open
- **editor:** show the bounds of a single marker in the visible-area mode at least 40 pixels wide and high, so its handles are apart
- **viewer:** keep the visible area or the elements of a shared map clear of the legend, beside or above it, whichever shows them larger
- **editor:** show the check mark on the copy buttons of the share dialog after copying, whose rule was invalid CSS
- **map:** update coordinates and styles for Berlin and Chernobyl map examples
- **examples:** update map center and radius for Hamburg–Berlin railway and Paris 2024 venues; refine legend entries and marker styles
- **theme:** adjust accent lightness from 60% to 59%
- keep a legend without its default position, layout and font everywhere, as links store it, so a legend is the same in a link, a file and the editor
- **symbols:** draw the symbols of the symbol selector in the text color with a halo in the background color, black on white or white on black in dark mode
- **symbols:** add title styling with reduced opacity for better visual hierarchy in symbol selector
- **legend:** give the symbols of the legend a halo in its background color, and light symbols a darker edge inside it
- **map:** update venue coordinates and adjust legend entries for clarity
- **venues:** update symbol for Olympic Village to use stadium icon
- **editor:** center the icons of the tool rail and put the icons of the bars on whole pixels, so all browsers draw them alike and in the middle of their buttons
- **markers:** draw the symbol and the label of a marker in the same order, so a marker in front covers the label of a marker behind it, for up to 100 labeled markers
- **editor:** line up the names of the elements with "Map settings" and "Legend" in the drawer
- **editor:** draw the zoom buttons of the editor in the colors of its theme, also in dark mode
- **editor:** put the icons of undo, redo, preview and share on whole pixels, by giving the title and the buttons whole widths
- **examples:** expect no legend in the viewer for examples that hide it, like the pharmacies of London
- example with halo=2x
- **editor:** name elements by their type and text instead of numbers that changed with the drawing order
- **editor:** keep the drawing order of areas and lines while the labels of the background map are over them, so an outline behind an area is covered by it
- **legend:** center the texts of entries on their symbols and swatches by the middle of their capitals, measured in the browser
- update berlin example
- **map-examples:** update coordinates and radius for Berlin, Chernobyl, Hamburg-Berlin, and Paris 2024 venues maps
- **paris-2024-venues:** remove popup text from markers
- **berlin-low-emission-zone:** store the legend entries as polygons with the styles of the elements, as the format and the schema expect
- **map-json:** update Berlin map center and radius, remove legend entries, and adjust marker styles in Paris venues
- **sessions:** skip maps in the browser storage that cannot be read, e.g. of an older format, when opening the editor or the viewer, and list them as "Unreadable map" so they can be deleted
- **examples:** update Warsaw Christmas markets 2025 map with corrected coordinates, styles, and popup texts
- **sessions:** keep the camera of the map before when opening another map or a new one
- **sessions:** do not store the camera while a map loads, so it is neither given to the map before nor changed by each reload
- **map-state:** refuse a string twice in its section and more than 2^22 characters, so a short hostile link cannot exhaust CPU and memory
- **map-state:** round the rotation, the pattern and the position of the label when writing, instead of throwing; the schema declares the rotation as whole degrees
- **map-state:** keep only the valid parts of a .mapjson file, with the sanitizers of the GeoJSON import, instead of trusting its content
- **map-state:** refuse links with elements that cannot be drawn, latitudes beyond ±90°, frames beyond the map and values out of range; write circles of at least 1 m
- **map-state:** take the origin of the coordinates only from a camera that is stored, so a NaN center no longer makes the writer throw
- **sessions:** keep opening the links in the address bar after one failed, and open the map of a link as a new map if the storage cannot be searched
- **files:** forget the name of the file when another map is opened, e.g. a recent map or a link, so downloads suggest the name of the open map
- **interaction:** end a drag also when the mouse button is released outside the map, or when the window loses the focus
- **config:** offer each color, color scheme and font of the configuration once, so the pickers do not fail on duplicate keys
- **sessions:** let go of the lock of a map that is released before the browser grants it, so other tabs can open the map
- **menu:** keep the focus in the recent maps after deleting one, on the map now at its place
- **share:** show each check mark for 2 s after its last copy, and do not load the preview again after the dialog is closed
- **color-picker:** close on Escape only from within the picker or its button, and keep that Escape from going further
- **legend:** measure the texts again only when the font changes, not when their shift does
- **map-state:** export the JSON Schema, so it can be imported as @versatiles/map-state/schema/mapjson-1.schema.json
- **map:** stop listening for idle once the map is ready
- **map-state:** split the arguments of rgb() and hsl() without a regular expression that could backtrack
- **examples:** update map configurations for Berlin, Chernobyl, London, and Warsaw examples
- the two imports that did not use barrel imports
- standardize label formatting and improve readability in map JSON files
- **inspector:** currentcolor in lowercase, as stylelint requires
- **ci:** sync SvelteKit before generating the dependency graph, so path aliases resolve
- **dependencies:** update @versatiles/style to 6.2.0 and @sveltejs/kit to 3.0.1; bump typescript-eslint and vite versions
- **release:** remove iframe-test.html from release package and update Node.js setup to disable npm cache
- **release:** update release workflows and documentation for versioning and tagging

### Performance Improvements

- **build:** share maplibre-gl's code between the app and its worker
- **editor:** add, select, delete and edit many elements in linear time
- **viewer:** prepare the elements with a popup once and handle mouse moves once per frame
- **viewer:** load the editor code and the country lookup only when they are needed
- **editor:** undo and redo change the elements in place instead of rebuilding all of them
- **editor:** draw all elements with one shared source and layer per role instead of a source and layers per element
- import the editor's code with the page, so it starts sooner on slow networks
- **rendering:** plan the layers once per flush instead of once per changed element, so undoing the labels of many markers takes milliseconds, not seconds
- **sessions:** read only the current state of the maps to compare and name them, and the whole history only of the map that is opened

### Code Refactoring

- remove esbuild top-level await support from vite configuration
- streamline Dockerfile and xvfb startup script, update test script for consistency
- update import paths for MockMap and getMapStyle to use $lib alias
- remove checkScreenshot function and related usages; clean up imports in tests
- streamline CI workflow and remove Docker dependencies for Playwright testing
- consolidate state encoding and decoding logic into a single codec module
- remove GeoJSON properties handling from map layer classes and streamline feature retrieval
- update color handling and map style integration in various components
- extract download helper and defer object URL revocation
- use codec as single source for style defaults, enum names and helpers
- **codec:** extract the map state codec into the package @versatiles/map-state, without dependencies, close #28
- remove unused code (StateManager.setHash, getHash metadata parameter, isClaimed, duplicate getSymbol, bindable share state)
- rename src/lib/lib to src/lib/core and merge its utils into src/lib/utils
- **editor:** register the element types in one place, and derive selection, layer ids, colors, clipboard and style editor from their style roles
- **editor:** move table categories, legend entries, file decoding, color picker math and file choosing out of the components into tested helpers
- **editor:** keep the element styles in Svelte runes instead of stores
- **editor:** keep the element list, legend, background, search, loading state, popups and measurements in Svelte runes
- **editor:** keep the selection, undo history, style clipboard and color palette in Svelte runes
- **editor:** keep the editor configuration and the notifications in Svelte runes, so no stores are left
- remove adding elements at random positions, since every element is drawn or loaded with its geometry
- import with $lib paths in components, and with relative paths in TypeScript modules
- move the geometry functions and types to core, and stop exporting its internal helpers
- move the element names and the popup text to core/element, so utils does not depend on core
- group the background map and the table import into folders of their own
- group the components into ui, shell, map, inspector and dialogs
- move building the map style with the editor's layers out of the geometry manager
- split the symbols into their catalog and their drawing
- move the file commands out of the main menu into core, and test them
- update import paths to use $lib alias for consistency
- move the popup position, the grouped properties and the map drags next to their only users
- move the download, file, location and throttle helpers next to their only users
- import the background map's modules through a barrel file
- move the table import beside its dialog, and import it through a barrel file
- import the shared helpers through a barrel file
- import the map layers of the element styles through a barrel file
- import the generic controls through a barrel file
- move the symbol catalog and the drawing of symbols out of their folder
- add barrel configuration to deps-graph in vrt.config.json
- move the file commands and their helpers from core into a folder of their own
- move the global stylesheets next to the components that use their classes
- move the modules of core one level up, into src/lib
- move the commands and the drawing of symbols to the components, their only users
- split the map overlays into those of the viewer and those of the editor, each with a barrel file
- reorder dependencies in vrt.config.json for clarity
- move keeping the URL hash in sync with the map out of MapEditor into a class, and test it
- move the layout of the map's overlays out of MapEditor into pure functions, and test them
- move the mouse and touch handling of the selection into a class of its own
- move the saturation, brightness and hue controls of the color picker into a component of their own
- move the mapping step of the table import into a component, and its settings into a module
- update collapse-dir paths in deps-graph for better module organization
- move the theme's colors and spacings out of MapEditor into a stylesheet of their own
- move the indicator of loading out of MapEditor into a component of its own
- move the tab of the sidebar out of MapEditor into a component, loaded with the editor
- dissolve utils: move its shared helpers into src/lib, and those that only the components use into components
- group the selection, the drawing, the drags and the cursor into a folder interaction, with a barrel file
- move the symbol selector out of the inspector, since the import dialog uses it too
- move the list of elements next to the drawer that shows it, and name it ElementList
- merge the types of positions and paths into the geometry module
- name the style editors of the inspector after what they edit
- group the helpers of the page around the map into a folder page
- move loading the background map's style out of the geometry manager into a class of its own
- rename the geometry manager to map document, which is what it holds
- name the variables that hold the map document doc instead of manager
- share the square icon buttons as a component instead of copying their CSS
- build the editor's map style from its parts: highlight, elements, selection and drawing
- split drawing a symbol into placing it, painting its pixels, and the helpers for its image
- replace the global classes btn and label with the components Button and Hint
- drop the symbols of older maps: their numbers and short names
- drop version 0 of the link format: only version 1 is read and written
- drop the alias StateRoot and the removal of an old satellite contrast
- simplify deps-graph by removing redundant paths in collapse-dir and merge-outgoing
- replace the last global styles with a component ButtonGroup and local separator styles
- group drawing the map into a folder rendering: the style loader, the editor's layers and the element renderer
- let the elements measure their geometry as numbers, and format the text in the inspector
- move turning popup text into DOM nodes out of the elements' folder
- move the names and texts of elements for the user to the components
- remove the unused canvas and map of the elements and the document, and isDarkMode
- move drawing the images of fill patterns into rendering, and keep their naming in the fill layer
- let the elements report their changes to the document instead of calling the renderer
- share one symbol library through a Svelte context, instead of passing the map to the components
- move the map's queries, the renderer and the style loader from MapDocument into a MapView
- reach the map through the document's view, and remove MapDocument.map and .renderer
- keep the background and the label font in MapDocument, and let the style loader only show them
- split MapEditor into a shared MapFrame, a MapViewer and the editor
- move the pages MapEditor, MapViewer and MapFrame into app/, next to their helpers
- move table-import
- let the elements depend on a small ElementOwner interface instead of the map document
- let the renderer work out the layer ids of an element, so the elements don't know the map layers
- keep the history, selection and palette only in the editor's MapDocumentInteractive
- rename map_layer/ to style/ and MapLayer* to FillStyle, LineStyle, SymbolStyle, since they hold the style, not map layers
- move the color, font and symbol pickers into components/pickers, so ui/ holds only generic controls
- let the styles' setState fill in the defaults, and add patch for partial changes like pasting
- create the state of new markers in one place, newMarkerState, next to the marker
- **editor:** read and write colors with their opacity through parseColor and formatHex of map-state, instead of hex helpers of the app
- **editor:** move components/map/viewer and components/map/editor up, as components/map_viewer and components/map_editor
- **editor:** build the layers of the elements as one layer per element and merge neighbours that draw the same, instead of grouping elements by rules, and test that they draw exactly like one layer per element
- **map-state:** remove writeString and readString with their character tables, since every string of a link is in the string table now
- **map-state:** read and write the version, the grid and the element type in methods of their own, the popup with its flag, and show keys as key(n) in analyse-bits
- **map-state:** call the order of the Exp-Golomb code its parameter k, so it is not mistaken for the order of the elements
- **map-state:** name the keys of the fields once, for the writer and the reader, and read the style fields by their name
- **legend:** move the editing of legend entries into legend_entries.ts and the open entry into LegendEntryDetails.svelte
- **menu:** render each group of the menu with its submenu by one snippet, instead of the submenu markup four times
- **share:** split the share dialog into SharePreview, ShareControls and ShareCode
- **color-picker:** move the sliders with their HSV state into ColorSliders and the swatches into ColorSwatches
- **background:** split changeSettings into switching the map, finding the overlay, the text and the layers of the imagery
- remove code that nothing or only tests used, and stop exporting what only its own module uses
- define the latitude limit, the Mercator functions, the touch tolerance, the history limit and the empty source once
- **css:** one global class for text only for screen readers, instead of eight copies under two names
- move the names of element types out of components/, so the storage of maps does not depend on the user interface
- **map-state:** turn bits into base64 with bitsToBase64, so the writer no longer needs a reader
- **share:** derive the ids of the link, the embed code and the precision from the component's id
- move src/lib into layered folders with barrels (document, editor, sessions, components/common), with no import going up a layer
- **style:** one place for the complete and the stored style of each role, instead of defaults combined in six modules
- **style:** convert colors for MapLibre with map-state's parseColor instead of the Color of @versatiles/style
- **map-state:** stop exporting sanitizeViewer and sanitizeLabelMinZoom, which only the package itself uses
- **map-state:** split pattern into dash for lines and outlines and pattern for areas
- **map-state:** store arrowStart and arrowEnd as names instead of indexes
- **map-state:** store the label position align as a name instead of an index
- **map-state:** store dash and pattern as names instead of indexes
- **map-state:** rename the style field align to labelPosition, in GeoJSON and KML too
- **theme:** update theme handling in background map settings and tests

### Documentation

- format representations table for improved readability in README
- **editor:** describe the new way to delete points, ref #33
- list the editor's features in the README
- **map-state:** say "no runtime dependencies", state the requirements, and mark the source files as internal
- describe the share and embed options and all quality checks in the README
- remove the unused root changelog and explain that only @versatiles/map-state has releases
- regenerate the dependency graph and bundle treemap, and measure all JavaScript of the editor in one chunk
- **map-state:** describe lowercase colors, skipped features and canonical metadata in the 1.0.0 changelog
- regenerate the dependency graph and the bundle treemap
- include the source of the map-state codec in the dependency graph
- update readme and charts
- update readme and diagrams
- describe the structure of the project and the rules it follows
- state that files/ is an exception to the placement rule
- update dependency graph
- update collapse-dir in vrt.config.json to include src/lib/page/*
- show the bundle treemaps of both pages, the editor and the viewer
- add entry for upcoming work plans to .gitignore
- **map-state:** prepare the first release 1.0.0: one changelog section, without claims about legacy links and symbols, and the frame and the new metadata in the README
- **examples:** give the example maps readable titles, and visible areas that show each story completely
- update dep graph
- update london example
- update deps graph
- **map-state:** explain the .mapjson format in MAPJSON.md, linked from the READMEs, with tests that its examples fit the schema, that it names every field and that its links exist
- **map-state:** add the size of the example maps as links, compared with their JSON and Brotli, and how to analyse the bits of a map
- **README:** update size section to clarify link size and remove example maps table
- **examples:** add the Christmas markets of 2025 in and near Warsaw, on the dark map with a dark legend
- update deps graph
- **map-state:** put the doc comments of sanitizeFrame and sanitizeBackground in place, fix a typo, and name the theme among the legend defaults
- update the dependency graph
- update the dependency graph
- add a guide to running the editor on your own web server
- **map-state:** describe the style names and how links store them, update the dependency graph
- **map-state:** the rules for the names of style values, and the dependency graph
- update the dependency graph after the format changes

### Tests

- add missing glyphs for bbox-map and map-editor tests
- make MockMap listener handling match maplibre
- mock network access that triggered happy-dom AbortError
- **playwright:** expect the invalid-hash error instead of printing it
- **playwright:** pin the browser locale
- **playwright:** do not expect exact glyph ranges
- **playwright:** speed up tests with GPU rendering, fewer workers and no fixed sleeps
- **playwright:** avoid a second page load and an unfinished download
- **playwright:** read the line after a touch drag only once the URL has settled
- **playwright:** poll a ready flag of the page instead of listening for the console message too late
- **playwright:** share the project, mapCenter and boxesOverlap helpers and the MapWindow type, and import lib/utils with its extension
- **playwright:** type-check the Playwright tests in check-types
- **playwright:** split map-editor.ts into files by topic
- **playwright:** compare only the sidebar controls and their states in the aria snapshot
- **playwright:** cache only successful GET responses, write the cache atomically, and never leave a request hanging
- **playwright:** cache only successful and 404 GET responses, write the cache atomically, and never leave a request hanging
- **docker:** include the @versatiles/map-state workspace in the Playwright container
- measure coverage of all sources except mocks, fixtures, types and data, and show Codecov's patch status as informational
- add unit tests for ColorPicker, DialogImportTable, and SearchPlace components
- add comprehensive XML parsing and writing tests
- **playwright:** describe logged errors in Firefox instead of "JSHandle@object", and ignore its layout warning
- draw a real element in the append test, so its redraw cannot throw an unhandled error after the test
- keep the trace of a failed Playwright test, locally too, and from the failed run instead of the retry
- fail the unit tests on warnings of Svelte
- run the Playwright tests with 4 workers on macOS
- run only the tests tagged @cross-browser in Firefox locally, and all of them in CI
- merge Playwright tests that start from the same page into steps of one test
- check that every CSS variable is defined and used
- add the methods of maplibre's map that the attribution control uses to its stand-in
- move the tests of the mouse and touch handling of the selection into a file of their own
- move the tests of the style loader into a file of their own
- share the mocked document of the selection tests and the deferred download of the style
- test drawing the pixels of a symbol directly
- replace MockMapDocument with a small MockElementOwner, which is all the element tests use
- **editor:** collect the tests of the maps in the browser storage, and add links to stored maps, broken links, other tabs and a missing storage
- **editor:** check the visible area in the three aspect ratios of the share preview, dragging a handle with undo, and merging frames on import
- **editor:** drag a handle of the visible area with a finger, a bit off the handle, and move the map elsewhere
- give the web server 5 minutes to build, and run 2 workers instead of 4 on a machine that is already busy
- **editor:** drag elements in the Elements list with a finger by their handles, and check that swiping over the rows scrolls the list instead
- **map-state:** add maps in seven languages and with emoji, which keep their texts in a link and fit the schema
- **map-state:** pin the bits of the string coder only for the language fixtures, since the examples are edited as showcases
- **examples:** allow example maps without a legend, as the Berlin map now has a label instead
- **iframe:** encode the map of the iframe test page when it loads, so its link stays readable when the format changes
- **examples:** expect the satellite background of the Warsaw Christmas markets map
- **map-state:** links cut off, changed or made up are refused quickly, or give a map that can be drawn and written again
- **playwright:** wait for the map of the preview and for the idle map instead of fixed times
- **playwright:** move the legend tests into legend.ts and the label tests into labels.ts
- **playwright:** find the sidebar by its role, as a landmark named "Sidebar", instead of its CSS class
- **sessions:** set the session id of a duplicated tab only in the page, not again in its iframe
- **playwright:** ignore Chrome's hint about frequent canvas readbacks, which only the tests cause
- **map-state:** give the tests of the symbol limit and of corrupt links 60 s, which they need with coverage on CI
- **examples:** expect the OpenStreetMap background of the Warsaw Christmas markets map
- load no configuration file in the unit tests of the editor, which asked localhost:3000
- give the editor's unit tests a browser storage, which happy-dom lacks
- add unit tests for barrel imports functionality
- **playwright:** stop printing console messages caused by cancelled fetches, and name the test of each one

### Build System

- **deps:** bump the action group across 1 directory with 7 updates
- **deps:** bump the action group across 1 directory with 4 updates
- **deps:** bump playwright in /docker in the docker group
- fail the type check on warnings of Svelte, e.g. unused CSS selectors
- lint the CSS with stylelint, and fix what it found
- format the README after regenerating the dependency graph or the bundle treemap
- import with #lib instead of $lib, which SvelteKit 3 removed; extend $app/tsconfig, and map the map-state source in Vite and TypeScript instead of the deprecated alias option
- **deps:** bump actions/cache from 4 to 6 in the action group

### CI/CD

- use npm ci, avoid duplicate unit test run and duplicate PR builds
- build and pack the npm package @versatiles/map-state in CI and before pushing
- deploy GitHub Pages only after CI has succeeded on main
- **playwright:** install only the needed browsers, cache browsers and server responses, and add retries, traces and an HTML report
- **map-state:** publish the package from "map-state-v*" tags with npm trusted publishing and provenance, and add its changelog
- check that the dependency graph is up to date, with release-tool 2.19.0
- **pages:** build the deployment without the npm cache, so a run with the rights of main never writes a shared cache
- **playwright:** run the tests in three parallel jobs, Chromium in one and Firefox in two, instead of 18 minutes in one

### Chores

- update dependencies to latest versions
- update dependencies to latest versions in package.json and package-lock.json
- update cookie dependency to version 0.7.2 and add overrides in package.json
- update changelog and README for standalone map editor; remove BBoxMap from .prettierignore
- update CI and Pages workflows; remove unused release workflow; refactor tests and clean up code
- remove outdated snapshot images and update snapshot script
- update dependencies and devDependencies in package.json
- update funding information to reflect organization support
- add security update groups for GitHub Actions and npm in dependabot configuration
- update dependencies and devDependencies in package.json
- update package.json to use vrt for dependency upgrades and add release tool dependency
- update dependencies and devDependencies in package.json
- document dependency tree and build size
- remove bbox generator scripts inherited from node-versatiles-svelte
- remove unused code and leftovers
- run svelte-check in pre-push hook
- **deps:** update dependencies to latest versions
- **dep:** update @versatiles/style from 6.0.1 to 6.0.2
- update @versatiles/release-tool to version 2.18.1
- ignore node_modules in the packages too
- **deps:** update dependencies to latest versions
- **examples:** make the London pharmacies script write the example as it is now: gray faded map, small markers with bold labels above them from zoom 12.9, legend hidden
- **deps:** update brace-expansion to 5.0.12 (npm audit fix)
- **deps:** update @sveltejs/adapter-static and @sveltejs/kit to latest versions
- drop the console message "map_ready", which nothing uses any more
- update @versatiles/style dependency to version 6.1.0
- update dependencies to latest versions
- remove husky and its pre-push hook

### Styles

- unify CSS custom properties and use lang="scss"
- nest the CSS rules for the map's controls and the buttons
- one import statement per module, with types inline, checked by ESLint's no-duplicate-imports

### Other Changes

- Implement code changes to enhance functionality and improve performance


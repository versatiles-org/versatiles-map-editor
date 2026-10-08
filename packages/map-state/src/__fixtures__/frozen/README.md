# Frozen samples

Links (`links-1`) and `.mapjson` files (`files-1`) of version 1 of the formats, each with the map
that it must be read as: `{ about, link | file, state }`. The test `frozen_samples.test.ts` reads
them all, so every later version of the package proves that it still reads what version 1 wrote.

**These files are written once and never again.** If the test fails, the reader has changed, not
the samples: maps that people made would be read differently. A new field of the formats gets new
samples (`npm run freeze-samples` writes the ones that are missing, see
`scripts/freeze_samples.mjs`); the existing ones stay as they are.

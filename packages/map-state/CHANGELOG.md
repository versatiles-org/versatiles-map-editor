# Changelog

All notable changes to `@versatiles/map-state` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Encode and decode maps of the VersaTiles map editor as a compact base64 string, as GeoJSON and as
  KML.
- Format version 1 of the base64 string: a color palette, style references and coordinates relative
  to the map center with a selectable resolution. Hashes of version 0 can still be read.
- The style vocabulary of the editor: defaults, names of patterns, stroke styles, label alignments
  and symbols.
- Colors are always returned as lowercase hex (`#rrggbb`, or `#rrggbbaa` when transparent), also
  the transparency of marker and line colors in KML of other tools.
- Features that cannot be mapped are skipped on import, e.g. circles without a positive radius, and
  deeply nested KML is read without a stack overflow.
- Metadata is stored only if one of its fields has a value, so the same map always gives the same
  hash.

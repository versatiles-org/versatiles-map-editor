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

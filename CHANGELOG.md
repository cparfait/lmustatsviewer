# Changelog

All notable changes to LMU Stats Viewer are documented here.

---

## [0.9.5] — 2026-04-11

### Added
- **SQLite cache** — XML sessions are now indexed in a local SQLite database (`%APPDATA%\LMU_Stats_Viewer\lmu_cache.db`); only new or modified files are parsed on each load (delta sync)
- **Personal Records page** — click the 📈 icon on any best-lap row to view the full historical progression for that track / car combo, with an interactive chart and a session-by-session breakdown
- **SQL-based filtering & pagination** — filters (track, car class, version…) and sorting are handled by SQL queries; memory usage is constant regardless of session count
- **Dynamic Steam path detection** — the configuration page automatically scans drives C–H and common Steam library folders to suggest the LMU results directory

### Improved
- **CSRF protection** — all four configuration forms now use `bin2hex(random_bytes(32))` tokens validated with `hash_equals()`
- **Update checker rate limiting** — version check results are cached in `localStorage` for 1 hour to avoid hammering the GitHub API on every page load
- **JSON payload validation** (`fetch_version.php`) — incoming update payloads are validated against an explicit whitelist before being stored in session; HTTP 400 returned on invalid input
- **CSS responsive layout** — configuration page is fully usable on narrow viewports; buttons no longer overflow at intermediate widths
- **PHP 8 type hints** — all previously untyped functions now carry proper parameter and return types
- **Error handling** — `@` suppression operators replaced with `is_readable()` guards and `libxml_use_internal_errors()` blocks

### Performance
- **Empty session detection** — replaced full XML scan with an O(1) SQLite query using the new `has_any_laps` column in `xml_index`; flag is computed at indexing time via an early-exit driver loop
- **First-launch indexing** no longer times out regardless of collection size

### Removed
- Dead functions: `get_race_events()`, `formatDateInLocale()`, `calculate_avg_lap()`
- Legacy `get_race_events()` fallback from `race_details.php` (all databases are now migrated via the SQLite indexer)

---

## [0.9.4] — 2026-04-02

### Added
- Automatic update checker — notifies and links to the latest release on GitHub / Overtake.gg
- Car brand logos: Genesis GMR-001, Duqueine D09 P3
- Circuit flags: Barcelona-Catalunya
- Circuit layouts: Paul Ricard, Silverstone
- Automatic update download & install from the in-app update page
- System tray icon — right-click menu to open the app, access config, check for updates or quit
- Launcher auto-start at Windows boot (InnoSetup option)
- Multi-language installer (FR / EN / ES / DE)
- First-launch redirect — automatically opens the configuration page on fresh install

### Improved
- Single source of truth for version number (`version.txt`)
- InnoSetup script: AppId, support URLs, installer icon

---

## [0.9.3] — 2025-09-23

### Added
- GTE class table
- Race car summary
- LMP3 support *(thanks @Antotitus22)*
- LMP2 ELMS support *(thanks @Antotitus22)*
- Driver comparison — overlay lap time curves for any two drivers
- Game version display

### Fixed
- My Laps lap display bug
- Finish position display bug in best laps table

### Changed
- Graphics improvements, code cleanup, translation fixes

---

## [0.9.2]

### Fixed
- Update checker not working

---

## [0.9.1]

### Added
- Automatic update availability check
- Automatic refresh after update

---

## [0.9]

### Added
- Dark theme
- Circuit layout support *(thanks @Tontonjp)*
- New `config.json` system with driver name suggestion and log path detection
- GTE class colour *(thanks @h55d)*

### Changed
- CSS colours for best sectors and optimal time — improved readability
- CSS hover colours preserved
- Purge session system reworked

---

## [0.8]

### Fixed
- Spa sector 2 times (missing minutes)
- German translation *(thanks @Texas-Edelweis)*

---

## [0.7]

### Added
- Strategy tab (tyres & fuel)
- Fuel at start / finish in race details ranking
- Filters on the details table (sectors, V-max…)

### Changed
- Best times ranking *(thanks @astroremucho)*

---

## [0.6]

### Added
- Class-based ranking for multi-class races
- Class ranking column and class display in details
- Long session support *(thanks @Botmeister)*
- Incident types table
- Car brand logos

### Fixed
- Invalid lap when a sector is missing *(thanks @Botmeister)*

### Changed
- `Authorized Vehicles` field value by class type
- Session ranking order *(thanks @Botmeister)*
- CSS updates

---

## [0.5]

### Added
- Gap to leader in details tables
- Finishing position in best laps table on details page
- V-max in race results table
- Race date on details page
- Gear icon link to configuration page
- Button to purge sessions without lap times
- Button to delete the cache file in `%APPDATA%` (bug recovery)
- Chat tab in race details
- My Laps button on Race Details tab *(thanks @pcFiNCH85)*

### Changed
- Header CSS *(thanks @Botmeister)*
- Translations updated

---

## [0.4]

### Added
- Online / offline filter
- Filter on details page to quickly find your name in race laps

---

## [0.3]

### Added
- Filter to display only best times since LMU v1 *(thanks @Pillot69)*
- Peugeot 9x8: differentiated 2023 vs 2024/25 variants *(thanks @Pillot69)*

### Fixed
- Cache not displaying new sessions

---

## [0.2]

### Fixed
- Configuration not saving the log path

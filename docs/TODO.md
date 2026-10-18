# To do later

## More countries and cities (done in 1.0.0)

Settings -> Prayer Times and the welcome screen have a country list and a city search for every country (about 30,000 cities of 15,000 people or more, from GeoNames). Egypt keeps its own short list. A chosen city is saved as the city in use (coordinates + time zone) with the usual calculation method of its country.

Still open:
- City names are in English only (the Egyptian list is translated). Searching in Arabic finds nothing; the message says so.
- The time zone of a city is the nearest place of the same country in the time zone database. It is exact for countries with one zone; in a few big multi-zone countries a city near a border can get the neighbouring zone. The chosen zone is shown, and "My city is not in the list" lets a person type the right one.
- Cities above about 66 degrees north or south (midnight sun) are refused with a message, because the prayers cannot be worked out all year there.
- Tasks, reminders and zone times stay on the computer's clock; only the zone start and end are shown in the city's own time zone (as for a typed-in city before).

## From the code review of 15 Oct 2026 (not done yet)

- **Batch 3, speed (done: the repeat count is worked out once per rule, overlap check in one pass, remembered date conversions, `state.json` for the minute-by-minute bookkeeping, no redraw while the window is hidden, splash 1.8 s, one start-up request instead of two). Left**: a cache of whole days shared by the day view and the reminder engine, and a worker for very large plans (thousands of tasks).
- **Batch 4, look and accessibility**:  colors with low contrast (zones 1, 3, 4, the bell badge, the error toast), padding with `inline` properties for Arabic, focus in dialogs, real buttons for "Upcoming" and "Continues".
- **Electron Fuses**: done through `build.electronFuses` in `package.json` (electron-builder applies them while packing, no new package needed). Still to do: `enableEmbeddedAsarIntegrityValidation`, only after the installer has been tried on Windows.
- Full-screen alert: done (the title has a maximum height and scrolls; its size setting is unchanged).

## Public release (next steps for the owner)

See `docs/PUBLISHING.md`: make the repository public, publish the website, make the first release, apply to the SignPath Foundation. After approval: add SignPath's GitHub Action to `.github/workflows/release.yml` and change "not signed yet" in `docs/CODE_SIGNING_POLICY.md`, `docs/WINDOWS_WARNING.md(.ar)` and the website.

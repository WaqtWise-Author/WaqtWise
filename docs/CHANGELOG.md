# What changed in each version

The version number is in `package.json` (`version`). The installer file is named after it: `WaqtWise-Setup-<version>.exe`.
Before a release: raise the number, add a section here, then build ("Build Windows installer" on GitHub).

## 1.0.0

The first public release. The work before it was numbered 0.x while the app was private; this section lists what changed since the last private version.

New
- **Daily View details** (Settings -> Daily View): choose which of 14 details each task row shows (start and end time, duration, priority, category, status, conflicts, repeat, what the start follows, reminders, full-screen alert, notes, "continues", backup-time warning), with three presets and a live preview.
- **Shorter Daily View**: a zone with no tasks, and (on today) a zone that is over with every task done, is shown as one line (click it to open; the arrow in its band hides it again). A zone that is over with something not done stays open and shows "N not done". Opening today scrolls to the zone happening now. Settings -> Daily View -> *Empty and finished zones*: Collapse (default) or Show in full.
- **Any country, any city**: Settings -> Prayer Times and the welcome screen have a country list, then a searchable list of that country's cities (about 30,000 cities of 15,000 people or more, 209 countries). The city's coordinates and time zone are saved, and the calculation method of the country is chosen for you (Umm al-Qura for Saudi Arabia, Turkey, North America, and so on); you can change it. Egypt keeps its own list. Country names follow the app language. City data: GeoNames (CC BY 4.0), see `src/core/WORLD_CITIES_SOURCE.md`.
- **Late tasks** (Settings -> Application): set after how many hours and minutes a ticked task counts as late. Statistics has *Done on time*, *Most late tasks*, *Lateness by zone and category* and *Lateness over time*.
- The window opens **maximized**.
- **Arabic font**: IBM Plex Sans Arabic is inside the app (English letters and numbers keep Plus Jakarta Sans).
- Start-up screen shows for 3 seconds and nothing skips it.

Public release (documents and website; the app itself is unchanged by this part)
- License: **GPL-3.0-or-later** (`LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md`); the license files ship inside the installer. The name, logo and icon are not licensed.
- New README (English and Arabic) with screenshots, and a full **user guide** in English and Arabic (`docs/USER_GUIDE.md`, `docs/USER_GUIDE.ar.md`) replacing `HOW_TO_INSTALL_AND_USE.md`. Developer notes moved to `docs/DEVELOPMENT.md`.
- `docs/WINDOWS_WARNING.md` (+ Arabic): why Windows SmartScreen warns about the unsigned installer, how to install anyway, how to check the SHA256 checksum.
- `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates, `docs/CODE_SIGNING_POLICY.md` (for the SignPath Foundation application) and `docs/PUBLISHING.md` (the owner's checklist).
- **Website** in `site/` (English and Arabic, no cookies or third-party content; for ordinary users only, so it has no release notes - they stay in this file): home page, guide pages built from the Markdown by `tools/build-site.py`. Manual workflows: **Publish website** (GitHub Pages) and **Release** (builds the installer, writes SHA256SUMS and creates a draft release).
- Screenshots of the real app with example data (`tools/make-screenshots.js`, `tools/shots-to-webp.py`) in `docs/images/` and `site/assets/screens/`.
- `tests/docs.test.js` checks the license files, links between documents, screenshots, the website and the workflows, and that the app code makes no network requests.

Look and feel
- One look for every screen (sizes, corners, switches, Settings rows, a section index that stays visible while scrolling). See `docs/UI_REVIEW.md`.
- One type scale: seven font sizes and four weights; nothing smaller than 12 px.
- Better contrast on the zone colors, the bell number, the error message and the tick.
- Keyboard: Tab stays inside dialogs; Enter and Space work on every list item; Enter on the tick button only ticks; focus stays on the same task when the day is redrawn.
- Arabic: taller lines and mirrored spacing.

Fixed
- The five-zone strip at the top of the Daily View no longer cuts off the name of a short zone (Maghrib): it goes on a second line.
- Full-screen reminder: a long title wraps onto more lines and, if it is still too tall, the letters get smaller until it fits (never below 24 px). There is no scroll bar next to the title, and the buttons always stay on the screen (checked at 1366 x 768).
- Opening WaqtWise after Windows started (from its shortcut or the tray) now brings the window to the front instead of only flashing in the taskbar.
- Minimizing no longer relies on cancelling the minimize (Windows ignores that); the window is hidden to the tray after it.
- A custom city many hours ahead of the computer no longer stops reminders for some hours each day.
- The window shows the new day after Fajr instead of yesterday.
- A data file that is busy for a moment (antivirus) is no longer treated as damaged; a file from a newer version is refused instead of overwritten.
- Task titles are limited to 200 characters; a task that lasts several days is listed on every day it runs.
- Deleting a category also clears it from the free list; copies and "Mark as Done" from an alert count in saved statistics.
- Prayer-time adjustments that put the prayers out of order are refused.
- A second launch that arrives while the app is starting is handled after it is ready.

Safety
- Browser permissions (camera, microphone, location, ...) are refused; stricter page security policy; the requests from the window are checked.
- An imported backup cannot switch on "Start with Windows"; limits on how many dates one task can hold.
- The packed app is built with Electron Fuses: it cannot be started as a plain Node program or with Node debugging switches.

Speed
- The small reminder bookkeeping is saved in `state.json` about once a minute instead of rewriting all the data.
- Repeat-after-N-times rules, overlap checks and date conversions are much cheaper; nothing is redrawn while the window is hidden in the tray.

## 0.7.0

Everything before this list (see the git history).

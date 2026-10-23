# What Changed in Each Version

The version number is in `package.json` (`version`). The installer file is named after it: `WaqtWise-Setup-<version>.exe`.
Before a release: raise the number, add a section here, then build ("Build Windows installer" on GitHub).

## 1.1.0

New
- **Routines** (menu -> Routines): things that repeat several times a day inside a time window, for example "drink water every 2 hours 30 minutes from 8:00 AM to 8:00 PM". Each routine has its own start and end time (a window may run past midnight), a repeat distance given in hours and minutes (at least 5 minutes), the days of the week it applies to, and its own way of reminding: a notification, a full-screen alert, or both. The page shows today's times for each routine to tick off; a routine can be paused. A time missed while the computer was off is skipped. Routines are a list of their own, separate from tasks: they are not in the five zones or the statistics (a statistics card for them may come later). They are saved with the data and travel with export, import and backups (`routines` in the file, see `docs/DATA_FORMAT.md`).
- **One note at random for routines**: write several notes separated by `;` and the full-screen alert shows a different one each time it rings, none repeating until all were shown (same as for tasks).
- **Statistics card for routines** (Statistics -> Manage -> *Routines*, on by default for new installs): for each routine the share of its times done in the chosen range, the current streak, the last days as small squares, and the time you miss most often. Only times that have passed count, on the days the routine applies, since the routine was made. Ticks are now kept for 400 days (were 60).
- **Stay Quiet During Prayer** (per routine): a time that falls from a prayer's call until 10 to 60 minutes after it rings when that period ends instead.
- **Notification a few minutes early** (per routine): the notification can come 0 to 120 minutes before each time (exact minutes, no hours). The full-screen alert stays on the exact time.
- **Silent while chosen tasks run** (per routine): choose tasks; a routine time that falls while one of them is running does not ring (a task already ticked as done does not count).
- **Tray menu**: right-click now shows the next task that has not started yet, **Pause Reminders** (30 minutes, 1 hour, 2 hours, or until the next Fajr; notifications, full-screen alerts and routines stay silent, what falls inside is skipped, the tooltip shows when it ends, **Resume Reminders** ends it early; not saved when the app closes), then Open / Show, Hide / Minimize and Exit.
- **Roomier routine card**: a summary line (done, silent, missed, next), a progress bar, and a timeline of the day with the silent tasks drawn as bands; the long list of times and the silent tasks open on request (*Show All Times*, *Silent During N Tasks*).
- **Title Case** for buttons, headings, labels and menu items in the app, the guides and the website (full sentences keep normal capitals).
- **No ticking the future**: a task on a day that has not come yet (tomorrow or later) can no longer be marked done (its circle is greyed out and the app refuses); a routine time that has not come yet cannot be ticked either. Taking a tick back always works.
- Clicking a routine notification opens the Routines page. Notifications still have no buttons; Snooze, Mark as Done and Open routines are on the full-screen alert.

Fixed
- A long task name on the full-screen alert wraps onto the next line neatly and shrinks only if it still does not fit; the alert no longer shows a scroll bar.

Documents and website
- The Routines section in the user guide (English and Arabic), a Routines screenshot, and the data format.
- The website home page has the logo large in the middle of the top, and as the first picture among the screenshots.
- The **Run tests**, **Screen check** and **Publish website** workflows now also start by themselves on every push (the website only when the site or the documents change on `main`); **Build Windows installer** and **Release** stay manual.

## 1.0.0

The first public release. The work before it was numbered 0.x while the app was private; this section lists what changed since the last private version.

New
- **Daily View details** (Settings -> Daily View): choose which of 14 details each task row shows (start and end time, duration, priority, category, status, conflicts, repeat, what the start follows, reminders, full-screen alert, notes, "continues", backup-time warning), with three presets and a live preview.
- **Shorter Daily View**: a zone with no tasks, and (on today) a zone that is over with every task done, is shown as one line (click it to open; the arrow in its band hides it again). A zone that is over with something not done stays open and shows "N not done". Opening today scrolls to the zone happening now. Settings -> Daily View -> *Empty and Finished Zones*: Collapse (default) or Show in full.
- **Any country, any city**: Settings -> Prayer Times and the welcome screen have a country list, then a searchable list of that country's cities (about 30,000 cities of 15,000 people or more, 209 countries). The city's coordinates and time zone are saved, and the calculation method of the country is chosen for you (Umm al-Qura for Saudi Arabia, Turkey, North America, and so on); you can change it. Egypt keeps its own list. Country names follow the app language. City data: GeoNames (CC BY 4.0), see `src/core/WORLD_CITIES_SOURCE.md`.
- **Late Tasks** (Settings -> Application): set after how many hours and minutes a ticked task counts as late. Statistics has *Done on Time*, *Most Late Tasks*, *Lateness by Zone and Category* and *Lateness Over Time*.
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

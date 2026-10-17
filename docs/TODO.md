# To do later

## More countries and cities (postponed)

Today the built-in city list is Egyptian only. Anyone else uses "Custom city…" (name, latitude, longitude, time zone).

Decided direction (not built yet):

- Add Saudi cities (Riyadh, Jeddah, Makkah, Madinah, Dammam, ...) and other Gulf cities, each with its coordinates and time zone. Choosing one sets a fitting calculation method (for example Umm al-Qura for Saudi Arabia). More countries to be chosen together.
- The computer's clock stays the single reference for tasks, reminders and zone times, also for built-in cities. Egyptian governorates share one time zone, so nothing changes for them.
- Show a small note only when the chosen city's time zone differs from the computer's, for example: "Your city uses Riyadh time and this computer uses Cairo time."
- Not planned: showing built-in cities in their own time zone (it would mix two clocks between prayer times and tasks).

Open: the exact list of countries and cities to add.

## From the code review of 15 Oct 2026 (not done yet)

- **Batch 3, speed (done: the repeat count is worked out once per rule, overlap check in one pass, remembered date conversions, `state.json` for the minute-by-minute bookkeeping, no redraw while the window is hidden, splash 1.8 s, one start-up request instead of two). Left**: a cache of whole days shared by the day view and the reminder engine, and a worker for very large plans (thousands of tasks).
- **Batch 4, look and accessibility**:  colors with low contrast (zones 1, 3, 4, the bell badge, the error toast), padding with `inline` properties for Arabic, focus in dialogs, real buttons for "Upcoming" and "Continues".
- **Electron Fuses**: done through `build.electronFuses` in `package.json` (electron-builder applies them while packing, no new package needed). Still to do: `enableEmbeddedAsarIntegrityValidation`, only after the installer has been tried on Windows.
- Full-screen alert: title size in `cqmin` and a maximum height so the buttons are always visible.

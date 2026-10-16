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

- **Batch 3, speed**: cache the days and the repeat rules, write `lastTickAt` to a small separate file, stop the timers while the window is hidden, shorten the 3.2 s splash.
- **Batch 4, look and accessibility**: one font-size scale and fewer weights (the Arabic font is done), colors with low contrast (zones 1, 3, 4, the bell badge, the error toast), padding with `inline` properties for Arabic, focus in dialogs, real buttons for "Upcoming" and "Continues".
- **Electron Fuses** (`@electron/fuses`): needs a new dev dependency and an updated `package-lock.json`, so it is done on the user's computer with `npm install`.
- Full-screen alert: title size in `cqmin` and a maximum height so the buttons are always visible.

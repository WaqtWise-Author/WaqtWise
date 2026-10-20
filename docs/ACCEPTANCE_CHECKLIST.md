# Acceptance checklist

Every scenario in Section 16 of the specification (plus the later additions 27-37), where it is checked
automatically, and what still has to be tried on a real Windows computer.

Automatic tests run when you start them by hand on GitHub (**Actions -> Run tests -> Run workflow**). `tools/ui-check.js` clicks through the
real screens in a test browser; it was run while building and is not part of the installed app.

| # | What is checked | Checked automatically in | Also try on a real PC |
| --- | --- | --- | --- |
| 1 | Zone derivation for typical times | tests/zones.test.js | - |
| 2 | A moment exactly at a prayer time belongs to the zone that starts there | tests/zones.test.js | - |
| 3 | 2:00 AM is Zone 5 of the previous Planning Day | tests/zones.test.js, tests/service.test.js | - |
| 4 | Zone totals (Zone 1 = 6h 43m) | tests/zones.test.js, tests/service.test.js | - |
| 5 | Scheduled 3h 10m / Free 3h 33m | tests/zones.test.js | - |
| 6 | Overlaps merged and flagged | tests/zones.test.js | - |
| 7 | Task crossing Dhuhr: 18 / 42 minutes, 'Continues from' | tests/zones.test.js, tests/service.test.js | - |
| 8 | Zone 5 task running past the next Fajr | tests/zones.test.js | - |
| 9 | End time = start + duration (also past midnight) | tests/zones.test.js | - |
| 10 | '10 minutes after Asr' follows each day's Asr | tests/zones.test.js, tests/task-relative.test.js | - |
| 11 | Daily 5:10 AM task changes zone across the year | tests/zones.test.js | - |
| 12 | Every 3 weeks on Sunday and Thursday | tests/recurrence.test.js | - |
| 13 | 1st and 3rd Friday of every 2 months; last Sunday; day 31 | tests/recurrence.test.js | - |
| 14 | Limits: 20 occurrences, until Dec 31, no end | tests/recurrence.test.js | - |
| 15 | Exceptions, additions, single-occurrence edits | tests/tasks.test.js | - |
| 16 | Edit scope: this / this and following / all | tests/tasks.test.js, tests/service.test.js | - |
| 17 | Per-occurrence completion | tests/tasks.test.js | - |
| 18 | Reminders {15, 0}; daily; prayer-relative | tests/reminders.test.js, tests/reminder-engine.test.js | See check 6 below (real notification) |
| 19 | Notifications with the window closed | tests/main.test.js (window hidden, engine still notifies) | Check 7 below |
| 20 | Missed reminders summary | tests/reminder-engine.test.js | Check 9 below |
| 21 | Second launch focuses the existing window | tests/main.test.js | Check 8 below |
| 22 | Start with Windows, hidden in the tray | tests/main.test.js (registers --hidden login item) | Check 10 below |
| 23 | Settings changes update zones, durations and notifications | tests/service.test.js, tests/reminder-engine.test.js | - |
| 24 | Daylight saving / time zone change | tests/dst.test.js (real Egyptian 2026 changes); the app also checks every minute and after wake | Check 11 below (changing the time zone while the app runs) |
| 25 | Persistence, export / import, damaged-file recovery | tests/service.test.js | Check 12 below (reinstall keeps data) |
| 26 | Theme and 12-hour times everywhere | tools/ui-check.js (theme), tests (12-hour labels) | Look at both themes once |
| 27 | 'Today' is the Planning Day containing now | tests/zones.test.js, tests/service.test.js | - |
| 28 | Date field vs Planning Day, 'Will appear under...' note | tests/tasks.test.js, tests/service.test.js, tools/ui-check.js | - |
| 29 | Zone-start notifications are never late, never 'missed' | tests/reminder-engine.test.js | - |
| 38 | Full-screen alert at the exact start moment | tests/alerts.test.js, tests/main.test.js | Check 14 below |
| 39 | Alert content (name, notes, details, long text, Arabic) | tools/ui-check.js, tests/main.test.js | Check 14 below |
| 40 | Per-task switch, default for new tasks, master switch | tests/alert-settings.test.js, tests/alerts.test.js | - |
| 41 | Customization applies to the alert and the preview; looks; limits; backups | tests/alert-settings.test.js, tools/ui-check.js | Check 15 below |
| 42 | All screens / main screen only | tests/main.test.js | Check 16 below (if you have two screens) |
| 43 | Full-screen alert buttons (Got it, Snooze, Open task, Mark as Done) and the queue | tests/main.test.js, tests/alerts.test.js, tools/ui-check.js | Check 14 below |
| 44 | Protection against accidental dismissal | tools/ui-check.js | Check 14 below |
| 45 | Late / missed: no late alert, missed summary | tests/alerts.test.js | - |
| 46 | The alert replaces the plain notification at the start | tests/alerts.test.js, tests/main.test.js | - |
| 30-37 | Relative to a task: resolution, chains, repeating, backup time, loops, deleting, split edits, reminders | tests/task-relative.test.js, tools/ui-check.js | Check 5 below |

## Things only a real Windows computer can confirm

Do these once after installing. They are the parts that cannot be tested without Windows itself.

1. **Install**: run the installer; the SmartScreen steps work; the wizard finishes; Start menu and Desktop shortcuts exist.
2. **Welcome screen**: choose your city. Compare the five prayer times with a timetable you trust.
3. **Add a task** at a time two minutes from now with a reminder at 0 minutes.
4. **Close the window** (X). The message says WaqtWise is still running; the tray icon is there.
5. **Relative to Task**: add two tasks in sequence (the second 5 minutes after the end of the first); move the first one and see the second move.
6. **Notification**: with the window closed, a Windows notification appears on time, showing the title, start time and zone.
   Also use Settings -> **Send a test notification**: the notification has no buttons; click it and confirm WaqtWise opens on the Daily View.
7. **Real task notification**: let a real reminder appear and click it: WaqtWise opens on the Daily View. Press Alt+F4 on a full-screen alert: the task appears in the bell as missed.
8. **Single instance**: with the window hidden, double-click the Desktop shortcut: the existing window appears; no second copy in the tray.
9. **Missed reminders**: make a task with a reminder 5 minutes ahead, choose Exit from the tray, wait 10 minutes, start the app: a "You missed ..." message appears.
10. **Start with Windows**: switch it on in Settings, sign out and in (or restart): the app is in the tray and no window opens.
11. **Time zone**: with the app running, change the Windows time zone; within a minute the zone times and the upcoming reminders (bell icon) follow the new clock.
12. **Reinstall**: Export data; uninstall (answer **No** when asked whether to delete your data); reinstall; tasks are still there. Then import the backup file into a fresh install.
13. **Uninstall**: choose to delete data; reinstall: the app is empty and shows the welcome screen.

14. **Full-screen alert**: add a task starting 2 minutes from now with "Full-screen alert at the start time" switched on. Open any other program (a browser, a document) and keep working. At exactly the start time the full-screen reminder appears over it, showing the name and notes. Try Snooze (it returns), Open task, Mark as Done, and Got it. Press a few keys right when it appears: it must not close by accident.
15. **Look**: Settings -> Full-screen reminder: choose a ready-made look, change a color and the name size, click **Preview full screen**; the real reminder looks like the small preview.
16. **Two screens** (if you have them): the reminder covers both. Choose "Main screen only" and check that only one is covered.
17. **Limit check** (optional): start a video or game in full screen and see whether the reminder appears over it; some exclusive full-screen programs do not allow it.

18. **Backups**: Settings -> Data -> **Restore from backup…** lists today's copy. Import a backup file: a "Before an import" copy appears; restore it and your previous tasks come back.
19. **Past statistics**: complete a task, wait for the next day (or change the computer date), then delete that task: the finished day in Statistics keeps its numbers.

20. **Custom city**: Settings -> City -> Custom city…, enter a city with its coordinates and time zone, Save city: the zone times in the Daily View change. Choose Cairo again: they go back.
21. **Every 2 weeks**: a task repeating every 2 weeks on Sunday and Monday; change the first day of the week to Monday in Settings and see that its weeks shift.

22. **Arabic**: Settings -> Language / اللغة -> العربية. The whole app turns right to left at once (menu, forms, Statistics, the notification texts). Numbers stay 0123456789. Open a task form, Statistics and a full-screen reminder (Settings -> Preview full screen) and look for any English left over. Switch back to English: everything returns as before.

23a. **Routines**: menu -> Routines -> Add routine: title, From 8:00 AM, To 8:00 PM, every 2 hours 30 minutes; the line under the boxes lists the times. Choose both a notification and a full-screen alert. Save. Wait for (or set a time just ahead of) the next time: the notification (no buttons; clicking it opens the Routines page) and the full-screen alert both appear; on the full-screen alert, Snooze brings it back and Mark as Done ticks that time on the Routines page. Pause stops it; a full-screen-only routine rings only the alert. Export and import: the routine comes back.
23. **Free To-Do list and task details**: menu -> Free To-Do list. Add a task by typing and pressing Enter, and one with "Add with details". Tick one, then "Clear done". Press **Schedule task** on another: the usual window opens filled in; choose a time and Save: the task is in the Daily View and gone from the free list. In the Daily View click a task: you get its details (not the edit window); **Edit task** opens the edit window. Export and import: the free list comes back.

24. **Random notes**: make a task for 2 minutes from now with the full-screen alert on, tick **Show one note at random**, and write `first; second; third` in Notes. When the alert appears it shows one of the three. Snooze it: when it comes back a different note shows. On another task day a different one shows too, and all three appear before any repeats. A task with one note, or with the switch off, shows its notes as written.

25. **Alert buttons**: Settings -> Full-screen reminder -> **Buttons shown**: switch off Snooze and Mark as Done. The preview shows only "Got it" and "Open task". Click **Preview full screen**: the real alert has the same buttons. Switch them on again. "Got it" has no switch.

26. **Saving problems**: with the app open, make the data file read-only (right-click `data.json` in the app's data folder -> Properties -> Read-only) and add a task: a red banner appears at the top ("Your changes could not be saved…") with the reason; "Export a copy" saves a backup file. Remove the read-only mark and press **Try again**: the banner goes away. Do this only on a test copy of your data.

27. **Statistics travel with the export**: complete a task, delete it the next day, export, and import the file on another computer (or after Restore): the finished day still shows in Statistics.

28. **Opens maximized**: close the app to the tray and open it again (tray icon or shortcut): the window fills the screen. Start with Windows is unchanged: it stays hidden in the tray until you open it, then it is maximized.

29. **Late tasks**: Settings -> Application -> **Late tasks**: set 1 hour 0 minutes. Make a daily task at 12:00 and tick it at 1:30 PM. Statistics shows it in **Most late tasks** (average 1h 30m), **Done on time** drops, and the zone, category and over-time charts show the delay. Raise the limit to 2 hours: it is no longer late. Add or remove these charts with **Manage**.

30. **Look and feel (see `docs/UI_REVIEW.md`)**: open Settings in English and in Arabic, light and dark. The section buttons at the top jump to each section and stay visible while scrolling; every on/off choice is the same sliding switch; fields, buttons and cards have the same rounded corners as the Daily View. Open **New task**: Reminder, Full-screen alert and "Show one note at random" are switches too. Make the window narrow: nothing is cut off. Try Windows text size 125% and 150%.

31. **Task details in the Daily View**: Settings -> **Daily View**. Untick Category and Priority: they disappear from every task row at once (and the preview above the switches shows it). Tick **Repeat**, **What the start follows**, **Reminders**, **Notes**: a task that repeats, starts after a prayer or another task, has reminders or notes shows them. **Name only** leaves just the name and the tick; **Standard** returns to the default. Check Arabic too: long details wrap onto the next line and nothing is cut off.
32. **Cities in other time zones**: in Settings choose a custom city that is far ahead of your computer's time zone (for example Tokyo while your computer is set to Cairo). Leave the app open across the whole day, including 1-5 AM: the zone shown and the reminders keep working, with no "Could not derive a zone" message. Leave the window hidden in the tray past Fajr, then open it: it shows the new day, not yesterday.
33. **Keyboard and limits**: in the Daily View press Tab to a task's round tick button and press Enter: the task is ticked and the details do NOT open; Tab to the task row itself and press Enter or Space: the details open. A task title longer than 200 characters is refused with a clear message. A task that lasts several days is still listed on each day while it runs.
34. **Safety**: Settings -> Prayer Times: set Dhuhr +120 and Asr -120: the change is refused with a clear message and the old values stay. Import a backup that was exported with "Start with Windows" on while it is off here: it stays off. If antivirus locks `data.json` at start, the app shows a message and closes without touching the file (it does not start empty). A data file from a newer WaqtWise is refused the same way.
35. **Keyboard and reading**: with the keyboard only, open New task: Tab never leaves the window, Escape closes it, and focus returns to the button you used. In the Daily View Tab to a task and wait 30 seconds: the focus stays on it. The bell list, the Missed list and the late-task list open with Enter or Space. In Arabic the letters use IBM Plex Sans Arabic (the English words and numbers inside Arabic text stay in the main font), the lines are taller and nothing is cut; the full-screen reminder in Arabic looks the same way. The zone bars (all five), the bell number and an error message are easy to read in light and dark.
36. **Speed and the small state file**: leave the app running for 5 minutes with a reminder due. In `%APPDATA%\WaqtWise` the file `data.json` keeps its modified time while `state.json` changes every minute. Hide the window to the tray for a while and open it again: it shows the current day at once. Make a task that repeats daily and ends after 900 times: the Daily View opens without delay. The start-up screen is shown for 3 seconds and nothing skips it: clicking it or pressing keys does nothing.
37. **Type sizes**: look at the Daily View, Statistics, Settings and the New task window in English and Arabic, light and dark, and with Windows text size 125% and 150%: text is easy to read (nothing under 12 px), headings are clearly bigger than labels, and no line is cut or overlaps.
38. **Electron Fuses (new in 1.0.0)**: the installed app starts, the window shows the Daily View, the tray icon, notifications and the full-screen reminder work. If the app does not start at all after installing this build, remove the `electronFuses` block from `package.json` (under `build`), build again, and tell me. The installer file is `WaqtWise-Setup-1.0.0.exe`.
39. **After an Electron upgrade** (the app now uses Electron 44): install the new build and go through checks 1 to 43 once, with extra care for the tray icon, notifications (click to open), the full-screen reminder and starting with Windows.
40. **Shorter Daily View (new in 1.0.0)**: on today, a finished past zone and an empty zone are one line each; click opens it, the small arrow in its band hides it again; a past zone with something not done stays open with a red "N not done"; opening today scrolls to the current zone; Settings -> Daily View -> *Empty and finished zones* -> Show in full shows everything. Check once in Arabic and once with Windows text size 125%.
41. **Window comes to the front (new in 1.0.0)**: restart Windows with *Start with Windows* on, wait for the desktop, then open WaqtWise from its shortcut: the window must appear full screen in front, not only flash in the taskbar. Also: minimize (button in the corner) hides it to the tray, and the tray icon opens it full size again.
42. **Any country, any city (new in 1.0.0)**: in Settings -> Prayer Times choose another country (for example Saudi Arabia), type a few letters of a city, pick it: a message says the city is saved and which calculation method was set; the five prayer times look right for that city compared with a trusted source; the zone times show in that city's time zone. Then choose Egypt and a city from its list again. Do the same on the first-run screen (delete the app's data folder to see it). Check once in Arabic (country names are Arabic, city names English).

43. **Public release and website (new in 1.0.0)**: after the repository is public and the website is published (see `docs/PUBLISHING.md`): open the website in English and Arabic on your phone and PC; the Download button opens your latest release (and, once a release is published, downloads the .exe); the links in the footer open the right pages and repository pages; the screenshots load; the Windows warning page and the code signing section read correctly. On a PC without the developer tools, install from the release and compare the SHA256 value (PowerShell `Get-FileHash`) with the one in the release notes.

If any of these fails, note which number and what you saw, and send it back.

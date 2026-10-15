# UI review and the shared design system

This is what the screen-by-screen review found, what was changed, and the rules to follow when adding screens.

## What was found (and fixed)

| # | Problem | Why it mattered | Fix |
|---|---------|-----------------|-----|
| 1 | Settings, dialogs and forms used an older "compact" style (corners 8-14 px, 38 px fields, 12-18 px padding) while Daily View, Statistics and the Free list use the newer one (corners 22 px, 44 px controls, roomy padding). | Two apps in one window; Settings looked unfinished. | Shared size scale (see below); cards, dialogs and settings sections now use the same corner and padding. |
| 2 | Settings was one 3,900 px page with no way to jump around. | Hard to find a setting. | An index row of section buttons stays at the top while scrolling. |
| 3 | Settings rows: labels centred against tall controls, drop-downs stretched across the whole window, no separation between settings. | Hard to scan, especially in Arabic where the label and its control ended up on opposite sides of a wide gap. | One row component (`settings-row`): label on top-left, control next to it, thin dividers, controls capped at a readable width. |
| 4 | Yes/no choices looked different: some were sliding switches, others plain checkboxes (Settings and the task form). | The same kind of choice looked like different controls. | One shared switch (`WW.onOffSwitch`) for every single yes/no setting and in the task form (Reminder, Full-screen alert, Show one note at random). Checkboxes stay only for "pick several" sets (Details shown, Buttons shown). |
| 5 | The Full-screen reminder section was one long list. | No grouping. | Three sub-headings: Behavior, Look, What it shows. |
| 6 | The Settings page title was a different size from the other page titles, and nothing said when settings are saved. | Inconsistent titles; people look for a Save button. | Same page-title component as the other screens, with "Changes are saved as you make them." |
| 7 | Inputs had square-ish corners next to rounded buttons (Free list "Add" row, headers). | Mismatch on one line. | Inputs, buttons and segmented controls share corners and height. |
| 8 | Hover, pressed and disabled states were missing on fields, segmented controls and day buttons. | Controls did not react to the mouse. | Added hover, pressed and disabled looks everywhere; keyboard focus ring is no longer cut off inside segmented controls. |
| 9 | Empty grey bubbles while the task form works out the times. | Looked broken for a moment. | A dash is shown until the time is ready. |
| 10 | No respect for "reduce motion". | Accessibility. | Transitions and scrolling animations are switched off when Windows asks for less motion. |
| 11 | Small tap targets on the remove "x" of reminder chips. | Hard to hit. | 24 px. |

## The shared scale (src/renderer/styles.css, top of the file)

- `--r-card` 22 px: cards, dialogs, settings sections.
- `--r-ctl-lg` 14 px at `--ctl-h-lg` 44 px: big controls in screen headers (date field, "Today", Manage, the Add row).
- `--r-ctl` 12 px at `--ctl-h` 40 px: buttons, fields, drop-downs, segmented controls, day toggles.
- `--r-sm` 10 px: small buttons and inline messages.
- `--gap-card` 18 px: space between cards.

Rules: use these variables, not new pixel values; a yes/no choice is `WW.onOffSwitch`; a setting is `row(label, control)` inside a `settings-grid`; a "pick several" set is checkboxes; a one-of-few choice is a segmented control.

## Still open (optional)

- Check the Arabic (right-to-left) screens on a real Windows machine, and with Windows text scaling at 125% and 150%.
- The sizes of the smallest labels (11-12 px) were left as they are; raising them would change the look of the Daily View.

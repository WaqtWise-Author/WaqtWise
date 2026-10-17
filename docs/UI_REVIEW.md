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
- The smallest text is now 12 px (it was 11 px in seven places); a test keeps it that way.
- Review of 15 Oct 2026, done: zone colors 1, 3 and dark 4, the bell badge, the error toast and the tick now have a contrast of 4.5 or more (tested); digits are equal-width only for times and numbers; Arabic has a line height of 1.65; padding and margins that must mirror use logical properties; priority also differs by size and has a text label for screen readers; dialogs keep Tab inside and move focus in; upcoming, missed, late and "continues" items work with Enter and Space; the keyboard focus stays on the same task when the day is redrawn; a long title shows in full as a tooltip.
- Arabic font: IBM Plex Sans Arabic (SIL Open Font License) is kept in `src/renderer/fonts-arabic/` (Regular, SemiBold, Bold, cut to the Arabic letters, about 60 KB each, with its license). Only Arabic letters use it; English letters and digits keep Plus Jakarta Sans, so a mixed line looks even. The old Segoe UI override for Arabic is removed. The full-screen alert uses it for Arabic text too, whatever font is chosen.
- Type scale (done): seven sizes, set once at the top of `styles.css` as `--fs-xs` 12, `--fs-sm` 14, `--fs-md` 16 (reading text), `--fs-lg` 18, `--fs-xl` 22, `--fs-2xl` 28, `--fs-3xl` 36. Before there were 13 sizes. Four weights: 400 reading text, 600 labels, buttons and item titles, 700 headings and values, 800 only for the big numbers and the brand name (it was five weights, and 500 is gone with its font files). Only the start-up and welcome screens scale with the window height, and the full-screen reminder scales with the screen. A test (`tests/a11y.test.js`) keeps all this. When adding a screen, use the tokens, never a new `px` size.
- Start-up splash: 3 seconds, nothing skips it (a click or a key press does nothing, and keys cannot reach the page behind it).

'use strict';

// WaqtWise - main screen logic (Daily View, navigation, bell, menu).

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP, arrowHead } = WW;

  WW.state = { settings: null, categories: [], cities: [], countries: [], methods: [], dayKey: null, view: 'daily', day: null, zoneOpen: {} };

  const view = () => document.getElementById('view');
  const anyDialogOpen = () => document.querySelector('.overlay') !== null;

  // The page follows the saved choice; "system" leaves it to the Windows setting (see styles.css).
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function effectiveTheme() {
    const saved = WW.state.settings && WW.state.settings.theme;
    if (saved === 'light' || saved === 'dark') return saved;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  function updateThemeButton() {
    const button = document.getElementById('theme-btn');
    if (!button) return;
    const dark = effectiveTheme() === 'dark';
    const label = T(dark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
    clear(button).appendChild(WW.icon(dark ? 'sun' : 'moon'));
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  WW.applyTheme = function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    updateThemeButton();
  };

  async function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try {
      WW.state.settings = await WW.call('saveSettings', { theme: next });
      WW.applyTheme(WW.state.settings.theme);
      if (WW.state.view === 'settings') WW.renderSettings();
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  }

  // ---- Daily View ---------------------------------------------------------------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // A ring showing "pct" percent. Built with SVG elements (no markup from data).
  function donut(size, radius, stroke, pct, color, numberSize) {
    const c = 2 * Math.PI * radius;
    const mid = size / 2;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `rotate(-90 ${mid} ${mid})`);
    [['var(--border)', c], [color, (c * pct) / 100]].forEach(([stroke_color, dash]) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(mid));
      circle.setAttribute('cy', String(mid));
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', stroke_color);
      circle.setAttribute('stroke-width', String(stroke));
      circle.setAttribute('stroke-dasharray', `${dash} ${c}`);
      g.appendChild(circle);
    });
    svg.appendChild(g);
    return h('div', { class: 'donut', style: { width: `${size}px`, height: `${size}px` } },
      svg, h('div', { class: 'donut-num', style: { fontSize: `${numberSize}px` }, text: `${pct}%` }));
  }

  const percent = (done, total) => (total ? Math.round((done / total) * 100) : 0);

  // The task row follows Settings -> Daily View: each piece of information is shown only when it is switched on there.
  // `info` may be passed in (the Settings preview does), otherwise the saved choice is used.
  function taskRow(t, info) {
    const show = info || (WW.state.settings && WW.state.settings.taskInfo) || {};
    const tags = [];
    if (show.category && t.categoryName) {
      tags.push(h('span', { class: 'tag pill' }, h('span', { class: 'dot', style: { background: t.categoryColor } }), t.categoryName));
    }
    if (show.status && t.overdue) tags.push(h('span', { class: 'tag late', text: T('Not Done') }));
    if (show.status && t.inProgress) tags.push(h('span', { class: 'tag live', text: T('In Progress') }));
    if (show.conflicts && t.overlaps) {
      const names = (t.conflictWith || []).map((n) => `“${n}”`).join(T(', '));
      tags.push(h('span', { class: 'tag warn conflict', title: T('Overlaps Another Task') },
        WW.icon('warn', 13, 2.6), names ? T('Conflict with {names}', { names }) : T('Conflict')));
    }
    if (show.backupStart && t.startWarning) tags.push(h('span', { class: 'tag warn', title: t.startWarning, text: T('⚠ Backup start time') }));
    if (show.continues && t.extendsPastZoneEnd) tags.push(h('span', { class: 'tag', title: T('Continues into the Next Zone'), text: T('→ Continues into next zone') }));
    if (show.repeat && t.repeatSummary) tags.push(h('span', { class: 'tag', title: T('Repeat'), text: `↻ ${t.repeatSummary}` }));
    if (show.startRule && t.startRuleLabel) tags.push(h('span', { class: 'tag', text: t.startRuleLabel }));
    if (show.reminders && t.reminderOffsets && t.reminderOffsets.length) {
      const labels = t.reminderOffsets.slice().sort((x, y) => y - x).map((n) => WW.offsetLabel(n)).join(T(', '));
      tags.push(h('span', { class: 'tag', title: T('Reminders') }, WW.icon('bell', 13, 2), labels));
    }
    if (show.fullScreen && t.hasFullScreen) tags.push(h('span', { class: 'tag', text: T('Full-Screen Alert') }));

    const check = h('button', {
      class: `check ${t.done ? 'on' : ''}`, type: 'button', disabled: Boolean(t.future && !t.done), title: t.future && !t.done ? T('This task is on a day that has not come yet') : null,
      'aria-label': T(t.done ? 'Mark "{title}" as not done' : 'Mark "{title}" as done', { title: t.title }), 'aria-pressed': String(t.done),
      onclick: async (event) => {
        event.stopPropagation();
        try {
          await WW.call('setDone', { taskId: t.taskId, dateKey: t.dateKey, done: !t.done });
          // A small sound when a task becomes done (not when the tick is taken back).
          if (!t.done && WW.state.settings) WW.sounds.play(WW.state.settings.doneSound, WW.state.settings.doneSoundVolume);
          WW.afterChange();
        } catch (error) {
          WW.toast(error.message, 'error');
        }
      },
    }, WW.icon('check', 15, 3.4));

    return h('div', {
      class: `task ${t.done ? 'done' : ''} ${t.overdue ? 'overdue' : ''} ${t.inProgress ? 'live' : ''}`, role: 'button', tabindex: '0', 'data-occ': `${t.taskId}@${t.dateKey}`,
      'aria-label': `${t.title}, ${t.startLabel}`,
      onclick: () => WW.openTaskDetails({ taskId: t.taskId, dateKey: t.dateKey }),
      onkeydown: (e) => {
        if (e.target !== e.currentTarget) return; // a key pressed on the tick button belongs to the button
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          WW.openTaskDetails({ taskId: t.taskId, dateKey: t.dateKey });
        }
      },
    },
      check,
      show.time || show.endTime
        ? h('div', { class: 'task-time' },
          show.time ? t.startLabel : t.endLabel,
          show.time && show.endTime ? h('small', { class: 'task-end', text: `– ${t.endLabel}` }) : null,
          show.time && t.afterMidnight ? h('small', { text: T('next day') }) : null)
        : null,
      h('div', { class: 'task-main' },
        h('div', { class: 'task-title', text: t.title, title: t.title }),
        tags.length ? h('div', { class: 'task-meta' }, tags) : null,
        show.notes && t.notesLine ? h('div', { class: 'task-notes', text: t.notesLine }) : null),
      show.duration ? h('div', { class: 'task-duration', text: t.durationLabel }) : null,
      show.priority ? h('span', { class: `prio ${t.priority}`, role: 'img', 'aria-label': T('{priority} priority', { priority: T(t.priority) }), title: T('{priority} priority', { priority: T(t.priority) }) }) : null);
  }

  WW.taskRow = taskRow;

  // Zones that can be folded into one line (Settings -> Daily View): a zone with nothing in it, and - on today - a zone
  // that is over with every task done. A zone that is over with something not done always stays open.
  function zoneKey(day, z) { return `${day.planningDayKey}#${z.index}`; }
  function isFoldable(day, z) {
    if (!(WW.state.settings && WW.state.settings.collapseZones)) return false;
    if (z.continued.length > 0) return false;
    if (z.taskCount === 0) return true;
    return Boolean(day.isCurrentDay && z.isPast && z.doneCount === z.taskCount);
  }
  function setZoneOpen(day, z, open) {
    WW.state.zoneOpen[zoneKey(day, z)] = open;
    const memory = { index: z.index, open };
    renderDay();
    const btn = view().querySelector(`.zone.z${memory.index} [data-zone-toggle]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  function foldedZone(day, z) {
    const summary = z.taskCount === 0
      ? T('No tasks · {free} free', { free: z.freeLabel })
      : `✓ ${T('{done} of {total} done', { done: z.doneCount, total: z.taskCount })}`;
    return h('section', { class: `zone z${z.index} folded`, 'aria-label': z.name },
      h('button', {
        class: 'zone-fold', type: 'button', 'data-zone-toggle': String(z.index), 'aria-expanded': 'false',
        'aria-label': `${T('Show {zone} zone', { zone: z.name })}: ${summary}`,
        onclick: () => setZoneOpen(day, z, true),
      },
      h('span', { class: 'zf-icon' }, WW.zoneIcon(z.index, 22)),
      h('span', { class: 'zf-name', text: z.name }),
      h('span', { class: 'zf-range', text: `${z.startLabel} – ${z.endLabel}` }),
      h('span', { class: `zf-sum${z.taskCount ? ' ok' : ''}` }, summary, h('span', { class: 'zf-chev', 'aria-hidden': 'true' }, WW.icon('chevron-down', 16, 2.4)))));
  }

  function zoneSection(z, day) {
    if (isFoldable(day, z) && !WW.state.zoneOpen[zoneKey(day, z)]) return foldedZone(day, z);
    const foldBack = isFoldable(day, z);
    const notDone = z.isPast && day.isCurrentDay ? z.taskCount - z.doneCount : 0;
    const fill = h('div', { class: 'timeline-fill' });
    // Square, touching pieces: back-to-back tasks look like one continuous band.
    z.segments.forEach((s) =>
      fill.appendChild(h('div', {
        class: `seg ${s.done ? 'done' : ''}`,
        title: s.title,
        // Each task piece takes its category's color (the zone color when it has no category).
        style: Object.assign({ insetInlineStart: `${s.leftPct}%`, width: `${s.widthPct}%` }, s.color ? { background: s.color } : {}),
      })));
    const timeline = h('div', { class: 'timeline' }, fill);
    z.confSegs.forEach((c) =>
      timeline.appendChild(h('div', { class: 'conflict-seg', title: c.title, style: { insetInlineStart: `${c.leftPct}%`, width: `${c.widthPct}%` } })));
    if (z.nowPct !== null) timeline.appendChild(h('div', { class: 'now', style: { insetInlineStart: `${z.nowPct}%` }, title: T('Now') }));

    const body = h('div', { class: 'zone-body' });
    z.continued.forEach((c) =>
      body.appendChild(h('div', {
        class: 'continues', role: 'button', tabindex: '0', text: T('↳ Continues from “{title}” ({minutes} here, until {end})', { title: c.title, minutes: c.minutesLabel, end: c.endLabel }),
        onclick: () => WW.openTaskDetails({ taskId: c.taskId, dateKey: c.dateKey }),
      })));
    if (z.tasks.length === 0 && z.continued.length === 0) {
      body.appendChild(h('div', { class: 'empty-zone', text: T('No tasks in this zone yet.') }));
    }
    z.tasks.forEach((t) => body.appendChild(taskRow(t)));

    const pct = percent(z.doneCount, z.taskCount);
    const conflictText = TP(z.conflictCount, '1 conflict', '{n} conflicts');

    return h('section', { class: `zone z${z.index} ${z.isCurrent ? 'current' : ''}`, 'aria-label': z.name },
      h('div', { class: 'zone-band' },
        h('div', { class: 'zone-band-left' },
          WW.zoneIcon(z.index, 26),
          h('h2', { class: 'zone-name' }, z.name),
          z.isCurrent ? h('span', { class: 'band-chip now-chip', text: T('NOW') }) : null,
          notDone > 0 ? h('span', { class: 'band-chip notdone-chip', text: TP(notDone, '{n} not done', '{n} not done') }) : null,
          z.conflictCount ? h('span', { class: 'band-chip conflict-chip' }, WW.icon('warn', 13, 2.6), conflictText) : null),
        h('span', { class: 'zone-band-right' },
          h('span', { class: 'zone-range', text: `${z.startLabel} – ${z.endLabel}` }),
          foldBack ? h('button', {
            class: 'zone-unfold', type: 'button', 'data-zone-toggle': String(z.index), 'aria-expanded': 'true',
            'aria-label': T('Hide {zone} zone', { zone: z.name }), title: T('Hide {zone} zone', { zone: z.name }),
            onclick: () => setZoneOpen(day, z, false),
          }, WW.icon('chevron-up', 16, 2.4)) : null)),
      h('div', { class: 'zone-summary' },
        h('div', { class: 'zone-summary-main' },
          h('div', { class: 'zone-times' }, h('span', { text: z.startLabel }), timeline, h('span', { text: z.endLabel })),
          h('div', { class: 'zone-figures' },
            h('span', { class: 'fig' }, T('Total'), ' ', h('b', { text: z.totalLabel })),
            h('span', { class: 'fig' }, T('Scheduled'), ' ', h('b', { text: z.scheduledLabel })),
            h('span', { class: 'fig free' }, T('Free'), ' ', h('b', { text: z.freeLabel })))),
        h('div', { class: 'zone-done', role: 'img', 'aria-label': T('{pct}% done: {done} of {total} tasks', { pct, done: z.doneCount, total: z.taskCount }) },
          donut(76, 30, 8, pct, 'var(--zf)', 16),
          h('div', {},
            h('div', { class: 'stat-label', text: T('Completed') }),
            h('div', { class: 'stat-value' }, T('{done} of {total}', { done: z.doneCount, total: z.taskCount }))))),
      body);
  }

  function heroCard(day) {
    const cur = day.currentZone;
    const pct = percent(day.doneCount, day.taskCount);
    const title = cur ? cur.name : day.isCurrentDay ? T('Between Zones') : T('Day Overview');
    const sub = cur
      ? [h('b', { text: cur.timeLeftLabel }), cur.nextName ? T(' until {zone} · ', { zone: arrowHead(cur.nextName) }) : T(' left · '), T('{free} free in this zone', { free: cur.freeLabel })]
      : [TP(day.taskCount, '{n} task planned for this day', '{n} tasks planned for this day')];

    const bars = h('div', { class: 'strip-bars' });
    const labels = h('div', { class: 'strip-labels' });
    day.zones.forEach((z) => {
      const grow = `${z.minutes} 1 0`;
      const dim = day.isCurrentDay && !z.isCurrent ? 0.45 : 1;
      bars.appendChild(h('div', { class: `z${z.index}`, style: { flex: grow, opacity: String(dim) }, title: `${z.name} · ${z.startLabel} – ${z.endLabel}` }));
      // A short zone (like Maghrib) has no room for its name: it goes on a second line instead of being cut off.
      const narrow = day.zones.length > 0 && (z.minutes / day.zones.reduce((n, x) => n + x.minutes, 0)) < 0.09;
      if (narrow) labels.classList.add('has-narrow');
      labels.appendChild(h('div', { class: narrow ? 'narrow' : '', style: { flex: grow }, text: arrowHead(z.name) }));
    });
    const strip = h('div', { class: 'day-strip' }, bars);
    if (day.dayNowPct !== null) strip.appendChild(h('div', { class: 'strip-now', style: { insetInlineStart: `${day.dayNowPct}%` }, title: T('Now') }));
    strip.appendChild(labels);

    return h('section', { class: 'hero', 'aria-label': T('Right Now') },
      h('div', { class: 'hero-top' },
        h('div', {},
          h('div', { class: 'hero-eyebrow', text: cur ? T('RIGHT NOW') : day.isCurrentDay ? T('TODAY') : T('OVERVIEW') }),
          h('div', { class: 'hero-title', text: title }),
          h('div', { class: 'hero-sub' }, sub)),
        h('div', { class: 'hero-cards' },
          h('div', { class: 'stat-card', role: 'img', 'aria-label': T('Done {done} of {total} tasks ({pct}%)', { done: day.doneCount, total: day.taskCount, pct }) },
            donut(64, 25, 7, pct, 'var(--accent)', 14),
            h('div', {},
              h('div', { class: 'stat-label', text: day.isCurrentDay ? T('Done Today') : T('Done') }),
              h('div', { class: 'stat-value' }, `${day.doneCount} `, h('small', { text: `/ ${day.taskCount}` })))),
          day.isCurrentDay
            ? h('div', { class: 'stat-card plain' },
              h('div', { class: 'stat-label', text: T('In Progress') }),
              h('div', { class: 'stat-text', text: day.inProgress.length ? day.inProgress.join(T(', ')) : '—' }),
              day.freeHint ? h('div', { class: 'stat-hint', text: day.freeHint }) : null)
            : null)),
      strip);
  }

  // The page is drawn again every 30 seconds and after every change. The element that had the keyboard focus
  // (a task row or its tick button) gets it back, so keyboard users are not thrown to the top of the page.
  function focusMemory() {
    const el = document.activeElement;
    const row = el && el.closest ? el.closest('.task[data-occ]') : null;
    if (!row || !view().contains(el)) return null;
    return { occ: row.getAttribute('data-occ'), onCheck: el.classList.contains('check') };
  }
  function restoreFocus(memory) {
    if (!memory) return;
    const row = Array.from(view().querySelectorAll('.task[data-occ]')).find((r) => r.getAttribute('data-occ') === memory.occ);
    const target = row && (memory.onCheck ? row.querySelector('.check') : row);
    if (target) target.focus({ preventScroll: true });
  }

  // ---- the arrows beside the week strip: one day at a time, and holding the button keeps going -------------------------

  const STEP_FIRST_MS = 420; // how long the button is held before it starts repeating
  const STEP_SLOW_MS = 230; // the gap between repeated steps at first ...
  const STEP_FAST_MS = 120; // ... and after a while
  const hold = { dir: 0, timer: null, count: 0 };

  function addDaysToKey(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  // Moves the selected day by one. The key comes from the day that was asked for last, so quick repeats never skip or repeat a day.
  function stepDay(dir, ms) {
    const from = WW.state.dayKey || (WW.state.day && WW.state.day.planningDayKey);
    if (!from) return;
    WW.state.step = { dir, ms: ms || STEP_SLOW_MS };
    WW.showDay(addDaysToKey(from, dir));
  }

  function stopHolding() {
    hold.dir = 0;
    clearTimeout(hold.timer);
    hold.timer = null;
  }

  function holdTick() {
    if (!hold.dir) return;
    hold.count += 1;
    const ms = hold.count > 6 ? STEP_FAST_MS : STEP_SLOW_MS;
    stepDay(hold.dir, ms);
    hold.timer = setTimeout(holdTick, ms);
  }

  function stepButton(dir, label) {
    return h('button', {
      class: 'icon-btn sm step-btn', type: 'button', 'aria-label': label, title: label, 'data-step': String(dir),
      // A mouse or finger: one step at once, and more while it stays down. (The page is redrawn after each step, so the button
      // that was pressed is replaced; the release is caught on the whole document below.)
      onpointerdown: (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        stopHolding();
        hold.dir = dir;
        hold.count = 0;
        stepDay(dir, STEP_SLOW_MS);
        hold.timer = setTimeout(holdTick, STEP_FIRST_MS);
      },
      // The keyboard (Enter or Space) clicks with no pointer: one step, and the focus stays on the arrow.
      onclick: (e) => {
        if (e.detail === 0) { WW.state.focusStep = dir; stepDay(dir, STEP_SLOW_MS); }
      },
    }, WW.icon(WW.arrowIcon(dir < 0 ? 'prev' : 'next'), 18, 2.2));
  }

  for (const type of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(type, stopHolding);

  // The cards slide one place: the chosen day stays in the middle and the others move past it.
  // The new strip is drawn in its final place and every card starts one place away, then glides to where it belongs.
  function slideStrip(root, step) {
    const box = root.querySelector('.week-chips');
    const chips = box ? Array.from(box.children) : [];
    if (chips.length < 3 || !box.animate) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const slot = chips[1].offsetLeft - chips[0].offsetLeft; // one card plus the gap (negative when the page runs right to left)
    const fromX = step.dir * slot;
    const timing = { duration: step.ms, easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)', fill: 'backwards' };
    chips.forEach((chip, i) => {
      chip.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(0)' }], timing);
      const entering = i === (step.dir > 0 ? chips.length - 1 : 0); // the card that comes in from the edge
      if (entering) chip.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    });
    const left = chips[(chips.length >> 1) - step.dir];
    if (left) {
      const fade = h('span', { class: 'day-chip-fade', 'aria-hidden': 'true' });
      left.appendChild(fade);
      fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: step.ms, easing: 'ease-out', fill: 'forwards' }).onfinish = () => fade.remove();
    }
  }

  function renderDay() {
    const day = WW.state.day;
    const memory = focusMemory();
    const root = clear(view());
    const step = WW.state.step;
    WW.state.step = null;

    const picker = h('input', {
      type: 'date', value: day.planningDayKey, 'aria-label': T('Jump to Date'),
      onchange: (e) => { if (e.target.value) WW.showDay(e.target.value); },
    });

    const week = day.week;
    const chip = (d) => h('button', {
      class: `day-chip${d.isSelected ? ' on' : ''}${d.isToday ? ' today' : ''}`, type: 'button',
      'aria-pressed': String(d.isSelected), 'aria-label': d.label, title: d.label,
      onclick: () => { if (!d.isSelected) WW.showDay(d.key); },
    },
    h('span', { class: 'day-chip-wd', text: d.isToday ? T('TODAY') : d.weekday.toUpperCase() }),
    h('span', { class: 'day-chip-n', text: String(d.day) }),
    h('span', { class: 'day-chip-track', 'aria-hidden': 'true' }, h('span', { class: 'day-chip-fill', style: { width: `${d.pct}%` } })));

    root.append(
      h('div', { class: 'day-head' },
        h('div', { class: 'day-info' },
          h('h1', { class: 'day-title', text: day.dateTitle }),
          h('div', { class: 'day-sub' },
            day.hijri ? h('span', { class: 'hijri', text: day.hijri }) : null,
            h('span', { text: day.planningLine })),
          h('div', { class: 'day-actions' },
            h('button', { class: 'btn', text: T('Today'), onclick: () => WW.showDay(WW.state.todayKey || day.currentPlanningDayKey) }),
            picker)),
        h('div', { class: 'week-strip', role: 'group', 'aria-label': T('Days of This Week') },
          stepButton(-1, T('Previous Day')),
          h('div', { class: 'week-chips' }, week.days.map(chip)),
          stepButton(1, T('Next Day')))),
      heroCard(day),
      h('div', { class: 'zones' }, day.zones.map((z) => zoneSection(z, day))));
    restoreFocus(memory);
    if (step) slideStrip(root, step);
    if (WW.state.focusStep) {
      const arrow = root.querySelector(`.step-btn[data-step="${WW.state.focusStep}"]`);
      WW.state.focusStep = 0;
      if (arrow) arrow.focus({ preventScroll: true });
    }
  }

  // Only the newest request may draw: an older answer that arrives late must not replace the day the person chose.
  let showSeq = 0;
  WW.showDay = async function showDay(key) {
    const seq = ++showSeq;
    try {
      // Redrawing the same day (ticking a task, a background refresh) must not throw the page back to the top.
      const keepScroll = WW.state.view === 'daily' && WW.state.dayKey === key;
      const scrollY = window.scrollY;
      WW.state.view = 'daily';
      WW.state.dayKey = key;
      const day = await WW.call('getDay', key);
      if (seq !== showSeq) return;
      WW.state.day = day;
      WW.state.todayKey = day.currentPlanningDayKey;
      renderDay();
      if (keepScroll) window.scrollTo(0, scrollY);
      else if (day.isCurrentDay) {
        // Opening today: when the zone happening now (or the next one with something in it) starts low on the screen,
        // scroll it up. When it is already well in view the top of the page - the "Right Now" card - stays.
        const target = view().querySelector('.zone.current') || view().querySelector('.zone:not(.folded)');
        if (target && target.scrollIntoView && target.getBoundingClientRect().top > window.innerHeight * 0.6) target.scrollIntoView({ block: 'start' });
      }
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };

  WW.showDaily = function showDaily() {
    return WW.showDay(WW.state.dayKey || WW.state.todayKey);
  };

  WW.showSettings = function showSettings() {
    WW.state.view = 'settings';
    WW.renderSettings();
    window.scrollTo(0, 0);
  };

  // Redraw the day on screen. If it was "today" and a new Planning Day has begun since (Fajr passed while the window
  // was open or hidden in the tray), move on to the new day instead of staying on yesterday.
  WW.refreshDay = async function refreshDay() {
    const wasToday = WW.state.dayKey === WW.state.todayKey;
    await WW.showDay(WW.state.dayKey);
    if (wasToday && WW.state.view === 'daily' && WW.state.todayKey && WW.state.todayKey !== WW.state.dayKey) {
      await WW.showDay(WW.state.todayKey);
    }
  };

  // Called after anything changes the data.
  WW.afterChange = async function afterChange() {
    refreshBell();
    WW.refreshSaveBanner();
    if (WW.state.view === 'daily') await WW.refreshDay();
    else if (WW.state.view === 'stats') await WW.showStats();
    else if (WW.state.view === 'free') await WW.showFree();
    else if (WW.state.view === 'routines') await WW.showRoutines();
  };

  // ---- Banner: the data could not be saved -----------------------------------------------------------------------

  // Shown as long as the last save failed, and hidden by itself when a save works again.
  WW.refreshSaveBanner = async function refreshSaveBanner() {
    const banner = document.getElementById('save-banner');
    if (!banner) return;
    let status;
    try {
      status = await window.api.call('getSaveStatus');
    } catch (error) {
      return;
    }
    if (status.ok) {
      banner.hidden = true;
      clear(banner);
      return;
    }
    clear(banner).append(
      h('div', { class: 'save-text' },
        T('Your changes could not be saved. Do not close WaqtWise yet.'),
        h('span', { class: 'save-reason', text: status.message })),
      h('button', { class: 'btn small', type: 'button', id: 'save-retry', text: T('Try Again'), onclick: async () => {
        try { await window.api.call('retrySave'); } catch (error) { /* the banner says why */ }
        await WW.refreshSaveBanner();
        const again = document.getElementById('save-banner');
        if (again && again.hidden) WW.toast(T('Saved'));
      } }),
      h('button', { class: 'btn small', type: 'button', id: 'save-export', text: T('Export a Copy'), onclick: () => WW.exportData() }));
    banner.hidden = false;
  };

  // ---- Bar: reminders or routines are paused (from the tray menu) -----------------------------------------------------

  WW.refreshPauseBanner = async function refreshPauseBanner(state) {
    const banner = document.getElementById('pause-banner');
    if (!banner) return;
    try {
      state = state || await window.api.getPauseState();
    } catch (error) {
      return;
    }
    const rows = [];
    const row = (kind, text) => h('div', { class: 'pause-row', 'data-kind': kind },
      h('span', { class: 'pause-text', text }),
      h('button', { class: 'btn small', type: 'button', id: `pause-resume-${kind}`, text: kind === 'routines' ? T('Resume Routines') : T('Resume Reminders'),
        onclick: async () => { try { await WW.refreshPauseBanner(await window.api.resumePause(kind)); } catch (error) { WW.toast(error.message, 'error'); } } }));
    if (state && state.reminders) rows.push(row('reminders', T('Reminders Paused Until {time}', { time: state.reminders.label })));
    if (state && state.routines) rows.push(row('routines', T('Routines Paused Until {time}', { time: state.routines.label })));
    clear(banner);
    banner.hidden = rows.length === 0;
    if (rows.length) banner.append(...rows);
  };

  // ---- Bell and menu ----------------------------------------------------------------------------------------------

  function closePopovers() {
    document.getElementById('bell-panel').hidden = true;
  }

  // The bell shows reminders that were missed while the computer was off or asleep.
  // It shows a red number when there are some, and looks faded when there are none.
  WW.refreshBell = refreshBell;
  async function refreshBell() {
    const button = document.getElementById('bell-btn');
    if (!button) return null;
    try {
      const list = await WW.call('getMissed');
      WW.state.missedCount = list.length;
      button.classList.toggle('bell-empty', list.length === 0);
      const label = list.length === 0 ? T('No Missed Reminders') : TP(list.length, '{n} missed reminder', '{n} missed reminders');
      button.title = label;
      button.setAttribute('aria-label', label);
      let badge = button.querySelector('.bell-badge');
      if (list.length === 0) {
        if (badge) badge.remove();
      } else {
        if (!badge) { badge = h('span', { class: 'bell-badge', 'aria-hidden': 'true' }); button.appendChild(badge); }
        badge.textContent = list.length > 99 ? '99+' : String(list.length);
      }
      return list;
    } catch (error) {
      return null;
    }
  }

  async function toggleBell() {
    const panel = document.getElementById('bell-panel');
    const wasHidden = panel.hidden;
    closePopovers();
    if (!wasHidden) return;
    const list = (await refreshBell()) || [];
    clear(panel).appendChild(h('div', { class: 'popover-head' },
      h('h3', { text: T('Missed Reminders') }),
      list.length ? h('button', {
        class: 'link-btn', type: 'button', text: T('Clear All'),
        onclick: async () => {
          try { await WW.call('clearMissed'); } catch (error) { WW.toast(error.message, 'error'); }
          closePopovers();
          refreshBell();
        },
      }) : null));
    if (list.length === 0) panel.appendChild(h('div', { class: 'empty-zone', text: T('No missed reminders.') }));
    list.forEach((r) =>
      panel.appendChild(h('div', {
        class: 'upcoming-item', role: 'button', tabindex: '0',
        onclick: async () => {
          closePopovers();
          try { await WW.call('dismissMissed', { taskId: r.taskId, dateKey: r.dateKey }); } catch (error) { /* the task may be gone */ }
          refreshBell();
          WW.openTaskDetails({ taskId: r.taskId, dateKey: r.dateKey });
        },
      },
        h('div', { class: 'when', text: r.title }),
        h('div', { class: 'what', text: `${r.alreadyStarted ? T('Started') : T('Was due')} ${r.whenLabel} · ${r.zoneName}` }))));
    panel.hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawer').hidden = true;
    document.getElementById('scrim').hidden = true;
    document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
  }

  async function openDrawer() {
    closePopovers();
    if (WW.refreshFreeCount) await WW.refreshFreeCount();
    const drawer = document.getElementById('drawer');
    const item = (icon, label, fn, active) => h('button', {
      class: `drawer-item ${active ? 'active' : ''}`, type: 'button',
      onclick: () => { closeDrawer(); fn(); },
    }, WW.icon(icon, 20, 1.9), label);
    clear(drawer).append(
      h('div', { class: 'drawer-head' },
        h('img', { class: 'app-logo', src: 'logo.png', alt: '' }),
        h('div', { class: 'drawer-title', text: 'WaqtWise' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': T('Close Menu'), onclick: closeDrawer }, WW.icon('close', 18, 2))),
      item('calendar', T('Daily View'), () => WW.showDaily(), WW.state.view === 'daily'),
      item('check', T('Free To-Do List') + (WW.state.freeCount ? ` (${WW.state.freeCount})` : ''), () => WW.showFree(), WW.state.view === 'free'),
      item('bell', T('Routines'), () => WW.showRoutines(), WW.state.view === 'routines'),
      item('chart', T('Statistics'), () => WW.showStats({ range: 'week' }), WW.state.view === 'stats'),
      item('gear', T('Settings'), () => WW.showSettings(), WW.state.view === 'settings'));
    drawer.hidden = false;
    document.getElementById('scrim').hidden = false;
    document.getElementById('menu-btn').setAttribute('aria-expanded', 'true');
    const first = drawer.querySelector('.drawer-item');
    if (first) first.focus();
  }

  // ---- Export / import --------------------------------------------------------------------------------------------------

  WW.exportData = async function exportData() {
    try {
      const result = await window.api.exportData();
      if (result && result.ok) WW.toast(T('Backup Saved'));
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };

  WW.importData = async function importData() {
    const go = await WW.ask({
      title: T('Import Data'),
      message: T('Importing a backup replaces ALL tasks, categories and settings on this computer with the contents of the file. Continue?'),
      choices: [{ label: T('Cancel'), value: false }, { label: T('Choose File…'), value: true, kind: 'primary' }],
    });
    if (!go) return;
    try {
      const result = await window.api.importData();
      if (!result || result.canceled) return;
      await reloadEverything();
      const extra = result.warnings && result.warnings.length ? T(' ({n} item(s) skipped)', { n: result.warnings.length }) : '';
      WW.toast(T('Imported {n} task(s)', { n: result.tasks }) + extra);
      if (result.warnings && result.warnings.length) {
        const dlg = WW.openDialog({ title: T('Some items were skipped') });
        result.warnings.forEach((w) => dlg.body.appendChild(h('p', { text: w })));
        dlg.footer.appendChild(h('button', { class: 'btn primary', text: T('OK'), onclick: () => dlg.close() }));
      }
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };

  // ---- Restore from a saved copy -----------------------------------------------------------------------------------

  const BACKUP_KIND = () => ({ daily: T('Daily Copy'), 'before-import': T('Before an Import'), 'before-restore': T('Before a Restore') });

  WW.restoreBackup = async function restoreBackup() {
    let list;
    try {
      list = await WW.call('listBackups');
    } catch (error) {
      WW.toast(error.message, 'error');
      return;
    }
    const dlg = WW.openDialog({ title: T('Restore from Backup') });
    dlg.body.appendChild(h('p', { class: 'dialog-message', text: T('WaqtWise keeps a copy of your data every day (last 7 days) and one before every import or restore. Restoring replaces all tasks, categories and settings with the chosen copy. Your current data is saved first, so you can undo it from this same list.') }));
    if (!list.length) {
      dlg.body.appendChild(h('p', { class: 'hint', text: T('No saved copies yet. The first one is made automatically today.') }));
    }
    const box = h('div', { class: 'backup-list' });
    list.forEach((b) => {
      const when = b.time ? `${b.date}  ${b.time}` : b.date;
      box.appendChild(h('div', { class: 'backup-row' },
        h('div', { class: 'backup-info' },
          h('strong', { text: when }),
          h('span', { class: 'hint', text: `${BACKUP_KIND()[b.kind] || b.kind} · ${TP(b.tasks, '{n} task', '{n} tasks')}` })),
        h('button', { class: 'btn', text: T('Restore'), 'aria-label': T('Restore the copy from {when}', { when }), onclick: async () => {
          const go = await WW.ask({
            title: T('Restore this copy?'),
            message: T('All tasks, categories and settings will be replaced with the copy from {when} ({tasks}).', { when, tasks: TP(b.tasks, '{n} task', '{n} tasks') }),
            choices: [{ label: T('Cancel'), value: false }, { label: T('Restore'), value: true, kind: 'primary' }],
          });
          if (!go) return;
          try {
            const result = await WW.call('restoreBackup', { id: b.id });
            dlg.close();
            await reloadEverything();
            WW.toast(T('Restored {n} task(s)', { n: result.tasks }));
          } catch (error) {
            WW.toast(error.message, 'error');
          }
        } })));
    });
    dlg.body.appendChild(box);
    dlg.footer.appendChild(h('button', { class: 'btn', text: T('Close'), onclick: () => dlg.close() }));
  };

  WW.refreshCity = async function refreshCity() {
    WW.state.city = await WW.call('getCityInfo');
  };

  WW.reloadEverything = reloadEverything;
  async function reloadEverything() {
    const boot = await WW.call('bootstrap');
    Object.assign(WW.state, { settings: boot.settings, categories: boot.categories, cities: boot.cities, countries: boot.countries, methods: boot.methods, city: boot.city, version: boot.version, todayKey: boot.currentPlanningDayKey });
    WW.applyLanguage(boot.settings.language);
    const add = document.getElementById('add-btn');
    if (add) clear(add).append(WW.icon('plus', 16, 2.6), T('New Task'));
    WW.applyTheme(boot.settings.theme);
    if (WW.refreshBell) WW.refreshBell();
    if (WW.state.view === 'settings') WW.renderSettings();
    else if (WW.state.view === 'stats') await WW.showStats();
    else if (WW.state.view === 'free') await WW.showFree();
    else if (WW.state.view === 'routines') await WW.showRoutines();
    else await WW.showDay(WW.state.todayKey);
    return boot;
  }

  // ---- Missed reminders --------------------------------------------------------------------------------------------------

  WW.showMissed = function showMissed(items) {
    if (!items || items.length === 0) return;
    const dlg = WW.openDialog({ title: TP(items.length, 'You missed 1 reminder', 'You missed {n} reminders') });
    dlg.body.appendChild(h('p', { class: 'hint', text: T('These reminders came due while the computer was off or asleep:') }));
    items.forEach((i) =>
      dlg.body.appendChild(h('div', {
        class: 'upcoming-item', role: 'button', tabindex: '0',
        onclick: async () => {
          dlg.close();
          try { await WW.call('dismissMissed', { taskId: i.taskId, dateKey: i.dateKey }); } catch (error) { /* ignore */ }
          refreshBell();
          WW.openTaskDetails({ taskId: i.taskId, dateKey: i.dateKey });
        },
      },
        h('div', { class: 'when', text: i.title }),
        h('div', { class: 'what', text: `${i.alreadyStarted ? T('Started at {at}', { at: i.startLabel }) : T('Starts at {at}', { at: i.startLabel })} · ${i.zoneName}` }))));
    dlg.footer.appendChild(h('button', { class: 'btn primary', text: T('OK'), onclick: () => dlg.close() }));
  };

  // ---- First run ---------------------------------------------------------------------------------------------------------

  // First run: the welcome screen asks for the city (prayer times depend on it), then the app starts.
  WW.showWelcome = function showWelcome() {
    let city = WW.state.settings.cityName;
    let country = 'EG';
    let worldChosen = null; // { name, timeZone } once a city of another country has been picked (it is saved at once)
    const select = h('select', { id: 'welcome-city', 'aria-label': T('Your City'), onchange: (e) => { city = e.target.value; } },
      WW.state.cities.map((name) => h('option', { value: name, text: T(name), selected: name === city })));
    const cityBox = h('div', { class: 'welcome-city-box' });
    const drawCity = () => {
      cityBox.replaceChildren();
      if (country === 'EG') { cityBox.append(select); return; }
      if (worldChosen) cityBox.append(h('p', { class: 'current-city', role: 'status' }, `✓ ${worldChosen.name}`, h('small', { text: ` · ${T('Time Zone')}: ${worldChosen.timeZone}` })));
      cityBox.append(
        WW.worldCitySearch({
          country,
          onChosen: async () => {
            const saved = await WW.call('getSettings');
            WW.state.settings = saved;
            worldChosen = { name: saved.customCity.name, timeZone: saved.customCity.timeZone };
            drawCity();
          },
        }));
    };
    const countrySel = WW.countrySelect({ id: 'welcome-country', value: country, onChange: (code) => { country = code; worldChosen = null; drawCity(); } });
    drawCity();
    const strip = h('div', { class: 'splash-strip', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('div', { class: `z${n}` })));
    const start = h('button', {
      class: 'btn primary', type: 'button',
      onclick: async () => {
        try {
          if (country !== 'EG' && !worldChosen) { WW.toast(T('Choose your city first.'), 'error'); return; }
          WW.state.settings = await WW.call('saveSettings', country === 'EG'
            ? { cityName: city, useCustomCity: false, countryCode: 'EG', welcomeShown: true }
            : { welcomeShown: true });
          const boot = await WW.call('bootstrap'); // the chosen city decides which Planning Day it is
          Object.assign(WW.state, { city: boot.city, todayKey: boot.currentPlanningDayKey });
          screen.releaseBehind();
          screen.remove();
          await WW.showDay(WW.state.todayKey);
        } catch (error) {
          WW.toast(error.message, 'error');
        }
      },
    }, T('Start Planning'), WW.icon(WW.arrowIcon('next'), 20, 2.4));
    const screen = h('div', { class: 'welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('Welcome to WaqtWise') },
      h('div', { class: 'welcome-brand' },
        h('img', { src: 'logo-large.png', alt: '' }),
        h('div', { class: 'welcome-name', text: 'WaqtWise' }),
        h('p', { text: T('Make every waqt count, wisely.') }),
        strip),
      h('div', { class: 'welcome-form' },
        h('div', { class: 'welcome-eyebrow', text: T('WELCOME') }),
        h('h2', { text: T('Let\u2019s Set Up Your Day') }),
        h('p', { class: 'lead', text: T('WaqtWise divides your day into 5 zones using the prayer times, so it needs to know your city.') }),
        h('label', { for: 'welcome-country', text: T('Your Country') }),
        countrySel,
        h('label', { for: 'welcome-city', text: T('Your City') }),
        cityBox,
        h('p', { class: 'hint', text: T('You can change this later in Settings. Everything stays on this computer.') }),
        start));
    // A real dialog: nothing behind it can be reached with Tab or the mouse until the city is chosen.
    const behind = [...document.body.children].filter((el) => el.tagName !== 'SCRIPT' && el.id !== 'splash');
    behind.forEach((el) => { el.inert = true; });
    document.body.appendChild(screen);
    start.focus();
    screen.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const items = [...screen.querySelectorAll('select, button:not(:disabled), input')];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    screen.releaseBehind = () => behind.forEach((el) => { el.inert = false; });
  };

  // The splash covers the window for 3 seconds at every start. Nothing skips it: a click or a key press does nothing.
  const SPLASH_MS = Number.isFinite(window.WW_SPLASH_MS) ? window.WW_SPLASH_MS : 3000; // the checks in tools/ui-check.js shorten it
  function ignoreWhileSplash(event) { event.preventDefault(); event.stopPropagation(); }
  const splashStarted = Date.now();
  function hideSplash() {
    const splash = document.getElementById('splash');
    if (!splash || splash.dataset.leaving) return;
    splash.dataset.leaving = '1';
    // While it shows, key presses are swallowed so nothing behind it can be triggered by accident.
    document.addEventListener('keydown', ignoreWhileSplash, true);
    document.addEventListener('keyup', ignoreWhileSplash, true);
    const leave = () => {
      document.removeEventListener('keydown', ignoreWhileSplash, true);
      document.removeEventListener('keyup', ignoreWhileSplash, true);
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 500);
    };
    setTimeout(leave, Math.max(0, SPLASH_MS - (Date.now() - splashStarted)));
  }

  // ---- Start-up -------------------------------------------------------------------------------------------------------------

  async function init() {
    const put = (id, node) => clear(document.getElementById(id)).appendChild(node);
    put('menu-btn', WW.icon('menu', 22, 1.9));
    put('bell-btn', WW.icon('bell'));
    clear(document.getElementById('add-btn')).append(WW.icon('plus', 16, 2.6), T('New Task'));
    updateThemeButton();
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', updateThemeButton);

    document.getElementById('menu-btn').addEventListener('click', (e) => { e.stopPropagation(); openDrawer(); });
    document.getElementById('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closePopovers(); } });
    document.getElementById('theme-btn').addEventListener('click', toggleTheme);
    document.getElementById('bell-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleBell(); });
    document.getElementById('add-btn').addEventListener('click', () => {
      closePopovers();
      WW.openTaskForm({ mode: 'create', defaultKey: WW.state.dayKey || WW.state.todayKey });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.popover') && !e.target.closest('.icon-btn')) closePopovers();
    });

    try {
      const boot = await reloadEverything();
      if (boot.loadNotes && boot.loadNotes.length) WW.toast(boot.loadNotes[0], 'error');
    } catch (error) {
      clear(view()).appendChild(h('div', { class: 'errors', text: T('Could not start: {error}', { error: error.message }) }));
      hideSplash();
      return;
    }

    refreshBell();
    WW.refreshSaveBanner();
    WW.refreshPauseBanner();
    // While the window is hidden in the tray nothing is redrawn; when it comes back the page is refreshed at once.
    setInterval(() => { if (!document.hidden) WW.refreshSaveBanner(); }, 15000);
    if (!WW.state.settings.welcomeShown) WW.showWelcome();
    hideSplash();

    // The window keeps itself fresh: current zone, overdue marks, and changes made elsewhere.
    setInterval(() => {
      if (document.hidden || anyDialogOpen()) return;
      // The Statistics screen is heavy, so it is recalculated only when asked for (opening it, changing the range, a change of data).
      if (WW.state.view === 'daily') WW.afterChange();
      else refreshBell();
    }, 30000);
    window.addEventListener('focus', () => { if (!anyDialogOpen()) WW.afterChange(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !anyDialogOpen()) WW.afterChange(); });

    if (window.api && window.api.on) {
      window.api.on('data-changed', () => { if (document.hidden) return; if (!anyDialogOpen()) WW.afterChange(); else refreshBell(); });
      window.api.on('missed', (items) => { refreshBell(); WW.showMissed(items); });
      window.api.on('show-daily', () => {
        if (!anyDialogOpen() && WW.state.settings && WW.state.settings.welcomeShown) { WW.state.view = 'daily'; WW.state.dayKey = WW.state.todayKey || WW.state.dayKey; WW.refreshDay(); }
      });
      window.api.on('pause-changed', (state) => WW.refreshPauseBanner(state));
      window.api.on('show-routines', () => { if (!anyDialogOpen()) WW.showRoutines(); });
      window.api.on('open-task', ({ taskId, dateKey }) => {
        if (taskId && dateKey) WW.openTaskDetails({ taskId, dateKey });
        else WW.showDay(WW.state.todayKey);
      });
    }
    // Tell the main process the window is ready to receive events (missed reminders, links from notifications).
    if (window.api && window.api.ready) window.api.ready();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

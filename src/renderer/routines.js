'use strict';

// The Routines screen: things that repeat several times a day inside a time window
// (for example "every 2 hours 30 minutes, 8:00 AM - 8:00 PM"), each with its own way of reminding.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP } = WW;
  const i18n = window.WWI18n;

  async function call(name, payload) {
    try {
      return await WW.call(name, payload);
    } catch (error) {
      WW.toast(error.message, 'error');
      return null;
    }
  }

  // The window for adding or changing one routine. `item` is the existing routine, or null for a new one.
  async function openRoutineForm(item) {
    const f = item ? await call('getRoutineForEdit', { id: item.id }) : await call('newRoutineDefaults');
    if (!f) return;
    const dlg = WW.openDialog({ title: item ? T('Edit Routine') : T('Add Routine'), wide: true });
    const errors = h('div', { class: 'errors', hidden: true });
    const title = h('input', { type: 'text', id: 'rf-title', value: f.title, maxlength: '200', placeholder: T('For example: Drink water'), autocomplete: 'off' });
    const category = h('select', { id: 'rf-category', onchange: (e) => { f.categoryId = e.target.value || null; } },
      h('option', { value: '', text: T('No Category') }),
      WW.state.categories.map((c) => h('option', { value: c.id, text: c.name, selected: f.categoryId === c.id })));
    const from = h('input', { type: 'time', id: 'rf-from', value: f.from, required: 'true', 'aria-label': T('From') });
    const to = h('input', { type: 'time', id: 'rf-to', value: f.to, required: 'true', 'aria-label': T('To') });
    const hours = h('input', { type: 'number', class: 'num', id: 'rf-hours', min: '0', max: '24', value: String(f.hours), 'aria-label': T('Hours') });
    const minutes = h('input', { type: 'number', class: 'num', id: 'rf-minutes', min: '0', max: '59', value: String(f.minutes), 'aria-label': T('Minutes') });
    const quiet = h('select', { id: 'rf-quiet', onchange: (e) => { f.quietMinutes = Number(e.target.value); } },
      [0, 10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: f.quietMinutes === m, text: m === 0 ? T('No, Ring at the Exact Time') : TP(m, 'Yes, until {n} minute after the call to prayer', 'Yes, until {n} minutes after the call to prayer') })));
    const before = h('input', { type: 'number', class: 'num', id: 'rf-before', min: '0', max: '120', value: String(f.notifyBefore), 'aria-label': T('Minutes') });
    const choices = (await call('getReferenceChoices', { taskId: null })) || [];
    const skipList = h('div', { class: 'skip-list', id: 'rf-skip' });
    const drawSkip = () => {
      clear(skipList);
      if (!choices.length) { skipList.append(h('p', { class: 'hint', text: T('There are no tasks yet.') })); return; }
      skipList.append(...choices.map((c) => h('label', { class: 'check-line' },
        h('input', { type: 'checkbox', checked: f.skipTasks.includes(c.taskId), 'data-task': c.taskId,
          onchange: (e) => { f.skipTasks = e.target.checked ? [...f.skipTasks, c.taskId] : f.skipTasks.filter((x) => x !== c.taskId); } }), ' ', c.title)));
    };
    drawSkip();
    const notes = h('textarea', { id: 'rf-notes', value: f.notes, 'aria-label': T('Notes'), oninput: (e) => { f.notes = e.target.value; } });
    const preview = h('p', { class: 'hint', id: 'rf-preview' });

    const days = h('span', { class: 'daytoggle', id: 'rf-days' });
    const drawDays = () => {
      clear(days).append(...[0, 1, 2, 3, 4, 5, 6].map((i) => h('button', {
        type: 'button', class: f.weekdays.includes(i) ? 'on' : '', text: i18n.weekdayShort(i), 'aria-pressed': String(f.weekdays.includes(i)),
        onclick: () => { f.weekdays = f.weekdays.includes(i) ? f.weekdays.filter((d) => d !== i) : [...f.weekdays, i].sort(); drawDays(); },
      })));
    };
    drawDays();

    const check = (id, label, key) => h('label', { class: 'check-line' },
      h('input', { type: 'checkbox', id, checked: f[key], onchange: (e) => { f[key] = e.target.checked; } }), ' ', label);

    // The times that will ring, worked out as the person types.
    const update = () => {
      const h0 = Number(hours.value) || 0;
      const m0 = Number(minutes.value) || 0;
      const step = h0 * 60 + m0;
      const a = /^(\d\d):(\d\d)$/.exec(from.value);
      const b = /^(\d\d):(\d\d)$/.exec(to.value);
      if (!a || !b || step < 5 || from.value === to.value) { preview.textContent = ''; return; }
      const start = Number(a[1]) * 60 + Number(a[2]);
      const end = Number(b[1]) * 60 + Number(b[2]);
      const last = start + (end > start ? end - start : end + 1440 - start);
      const slots = [];
      for (let m = start; m <= last; m += step) slots.push(m);
      const fmt = (m) => { const mm = m % 1440; const hh = Math.floor(mm / 60); return `${((hh + 11) % 12) + 1}:${String(mm % 60).padStart(2, '0')} ${hh < 12 ? T('AM') : T('PM')}`; };
      const shown = slots.length > 8 ? `${slots.slice(0, 6).map(fmt).join(T(', '))}${T(', …, ')}${fmt(slots[slots.length - 1])}` : slots.map(fmt).join(T(', '));
      preview.textContent = `${TP(slots.length, '{n} time a day: ', '{n} times a day: ')}${shown}`;
    };
    for (const el of [from, to, hours, minutes]) el.addEventListener('input', update);

    dlg.body.append(
      errors,
      h('div', { class: 'field' }, h('label', { for: 'rf-title', text: T('Title') }), title),
      h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('div', { class: 'field' }, h('label', { for: 'rf-from', text: T('From') }), from),
        h('div', { class: 'field' }, h('label', { for: 'rf-to', text: T('To') }), to)),
      h('div', { class: 'field' }, h('label', { for: 'rf-hours', text: T('Repeat Every') }),
        h('div', { class: 'row', style: { alignItems: 'center' } }, hours, h('span', { text: T('hours') }), minutes, h('span', { text: T('minutes') })),
        preview),
      h('div', { class: 'field' }, h('label', { text: T('On These Days') }), days),
      h('div', { class: 'field' }, h('label', { text: T('How should it remind you?') }),
        check('rf-notification', T('Notification'), 'notification'),
        check('rf-fullscreen', T('Full-Screen Alert'), 'fullScreen'),
        check('rf-randomnotes', T('Show One Note at Random'), 'randomNotes'),
        h('p', { class: 'hint', text: T('Choose one or both. The switches in Settings → Reminders still apply.') }),
        h('p', { class: 'hint', text: T('One note at random works on the full-screen alert: write several notes separated by ; and each time it rings it shows a different one.') })),
      h('div', { class: 'field' }, h('label', { for: 'rf-before', text: T('Notify Before the Time') }),
        h('div', { class: 'row', style: { alignItems: 'center' } }, before, h('span', { text: T('minutes') })),
        h('p', { class: 'hint', text: T('0 means at the exact time. The full-screen alert always comes at the exact time.') })),
      h('div', { class: 'field' }, h('label', { text: T('Stay silent while these tasks are running') }), skipList,
        h('p', { class: 'hint', text: T('A time that falls while one of the chosen tasks is running does not ring. A task that is already ticked as done does not count.') })),
      h('div', { class: 'field' }, h('label', { for: 'rf-quiet', text: T('Stay Quiet During Prayer') }), quiet,
        h('p', { class: 'hint', text: T('A time that falls just after the call to prayer rings when the quiet period ends instead.') })),
      h('div', { class: 'field' }, h('label', { for: 'rf-category', text: T('Category') }), category),
      h('div', { class: 'field' }, h('label', { for: 'rf-notes', text: T('Notes') }), notes));
    update();

    const save = h('button', { class: 'btn primary', text: T('Save') });
    dlg.footer.append(h('button', { class: 'btn', text: T('Cancel'), onclick: () => dlg.close() }), save);
    save.addEventListener('click', async () => {
      f.title = title.value;
      f.from = from.value;
      f.to = to.value;
      f.hours = Math.max(0, Math.floor(Number(hours.value) || 0));
      f.minutes = Math.max(0, Math.floor(Number(minutes.value) || 0));
      f.notifyBefore = Math.max(0, Math.floor(Number(before.value) || 0));
      if (f.title.trim() === '') { errors.hidden = false; errors.textContent = T('Please enter a title'); return; }
      save.disabled = true;
      try {
        await WW.call('saveRoutine', { id: item ? item.id : null, form: f });
        dlg.close();
        WW.toast(item ? T('Routine Saved') : T('Routine Added'));
        WW.showRoutines();
      } catch (error) {
        errors.hidden = false;
        errors.textContent = error.message;
        save.disabled = false;
      }
    });
    title.focus();
  }

  async function remove(item) {
    const go = await WW.ask({
      title: T('Delete Routine'), message: T('Delete "{title}"?', { title: item.title }),
      choices: [{ label: T('Cancel'), value: false }, { label: T('Delete'), value: true, kind: 'danger' }],
    });
    if (!go) return;
    if (await call('deleteRoutine', { id: item.id })) { WW.toast(T('Routine Deleted')); WW.showRoutines(); }
  }

  function alertsText(item) {
    const parts = [];
    if (item.alerts.notification) parts.push(item.notifyBefore ? TP(item.notifyBefore, 'Notification {n} minute before', 'Notification {n} minutes before') : T('Notification'));
    if (item.alerts.fullScreen) parts.push(T('Full-Screen Alert'));
    return parts.join(' + ');
  }

  // A clock time such as "8:30 AM" from a moment in milliseconds.
  function clock(ms) {
    const d = new Date(ms);
    const hh = d.getHours();
    return `${((hh + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${hh < 12 ? T('AM') : T('PM')}`;
  }

  async function tick(item, x) {
    if (await call('setRoutineSlotDone', { id: item.id, dateKey: item.dateKey, slot: x.slot, done: !x.done })) {
      if (!x.done && WW.state.settings) WW.sounds.play(WW.state.settings.doneSound, WW.state.settings.doneSoundVolume);
      WW.showRoutines();
    }
  }

  function timeTitle(x) {
    if (x.state === 'done') return T('Mark as Not Done');
    if (x.state === 'silent') return T('Silent: {title}', { title: x.silentTitle });
    if (x.state === 'future') return T('This Time Has Not Come Yet');
    return T('Mark as Done');
  }

  // The whole day on one line: a dot for each time, a band under it for each chosen task that is running.
  function timeline(item) {
    const start = item.windowStartMs;
    const end = item.windowEndMs;
    const pct = (ms) => (end > start ? Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100)) : 50);
    const dot = Math.max(6, Math.min(16, Math.floor(640 / item.times.length) - 2));
    const track = h('div', { class: 'rt-track' });
    track.append(h('div', { class: 'rt-axis' }));
    // hour marks: at most about eight labels
    const hours = Math.max(1, Math.ceil(((end - start) / 3600000) / 8));
    const firstHour = new Date(start);
    firstHour.setMinutes(0, 0, 0);
    for (let t = firstHour.getTime(); t <= end; t += hours * 3600000) {
      if (t < start) continue;
      track.append(h('div', { class: 'rt-hourline', style: { left: `${pct(t)}%` } }), h('div', { class: 'rt-hour', style: { left: `${pct(t)}%` }, text: clock(t) }));
    }
    for (const x of item.times) {
      const canTick = x.state === 'done' || x.state === 'missed';
      track.append(h('button', {
        type: 'button', class: `rt-dot ${x.state}`, style: { left: `${pct(x.ms)}%`, width: `${dot}px`, height: `${dot}px` },
        disabled: !canTick, title: `${x.label} · ${timeTitle(x)}`, 'aria-label': `${x.label} – ${timeTitle(x)}`,
        onclick: () => tick(item, x),
      }));
    }
    if (item.nowMs >= start && item.nowMs <= end) {
      track.append(h('div', { class: 'rt-now', style: { left: `${pct(item.nowMs)}%` } }), h('div', { class: 'rt-now-label', style: { left: `${pct(item.nowMs)}%` }, text: T('Now') }));
    }
    const rows = [];
    for (const sp of item.silentSpans) {
      let row = rows.findIndex((last) => last <= sp.startMs);
      if (row < 0) { row = rows.length; rows.push(0); }
      rows[row] = sp.endMs;
      const from = pct(Math.max(sp.startMs, start));
      const to = pct(Math.min(sp.endMs, end));
      track.append(h('div', { class: 'rt-band', style: { left: `${from}%`, width: `${Math.max(to - from, 0.8)}%`, top: `${58 + row * 22}px` }, title: `${sp.title} · ${sp.startLabel} – ${sp.endLabel}`, text: sp.title }));
    }
    track.style.height = `${64 + rows.length * 22}px`;
    return h('div', { class: 'rt-scroll', dir: 'ltr' }, track);
  }

  function legend(item) {
    const entry = (cls, text) => h('span', {}, h('i', { class: `rt-sw ${cls}` }), text);
    return h('div', { class: 'rt-legend' }, entry('done', T('Done')), entry('missed', T('Missed')), entry('future', T('Coming')), item.silentSpans.length ? entry('silent', T('Silent')) : null);
  }

  function routineCard(item) {
    const open = (WW.state.routineOpen = WW.state.routineOpen || {});
    const mine = (open[item.id] = open[item.id] || { times: false, silent: false });
    const meta = [];
    if (item.categoryName) meta.push(h('span', { class: 'tag pill' }, h('span', { class: 'dot', style: { background: item.categoryColor } }), item.categoryName));
    meta.push(h('span', { class: 'tag', text: item.weekdays.length === 7 ? T('Every Day') : item.weekdays.map((i) => i18n.weekdayShort(i)).join(T(', ')) }));
    meta.push(h('span', { class: 'tag', text: alertsText(item) || T('No Reminder') }));
    if (item.quietMinutes) meta.push(h('span', { class: 'tag', text: T('Quiet During Prayer') }));
    if (item.skipTitles && item.skipTitles.length) {
      meta.push(h('button', {
        type: 'button', class: 'tag silent-tag', id: `rs-${item.id}`, 'aria-expanded': String(mine.silent),
        onclick: () => { mine.silent = !mine.silent; WW.showRoutines(); },
        text: `${TP(item.skipTitles.length, 'Silent During {n} Task', 'Silent During {n} Tasks')} ${mine.silent ? '▴' : '▾'}`,
      }));
    }
    if (!item.enabled) meta.push(h('span', { class: 'tag pill', text: T('Paused') }));

    let today;
    if (item.enabled && item.onToday) {
      const parts = [T('Today: {done} of {total} Done', { done: item.doneToday, total: item.times.length })];
      if (item.silentToday) parts.push(T('Silent: {n}', { n: item.silentToday }));
      if (item.missedToday) parts.push(T('Missed: {n}', { n: item.missedToday }));
      if (item.nextLabel) parts.push(T('Next: {at}', { at: item.nextLabel }));
      const bar = h('div', { class: 'rt-bar', role: 'img', 'aria-label': parts[0] }, item.times.map((x) => h('i', { class: x.state, title: x.label })));
      const chips = h('div', { class: 'routine-times', hidden: !mine.times }, item.times.map((x) => h('button', {
        type: 'button', class: `routine-time ${x.state}`, 'aria-pressed': String(x.done),
        disabled: x.state === 'future' || x.state === 'silent', title: timeTitle(x), 'aria-label': `${x.label} – ${x.done ? T('Done') : T('Not Done')}`,
        onclick: () => tick(item, x),
      }, x.done ? WW.icon('check', 13, 3.4) : null, h('bdi', { dir: 'ltr', text: x.label }))));
      today = h('div', { class: 'routine-today' },
        h('div', { class: 'routine-today-label', text: parts.join(' · ') }),
        bar, timeline(item), legend(item),
        h('button', { type: 'button', class: 'btn small', id: `rt-${item.id}`, 'aria-expanded': String(mine.times), text: mine.times ? T('Hide Times') : T('Show All Times'), onclick: () => { mine.times = !mine.times; WW.showRoutines(); } }),
        chips);
    } else {
      today = h('div', { class: 'routine-today-label', text: item.enabled ? T('Not Scheduled Today') : '' });
    }

    const silentPanel = mine.silent && item.silentSpans.length
      ? h('div', { class: 'rt-silent-panel' }, item.silentSpans.map((sp) => h('div', { class: 'rt-silent-row' }, h('span', { text: sp.title }), h('span', { class: 'muted', dir: 'ltr', text: `${sp.startLabel} – ${sp.endLabel}` }))))
      : null;

    return h('section', { class: `zone routine-card ${item.enabled ? '' : 'paused'}`, 'data-id': item.id },
      h('div', { class: 'zone-body' },
        h('div', { class: 'routine-head' },
          h('div', { class: 'task-main' },
            h('div', { class: 'task-title', text: item.title }),
            h('div', { class: 'routine-summary', text: item.summary }),
            h('div', { class: 'task-meta' }, meta),
            item.notes ? h('div', { class: 'free-notes', text: item.notes }) : null),
          h('div', { class: 'free-actions' },
            h('button', { class: 'btn small', type: 'button', text: item.enabled ? T('Pause') : T('Resume'), onclick: async () => { if (await call('setRoutineEnabled', { id: item.id, enabled: !item.enabled })) WW.showRoutines(); } }),
            h('button', { class: 'btn small', type: 'button', text: T('Edit'), onclick: () => openRoutineForm(item) }),
            h('button', { class: 'btn small danger', type: 'button', text: T('Delete'), onclick: () => remove(item) }))),
        silentPanel, today));
  }

  function renderRoutines() {
    const items = WW.state.routines;
    const root = clear(document.getElementById('view'));
    root.append(
      h('div', { class: 'day-head' },
        h('div', { class: 'day-info' },
          h('h1', { class: 'day-title', text: T('Routines') }),
          h('div', { class: 'day-sub', text: T('Things that repeat several times a day, such as drinking water or a short break.') })),
        h('div', { class: 'day-actions' },
          h('button', { class: 'btn primary', type: 'button', id: 'routine-add', text: T('Add Routine'), onclick: () => openRoutineForm(null) }))),
      ...(items.length
        ? items.map(routineCard)
        : [h('div', { class: 'empty-zone', id: 'routine-empty', text: T('No routines yet. Add one, for example "Drink water" every 2 hours.') })]));
  }

  WW.showRoutines = async function showRoutines() {
    try {
      const keepScroll = WW.state.view === 'routines';
      const scrollY = window.scrollY;
      WW.state.view = 'routines';
      WW.state.routines = await WW.call('getRoutines');
      renderRoutines();
      if (keepScroll) window.scrollTo(0, scrollY);
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };

  WW.openRoutineForm = openRoutineForm;
})();

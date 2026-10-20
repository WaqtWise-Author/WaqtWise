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
    const dlg = WW.openDialog({ title: item ? T('Edit routine') : T('Add routine'), wide: true });
    const errors = h('div', { class: 'errors', hidden: true });
    const title = h('input', { type: 'text', id: 'rf-title', value: f.title, maxlength: '200', placeholder: T('For example: Drink water'), autocomplete: 'off' });
    const category = h('select', { id: 'rf-category', onchange: (e) => { f.categoryId = e.target.value || null; } },
      h('option', { value: '', text: T('No category') }),
      WW.state.categories.map((c) => h('option', { value: c.id, text: c.name, selected: f.categoryId === c.id })));
    const from = h('input', { type: 'time', id: 'rf-from', value: f.from, required: 'true', 'aria-label': T('From') });
    const to = h('input', { type: 'time', id: 'rf-to', value: f.to, required: 'true', 'aria-label': T('To') });
    const hours = h('input', { type: 'number', class: 'num', id: 'rf-hours', min: '0', max: '24', value: String(f.hours), 'aria-label': T('Hours') });
    const minutes = h('input', { type: 'number', class: 'num', id: 'rf-minutes', min: '0', max: '59', value: String(f.minutes), 'aria-label': T('Minutes') });
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
      h('div', { class: 'field' }, h('label', { for: 'rf-hours', text: T('Repeat every') }),
        h('div', { class: 'row', style: { alignItems: 'center' } }, hours, h('span', { text: T('hours') }), minutes, h('span', { text: T('minutes') })),
        preview),
      h('div', { class: 'field' }, h('label', { text: T('On these days') }), days),
      h('div', { class: 'field' }, h('label', { text: T('How should it remind you?') }),
        check('rf-notification', T('Notification'), 'notification'),
        check('rf-fullscreen', T('Full-screen alert'), 'fullScreen'),
        check('rf-randomnotes', T('Show one note at random'), 'randomNotes'),
        h('p', { class: 'hint', text: T('Choose one or both. The switches in Settings → Reminders still apply.') }),
        h('p', { class: 'hint', text: T('One note at random works on the full-screen alert: write several notes separated by ; and each time it rings it shows a different one.') })),
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
      if (f.title.trim() === '') { errors.hidden = false; errors.textContent = T('Please enter a title'); return; }
      save.disabled = true;
      try {
        await WW.call('saveRoutine', { id: item ? item.id : null, form: f });
        dlg.close();
        WW.toast(item ? T('Routine saved') : T('Routine added'));
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
      title: T('Delete routine'), message: T('Delete "{title}"?', { title: item.title }),
      choices: [{ label: T('Cancel'), value: false }, { label: T('Delete'), value: true, kind: 'danger' }],
    });
    if (!go) return;
    if (await call('deleteRoutine', { id: item.id })) { WW.toast(T('Routine deleted')); WW.showRoutines(); }
  }

  function alertsText(item) {
    const parts = [];
    if (item.alerts.notification) parts.push(T('Notification'));
    if (item.alerts.fullScreen) parts.push(T('Full-screen alert'));
    return parts.join(' + ');
  }

  function routineCard(item) {
    const meta = [];
    if (item.categoryName) meta.push(h('span', { class: 'tag pill' }, h('span', { class: 'dot', style: { background: item.categoryColor } }), item.categoryName));
    meta.push(h('span', { class: 'tag', text: item.weekdays.length === 7 ? T('Every day') : item.weekdays.map((i) => i18n.weekdayShort(i)).join(T(', ')) }));
    meta.push(h('span', { class: 'tag', text: alertsText(item) || T('No reminder') }));
    if (!item.enabled) meta.push(h('span', { class: 'tag pill', text: T('Paused') }));

    const times = item.times.map((x) => h('button', {
      type: 'button', class: `routine-time ${x.done ? 'on' : ''} ${x.past && !x.done ? 'late' : ''}`, 'aria-pressed': String(x.done),
      'aria-label': `${x.label} – ${x.done ? T('Done') : T('Not done')}`, title: x.done ? T('Mark as not done') : T('Mark as Done'),
      onclick: async () => {
        if (await call('setRoutineSlotDone', { id: item.id, dateKey: item.dateKey, slot: x.slot, done: !x.done })) {
          if (!x.done && WW.state.settings) WW.sounds.play(WW.state.settings.doneSound, WW.state.settings.doneSoundVolume);
          WW.showRoutines();
        }
      },
    }, x.done ? WW.icon('check', 13, 3.4) : null, h('bdi', { dir: 'ltr', text: x.label })));

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
        item.enabled && item.onToday
          ? h('div', { class: 'routine-today' },
            h('div', { class: 'routine-today-label', text: T('Today: {done} of {total} done', { done: item.doneToday, total: item.times.length }) + (item.nextLabel ? ` · ${T('Next: {at}', { at: item.nextLabel })}` : '') }),
            h('div', { class: 'routine-times' }, times))
          : h('div', { class: 'routine-today-label', text: item.enabled ? T('Not scheduled today') : '' })));
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
          h('button', { class: 'btn primary', type: 'button', id: 'routine-add', text: T('Add routine'), onclick: () => openRoutineForm(null) }))),
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

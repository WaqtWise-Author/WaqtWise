'use strict';

// The Settings screen (spec 12.4). Every change is saved as soon as it is made.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP } = WW;
  const i18n = window.WWI18n;

  const dayLabels = () => [0, 1, 2, 3, 4, 5, 6].map((i) => i18n.weekdayShort(i));
  const prayers = () => [['fajr', T('Fajr')], ['dhuhr', T('Dhuhr')], ['asr', T('Asr')], ['maghrib', T('Maghrib')], ['isha', T('Isha')]];

  async function save(patch) {
    try {
      WW.state.settings = await WW.call('saveSettings', patch);
      WW.applyTheme(WW.state.settings.theme);
    } catch (error) {
      WW.toast(error.message, 'error');
      WW.state.settings = await WW.call('getSettings');
      WW.renderSettings();
    }
  }

  // Every single yes/no setting is the same sliding switch (see WW.onOffSwitch).
  const toggle = (label, checked, onChange, hint) => WW.onOffSwitch(label, checked, onChange, hint);
  const onOffSwitch = toggle;

  function numberField(value, min, max, suffix, onCommit, label) {
    return h('span', { class: 'row tight' },
      h('input', {
        type: 'number', class: 'num', min: String(min), max: String(max), value: String(value), 'aria-label': label,
        onchange: (e) => {
          const n = Number(e.target.value);
          onCommit(e.target.value === '' ? NaN : n);
        },
      }),
      suffix ? h('span', { text: suffix }) : null);
  }

  // Each section has an id so the index at the top of the page can jump to it.
  const SECTIONS = [];
  function section(title, ...children) {
    const id = `settings-${SECTIONS.length + 1}`;
    SECTIONS.push({ id, title });
    return h('section', { class: 'settings-section', id }, h('h2', { text: title }), ...children);
  }

  // One setting: the name on one side, the control (and its hint) on the other.
  function row(label, control) {
    return h('div', { class: 'settings-row' }, h('div', { class: 'settings-label', text: label }), h('div', { class: 'settings-control' }, control));
  }

  function subheading(text) {
    return h('h3', { class: 'settings-sub', text });
  }

  // A row of jump buttons, one for each section; it stays at the top while the page scrolls.
  function sectionIndex() {
    const nav = h('nav', { class: 'settings-nav', 'aria-label': T('Settings Sections') },
      SECTIONS.map((s) => h('button', {
        type: 'button', class: 'settings-nav-btn', text: s.title,
        onclick: () => {
          const target = document.getElementById(s.id);
          if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        },
      })));
    return nav;
  }

  // One sound choice: a list, a volume slider and a "Preview" button. Each change is saved at once.
  function soundPicker({ label, options, idKey, volumeKey, extra }) {
    const st = WW.state.settings;
    let id = st[idKey];
    let volume = st[volumeKey];
    const readout = h('span', { class: 'vol-readout', text: `${volume}%` });
    const select = h('select', {
      class: 'sel-auto', 'aria-label': T('{label} sound', { label }),
      onchange: (e) => { id = e.target.value; save({ [idKey]: id }); },
    }, options.map(([value, text]) => h('option', { value, text: T(text), selected: id === value })));
    const slider = h('input', {
      type: 'range', min: '0', max: '100', step: '5', value: String(volume), class: 'vol', 'aria-label': T('{label} volume', { label }),
      oninput: (e) => { volume = Number(e.target.value); readout.textContent = `${volume}%`; },
      onchange: (e) => { volume = Number(e.target.value); save({ [volumeKey]: volume }); },
    });
    const preview = h('button', {
      class: 'btn small', type: 'button', text: T('Preview'), 'aria-label': T('Preview the {label} sound', { label: label.toLowerCase() }),
      onclick: () => WW.sounds.play(id, volume),
    });
    return h('div', {}, h('div', { class: 'row' }, select, slider, readout, preview), extra || null);
  }

  function soundsSection() {
    const st = WW.state.settings;
    return section(T('Sounds'),
      h('p', { class: 'dialog-message', text: T('Sounds are made by WaqtWise itself and play only while it is running. They are separate from the Windows notification sound above.') }),
      h('div', { class: 'settings-grid' },
        row(T('Task Done'), soundPicker({ label: T('Task Done'), options: WW.sounds.DONE_OPTIONS, idKey: 'doneSound', volumeKey: 'doneSoundVolume',
          extra: h('p', { class: 'hint', text: T('Plays when you tick a task as done.') }) })),
        row(T('Full-Screen Alert'), soundPicker({ label: T('Full-Screen Alert'), options: WW.sounds.ALERT_OPTIONS, idKey: 'alertSound', volumeKey: 'alertSoundVolume',
          extra: h('div', {},
            toggle(T('Keep repeating until a button is pressed'), st.alertSoundRepeat, (v) => save({ alertSoundRepeat: v })),
            h('p', { class: 'hint', text: T('Plays when a full-screen alert appears (on one screen only, even if several are covered).') })) }))));
  }

  function categoriesSection() {
    const list = h('div');
    const draw = () => {
      clear(list);
      WW.state.categories.forEach((c) => {
        const name = h('input', { type: 'text', value: c.name, maxlength: '40', 'aria-label': T('Name of {name}', { name: c.name }) });
        const color = h('input', { type: 'color', value: c.color, 'aria-label': T('Color of {name}', { name: c.name }) });
        const commit = async () => {
          try {
            WW.state.categories = await WW.call('updateCategory', { id: c.id, name: name.value, color: color.value });
            WW.toast(T('Category Saved'));
          } catch (error) {
            WW.toast(error.message, 'error');
            name.value = c.name;
          }
          draw();
        };
        name.addEventListener('change', commit);
        color.addEventListener('change', commit);
        list.appendChild(h('div', { class: 'cat-row' }, color, name,
          h('button', {
            class: 'btn small danger', text: T('Delete'),
            onclick: async () => {
              const ok = await WW.ask({
                title: T('Delete Category'), message: T('Delete "{name}"? Tasks in this category are kept, but they become uncategorized.', { name: c.name }),
                choices: [{ label: T('Cancel'), value: false }, { label: T('Delete'), value: true, kind: 'danger' }],
              });
              if (!ok) return;
              WW.state.categories = await WW.call('deleteCategory', { id: c.id });
              draw();
            },
          })));
      });
      const newName = h('input', { type: 'text', placeholder: T('New Category Name'), maxlength: '40', 'aria-label': T('New Category Name') });
      const newColor = h('input', { type: 'color', value: '#3b82f6', 'aria-label': T('New Category Color') });
      list.appendChild(h('div', { class: 'cat-row' }, newColor, newName,
        h('button', {
          class: 'btn small primary', text: T('Add'),
          onclick: async () => {
            try {
              WW.state.categories = await WW.call('addCategory', { name: newName.value, color: newColor.value });
              draw();
            } catch (error) {
              WW.toast(error.message, 'error');
            }
          },
        })));
    };
    draw();
    return section(T('Categories'), list);
  }


  // ---- Full-screen reminder ------------------------------------------------------------------------------

  const FONTS = ['Segoe UI', 'Tahoma', 'Arial', 'Verdana', 'Georgia', 'Times New Roman'];
  const presetList = () => [
    ['dark', T('Dark')], ['light', T('Light')], ['highContrast', T('High Contrast')], ['red', T('Red Alert')], ['calm', T('Calm Green')],
  ];
  const sampleItem = () => ({
    id: 'preview', taskId: '__sample__', dateKey: '2026-01-01', title: T('Study SQL: Joins and Subqueries'),
    notes: T('Open the exercises from yesterday.\nFinish chapter 4, then try the practice questions.'),
    startLabel: `12:00 ${T('PM')}`, endLabel: `12:45 ${T('PM')}`, durationLabel: T('{m}m', { m: 45 }), zoneName: 'Dhuhr → Asr', zoneIndex: 2,
    categoryName: T('Study'), categoryColor: '#8b5cf6', priority: 'High', snoozed: false,
  });

  // setIn(object, ['name', 'size'], 90) -> a copy with that value changed
  function setIn(object, keys, value) {
    const copy = JSON.parse(JSON.stringify(object));
    let node = copy;
    keys.slice(0, -1).forEach((k) => { node = node[k]; });
    node[keys[keys.length - 1]] = value;
    return copy;
  }
  function getIn(object, keys) {
    return keys.reduce((node, k) => node[k], object);
  }
  function nestedPatch(keys, value) {
    return keys.reduceRight((inner, key) => ({ [key]: inner }), value);
  }

  function alertSection() {
    const preview = h('div', { class: 'alert-preview', 'aria-label': T('Preview of the Full-Screen Reminder') });

    function drawPreview() {
      const { frame } = WW.AlertView.render(preview, {
        item: sampleItem(), remaining: 0, appearance: WW.state.settings.alertAppearance,
        snoozeMinutes: WW.state.settings.snoozeMinutes, guardActive: false,
      }, null);
      const fit = () => { frame.style.transform = `scale(${preview.clientWidth / 1280})`; };
      fit();
      requestAnimationFrame(fit);
    }

    // Change one appearance value. `commit` false = only update the preview while a slider is being dragged.
    async function change(keys, value, commit = true) {
      WW.state.settings = { ...WW.state.settings, alertAppearance: setIn(WW.state.settings.alertAppearance, keys, value) };
      drawPreview();
      if (!commit) return;
      try {
        WW.state.settings = await WW.call('saveSettings', { alertAppearance: nestedPatch(keys, value) });
      } catch (error) {
        WW.toast(error.message, 'error');
        WW.state.settings = await WW.call('getSettings');
        WW.renderSettings();
      }
    }

    const value = (keys) => getIn(WW.state.settings.alertAppearance, keys);
    const color = (keys, label) => h('input', { type: 'color', value: value(keys), 'aria-label': label, onchange: (e) => change(keys, e.target.value) });
    const check = (keys, label) => h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: value(keys), 'aria-label': label, onchange: (e) => change(keys, e.target.checked) }), h('span', { text: label }));
    const slider = (keys, min, max, label) => {
      const readout = h('span', { class: 'hint', text: T('{n} px', { n: value(keys) }) });
      return h('span', { class: 'row tight' },
        h('input', {
          type: 'range', min: String(min), max: String(max), value: String(value(keys)), 'aria-label': label, style: { width: '220px' },
          oninput: (e) => { readout.textContent = T('{n} px', { n: e.target.value }); change(keys, Number(e.target.value), false); },
          onchange: (e) => change(keys, Number(e.target.value)),
        }), readout);
    };
    const select = (keys, options, label) => h('select', { class: 'sel-auto', 'aria-label': label, onchange: (e) => change(keys, e.target.value) },
      options.map(([v, l]) => h('option', { value: v, text: l, selected: value(keys) === v })));

    const presets = h('div', { class: 'row' }, presetList().map(([key, label]) => h('button', {
      class: 'btn small', type: 'button', text: label,
      onclick: async () => {
        const preset = await WW.call('getAlertPreset', key);
        WW.state.settings = await WW.call('saveSettings', { alertAppearance: preset });
        const y = window.scrollY;
        WW.renderSettings();
        window.scrollTo(0, y);
      },
    })));

    const box = section(T('Full-Screen Reminder'),
      h('p', { class: 'dialog-message', text: T('At the exact start time of a task that has the full-screen alert switched on, a full-screen reminder covers the screen so it cannot be missed. It stays until you click a button.') }),
      h('div', { class: 'settings-grid' },
        subheading(T('Behavior')),
        row(T('Full-Screen Alerts'), onOffSwitch(T('Full-Screen Reminders'), WW.state.settings.fullScreenAlerts, (v) => save({ fullScreenAlerts: v }), T('Each task also has its own switch in the task form. With this off, no full-screen alert appears.'))),
        row(T('New Tasks'), toggle(T('Switch the full-screen alert on for new tasks'), WW.state.settings.fullScreenDefaultForNewTasks, (v) => save({ fullScreenDefaultForNewTasks: v }))),
        row(T('Screens'), h('select', { class: 'sel-auto', 'aria-label': T('Screens'), onchange: (e) => save({ alertScreens: e.target.value }) },
          h('option', { value: 'all', text: T('All Screens'), selected: WW.state.settings.alertScreens === 'all' }),
          h('option', { value: 'main', text: T('Main Screen Only'), selected: WW.state.settings.alertScreens === 'main' }))),
        subheading(T('Look')),
        row(T('Ready-Made Looks'), presets),
        row(T('Colors'), h('div', { class: 'row' },
          h('span', { text: T('Background') }), color(['backgroundColor'], T('Background Color')),
          h('span', { text: T('Text') }), color(['textColor'], T('Text Color')),
          h('span', { text: T('Accent') }), color(['accentColor'], T('Accent Color')))),
        row(T('Font'), h('div', { class: 'row' },
          select(['fontFamily'], FONTS.map((f) => [f, f]), T('Font')),
          select(['alignment'], [['center', T('Centered')], ['left', T('Left Aligned')]], T('Alignment')))),
        row(T('Task Name'), h('div', {},
          slider(['name', 'size'], 24, 160, T('Task Name Size')),
          h('div', { class: 'row', style: { marginTop: '8px' } }, color(['name', 'color'], T('Task Name Color')),
            check(['name', 'bold'], T('Bold')), check(['name', 'italic'], T('Italic')), check(['name', 'uppercase'], T('CAPITALS'))))),
        row(T('Notes'), h('div', {},
          check(['notes', 'show'], T('Show the Notes')),
          h('div', { style: { marginTop: '8px' } }, slider(['notes', 'size'], 14, 96, T('Notes Size'))),
          h('div', { class: 'row', style: { marginTop: '8px' } }, color(['notes', 'color'], T('Notes Color')),
            check(['notes', 'bold'], T('Bold')), check(['notes', 'italic'], T('Italic'))))),
        subheading(T('What It Shows')),
        row(T('Details Shown'), h('div', { class: 'row' },
          check(['show', 'time'], T('Time')), check(['show', 'duration'], T('Duration')), check(['show', 'zone'], T('Zone')),
          check(['show', 'category'], T('Category')), check(['show', 'priority'], T('Priority')))),
        row(T('Buttons Shown'), h('div', {},
          h('div', { class: 'row' },
            check(['buttons', 'snooze'], T('Snooze')), check(['buttons', 'open'], T('Open Task')), check(['buttons', 'done'], T('Mark as Done'))),
          h('p', { class: 'hint', text: T('"Got It" is always shown, so the reminder can always be closed.') })))),
      h('div', { style: { marginTop: '16px' } },
        preview,
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', {
            class: 'btn', text: T('Preview Full Screen'),
            onclick: async () => {
              try { await window.api.previewAlert(); } catch (error) { WW.toast(error.message, 'error'); }
            },
          }),
          h('span', { class: 'hint', text: T('Shows the real full-screen reminder with an example task. Click "Got It" to close it.') }))));
    requestAnimationFrame(drawPreview);
    drawPreview();
    return box;
  }

  const CUSTOM_VALUE = '__custom__';
  let customPending = false; // "Custom City…" chosen but not saved yet
  let pickerCountry = null; // the country shown in the picker when it is not the country of the city in use

  // Name, latitude, longitude and time zone of a city that is not in the list.
  function customCityPanel(s) {
    const c = s.customCity || {};
    const computerZone = (WW.state.city && WW.state.city.computerTimeZone) || '';
    const field = (label, value, type, extra = {}) => h('input', { type, value: value === undefined || value === null ? '' : String(value), 'aria-label': label, placeholder: label, ...extra });
    const name = field(T('City Name'), c.name, 'text', { maxlength: '40' });
    const lat = field(T('Latitude'), c.latitude, 'text', { inputmode: 'decimal' });
    const lon = field(T('Longitude'), c.longitude, 'text', { inputmode: 'decimal' });
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    const zone = field(T('Time Zone'), c.timeZone || computerZone, 'text', { list: 'tz-list', spellcheck: 'false' });
    const note = h('p', { class: 'hint' });
    const num = (el) => (el.value.trim() === '' ? NaN : Number(el.value.trim().replace(',', '.')));
    const info = () => {
      const city = WW.state.city;
      note.textContent = city && city.custom && city.differs
        ? T("Prayer times (zone start and end) are shown in {zone} time. Your tasks keep using this computer's clock ({computer}).", { zone: city.timeZone, computer: city.computerTimeZone })
        : T('Prayer times are worked out from the latitude and longitude, and shown in the time zone you enter.');
    };
    info();
    return h('div', { class: 'custom-city' },
      h('div', { class: 'row' }, name),
      h('div', { class: 'row' }, lat, lon),
      h('div', { class: 'row' }, zone,
        h('button', { type: 'button', class: 'btn', text: T("This Computer's Time Zone"), onclick: () => { zone.value = computerZone; } })),
      h('datalist', { id: 'tz-list' }, zones.map((z) => h('option', { value: z }))),
      h('div', { class: 'row' },
        h('button', {
          type: 'button', class: 'btn primary', text: T('Save City'),
          onclick: async () => {
            const latitude = num(lat);
            const longitude = num(lon);
            if (Number.isNaN(latitude) || Number.isNaN(longitude)) { WW.toast(T('Latitude and longitude must be numbers, like 24.7136 and 46.6753'), 'error'); return; }
            await save({ useCustomCity: true, countryCode: null, customCity: { name: name.value, latitude, longitude, timeZone: zone.value } });
            if (WW.state.settings.useCustomCity) { customPending = false; await WW.refreshCity(); WW.toast(T('City Saved')); WW.renderSettings(); }
          },
        })),
      note);
  }

  // The language switch. Its own labels are always shown in both languages, so it can be found from either one.
  function languageSection() {
    const current = WW.state.settings.language || 'en';
    const choose = async (code) => {
      if (code === current) return;
      try {
        await WW.call('saveSettings', { language: code });
        await WW.reloadEverything();
      } catch (error) {
        WW.toast(error.message, 'error');
      }
    };
    const button = (code, label) => h('button', {
      type: 'button', class: current === code ? 'on' : '', text: label, lang: code, 'aria-pressed': String(current === code),
      onclick: () => choose(code),
    });
    return section('اللغة / Language',
      h('div', { class: 'settings-grid' },
        row(T('App Language'), h('div', {},
          h('div', { class: 'segmented lang-switch', role: 'group', 'aria-label': 'اللغة / Language' }, button('en', 'English'), button('ar', 'العربية')),
          h('p', { class: 'hint', text: T('The whole app changes at once: texts and screen direction. Numbers stay 0123456789.') })))));
  }


  // ---- Daily View: what each task row shows ------------------------------------------------------------
  // Must match TASK_INFO in src/core/task-info.js (a test checks that).
  const TASK_INFO_DEF = () => [
    ['time', T('Start Time'), T('The Time the Task Starts')],
    ['endTime', T('End Time'), T('The Time the Task Ends')],
    ['duration', T('Duration'), T('How Long the Task Takes')],
    ['priority', T('Priority'), T('The Coloured Diamond: Low, Medium or High')],
    ['category', T('Category'), T('The Category Name and Colour')],
    ['status', T('Status'), T('"Not Done" and "In Progress"')],
    ['conflicts', T('Conflicts'), T('Which Tasks Overlap This One')],
    ['repeat', T('Repeat'), T('How Often the Task Repeats')],
    ['startRule', T('What the Start Follows'), T('A prayer or another task the start time is based on')],
    ['reminders', T('Reminders'), T('When the Reminders Go Off')],
    ['fullScreen', T('Full-Screen Alert'), T('That a full-screen alert is on')],
    ['notes', T('Notes'), T('The First Line of the Notes')],
    ['continues', T('Continues into Next Zone'), T('When the task runs past the end of its zone')],
    ['backupStart', T('Backup Start Time Warning'), T('When the prayer time was not available and a backup time is used')],
  ];

  // A made-up task that has every detail, so the preview can show whichever ones are switched on.
  const sampleTaskRow = () => {
    const cat = (WW.state.categories || []).find((c) => c.id === 'cat-study');
    return {
      id: 'preview', taskId: '__sample__', dateKey: '2026-01-01', title: T('Study SQL'), notes: '',
      startLabel: `9:00 ${T('AM')}`, endLabel: `9:45 ${T('AM')}`, endsNextDay: false, afterMidnight: false,
      durationLabel: T('{m}m', { m: 45 }), categoryName: cat ? cat.name : T('Study'), categoryColor: cat ? cat.color : '#8b5cf6', priority: 'High',
      done: false, overdue: false, inProgress: true, overlaps: true, conflictWith: [T('Team Call')],
      extendsPastZoneEnd: true, startWarning: T('Backup Start Time'),
      repeatSummary: T('Every Day'),
      startRuleLabel: T('Starts {time} after {prayer}', { time: T('{m}m', { m: 10 }), prayer: T('Asr') }),
      reminderOffsets: [60, 10], hasFullScreen: true, notesLine: T('Open the exercises from yesterday.'),
    };
  };

  function dailyViewSection() {
    const preview = h('div', { class: 'daily-preview', 'aria-label': T('Preview of a task in the Daily View') });
    preview.inert = true; // only a picture: it cannot be ticked or opened
    const current = () => WW.state.settings.taskInfo;
    const drawPreview = () => { clear(preview).appendChild(WW.taskRow(sampleTaskRow(), current())); };

    const setAll = async (patch) => {
      await save({ taskInfo: patch });
      const y = window.scrollY;
      WW.renderSettings();
      window.scrollTo(0, y);
    };
    const defaults = { time: true, endTime: false, duration: true, priority: true, category: true, status: true, conflicts: true, repeat: false, startRule: false, reminders: false, fullScreen: false, notes: false, continues: true, backupStart: true };
    const everything = Object.fromEntries(Object.keys(defaults).map((k) => [k, true]));
    const nothing = Object.fromEntries(Object.keys(defaults).map((k) => [k, false]));

    const boxes = h('div', { class: 'info-grid' }, TASK_INFO_DEF().map(([id, label, about]) =>
      h('label', { class: 'info-item', title: about },
        h('input', {
          type: 'checkbox', checked: Boolean(current()[id]), 'data-info': id,
          onchange: async (e) => { await save({ taskInfo: { [id]: e.target.checked } }); drawPreview(); },
        }),
        h('span', {},
          h('span', { class: 'info-name', text: label }),
          h('span', { class: 'info-about', text: about })))));

    drawPreview();
    return section(T('Daily View'),
      h('p', { class: 'dialog-message', text: T('Choose what is shown on each task in the Daily View. The task name and the done tick are always shown.') }),
      h('div', { class: 'settings-grid' },
        row(T('Task Details'), h('div', {},
          h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', id: 'info-all', text: T('Show Everything'), onclick: () => setAll(everything) }),
            h('button', { class: 'btn small', type: 'button', id: 'info-default', text: T('Standard'), onclick: () => setAll(defaults) }),
            h('button', { class: 'btn small', type: 'button', id: 'info-none', text: T('Name Only'), onclick: () => setAll(nothing) })),
          boxes)),
        row(T('Empty and Finished Zones'), h('div', {},
          h('select', { class: 'sel-auto', id: 'collapse-zones', 'aria-label': T('Empty and Finished Zones'), onchange: (e) => save({ collapseZones: e.target.value === 'collapse' }) },
            [['collapse', T('Collapse')], ['full', T('Show in Full')]].map(([v, l]) => h('option', { value: v, text: l, selected: (WW.state.settings.collapseZones ? 'collapse' : 'full') === v }))),
          h('p', { class: 'hint', text: T('A zone with no tasks, and on today a zone that is over with every task done, is shown as one line. Click the line to open it.') }))),
        row(T('Preview'), h('div', {}, preview, h('p', { class: 'hint', text: T('A sample task with every detail, shown the way your choices make it look.') })))));
  }

  WW.renderSettings = function renderSettings() {
    const view = clear(document.getElementById('view'));
    const s = WW.state.settings;

    const manual = s.useCustomCity && s.countryCode === null; // a city typed in by hand
    const customShown = manual || customPending;
    const country = pickerCountry || s.countryCode || 'EG';
    const egyptCurrent = !s.useCustomCity && (s.countryCode || 'EG') === 'EG';
    const cityChosen = async () => { pickerCountry = null; customPending = false; await WW.refreshCity(); };
    const city = h('select', {
      'aria-label': T('City'),
      onchange: async (e) => {
        if (e.target.value === '') return;
        if (e.target.value === CUSTOM_VALUE) {
          customPending = true;
          if (s.customCity) { await save({ useCustomCity: true, countryCode: null }); await WW.refreshCity(); } // the one typed in before
          WW.renderSettings();
          return;
        }
        await save({ useCustomCity: false, cityName: e.target.value, countryCode: 'EG' });
        await cityChosen();
        WW.renderSettings();
      },
    },
    [...(egyptCurrent || customShown ? [] : [h('option', { value: '', text: T('Choose a City…'), selected: true })]),
      ...WW.state.cities.map((name) => h('option', { value: name, text: T(name), selected: egyptCurrent && !customShown && s.cityName === name })),
      h('option', { value: CUSTOM_VALUE, text: T('Custom City…'), selected: customShown })]);
    const countrySel = WW.countrySelect({
      id: 'settings-country', value: country,
      onChange: (code) => { pickerCountry = code; WW.renderSettings(); },
    });
    const worldPart = () => {
      const here = s.useCustomCity && s.countryCode === country && s.customCity;
      const cityInfo = WW.state.city;
      return h('div', {},
        here ? h('p', { class: 'current-city' }, T('Current city: {city}', { city: s.customCity.name }), h('small', { text: ` · ${T('Time Zone')}: ${s.customCity.timeZone}` })) : null,
        here && cityInfo && cityInfo.custom && cityInfo.differs
          ? h('p', { class: 'hint', text: T("Prayer times (zone start and end) are shown in {zone} time. Your tasks keep using this computer's clock ({computer}).", { zone: cityInfo.timeZone, computer: cityInfo.computerTimeZone }) })
          : null,
        WW.worldCitySearch({
          country,
          onChosen: async (result) => {
            await cityChosen();
            WW.state.settings = await WW.call('getSettings');
            const method = (WW.state.methods.find((m) => m.key === result.method) || {}).label || result.method;
            WW.toast(T('City saved. Calculation method: {method} (you can change it below).', { method }));
            WW.renderSettings();
          },
        }),
        customPending ? null : h('button', { type: 'button', class: 'btn small', id: 'city-not-listed', text: T('My city is not in the list'), onclick: () => { customPending = true; WW.renderSettings(); } }));
    };
    const customPanel = customShown ? customCityPanel(s) : null;
    const method = h('select', { 'aria-label': T('Calculation Method'), onchange: (e) => save({ method: e.target.value }) },
      WW.state.methods.map((m) => h('option', { value: m.key, text: m.label, selected: s.method === m.key })));
    const adjustments = h('div', { class: 'row' },
      prayers().map(([key, label]) => h('span', { class: 'row tight' },
        h('span', { text: label }),
        numberField(s.adjustments[key], -120, 120, T('min'), (n) => save({ adjustments: { [key]: n } }), T('{label} adjustment in minutes', { label })))));
    const hijri = h('select', { 'aria-label': T('Hijri Date Adjustment'), class: 'sel-auto', onchange: (e) => save({ hijriAdjustment: Number(e.target.value) }) },
      [[-1, T('−1 day')], [0, T('No Adjustment')], [1, T('+1 day')]].map(([v, l]) => h('option', { value: v, text: l, selected: s.hijriAdjustment === v })));

    const theme = h('select', { class: 'sel-auto', 'aria-label': T('Theme'), onchange: (e) => save({ theme: e.target.value }) },
      [['system', T('System (Follow Windows)')], ['light', T('Light')], ['dark', T('Dark')]].map(([v, l]) => h('option', { value: v, text: l, selected: s.theme === v })));

    const weekStart = h('select', { class: 'sel-auto', 'aria-label': T('First Day of the Week'), onchange: (e) => save({ weekStart: Number(e.target.value) }) },
      [6, 0, 1].map((d) => [d, i18n.weekdayLong(d)]).map(([v, l]) => h('option', { value: v, text: l, selected: s.weekStart === v })));

    const lateHours = Math.floor(s.lateAfterMinutes / 60);
    const lateMins = s.lateAfterMinutes % 60;
    const commitLate = async (hours, minutes) => {
      await save({ lateAfterMinutes: hours * 60 + minutes });
      WW.renderSettings();
    };
    const lateAfter = h('span', { class: 'row' },
      numberField(lateHours, 0, 168, T('hours'), (n) => commitLate(n, lateMins), T('Late After, Hours')),
      numberField(lateMins, 0, 59, T('minutes'), (n) => commitLate(lateHours, n), T('Late After, Minutes')));

    const workingDays = h('span', { class: 'daytoggle' },
      dayLabels().map((label, i) => h('button', {
        type: 'button', class: s.workingDays.includes(i) ? 'on' : '', text: label, 'aria-pressed': String(s.workingDays.includes(i)),
        onclick: async () => {
          const next = s.workingDays.includes(i) ? s.workingDays.filter((d) => d !== i) : [...s.workingDays, i];
          await save({ workingDays: next });
          WW.renderSettings();
        },
      })));

    SECTIONS.length = 0;
    const sections = [
      languageSection(),

      section(T('Prayer Times'),
        h('div', { class: 'settings-grid' },
          row(T('Country'), countrySel),
          row(T('City'), h('div', {}, country === 'EG' ? city : worldPart(), customPanel)),
          row(T('Calculation Method'), method),
          row(T('Manual Adjustment'), h('div', {}, adjustments, h('p', { class: 'hint', text: T('Minutes added to the calculated time (negative = earlier).') }))),
          row(T('Hijri Date'), hijri))),

      section(T('Reminders & Notifications'),
        h('div', { class: 'settings-grid' },
          row(T('Notifications'), onOffSwitch(T('Windows Notifications'), s.notificationsEnabled, (v) => save({ notificationsEnabled: v }), T('Reminder pop-ups from Windows. With this off, no pop-up appears (full-screen reminders have their own switch).'))),
          row(T('Sound'), toggle(T('Play a Sound'), s.soundEnabled, (v) => save({ soundEnabled: v }))),
          row(T('Default Reminder'), h('div', {}, numberField(s.defaultReminderOffsetMinutes, 0, 10080, T('minutes before the start'), (n) => save({ defaultReminderOffsetMinutes: n }), T('Default Reminder Minutes')),
            h('p', { class: 'hint', text: T('Used when a task has reminders turned on but no times added.') }))),
          row(T('Snooze'), numberField(s.snoozeMinutes, 1, 1440, T('minutes'), (n) => save({ snoozeMinutes: n }), T('Snooze Minutes'))),
          row(T('Zone Start'), toggle(T('Notify When Each Zone Begins'), s.zoneStartNotifications, (v) => save({ zoneStartNotifications: v }), T('A notification at each prayer time.'))),
          row(T('Test'), h('div', {},
            h('button', {
              class: 'btn', text: T('Send a Test Notification'),
              onclick: async () => {
                try {
                  await window.api.testNotification();
                  WW.toast(T('Test notification sent. Look at the bottom-right corner of the screen.'));
                } catch (error) {
                  WW.toast(error.message, 'error');
                }
              },
            }),
            h('p', { class: 'hint', text: T('Checks that Windows shows notifications. Click the notification to open WaqtWise.') }))))),

      section(T('Application'),
        h('div', { class: 'settings-grid' },
          row(T('Version'), h('div', { class: 'app-version', text: `WaqtWise ${WW.state.version || ''}` })),
          row(T('Start with Windows'), toggle(T('Start WaqtWise when Windows starts (in the tray)'), s.startWithWindows, (v) => save({ startWithWindows: v }))),
          row(T('Background Message'), toggle(T('Show the "still running in the background" message'), s.showBackgroundMessage, (v) => save({ showBackgroundMessage: v }), T('Shown once, the next time the window is closed. Closing the window keeps WaqtWise running in the tray so reminders keep working.'))),
          row(T('Theme'), theme),
          row(T('First Day of the Week'), h('div', {}, weekStart, h('p', { class: 'hint', text: T('The day cards at the top of the Daily View and the weeks in Statistics start from this day.') }), h('p', { class: 'hint', text: T('Careful: tasks that repeat every 2 or more weeks also count their weeks from this day, so changing it can move them to other weeks.') }))),
          row(T('Late Tasks'), h('div', {}, lateAfter, h('p', { class: 'hint', text: T('A task counts as late when you tick it as done more than this long after its start time. Used by the lateness charts in Statistics.') }))),
          row(T('Working Days'), h('div', {}, workingDays, h('p', { class: 'hint', text: T('Used by "last working day" repeat rules.') }))))),

      dailyViewSection(),

      alertSection(),

      soundsSection(),

      categoriesSection(),

      section(T('Data'),
        h('p', { class: 'dialog-message', text: T('Your data is stored only on this computer. Export a backup file to keep it safe or to move it to another computer.') }),
        h('div', { class: 'row' },
          h('button', { class: 'btn', text: T('Export Data…'), onclick: () => WW.exportData() }),
          h('button', { class: 'btn', text: T('Import Data…'), onclick: () => WW.importData() }),
          h('button', { class: 'btn', text: T('Restore from Backup…'), onclick: () => WW.restoreBackup() })),
        h('p', { class: 'hint', text: T('WaqtWise also keeps its own copies automatically: one per day for the last 7 days, and one before every import.') }))
    ];
    // The index row sticks just below the top bar, so it needs the bar's real height (it wraps on narrow windows).
    const fitIndex = () => {
      const bar = document.querySelector('.topbar');
      if (bar) document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
    };
    fitIndex();
    window.removeEventListener('resize', WW.fitSettingsIndex || (() => {}));
    WW.fitSettingsIndex = fitIndex;
    window.addEventListener('resize', fitIndex);
    view.append(
      h('button', { class: 'back-link', text: WW.isRtl() ? `${T('Back to Daily View')} →` : `← ${T('Back to Daily View')}`, onclick: () => WW.showDaily() }),
      h('div', { class: 'day-head' },
        h('div', { class: 'day-info' },
          h('h1', { class: 'day-title', text: T('Settings') }),
          h('div', { class: 'day-sub', text: T('Changes are saved as you make them.') }))),
      sectionIndex(),
      ...sections);
  };
})();

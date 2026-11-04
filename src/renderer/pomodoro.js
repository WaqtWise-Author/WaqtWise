'use strict';

// The Pomodoro screen: the Pomodoros the person made (each with its own Focus Time and breaks) and the running timer.
// The timer itself runs in the main process (it goes on while the window is hidden in the tray); this page only shows
// it, counts the seconds down between two updates, and sends the button presses.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP } = WW;
  const SVG = 'http://www.w3.org/2000/svg';
  const RING_R = 96;
  const RING_LEN = 2 * Math.PI * RING_R;

  async function call(name, payload) {
    try {
      return await WW.call(name, payload);
    } catch (error) {
      WW.toast(error.message, 'error');
      return null;
    }
  }

  // ---- the timer as last told by the main process, counted down here between updates --------------------------------

  let timer = null; // the view from getPomodoroTimer()
  let receivedAt = 0; // performance.now() when it came
  let ticker = null;
  let refreshing = false;

  function remainingMs() {
    if (!timer) return 0;
    if (timer.status !== 'running') return timer.remainingMs;
    return Math.max(0, timer.remainingMs - (performance.now() - receivedAt));
  }

  function clockLabel(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    const two = (n) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
  }

  // The small "Focus · 18:42" chip in the top bar (on every screen) and the time beside Pomodoro in the side menu.
  function chipText() {
    if (!timer) return '';
    if (timer.status === 'waiting') return T('{part} Next', { part: timer.next ? timer.next.name : '' });
    if (timer.status === 'paused') return T('{part} · Paused', { part: timer.partName });
    return `${timer.partName} · ${clockLabel(remainingMs())}`;
  }

  function paint() {
    const chip = document.getElementById('pomodoro-chip');
    if (chip) {
      chip.hidden = !timer;
      const label = chip.querySelector('.pomo-chip-text');
      if (label) label.textContent = chipText();
      if (timer) chip.setAttribute('aria-label', T('Pomodoro: {state}', { state: chipText() }));
      chip.classList.toggle('break', Boolean(timer) && timer.part !== 'focus');
      chip.classList.toggle('waiting', Boolean(timer) && timer.status !== 'running');
    }
    for (const el of document.querySelectorAll('[data-pomo-time]')) el.textContent = timer ? clockLabel(remainingMs()) : '';
    const ring = document.querySelector('.pomo-ring-value');
    if (ring && timer) {
      const done = timer.partMs > 0 ? 1 - remainingMs() / timer.partMs : 0;
      ring.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - Math.min(1, Math.max(0, done)))));
    }
    const menuTime = document.querySelector('.drawer-item [data-pomo-menu]');
    if (menuTime) menuTime.textContent = timer && timer.status === 'running' ? clockLabel(remainingMs()) : '';
  }

  // The part has run out here: ask the main process (it ends the part a moment later and says so).
  async function catchUp() {
    if (refreshing) return;
    refreshing = true;
    setTimeout(async () => {
      refreshing = false;
      const fresh = await WW.call('getPomodoroTimer').catch(() => null);
      WW.setPomodoroTimer(fresh);
      if (WW.state.view === 'pomodoro') WW.showPomodoro();
    }, 1500);
  }

  function tick() {
    paint();
    if (timer && timer.status === 'running' && remainingMs() <= 0) catchUp();
  }

  // A new timer view (from a button press, the main process or the start-up).
  WW.setPomodoroTimer = function setPomodoroTimer(view) {
    timer = view || null;
    receivedAt = performance.now();
    if (timer && !ticker) ticker = setInterval(tick, 1000);
    if (!timer && ticker) { clearInterval(ticker); ticker = null; }
    paint();
  };
  WW.pomodoroMenuTime = () => (timer && timer.status === 'running' ? clockLabel(remainingMs()) : '');

  // A button of the running card or a Start button. A failed call shows why (toast) and the page is drawn again.
  async function act(action, extra) {
    const view = await call('pomodoroAction', { action, ...(extra || {}) });
    WW.setPomodoroTimer(view);
    await WW.showPomodoro();
  }

  // "25m", "2h 5m"
  function minutesText(m) {
    const hrs = Math.floor(m / 60);
    return hrs > 0 ? T('{h}h {m}m', { h: hrs, m: m % 60 }) : T('{m}m', { m });
  }

  // ---- the form -----------------------------------------------------------------------------------------------------

  async function openPomodoroForm(item) {
    const f = item ? await call('getPomodoroForEdit', { id: item.id }) : await call('newPomodoroDefaults');
    if (!f) return;
    const dlg = WW.openDialog({ title: item ? T('Edit Pomodoro') : T('Add Pomodoro') });
    const errors = WW.errorBox();
    const title = h('input', { type: 'text', id: 'pf-title', value: f.title, maxlength: '200', placeholder: T('For example: Study'), autocomplete: 'off' });
    const num = (id, value, min, max, label) => h('input', { type: 'number', class: 'num', id, min: String(min), max: String(max), value: String(value), 'aria-label': label });
    const focus = num('pf-focus', f.focusMinutes, 1, 240, T('Focus Time (Minutes)'));
    const brk = num('pf-break', f.breakMinutes, 1, 120, T('Short Break (Minutes)'));
    const longMinutes = num('pf-long', f.longBreakMinutes, 1, 120, T('Long Break (Minutes)'));
    const longEvery = num('pf-every', f.longBreakEvery, 2, 12, T('Rounds Before a Long Break'));
    const summary = h('p', { class: 'hint', id: 'pf-summary' });

    // Quick choices under a minutes box.
    const presets = (input, values) => {
      const row = h('span', { class: 'pomo-presets' });
      const draw = () => {
        clear(row).append(...values.map((v) => h('button', {
          type: 'button', class: `pomo-preset ${Number(input.value) === v ? 'on' : ''}`, text: String(v), 'aria-pressed': String(Number(input.value) === v),
          'aria-label': TP(v, '{n} minute', '{n} minutes'),
          onclick: () => { input.value = String(v); draw(); update(); },
        })));
      };
      input.addEventListener('input', draw);
      draw();
      return row;
    };

    const longFields = h('div', { class: 'row pomo-long-fields', style: { alignItems: 'center' } },
      h('label', { for: 'pf-long', text: T('Length') }), longMinutes, h('span', { text: T('minutes, after every') }), longEvery, h('span', { text: T('rounds') }));
    const longSwitch = WW.onOffSwitch(T('Long Break'), f.longBreak, (on) => { f.longBreak = on; longFields.hidden = !on; update(); },
      T('A longer rest after several rounds of focus.'), { id: 'pf-longbreak' });
    longFields.hidden = !f.longBreak;
    const alertSel = h('select', { id: 'pf-alert', onchange: (e) => { f.alert = e.target.value; } },
      h('option', { value: 'fullScreen', text: T('Full-Screen Alert'), selected: f.alert === 'fullScreen' }),
      h('option', { value: 'notification', text: T('Notification'), selected: f.alert === 'notification' }));
    const holdSwitch = WW.onOffSwitch(T('Stop the Timer at Prayer Time'), f.holdAtPrayer, (on) => { f.holdAtPrayer = on; },
      T('When a prayer time comes while the timer runs, it stops and waits for you to resume it.'), { id: 'pf-hold' });

    // "4 rounds take about 2h 5m" (focus, the breaks between them and the long break at the end).
    function update() {
      const fm = Number(focus.value);
      const bm = Number(brk.value);
      if (!(fm > 0) || !(bm > 0)) { summary.textContent = ''; return; }
      if (f.longBreak && Number(longEvery.value) >= 2 && Number(longMinutes.value) > 0) {
        const n = Number(longEvery.value);
        const total = n * fm + (n - 1) * bm + Number(longMinutes.value);
        summary.textContent = T('{n} rounds take about {time}, with the long break at the end.', { n, time: minutesText(total) });
      } else {
        summary.textContent = T('One round (focus and break) takes {time}.', { time: minutesText(fm + bm) });
      }
    }
    for (const el of [focus, brk, longMinutes, longEvery]) el.addEventListener('input', update);

    dlg.body.append(
      errors,
      h('div', { class: 'field' }, h('label', { for: 'pf-title', text: T('Name') }), title),
      h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('div', { class: 'field grow' }, h('label', { for: 'pf-focus', text: T('Focus Time') }),
          h('div', { class: 'row', style: { alignItems: 'center' } }, focus, h('span', { text: T('minutes') })), presets(focus, [25, 45, 50, 90])),
        h('div', { class: 'field grow' }, h('label', { for: 'pf-break', text: T('Short Break') }),
          h('div', { class: 'row', style: { alignItems: 'center' } }, brk, h('span', { text: T('minutes') })), presets(brk, [5, 10, 15]))),
      h('div', { class: 'field' }, longSwitch, longFields),
      h('div', { class: 'field' }, h('label', { for: 'pf-alert', text: T('When a Part Ends') }), alertSel,
        h('p', { class: 'hint', text: T('The next part does not start by itself: you start it when you are ready.') })),
      h('div', { class: 'field' }, holdSwitch),
      summary);
    update();

    const save = h('button', { class: 'btn primary', id: 'pf-save', text: T('Save') });
    dlg.footer.append(h('button', { class: 'btn', text: T('Cancel'), onclick: () => dlg.close() }), save);
    save.addEventListener('click', async () => {
      if (save.disabled) return;
      f.title = title.value;
      if (f.title.trim() === '') { WW.showFormErrors(errors, [T('Please enter a name')], title); title.focus(); return; }
      const whole = (el) => (el.value === '' ? null : Number(el.value));
      f.focusMinutes = whole(focus);
      f.breakMinutes = whole(brk);
      f.longBreakMinutes = whole(longMinutes);
      f.longBreakEvery = whole(longEvery);
      save.disabled = true;
      try {
        await WW.call('savePomodoro', { id: item ? item.id : null, form: f });
        dlg.close();
        WW.toast(item ? T('Pomodoro Saved') : T('Pomodoro Added'));
        WW.showPomodoro();
      } catch (error) {
        WW.showFormErrors(errors, [error.message]);
        errors.focus();
        save.disabled = false;
      }
    });
    title.focus();
  }

  async function remove(item) {
    const go = await WW.ask({
      title: T('Delete Pomodoro'), message: T('Delete "{title}"?', { title: item.title }),
      choices: [{ label: T('Cancel'), value: false }, { label: T('Delete'), value: true, kind: 'danger' }],
    });
    if (!go) return;
    const result = await call('deletePomodoro', { id: item.id });
    if (result) {
      WW.toastUndo(T('Pomodoro Deleted'), result.undoId, WW.showPomodoro);
      WW.setPomodoroTimer(await WW.call('getPomodoroTimer').catch(() => null));
      WW.showPomodoro();
    }
  }

  // ---- the page -----------------------------------------------------------------------------------------------------

  function ring() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 220 220');
    svg.setAttribute('class', 'pomo-ring');
    svg.setAttribute('aria-hidden', 'true');
    const circle = (cls) => {
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', '110');
      c.setAttribute('cy', '110');
      c.setAttribute('r', String(RING_R));
      c.setAttribute('class', cls);
      return c;
    };
    const track = circle('pomo-ring-track');
    const value = circle('pomo-ring-value');
    value.setAttribute('stroke-dasharray', String(RING_LEN));
    value.setAttribute('stroke-dashoffset', String(RING_LEN));
    value.setAttribute('transform', 'rotate(-90 110 110)');
    svg.append(track, value);
    return svg;
  }

  function runningCard(items) {
    const tm = timer;
    const p = items.find((x) => x.id === tm.pomodoroId);
    const busy = (fn) => WW.oneAtATime(fn, () => [...document.querySelectorAll('.pomo-run button')]);
    const btn = (label, id, fn, kind) => h('button', { class: `btn ${kind || ''}`, type: 'button', id, text: label, onclick: busy(fn) });
    const actions = [];
    if (tm.status === 'running') {
      actions.push(btn(T('Pause'), 'pomo-pause', () => act('pause'), 'primary'));
      actions.push(btn(tm.part === 'focus' ? T('Skip to Break') : T('Skip Break'), 'pomo-skip', () => act('skip')));
    } else if (tm.status === 'paused') {
      actions.push(btn(T('Resume'), 'pomo-resume', () => act('resume'), 'primary'));
    } else if (tm.next) {
      actions.push(btn(tm.next.part === 'focus' ? T('Start Focus') : T('Start Break'), 'pomo-next', () => act('next'), 'primary'));
      if (tm.canExtend) actions.push(btn(T('5 More Minutes of Focus'), 'pomo-extend', () => act('extend', { minutes: 5 })));
    }
    actions.push(btn(T('Stop'), 'pomo-stop', () => act('stop'), 'danger'));

    let status = '';
    if (tm.status === 'paused') status = tm.heldFor ? T('Stopped for {prayer}. Resume when you are ready.', { prayer: tm.heldFor }) : T('Paused');
    if (tm.status === 'waiting') status = tm.finished === 'focus' ? T('Focus done. Start the break when you are ready.') : T('Break over. Start the next focus when you are ready.');

    const roundBar = tm.longBreakAfter
      ? h('div', { class: 'pomo-rounds', role: 'img', 'aria-label': tm.roundsLabel },
        Array.from({ length: tm.longBreakAfter }, (_, i) => {
          const inCycle = ((tm.round - 1) % tm.longBreakAfter) + 1;
          const state = i + 1 < inCycle || (i + 1 === inCycle && tm.status === 'waiting' && tm.finished === 'focus') ? 'done' : i + 1 === inCycle ? 'now' : '';
          return h('i', { class: state });
        }))
      : null;

    const timeBox = h('div', { class: 'pomo-ring-box' }, ring(),
      h('div', { class: 'pomo-ring-text' },
        h('bdi', { class: 'pomo-time', dir: 'ltr', 'data-pomo-time': '1', text: clockLabel(remainingMs()) }),
        h('span', { class: 'pomo-of', text: T('of {time}', { time: tm.partLabel }) })));

    return h('section', { class: `zone pomo-run ${tm.part === 'focus' ? 'focus' : 'break'}`, 'aria-label': T('Running Pomodoro'), 'data-status': tm.status },
      h('div', { class: 'zone-body pomo-run-body' },
        timeBox,
        h('div', { class: 'pomo-run-info' },
          h('div', { class: 'pomo-run-top' },
            h('span', { class: 'pomo-part', text: tm.status === 'waiting' && tm.next ? T('{part} Next', { part: tm.next.name }) : tm.partName }),
            h('span', { class: 'muted', text: tm.roundsLabel })),
          h('div', { class: 'task-title pomo-run-title', text: p ? p.title : tm.title }),
          roundBar,
          status ? h('div', { class: 'pomo-status', role: 'status', text: status }) : null,
          tm.prayerNote ? h('div', { class: 'note pomo-prayer', text: tm.prayerNote }) : null,
          h('div', { class: 'pomo-actions' }, actions))));
  }

  function card(item) {
    const isRunning = timer && timer.pomodoroId === item.id;
    const chips = [
      h('span', { class: 'tag' }, T('Focus'), ' ', h('b', { text: item.focusLabel })),
      h('span', { class: 'tag' }, T('Break'), ' ', h('b', { text: item.breakLabel })),
      item.longBreak.enabled ? h('span', { class: 'tag' }, T('Long'), ' ', h('b', { text: item.longBreakLabel }), ` / ${item.longBreak.every}`) : null,
    ];
    const how = [item.alert === 'fullScreen' ? T('Full-Screen Alert') : T('Notification')];
    if (item.holdAtPrayer) how.push(T('Stops at Prayer Time'));
    return h('section', { class: `zone pomo-card ${isRunning ? 'running' : ''}`, 'data-id': item.id },
      h('div', { class: 'zone-body' },
        h('div', { class: 'pomo-card-head' },
          h('span', { class: 'task-title', text: item.title }),
          isRunning ? h('span', { class: 'tag pill pomo-running', text: T('Running') }) : null),
        h('div', { class: 'task-meta' }, chips),
        h('div', { class: 'routine-summary', text: how.join(' · ') }),
        h('div', { class: 'routine-summary pomo-today', text: item.todayLabel }),
        h('div', { class: 'free-actions' },
          isRunning ? null : h('button', { class: 'btn small primary', type: 'button', text: T('Start'), 'aria-label': T('Start "{title}"', { title: item.title }),
            onclick: WW.oneAtATime(() => act('start', { id: item.id })) }),
          h('button', { class: 'btn small', type: 'button', text: T('Edit'), onclick: () => openPomodoroForm(item) }),
          h('button', { class: 'btn small danger', type: 'button', text: T('Delete'), onclick: () => remove(item) }))));
  }

  function renderPomodoro() {
    const { items } = WW.state.pomodoro;
    const root = clear(document.getElementById('view'));
    root.append(
      h('div', { class: 'day-head' },
        h('div', { class: 'day-info' },
          h('h1', { class: 'day-title', text: T('Pomodoro') }),
          h('div', { class: 'day-sub', text: T('Work in focused sessions with short breaks in between.') })),
        h('div', { class: 'day-actions' },
          h('button', { class: 'btn primary', type: 'button', id: 'pomodoro-add', text: T('Add Pomodoro'), onclick: () => openPomodoroForm(null) }))),
      timer ? runningCard(items) : null,
      items.length
        ? h('div', null, h('h2', { class: 'pomo-list-title', text: T('Your Pomodoros') }), h('div', { class: 'pomo-grid' }, items.map(card)))
        : h('div', { class: 'empty-zone', id: 'pomodoro-empty', text: T('No Pomodoros yet. Add one, for example "Study": 25 minutes of focus and a 5-minute break.') }));
    paint();
  }

  WW.showPomodoro = async function showPomodoro() {
    const seq = WW.nextView();
    try {
      const keepScroll = WW.state.view === 'pomodoro';
      const scrollY = window.scrollY;
      WW.state.view = 'pomodoro';
      const data = await WW.call('getPomodoros');
      if (!WW.isLatestView(seq)) return;
      WW.state.pomodoro = data;
      WW.setPomodoroTimer(data.timer);
      renderPomodoro();
      if (keepScroll) window.scrollTo(0, scrollY);
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };

  WW.openPomodoroForm = openPomodoroForm;
})();

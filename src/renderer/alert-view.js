'use strict';

// Draws the full-screen reminder. Used by the real alert page and by the preview in Settings.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP } = WW;

  function fontStack(name) {
    return `'${name}', 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif`;
  }

  // Applies the user's choices to the stage element.
  function applyAppearance(stage, a) {
    const set = (name, value) => stage.style.setProperty(name, value);
    set('--a-bg', a.backgroundColor);
    set('--a-text', a.textColor);
    set('--a-accent', a.accentColor);
    set('--a-font', fontStack(a.fontFamily));
    set('--a-align', a.alignment);
    set('--a-items', a.alignment === 'left' ? 'flex-start' : 'center');
    set('--a-items-justify', a.alignment === 'left' ? 'flex-start' : 'center');
  }

  // A long title wraps onto several lines. If it is still too tall for its box, make the letters smaller (never below 24px)
  // until it fits, so the title never needs a scroll bar and the buttons always stay on the screen.
  function fitTitle(el, base) {
    el.style.fontSize = `${base}px`;
    let size = base;
    while (el.scrollHeight > el.clientHeight + 2 && size > 24) {
      size = Math.max(24, Math.floor(size * 0.92));
      el.style.fontSize = `${size}px`;
    }
  }

  // state: { item, remaining, appearance, snoozeMinutes, guardActive }
  // handlers (optional): { dismiss, snooze, done, open, next, stop } - called with no arguments (snooze: with the chosen length)
  let snoozeChoicesOpen = false; // the row of other snooze lengths is open (kept across redraws)
  let watcher = null; // the one ResizeObserver that refits the title; the old one is let go before each redraw

  function render(root, state, handlers) {
    const { item, appearance: a } = state;
    const frame = h('div', { class: 'alert-frame' });
    const stage = h('div', { class: 'alert-stage', role: 'alertdialog', 'aria-modal': handlers ? 'true' : undefined, // the preview in Settings is not modal
      'aria-label': T('Reminder: {title}', { title: item.title }) });
    applyAppearance(stage, a);

    const name = h('h1', { class: 'alert-name', text: item.title });
    Object.assign(name.style, {
      fontSize: `${a.name.size}px`,
      color: a.name.color,
      fontWeight: a.name.bold ? '800' : '400',
      fontStyle: a.name.italic ? 'italic' : 'normal',
      textTransform: a.name.uppercase ? 'uppercase' : 'none',
    });

    const pomodoro = item.kind === 'pomodoro';
    const parts = [h('div', { class: 'alert-label', text: pomodoro ? item.label : item.snoozed ? T('Snoozed Reminder') : item.kind === 'routine' ? T('Routine Time') : T('Starts Now') }), name];

    if ((pomodoro || a.notes.show) && item.notes && item.notes.trim() !== '') {
      const notes = h('div', { class: 'alert-notes', text: item.notes });
      Object.assign(notes.style, {
        fontSize: `${a.notes.size}px`,
        color: a.notes.color,
        fontWeight: a.notes.bold ? '700' : '400',
        fontStyle: a.notes.italic ? 'italic' : 'normal',
      });
      parts.push(notes);
    }

    const act = (key, option) => () => { if (handlers && handlers[key] && !state.guardActive) handlers[key](option); };
    const button = (label, key, primary, option) =>
      h('button', { type: 'button', class: primary ? 'primary' : '', text: label, disabled: state.guardActive, onclick: act(key, option), dataset: option === undefined ? { action: key } : { action: key, option: String(option) } });

    if (pomodoro) {
      // A Pomodoro part is over: start the next part (the main button), focus 5 more minutes, later, or stop.
      parts.push(h('div', { class: 'alert-actions' },
        button(item.next === 'focus' ? T('Start Focus') : T('Start Break'), 'next', true),
        item.canExtend ? button(T('5 More Minutes of Focus'), 'snooze', false, 5) : null,
        button(T('Later'), 'dismiss', false),
        button(T('Stop Pomodoro'), 'stop', false)));
    } else {
      const chips = [];
      if (a.show.time) chips.push(h('span', { class: 'chip' }, h('b', { text: item.startLabel }), item.endLabel ? `– ${item.endLabel}` : ''));
      if (a.show.duration && item.durationLabel) chips.push(h('span', { class: 'chip', text: item.durationLabel }));
      if (a.show.zone && item.zoneName) chips.push(h('span', { class: 'chip', text: T('Zone: {zone}', { zone: T(item.zoneName) }) }));
      if (a.show.category && item.categoryName) {
        chips.push(h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: item.categoryColor || a.textColor } }), item.categoryName));
      }
      if (a.show.priority && item.priority) chips.push(h('span', { class: 'chip', text: T('{priority} priority', { priority: T(item.priority) }) }));
      if (chips.length) parts.push(h('div', { class: 'alert-info' }, chips));

      // "Got It" is always shown; the others follow the choice in Settings.
      const shown = a.buttons || { snooze: true, open: true, done: true };
      parts.push(h('div', { class: 'alert-actions' },
        button(T('Got It'), 'dismiss', true),
        shown.snooze ? button(TP(state.snoozeMinutes, 'Snooze {n} minute', 'Snooze {n} minutes'), 'snooze', false) : null,
        shown.snooze ? h('button', { type: 'button', class: 'snooze-more', text: '▾', title: T('More Snooze Options'), 'aria-label': T('More Snooze Options'), 'aria-expanded': String(snoozeChoicesOpen), 'aria-controls': 'alert-snooze-choices', disabled: state.guardActive, onclick: () => { snoozeChoicesOpen = !snoozeChoicesOpen; if (handlers && handlers.redraw) handlers.redraw(); }, dataset: { more: 'snooze' } }) : null,
        shown.open ? button(item.kind === 'routine' ? T('Open Routines') : T('Open Task'), 'open', false) : null,
        shown.done ? button(T('Mark as Done'), 'done', false) : null));

      if (shown.snooze && snoozeChoicesOpen) {
        parts.push(h('div', { class: 'alert-actions snooze-choices', id: 'alert-snooze-choices' },
          button(T('5 Minutes'), 'snooze', false, 5),
          button(T('15 Minutes'), 'snooze', false, 15),
          button(T('30 Minutes'), 'snooze', false, 30),
          button(T('1 Hour'), 'snooze', false, 60),
          button(T('After the Next Prayer'), 'snooze', false, 'prayer')));
      }
    }

    if (state.remaining > 0) {
      parts.push(h('div', { class: 'alert-more', text: TP(state.remaining, '{n} more task starting now', '{n} more tasks starting now') }));
    }

    stage.append(...parts);
    frame.appendChild(stage);
    clear(root).appendChild(frame);
    if (watcher) { watcher.disconnect(); watcher = null; }
    // Only the title on screen is refitted (a redraw replaces it; the old one is no longer measured).
    const refit = () => { if (name.isConnected) fitTitle(name, a.name.size); };
    refit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit).catch(() => {});
    if (window.ResizeObserver) {
      watcher = new ResizeObserver(refit);
      watcher.observe(frame);
    }
    return { stage, frame };
  }

  WW.AlertView = { render, applyAppearance, closeSnoozeChoices: () => { snoozeChoicesOpen = false; } };
})();

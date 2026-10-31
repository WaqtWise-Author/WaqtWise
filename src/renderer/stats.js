'use strict';

// The Statistics screen. A range (Day, Week, Month, Year or Custom) decides what every chart shows;
// the numbers come ready-made from the main process (getStats), this file only draws them.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, clear, T, TP } = WW;
  const i18n = window.WWI18n;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RANGES = () => [['day', T('Day')], ['week', T('Week')], ['month', T('Month')], ['year', T('Year')], ['custom', T('Custom')]];
  const WEEKDAYS = () => [0, 1, 2, 3, 4, 5, 6].map((i) => i18n.weekdayShort(i));
  const MONTHS_SHORT = () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => i18n.monthShort(i));
  const BAR_AREA = 170; // tallest bar, in pixels
  const LATE_SHOWN = 5;

  // Must match STATS_CHARTS in src/core/settings.js (a test checks that).
  const CHARTS_DEF = () => [
    ['kpi-rate', T('Completion Rate'), T('Share of counted tasks that are done')],
    ['kpi-done', T('Tasks Done'), T('How many tasks were done, out of how many')],
    ['kpi-streak', T('Current Streak'), T('Days in a row with at least 70% done')],
    ['kpi-time', T('Planned Time'), T('Total Time of the Counted Tasks')],
    ['kpi-ontime', T('Done on Time'), T('Share of done tasks that were not late')],
    ['bars', T('Done vs Planned'), T('Bars of Done and Planned Tasks')],
    ['zones', T('By Zone'), T('Share done in each of the 5 zones')],
    ['heat', T('Calendar Heat Map'), T('Every day of the month or year as a colour')],
    ['trend', T('Completion Trend'), T('How the Completion Rate Moves Over Time')],
    ['categories', T('By Category'), T('Share Done and Planned Time per Category')],
    ['late', T('Needs attention'), T('Tasks not done and already past their time')],
    ['lateness', T('Most Late Tasks'), T('Which tasks are done late, and by how much on average')],
    ['lateby', T('Lateness by Zone and Category'), T('Average Delay in Each Zone and Category')],
    ['latetrend', T('Lateness Over Time'), T('Average delay in each day, week or month')],
    ['prayertimes', T('Prayer Time Over Time'), T('At what time a prayer falls, day by day')],
    ['zonelength', T('Zone Length Over Time'), T('How long a zone lasts, day by day, in total or as free time')],
    ['routines', T('Routines'), T('How steadily you keep each routine, with its streak')],
  ];
  const CHARTS = { map: (f) => CHARTS_DEF().map(f), find: (f) => CHARTS_DEF().find(f) };
  const local = { query: { range: 'week' }, showAllLate: false, prayer: 'fajr', zone: 1, metric: 'total' };

  const shade = (pct) => `color-mix(in srgb, var(--accent) ${Math.round(14 + pct * 0.86)}%, var(--surface))`;

  function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    children.forEach((c) => { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  // ---- header ------------------------------------------------------------------------------------

  function header(data) {
    const go = (query) => query && WW.showStats(query);
    const prev = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': T('Previous Period'), disabled: !data.prevQuery, onclick: () => go(data.prevQuery) }, WW.icon(WW.arrowIcon('prev'), 18, 2.2));
    const next = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': T('Next Period'), disabled: !data.nextQuery, onclick: () => go(data.nextQuery) }, WW.icon(WW.arrowIcon('next'), 18, 2.2));

    const choose = (id) => {
      if (id === data.range) return;
      if (id === 'custom') go({ range: 'custom', fromKey: data.rangeStartKey, toKey: data.rangeEndKey });
      else go({ range: id, anchorKey: data.rangeEndKey });
    };
    const seg = h('div', { class: 'stats-seg', role: 'group', 'aria-label': T('Range') },
      RANGES().map(([id, label]) => h('button', {
        type: 'button', class: id === data.range ? 'on' : '', 'aria-pressed': String(id === data.range), 'data-range': id, onclick: () => choose(id),
      }, label)));

    const custom = data.range === 'custom'
      ? [
        h('input', { type: 'date', value: data.rangeStartKey, max: data.todayKey, 'aria-label': T('From Date'), id: 'stats-from',
          onchange: (e) => e.target.value && go({ range: 'custom', fromKey: e.target.value, toKey: data.rangeEndKey }) }),
        h('span', { class: 'stats-to', text: T('to') }),
        h('input', { type: 'date', value: data.rangeEndKey, max: data.todayKey, 'aria-label': T('To Date'), id: 'stats-to',
          onchange: (e) => e.target.value && go({ range: 'custom', fromKey: data.rangeStartKey, toKey: e.target.value }) }),
        h('button', { class: 'btn tall', type: 'button', id: 'stats-all', text: T('All Time'), onclick: () => go({ range: 'custom', fromKey: data.earliestKey, toKey: data.todayKey }) }),
      ]
      : [];

    return h('div', { class: 'day-head stats-head' },
      h('div', { class: 'day-info' },
        h('h1', { class: 'day-title', text: T('Statistics') }),
        h('div', { class: 'stats-nav' },
          h('div', { class: 'stats-arrows' }, prev, next),
          h('div', { class: 'day-sub', id: 'stats-range-label', text: data.rangeLabel }))),
      h('div', { class: 'day-actions stats-actions' }, custom, seg,
        h('button', { class: 'btn tall', type: 'button', id: 'stats-manage', onclick: openManage }, WW.icon('gear', 18, 2), T('Manage'))));
  }

  // ---- key figures ----------------------------------------------------------------------------------

  function kpiCards(data, ids) {
    const cards = ids.map((id) => data.kpis.find((k) => `kpi-${k.id}` === id)).filter(Boolean);
    return h('div', { class: 'stats-kpis' }, cards.map((k) =>
      h('div', { class: 'stats-card kpi', 'data-kpi': k.id },
        h('div', { class: 'kpi-label', text: k.label }),
        h('div', { class: 'kpi-value' }, h('span', { class: 'kpi-num', text: k.value }), k.unit ? h('span', { class: 'kpi-unit', text: k.unit }) : null),
        h('div', { class: `kpi-delta ${k.delta.tone}`, text: k.delta.text }))));
  }

  // ---- done versus planned ---------------------------------------------------------------------------

  function barsCard(data) {
    const b = data.bars;
    const many = b.items.length > 14;
    const detailed = b.items.length <= 12;
    const stride = b.items.length > 12 ? Math.ceil(b.items.length / 10) : 1;
    const columns = h('div', { class: `bars ${many ? 'tight' : ''}` }, b.items.map((it) =>
      h('div', { class: 'bar-col', title: T('{title}: {done} of {total} done', { title: it.title, done: it.done, total: it.total }) },
        h('div', { class: 'bar-pct', text: detailed && it.total ? `${it.pct}%` : '' }),
        h('div', { class: 'bar-planned', style: { height: `${Math.round((it.total / b.maxTotal) * BAR_AREA)}px` } },
          h('div', { class: 'bar-done', style: { height: `${Math.round((it.done / b.maxTotal) * BAR_AREA)}px` } })))));
    const labels = h('div', { class: `bar-labels ${many ? 'tight' : ''}` }, b.items.map((it, i) =>
      h('div', {}, h('div', { class: 'bl-name', text: i % stride === 0 ? it.label : '' }),
        h('div', { class: 'bl-ratio', text: detailed && !it.future ? `${it.done}/${it.total}` : '' }))));
    return h('section', { class: 'stats-card bars-card', 'aria-label': T('Done Versus Planned') },
      h('div', { class: 'stats-card-head' },
        h('div', {}, h('h2', { text: b.title }), h('div', { class: 'sub', id: 'bars-sub', text: b.sub })),
        h('div', { class: 'stats-legend' },
          h('span', {}, h('i', { class: 'sw planned' }), T('Planned')), h('span', {}, h('i', { class: 'sw done' }), T('Done')))),
      columns, labels);
  }

  function zonesCard(data) {
    return h('section', { class: 'stats-card zones-card', 'aria-label': T('By Zone') },
      h('h2', { text: T('By Zone') }), h('div', { class: 'sub', text: T('Share of Tasks Done in Each Zone') }),
      h('div', { class: 'bars-list' }, data.zones.map((z) =>
        h('div', { class: `z${z.index}` },
          h('div', { class: 'row-top' }, h('span', { class: 'zone-label' }, WW.zoneIcon(z.index, 18), z.name), h('span', { text: `${z.pct}%` })),
          h('div', { class: 'meter' }, h('div', { style: { width: `${z.pct}%`, background: 'var(--zf)' } })),
          h('div', { class: 'row-note', text: T('{done} of {total} tasks', { done: z.done, total: z.total }) })))));
  }

  // ---- heat map -------------------------------------------------------------------------------------------

  function heatCard(data) {
    const heat = data.heat;
    const open = (key) => WW.showStats({ range: 'day', anchorKey: key });
    const legend = h('div', { class: 'stats-legend heat-legend' }, T('Less'),
      [0, 25, 50, 75, 100].map((p) => h('span', { class: 'heat-sw', style: { background: shade(p) } })), T('More'));
    const cellTitle = (d) => (d.pct === null ? d.key : T('{date}: {pct}% done', { date: d.key, pct: d.pct }));
    let body;
    if (heat.mode === 'month') {
      const cells = [];
      for (let i = 0; i < 7; i++) cells.push(h('div', { class: 'heat-wd', text: WEEKDAYS()[(heat.weekStart + i) % 7] }));
      for (let i = 0; i < heat.firstWeekday; i++) cells.push(h('div', { class: 'heat-blank' }));
      heat.days.forEach((d) => {
        const strong = d.pct !== null && d.pct >= 70;
        cells.push(h('button', {
          type: 'button', class: `heat-day ${d.inRange ? 'sel' : ''}`, title: cellTitle(d), 'aria-label': cellTitle(d), disabled: d.future, 'data-key': d.key,
          style: { background: d.pct === null ? 'var(--heat-empty)' : shade(d.pct), color: d.pct === null ? 'var(--text-soft)' : strong ? 'var(--accent-text)' : 'var(--text)' },
          onclick: () => open(d.key),
        }, h('span', { class: 'hd-n', text: String(d.day) }), h('span', { class: 'hd-p', text: d.pct === null ? '' : `${d.pct}%` })));
      });
      body = h('div', { class: 'heat-month' }, cells);
    } else {
      const marks = [];
      heat.days.forEach((d, i) => {
        if (d.day === 1) marks.push(h('div', { class: 'ym', style: { gridColumn: String(Math.floor((heat.firstWeekday + i) / 7) + 1) }, text: MONTHS_SHORT()[Number(d.key.slice(5, 7)) - 1] }));
      });
      const cells = [];
      for (let i = 0; i < heat.firstWeekday; i++) cells.push(h('div', { class: 'heat-blank' }));
      heat.days.forEach((d) => cells.push(h('button', {
        type: 'button', class: `heat-sq ${d.inRange ? 'sel' : ''}`, title: cellTitle(d), 'aria-label': cellTitle(d), disabled: d.future, 'data-key': d.key,
        style: { background: d.pct === null ? 'var(--heat-empty)' : shade(d.pct) }, onclick: () => open(d.key),
      })));
      body = h('div', { class: 'heat-year-wrap' }, h('div', { class: 'heat-year' }, h('div', { class: 'heat-marks' }, marks), h('div', { class: 'heat-grid' }, cells)));
    }
    return h('section', { class: 'stats-card heat-card', 'aria-label': T('Calendar Heat Map') },
      h('div', { class: 'stats-card-head' },
        h('div', {}, h('h2', { id: 'heat-title', text: heat.title }), h('div', { class: 'sub', text: T('Darker = more of that day’s tasks were done. Click a day to open it.') })),
        legend),
      body);
  }

  // ---- completion trend ---------------------------------------------------------------------------------------

  function trendChart(trend) {
    const W = 640;
    const x0 = 56;
    const x1 = 616;
    const yTop = 12;
    const yBot = 180;
    const series = trend.points.map((p) => p.value);
    const values = series.concat(trend.compare || [], trend.thin || []).filter((v) => v !== null);
    const lo = Math.max(0, Math.floor((Math.min(...values) - 8) / 10) * 10);
    const hi = Math.min(100, Math.max(lo + 30, Math.ceil((Math.max(...values) + 4) / 10) * 10));
    const n = series.length;
    const flip = (i) => (WW.isRtl() ? n - 1 - i : i);
    const X = (i) => (n === 1 ? (x0 + x1) / 2 : Math.round(x0 + ((x1 - x0) * flip(i)) / (n - 1)));
    const Y = (v) => Math.round(yBot - ((v - lo) / (hi - lo)) * (yBot - yTop));
    const poly = (arr) => arr.map((v, i) => (v === null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(' ');
    const root = svg('svg', { viewBox: `0 0 ${W} 220`, width: '100%', role: 'img', 'aria-label': T('Completion trend. {sub}', { sub: trend.sub }) });
    root.style.overflow = 'visible';

    const step = Math.round((hi - lo) / 3);
    [0, 1, 2, 3].forEach((i) => {
      const v = i === 3 ? hi : lo + step * i;
      root.append(
        svg('line', { x1: 40, x2: 632, y1: Y(v), y2: Y(v), class: 'tr-grid' }),
        svg('text', { x: 0, y: Y(v) + 4, class: 'tr-axis' }, `${v}%`));
    });
    if (trend.thin) root.appendChild(svg('polyline', { points: poly(trend.thin), class: 'tr-thin' }));
    if (trend.compare) root.appendChild(svg('polyline', { points: poly(trend.compare), class: 'tr-compare' }));

    const known = series.map((v, i) => (v === null ? null : i)).filter((i) => i !== null);
    const first = known[0];
    const last = known[known.length - 1];
    if (known.length > 1) {
      const d = `M${X(first)},${yBot} L${poly(series).split(' ').join(' L')} L${X(last)},${yBot} Z`;
      root.appendChild(svg('path', { d, class: `tr-area ${trend.compare || trend.thin ? 'light' : ''}` }));
    }
    root.appendChild(svg('polyline', { points: poly(series), class: 'tr-line' }));

    const showDots = n <= 12;
    const labelStride = n > 8 && trend.points.every((p) => p.label !== '') ? Math.ceil(n / 8) : 1;
    trend.points.forEach((p, i) => {
      if (p.value !== null && (showDots || i === last)) {
        root.appendChild(svg('circle', { cx: X(i), cy: Y(p.value), r: 5, class: 'tr-dot' }, svg('title', {}, p.title)));
      }
      if (i % labelStride === 0 && p.label) root.appendChild(svg('text', { x: X(i), y: 212, 'text-anchor': 'middle', class: 'tr-axis' }, p.label));
    });
    root.appendChild(svg('text', { x: X(last), y: Y(series[last]) - 14, 'text-anchor': 'end', class: 'tr-last' }, `${series[last]}%`));
    return root;
  }

  function trendCard(data) {
    const t = data.trend;
    return h('section', { class: 'stats-card trend-card', 'aria-label': T('Completion Trend') },
      h('div', { class: 'stats-card-head' },
        h('div', {}, h('h2', { text: T('Completion Trend') }), h('div', { class: 'sub', id: 'trend-sub', text: t.sub })),
        h('div', { class: 'stats-legend' }, t.legend.map((l) => h('span', {}, h('i', { class: `ln ${l.style}` }), l.label)))),
      t.ok
        ? h('div', { class: 'trend-body' }, trendChart(t))
        : h('div', { class: 'trend-empty', id: 'trend-empty', text: T('Not enough data yet. The trend appears after 3 days with tasks.') }));
  }

  // ---- by category, needs attention ---------------------------------------------------------------------------------

  function categoriesCard(data) {
    return h('section', { class: 'stats-card cat-card', 'aria-label': T('By Category') },
      h('h2', { text: T('By Category') }), h('div', { class: 'sub', text: T('Share Done, and Planned Time') }),
      data.categories.length === 0
        ? h('div', { class: 'stats-none', text: T('No tasks in this range.') })
        : h('div', { class: 'bars-list cats' }, data.categories.map((c) =>
          h('div', { class: 'cat-line' },
            h('span', { class: 'cat-dot', style: { background: c.color } }),
            h('span', { class: 'cat-name', text: c.name }),
            h('div', { class: 'meter' }, h('div', { style: { width: `${c.pct}%`, background: c.color } })),
            h('span', { class: 'cat-pct', text: `${c.pct}%` }),
            h('span', { class: 'cat-time', text: c.timeLabel })))));
  }

  function lateCard(data) {
    const late = data.late;
    const shown = local.showAllLate ? late.items : late.items.slice(0, LATE_SHOWN);
    const list = h('div', { class: 'late-list' }, shown.map((t) =>
      h('div', { class: 'late-item', role: 'button', tabindex: '0', 'data-task': t.taskId,
        onclick: () => WW.openTaskDetails({ taskId: t.taskId, dateKey: t.dateKey }) },
      h('div', { class: 'late-main' }, h('div', { class: 'late-title', text: t.title }), h('div', { class: 'late-when', text: `${t.whenLabel} · ${t.zoneName}` })),
      h('span', { class: 'late-age', text: t.ageLabel }))));
    const more = late.total > LATE_SHOWN
      ? h('button', { class: 'link-btn late-more', type: 'button', id: 'late-more',
        text: local.showAllLate ? T('Show Fewer') : T('View all {n}', { n: late.total }),
        onclick: () => { local.showAllLate = !local.showAllLate; WW.renderStats(); } })
      : null;
    return h('section', { class: 'stats-card late-card', 'aria-label': T('Needs attention') },
      h('h2', { text: T('Needs attention') }), h('div', { class: 'sub', text: T('Not Done and Already Past Their Time') }),
      late.total === 0 ? h('div', { class: 'stats-none', id: 'late-none', text: T('Nothing overdue in this range.') }) : list, more);
  }

  // ---- lateness ---------------------------------------------------------------------------------------------------

  function noTiming(id) {
    return h('div', { class: 'stats-none', id, text: T('No timing data in this range yet. It is recorded when you tick a task as done.') });
  }

  function latenessCard(data) {
    const l = data.lateness;
    const note = l.unknown > 0 ? TP(l.unknown, '{n} done task without a recorded time is not counted.', '{n} done tasks without a recorded time are not counted.') : '';
    const list = h('div', { class: 'late-list lateness-list' }, l.items.map((t) =>
      h('div', { class: 'late-item lateness-item', role: 'button', tabindex: '0', 'data-task': t.taskId,
        onclick: () => WW.openTaskDetails({ taskId: t.taskId, dateKey: t.dateKey }) },
      h('div', { class: 'late-main' }, h('div', { class: 'late-title', text: t.title }),
        h('div', { class: 'late-when', text: [
          t.n ? T('Late {late} of {n}', { late: t.late, n: t.n }) : '',
          t.n ? T('Longest: {time}', { time: t.maxLabel }) : '',
          t.missed ? TP(t.missed, 'Not done {n} time', 'Not done {n} times') : '',
        ].filter(Boolean).join(' · ') })),
      h('span', { class: 'late-age', text: t.avg === null ? '–' : T('Average {time}', { time: t.avgLabel }) }))));
    return h('section', { class: 'stats-card late-card lateness-card', 'aria-label': T('Most Late Tasks') },
      h('h2', { text: T('Most Late Tasks') }),
      h('div', { class: 'sub', text: T('Late means done more than {time} after the start. Change this in Settings.', { time: l.thresholdLabel }) }),
      l.measured === 0 && l.total === 0 ? noTiming('lateness-none')
        : l.total === 0 ? h('div', { class: 'stats-none', id: 'lateness-clear', text: T('Nothing was late in this range.') }) : list,
      note ? h('div', { class: 'row-note', text: note }) : null);
  }

  function delayLine(row, max, color) {
    const none = row.avg === null;
    return h('div', { class: 'cat-line late-by-line', 'data-n': String(row.n) },
      h('span', { class: 'cat-dot', style: { background: color || 'var(--accent)' } }),
      h('span', { class: 'cat-name', text: row.name }),
      h('div', { class: 'meter' }, h('div', { style: { width: `${none ? 0 : Math.max(2, Math.round((row.avg / max) * 100))}%`, background: color || 'var(--accent)' } })),
      h('span', { class: 'cat-pct', text: row.avgLabel }),
      h('span', { class: 'cat-time', text: none ? '' : T('{late} of {n} late', { late: row.late, n: row.n }) }));
  }

  function latebyCard(data) {
    const b = data.lateBy;
    const any = b.zones.some((z) => z.n > 0);
    return h('section', { class: 'stats-card cat-card lateby-card', 'aria-label': T('Lateness by Zone and Category') },
      h('h2', { text: T('Lateness by Zone and Category') }), h('div', { class: 'sub', text: T('Average time from the start until the task was ticked') }),
      !any ? noTiming('lateby-none') : h('div', {},
        h('div', { class: 'lateby-head', text: T('By Zone') }),
        h('div', { class: 'bars-list cats' }, b.zones.map((z) => delayLine(z, b.maxAvg, null))),
        h('div', { class: 'lateby-head', text: T('By Category') }),
        h('div', { class: 'bars-list cats' }, b.categories.map((c) => delayLine(c, b.maxAvg, c.color)))));
  }

  function latetrendCard(data) {
    const t = data.lateTrend;
    const many = t.items.length > 14;
    const stride = t.items.length > 12 ? Math.ceil(t.items.length / 10) : 1;
    const detailed = t.items.length <= 12;
    return h('section', { class: 'stats-card bars-card latetrend-card', 'aria-label': T('Lateness Over Time') },
      h('div', { class: 'stats-card-head' }, h('div', {}, h('h2', { text: T('Lateness Over Time' ) }), h('div', { class: 'sub', text: T('Average delay of the tasks done in each bar') }))),
      t.known === 0 ? noTiming('latetrend-none') : h('div', {},
        h('div', { class: `bars ${many ? 'tight' : ''}` }, t.items.map((it) =>
          h('div', { class: 'bar-col', title: it.n ? T('{title}: average {time}', { title: it.title, time: formatMinutes(it.avg) }) : it.title },
            h('div', { class: 'bar-pct', text: detailed && it.n ? formatMinutes(it.avg) : '' }),
            h('div', { class: 'bar-planned lt-bar', style: { height: `${it.n ? Math.max(3, Math.round((it.avg / t.maxAvg) * BAR_AREA)) : 0}px` } })))),
        h('div', { class: `bar-labels ${many ? 'tight' : ''}` }, t.items.map((it, i) =>
          h('div', {}, h('div', { class: 'bl-name', text: i % stride === 0 ? it.label : '' }), h('div', { class: 'bl-ratio', text: '' }))))));
  }


  // ---- prayer times and zone lengths over time (two line charts) ---------------------------------------------------

  const LC = { w: 1020, h: 262, left: 70, right: 40, top: 20, bottom: 220 };

  // series: { points: [{ label, title, value, valueLabel }], axis: { low, high, ticks: [{ value, label }] } }
  function lineChart(series, { color, aria, id }) {
    const n = series.points.length;
    const { low, high } = series.axis;
    const x = (i) => LC.left + ((LC.w - LC.left - LC.right) * i) / (n - 1);
    const y = (v) => LC.bottom - ((v - low) / (high - low || 1)) * (LC.bottom - LC.top);
    const line = series.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const stride = Math.max(1, Math.ceil(n / 10));
    const hits = n <= 62 ? series.points.map((p, i) =>
      svg('circle', { class: 'lc-hit', cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: n > 31 ? 5 : 8, 'data-i': i }, svg('title', {}, `${p.title}: ${p.valueLabel}`))) : [];
    const last = n - 1;
    return svg('svg', { class: 'line-chart', id, viewBox: `0 0 ${LC.w} ${LC.h}`, role: 'img', 'aria-label': aria },
      ...series.axis.ticks.map((tk) => svg('line', { class: 'lc-grid', x1: LC.left - 8, x2: LC.w - LC.right + 10, y1: y(tk.value).toFixed(1), y2: y(tk.value).toFixed(1) })),
      ...series.axis.ticks.map((tk) => svg('text', { class: 'lc-ylabel', x: LC.left - 14, y: (y(tk.value) + 4).toFixed(1), 'text-anchor': 'end' }, tk.label)),
      svg('polygon', { class: 'lc-area', points: `${x(0)},${LC.bottom + 10} ${line} ${x(last).toFixed(1)},${LC.bottom + 10}`, fill: color }),
      svg('polyline', { class: 'lc-line', points: line, stroke: color }),
      ...[0, last].map((i) => svg('circle', { class: 'lc-end', cx: x(i).toFixed(1), cy: y(series.points[i].value).toFixed(1), r: 5, stroke: color })),
      svg('text', { class: 'lc-endlabel', x: (x(0) + 8).toFixed(1), y: (y(series.points[0].value) - 12).toFixed(1), 'text-anchor': 'start' }, series.points[0].valueLabel),
      svg('text', { class: 'lc-endlabel', x: (x(last) - 4).toFixed(1), y: (y(series.points[last].value) - 12).toFixed(1), 'text-anchor': 'end' }, series.points[last].valueLabel),
      ...hits,
      ...series.points.map((p, i) => (i % stride === 0 ? svg('text', { class: 'lc-xlabel', x: x(i).toFixed(1), y: LC.h - 8, 'text-anchor': 'middle' }, p.label) : null)));
  }

  // The row of choices above a chart: one button for each, the chosen one is "on".
  function chipRow(items, chosen, label, pick) {
    return h('div', { class: 'trend-chips', role: 'group', 'aria-label': label }, items.map(([id, text]) =>
      h('button', { type: 'button', class: `trend-chip ${id === chosen ? 'on' : ''}`, 'aria-pressed': String(id === chosen), 'data-id': String(id), text, onclick: () => pick(id) })));
  }

  function bucketNote(trends) {
    if (trends.bucket === 'week') return T('Each point is the average of one week.');
    if (trends.bucket === 'month') return T('Each point is the average of one month.');
    return '';
  }

  function summaryChips(series, words) {
    const change = series.change === 0 ? T('No change over the range') : (series.change > 0 ? words.more : words.less).replace('{time}', series.changeLabel);
    return h('div', { class: 'trend-summary' },
      h('span', { class: 'trend-pill' }, h('b', { text: words.low }), ` ${series.lowest.valueLabel} · ${series.lowest.title}`),
      h('span', { class: 'trend-pill' }, h('b', { text: words.high }), ` ${series.highest.valueLabel} · ${series.highest.title}`),
      h('span', { class: 'trend-pill change', id: words.changeId, text: change }));
  }

  // Redraws only the card that was clicked (its choices live in `local`), and gives the focus back to the button.
  function redrawCard(builder, data, selector, chosenId) {
    const old = document.querySelector(selector);
    if (!old) return;
    const fresh = builder(data);
    old.replaceWith(fresh);
    const again = fresh.querySelector(`.trend-chip[data-id="${chosenId}"]`) || fresh.querySelector('.trend-chip.on');
    if (again) again.focus();
  }

  function trendNone(id) {
    return h('div', { class: 'stats-none', id, text: T('Choose Week, Month or Year to see how this changes over time.') });
  }

  function prayerTimesCard(data) {
    const trends = data.prayerTrends;
    const prayer = trends.prayers.find((p) => p.id === local.prayer) || trends.prayers[0];
    return h('section', { class: 'stats-card trend-card prayertimes-card', 'aria-label': T('Prayer Time Over Time') },
      h('div', { class: 'stats-card-head' },
        h('div', {}, h('h2', { text: T('Prayer Time Over Time') }), h('div', { class: 'sub', text: T('At what time the chosen prayer falls, day by day') })),
        chipRow(trends.prayers.map((p) => [p.id, p.name]), prayer.id, T('Prayer'), (id) => { local.prayer = id; redrawCard(prayerTimesCard, data, '.prayertimes-card', id); })),
      trends.single ? trendNone('prayertimes-none') : h('div', {},
        summaryChips(prayer, { low: T('Earliest'), high: T('Latest'), more: T('{time} later over the range'), less: T('{time} earlier over the range'), changeId: 'prayertimes-change' }),
        lineChart(prayer, { color: 'var(--accent)', id: 'prayertimes-chart', aria: T('{name}: {first} on the first day, {last} on the last day', { name: prayer.name, first: prayer.points[0].valueLabel, last: prayer.points[prayer.points.length - 1].valueLabel }) }),
        bucketNote(trends) ? h('div', { class: 'trend-note', text: bucketNote(trends) }) : null));
  }

  function zoneLengthCard(data) {
    const trends = data.prayerTrends;
    const zone = trends.zones.find((z) => z.index === local.zone) || trends.zones[0];
    const series = local.metric === 'free' ? zone.free : zone.total;
    return h('section', { class: 'stats-card trend-card zonelength-card', 'aria-label': T('Zone Length Over Time') },
      h('div', { class: 'stats-card-head' },
        h('div', {}, h('h2', { text: T('Zone Length Over Time') }), h('div', { class: 'sub', text: T('How long the chosen zone lasts, day by day (prayer to prayer)') })),
        chipRow(trends.zones.map((z) => [z.index, z.name]), zone.index, T('Zone'), (id) => { local.zone = id; redrawCard(zoneLengthCard, data, '.zonelength-card', id); })),
      trends.single ? trendNone('zonelength-none') : h('div', {},
        h('div', { class: 'trend-top' },
          summaryChips(series, { low: T('Shortest'), high: T('Longest'), more: T('{time} longer over the range'), less: T('{time} shorter over the range'), changeId: 'zonelength-change' }),
          chipRow([['total', T('Total Length')], ['free', T('Free Time')]], local.metric, T('Measure'), (id) => { local.metric = id; redrawCard(zoneLengthCard, data, '.zonelength-card', id); })),
        lineChart(series, { color: 'var(--gold)', id: 'zonelength-chart', aria: T('{name}: {first} on the first day, {last} on the last day', { name: zone.name, first: series.points[0].valueLabel, last: series.points[series.points.length - 1].valueLabel }) }),
        h('div', { class: 'trend-note', text: (local.metric === 'free' ? T('Free Time is the length of the zone minus the time your tasks take.') : T('Total Length is the whole stretch from one prayer to the next.')) + (bucketNote(trends) ? ` ${bucketNote(trends)}` : '') })));
  }

  // ---- routines -----------------------------------------------------------------------------------------

  function routinesCard(data) {
    const r = data.routineStats || { items: [], total: { planned: 0, done: 0, pct: null } };
    const shown = r.items.filter((x) => x.enabled);
    const body = !r.items.length
      ? h('div', { class: 'stats-none', id: 'routines-none', text: T('No routines yet. Add one from the Routines page.') })
      : r.total.planned === 0
        ? h('div', { class: 'stats-none', id: 'routines-empty', text: T('No routine times have come up in this range yet.') })
        : h('div', { class: 'bars-list routine-stats' }, shown.map((x) =>
          h('div', { class: 'routine-stat', 'data-id': x.id },
            h('div', { class: 'row-top' }, h('span', { class: 'zone-label', text: x.title }), h('span', { text: x.pct === null ? '–' : `${x.pct}%` })),
            h('div', { class: 'meter' }, h('div', { style: { width: `${x.pct || 0}%`, background: 'var(--accent)' } })),
            h('div', { class: 'row-note', text: T('{done} of {total} times done', { done: x.done, total: x.planned }) + (x.streak > 0 ? ` · ${TP(x.streak, 'Streak: {n} day', 'Streak: {n} days')}` : '') }),
            x.days.length ? h('div', { class: 'routine-spark', role: 'img', 'aria-label': T('The last days: a darker square means more times done') }, x.days.map((d) =>
              h('i', { title: `${d.key}: ${d.done}/${d.planned}`, style: { opacity: String(0.18 + 0.82 * ((d.pct || 0) / 100)) } }))) : null,
            x.weakest ? h('div', { class: 'row-note', text: T('Most often missed: {at} ({pct}% done)', { at: x.weakest.label, pct: x.weakest.pct }) }) : null)));
    return h('section', { class: 'stats-card routines-card', 'aria-label': T('Routines') },
      h('h2', { text: T('Routines') }),
      h('div', { class: 'sub', id: 'routines-sub', text: r.total.pct === null ? T('How Steadily You Keep Each Routine') : T('{pct}% of routine times done ({done} of {total})', { pct: r.total.pct, done: r.total.done, total: r.total.planned }) }),
      body);
  }

  function formatMinutes(m) {
    if (m === null || m === undefined) return '–';
    if (m === 0) return T('On Time');
    const hrs = Math.floor(m / 60);
    return hrs > 0 ? T('{h}h {m}m', { h: hrs, m: m % 60 }) : T('{m}m', { m });
  }

  // ---- screen ---------------------------------------------------------------------------------------------------------

  WW.renderStats = function renderStats() {
    const data = WW.state.stats;
    const root = clear(document.getElementById('view'));
    const chosen = WW.state.settings.statsCharts;
    const kpiIds = chosen.filter((id) => id.startsWith('kpi-'));
    const builders = { bars: barsCard, zones: zonesCard, heat: heatCard, trend: trendCard, categories: categoriesCard, late: lateCard, lateness: latenessCard, lateby: latebyCard, latetrend: latetrendCard, prayertimes: prayerTimesCard, zonelength: zoneLengthCard, routines: routinesCard };
    const cards = chosen.filter((id) => builders[id]);
    root.append(
      header(data),
      ...(data.empty ? [h('div', { class: 'stats-intro', id: 'stats-empty', text: T('Nothing to count yet. Tasks appear here once they are done or their time has passed.') })] : []),
      ...(kpiIds.length ? [kpiCards(data, kpiIds)] : []),
      ...(cards.length
        ? [h('div', { class: 'stats-grid' }, cards.map((id) => builders[id](data)))]
        : (kpiIds.length ? [] : [h('div', { class: 'stats-intro', id: 'stats-nothing', text: T('No charts are shown. Use Manage to add some.') })])));
  };

  // ---- Manage: add, remove and re-order the charts -------------------------------------------------------

  function openManage() {
    const dlg = WW.openDialog({ title: T('Manage Charts') });
    const info = (id) => CHARTS.find((c) => c[0] === id);
    const save = async (list) => {
      try {
        WW.state.settings = await WW.call('saveSettings', { statsCharts: list });
      } catch (error) {
        WW.toast(error.message, 'error');
      }
      draw();
      WW.renderStats();
    };
    function draw() {
      const shown = WW.state.settings.statsCharts.slice();
      const hidden = CHARTS.map((c) => c[0]).filter((id) => !shown.includes(id));
      const move = (i, d) => { const list = shown.slice(); [list[i], list[i + d]] = [list[i + d], list[i]]; save(list); };
      const row = (id, buttons) => h('div', { class: 'manage-row', 'data-chart': id },
        h('div', { class: 'manage-name' }, h('b', { text: info(id)[1] }), h('div', { class: 'hint', text: info(id)[2] })),
        h('div', { class: 'manage-btns' }, buttons));
      clear(dlg.body).append(
        h('h3', { class: 'manage-title', text: T('Shown ({n})', { n: shown.length }) }),
        ...(shown.length === 0 ? [h('p', { class: 'hint', text: T('No charts are shown.') })] : []),
        ...shown.map((id, i) => row(id, [
          h('button', { class: 'btn small', type: 'button', text: '▲', 'aria-label': T('Move {name} up', { name: info(id)[1] }), disabled: i === 0, onclick: () => move(i, -1) }),
          h('button', { class: 'btn small', type: 'button', text: '▼', 'aria-label': T('Move {name} down', { name: info(id)[1] }), disabled: i === shown.length - 1, onclick: () => move(i, 1) }),
          h('button', { class: 'btn small danger', type: 'button', text: T('Remove'), 'aria-label': T('Remove {name}', { name: info(id)[1] }), onclick: () => save(shown.filter((x) => x !== id)) }),
        ])),
        h('h3', { class: 'manage-title', text: T('Available to add ({n})', { n: hidden.length }) }),
        ...(hidden.length === 0 ? [h('p', { class: 'hint', text: T('Every chart is already shown.') })] : []),
        ...hidden.map((id) => row(id, [
          h('button', { class: 'btn small primary', type: 'button', text: T('Add'), 'aria-label': T('Add {name}', { name: info(id)[1] }), onclick: () => save(shown.concat(id)) }),
        ])));
    }
    draw();
    dlg.footer.append(
      h('button', { class: 'btn', type: 'button', id: 'manage-reset', text: T('Show All, Default Order'), onclick: () => save(CHARTS.map((c) => c[0])) }),
      h('button', { class: 'btn primary', type: 'button', text: T('Done'), onclick: () => dlg.close() }));
  }

  // query: { range, anchorKey, fromKey, toKey }. Without a query the last one is used again (a refresh).
  WW.showStats = async function showStats(query) {
    try {
      const keepScroll = WW.state.view === 'stats' && !query;
      const scrollY = window.scrollY;
      if (query) { local.query = query; local.showAllLate = false; }
      WW.state.view = 'stats';
      WW.state.stats = await WW.call('getStats', local.query);
      // Remember the resolved dates so the next step (Month, Custom, ...) starts from what is on screen.
      WW.renderStats();
      if (keepScroll) window.scrollTo(0, scrollY);
      else if (query) window.scrollTo(0, 0);
    } catch (error) {
      WW.toast(error.message, 'error');
    }
  };
})();

'use strict';

// Choosing a country and then a city anywhere in the world. Used by Settings and by the welcome screen.
// Egypt keeps its own short list of cities; every other country has its cities searched in the main process
// (the full list is too big to send to the window), and the chosen one is saved as the city in use.

(function () {
  const WW = (window.WW = window.WW || {});
  const { h, T, TP } = WW;

  // [{ code, name }] in the order of the language; filled at start-up (bootstrap) and again when the language changes.
  WW.countrySelect = function countrySelect({ id, value, onChange }) {
    const list = WW.state.countries || [];
    return h('select', { id, 'aria-label': T('Country'), onchange: (e) => onChange(e.target.value) },
      list.map((c) => h('option', { value: c.code, text: c.name, selected: c.code === value })));
  };

  // A search box and the matching cities of one country. `onChosen(result)` runs after the city has been saved.
  WW.worldCitySearch = function worldCitySearch({ country, onChosen }) {
    const input = h('input', {
      type: 'search', 'aria-label': T('Search for your city'), placeholder: T('Type your city (in English)'),
      autocomplete: 'off', spellcheck: 'false', maxlength: '60', 'data-city-search': country,
    });
    const list = h('ul', { class: 'city-results' });
    const status = h('p', { class: 'hint', role: 'status' });
    let seq = 0;
    let timer = null;

    const choose = async (item) => {
      list.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const result = await WW.call('chooseWorldCity', { country, id: item.id });
        await onChosen(result, item);
      } catch (error) {
        WW.toast(error.message, 'error');
        list.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    };

    const draw = (answer, text) => {
      list.replaceChildren(...answer.cities.map((c) => h('li', {},
        h('button', { type: 'button', class: 'city-result', 'data-city-id': String(c.id), onclick: () => choose(c) },
          h('span', { class: 'city-name', text: c.name }),
          c.region && c.region !== c.name ? h('span', { class: 'city-region', text: c.region }) : null))));
      if (answer.cities.length === 0) status.textContent = T('No city matches “{text}”. City names are in English: try another spelling, or use “My city is not in the list”.', { text });
      else if (answer.total > answer.cities.length) status.textContent = T('Showing {shown} of {total} cities. Type more letters to narrow the list.', { shown: answer.cities.length, total: answer.total });
      else status.textContent = TP(answer.total, '{n} city', '{n} cities');
    };

    const run = async () => {
      const mine = ++seq;
      const text = input.value.trim();
      try {
        const answer = await WW.call('searchCities', { country, query: text });
        if (mine === seq) draw(answer, text);
      } catch (error) {
        if (mine === seq) WW.toast(error.message, 'error');
      }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
    run();
    return h('div', { class: 'city-search' }, input, status, list);
  };
})();

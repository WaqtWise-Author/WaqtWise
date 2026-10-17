'use strict';

// Settings and categories.
// These methods are added to PlannerService (see ../service.js); `this` is the service.

const { t } = require('../../core/i18n');
const core = require('../../core');

const {
  mergeSettings,
} = core;
const { copy } = require('./util');

class SettingsMethods {
  // ---- settings and categories ---------------------------------------------------------------------------------

  getSettings() {
    return copy(this.settings);
  }

  saveSettings(patch) {
    this.freezePast();
    const previous = this.data.settings;
    const merged = mergeSettings(previous, patch);
    // Turning the "still running in the background" message back on shows it again at the next close.
    if (patch.showBackgroundMessage === true && !previous.showBackgroundMessage) merged.backgroundMessageShown = false;
    const prayerSettings = ['cityName', 'useCustomCity', 'customCity', 'countryCode', 'method', 'adjustments'];
    this.data.settings = merged;
    this.providerCache = null;
    if (prayerSettings.some((key) => key in patch)) {
      try {
        this.assertPrayerOrder();
      } catch (error) {
        this.data.settings = previous; // refused: nothing changes
        this.providerCache = null;
        throw error;
      }
    }
    this.applyLanguage();
    try {
      this.persist();
    } finally {
      this.onSettingsChanged(copy(this.data.settings));
      this.onDataChanged();
    }
    return copy(this.data.settings);
  }

  // ---- countries and cities of the world ----------------------------------------------------------------------

  getCountries() {
    return core.countryList(this.settings.language);
  }

  searchCities({ country, query } = {}) {
    return core.searchCities(country, query);
  }

  // Picks a city from the world list: it is kept as the custom city (coordinates + time zone), with the country's usual method.
  chooseWorldCity({ country, id } = {}) {
    const city = core.worldCity(country, id);
    const method = core.methodForCountry(country);
    try {
      this.saveSettings({
        useCustomCity: true,
        customCity: { name: city.name, latitude: city.latitude, longitude: city.longitude, timeZone: city.timeZone },
        countryCode: country,
        method,
      });
    } catch (error) {
      // Very far north or south the sun does not set or rise for weeks, and the prayers cannot be worked out all year.
      if (error.message === t('These prayer time settings put the prayers out of order on some days. Please change the adjustments.')) {
        throw new Error(t('Prayer times cannot be worked out all year for {city} (it is too far north or south). Choose another city, or enter one by hand.', { city: city.name }));
      }
      throw error;
    }
    return { city: this.cityInfo(), method };
  }

  validateCategory({ name, color }, ignoreId) {
    const clean = String(name || '').trim();
    if (clean === '') throw new Error(t('Please enter a category name.'));
    if (clean.length > 40) throw new Error(t('Category names can be up to 40 characters.'));
    if (this.data.categories.some((c) => c.id !== ignoreId && c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error(t('There is already a category with that name.'));
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) throw new Error(t('Please choose a color.'));
    return { name: clean, color };
  }

  addCategory(input) {
    const clean = this.validateCategory(input);
    const category = { id: `cat-${this.newId()}`, ...clean };
    this.data.categories.push(category);
    this.changed();
    return this.categoriesForView();
  }

  updateCategory({ id, name, color }) {
    const category = this.categoryOf(id);
    if (!category) throw new Error(t('That category no longer exists.'));
    Object.assign(category, this.validateCategory({ name, color }, id));
    this.changed();
    return this.categoriesForView();
  }

  // Deleting a category never deletes tasks: they simply become uncategorized.
  deleteCategory({ id }) {
    this.data.categories = this.data.categories.filter((c) => c.id !== id);
    for (const task of this.data.tasks) {
      if (task.categoryId === id) task.categoryId = null;
      for (const key of Object.keys(task.overrides)) {
        if (task.overrides[key].categoryId === id) task.overrides[key].categoryId = null;
      }
    }
    for (const free of this.data.freeTasks || []) {
      if (free.categoryId === id) free.categoryId = null;
    }
    this.changed();
    return this.categoriesForView();
  }
}

module.exports = { SettingsMethods };

'use strict';

// The system tray icon (the little icon near the clock).
// The menu is built from a plain list of actions, so new actions can be added later by adding
// one line to that list.
//
// action: { id, label, click, separatorBefore, enabled, submenu: [actions] }
// (a line with enabled: false and no click is just information, such as "Next Task: ...")

function buildTrayMenuTemplate(actions) {
  const template = [];
  for (const action of actions) {
    if (action.separatorBefore) template.push({ type: 'separator' });
    const item = { label: action.label };
    if (action.click) item.click = action.click;
    if (action.enabled === false) item.enabled = false;
    if (action.submenu) item.submenu = buildTrayMenuTemplate(action.submenu);
    template.push(item);
  }
  return template;
}

// electron: { Tray, Menu, nativeImage }  (passed in so this can be tested without Electron)
// getActions() is called every time the menu opens, so lines such as "Next Task" are always current.
function createTray({ Tray, Menu, nativeImage }, { iconPath, tooltip, getActions, onOpen }) {
  // No resize here: the icon file has @1.5x / @2x / @3x versions next to it, and Electron picks the right one.
  const image = nativeImage.createFromPath(iconPath);
  const tray = new Tray(image);
  tray.setToolTip(tooltip);
  const openMenu = () => tray.popUpContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(getActions())));
  tray.on('right-click', openMenu);

  // Double-click opens the window (spec). A single click does the same, which is what most people try first.
  tray.on('double-click', onOpen);
  tray.on('click', onOpen);

  return {
    tray,
    openMenu,
    setTooltip(text) {
      tray.setToolTip(text);
    },
    destroy() {
      if (!tray.isDestroyed || !tray.isDestroyed()) tray.destroy();
    },
  };
}

module.exports = { buildTrayMenuTemplate, createTray };

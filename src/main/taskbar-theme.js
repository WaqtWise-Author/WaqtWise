'use strict';

// Is the Windows taskbar (and with it the tray area) dark or light?
//
// That is the "Windows mode" setting (Settings -> Personalization -> Colors -> Choose your default Windows mode). It can
// differ from the "app mode", which is the one nativeTheme.shouldUseDarkColors follows. On Windows Electron gives the
// Windows mode as nativeTheme.shouldUseDarkColorsForSystemIntegratedUI (true when it is dark); where that property does
// not exist the app mode is used. Nothing is started and nothing is read from the registry by the app itself.

function createTaskbarTheme({ nativeTheme }) {
  // true: the taskbar is dark (a white icon is needed); false: it is light (a black icon is needed).
  function isDark() {
    const system = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    return typeof system === 'boolean' ? system : Boolean(nativeTheme.shouldUseDarkColors);
  }
  return { isDark };
}

module.exports = { createTaskbarTheme };

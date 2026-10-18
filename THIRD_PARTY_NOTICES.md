# Third-party software and data used by WaqtWise

WaqtWise is licensed under the GNU GPL v3 or later (see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)). The parts
below are made by other people and keep their own licenses. All of them allow use inside a GPL program.

| Part | What it is used for | License |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | The program that runs WaqtWise as a Windows app (it includes Chromium and Node.js; their license texts are installed with the app) | MIT (Electron), BSD-style and others (Chromium, Node.js) |
| [adhan](https://github.com/batoulapps/adhan-js) | Works out the five prayer times from the city's coordinates | MIT |
| [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) (through the npm package `@fontsource/plus-jakarta-sans`) | The font of English text and digits | SIL Open Font License 1.1 |
| [IBM Plex Sans Arabic](https://github.com/IBM/plex) | The font of Arabic text (files and license in `src/renderer/fonts-arabic/`) | SIL Open Font License 1.1 |
| [GeoNames](https://www.geonames.org/) | Names, regions, coordinates and population of about 30,000 cities (`src/core/world-cities.json`, see `src/core/WORLD_CITIES_SOURCE.md`) | Creative Commons Attribution 4.0 - attribution is given here and in the app's website |
| [IANA time zone database](https://www.iana.org/time-zones) | Which time zone each city is in (the file `zone.tab` was used to build the city list) | Public domain |
| [electron-builder](https://www.electron.build/) | Builds the Windows installer (a development tool, not part of the app) | MIT |

Attribution required by CC BY 4.0: *City data from GeoNames (https://www.geonames.org), licensed under Creative
Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Cities were filtered by population, their
time zones were assigned from the IANA database, and the data was reduced to the fields the app needs.*

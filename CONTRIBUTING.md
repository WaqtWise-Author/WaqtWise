# Contributing to WaqtWise

Thank you for wanting to help. You do not have to write code: bug reports, translation fixes, ideas, testing on
your own PC and improvements to the guides are all welcome.

## Ways to Help

- **Report a problem** or **suggest a feature**: open an [issue](../../issues/new/choose). Say your Windows
  version, the WaqtWise version (it is in the installer file name) and the steps to repeat it. Screenshots help.
  Please do not post private data.
- **Prayer times look wrong?** Tell us your country, city, the method you chose, and a timetable you trust.
- **Arabic wording:** every text has an Arabic translation in `src/core/i18n-ar.js` (the English text is the key).
  Corrections are very welcome.
- **Code:** see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the folders, how to run the tests and how to build.

## Before You Send a Pull Request

1. Open an issue first for anything bigger than a small fix, so we can agree on the direction.
2. Keep the change small and focused.
3. Run `npm test`; for screen changes also `node tools/ui-check.js`.
4. Every new visible text needs an Arabic translation (`node tools/i18n-scan.js` lists them; `tests/i18n.test.js` fails otherwise).
5. Follow the look in [docs/UI_REVIEW.md](docs/UI_REVIEW.md) and add a line to [docs/CHANGELOG.md](docs/CHANGELOG.md).
6. Do not add network access, tracking, or new dependencies without discussing it first.

## License of Contributions

By sending a contribution you agree that it is licensed under the project's license, **GPL-3.0-or-later**
(see [NOTICE.md](NOTICE.md)). The name, logo and icon are not licensed (see NOTICE.md).

Please follow the [code of conduct](CODE_OF_CONDUCT.md).

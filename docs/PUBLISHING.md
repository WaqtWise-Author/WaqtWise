# Publishing checklist (for the project owner)

This is a to-do list for the person who owns the GitHub repository. It is not needed by users.

## 0. Before the first public upload

- [ ] **Copyright holder.** `LICENSE` is the standard GPL text and needs no change. In `NOTICE.md`,
      `package.json` (`author`, `build.copyright`) the holder is "The WaqtWise authors". Replace it with your name
      if you prefer. Do **not** put an email address anywhere you do not want it to be public.
- [ ] **Search for private things** you do not want public: names, emails, paths in `docs/` and `src/`.
- [ ] Keep `package-lock.json` in the repository (the workflows use `npm ci`) and upload the whole `.github` folder.

## 1. Create the repository

1. GitHub → **New repository**, name e.g. `waqtwise`, **Public**, no template files.
2. Upload everything (drag the extracted folder's content, including the hidden `.github`).
3. **Settings → General**: add the description, website (after step 3) and topics, for example:
   `prayer-times`, `salah`, `islamic`, `task-manager`, `planner`, `electron`, `windows`, `productivity`, `arabic`, `rtl`.
4. **Settings → General → Social preview**: upload `docs/images/social-preview.png`.
5. Under **Settings → Code security**, turn on *Private vulnerability reporting* and *Dependabot alerts*.
6. Turn on **two-factor authentication** for your GitHub account (SignPath requires MFA for everyone with access).
7. Optional but recommended: **Settings → Branches**, protect `main`.

## 2. Check that everything builds (Actions tab)

**Run tests**, **Screen check** and **Publish website** also start by themselves on every push (the website only
when `site/`, `docs/` or the page builder change on `main`). **Build Windows installer** and **Release** are always
started by hand.

- [ ] **Run tests**, **Screen check**, **Build Windows installer** are green.
- [ ] Download the installer from the build and test it on your Windows PC (checks 40, 41 and 42 in
      `ACCEPTANCE_CHECKLIST.md`, and the new check 43 for the website).

## 3. Publish the website (GitHub Pages)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → Publish website → Run workflow** (the first time; after that it runs by itself when the site changes).
3. The site is at `https://<your-user>.github.io/<repo>/`. Links to the downloads are worked out from that
   address automatically. If you use another domain, edit `site/config.js`.

## 4. First release

1. Raise `version` in `package.json` if needed and add the section in `docs/CHANGELOG.md`.
2. **Actions → Release → Run workflow** with the version (e.g. `1.0.0`). It builds the installer and creates a
   **draft** release with the installer, `SHA256SUMS.txt` and release notes.
3. Open the draft, read the notes, test the installer once more, then **Publish release**.
4. The website's *Download* button always points at the newest published release.

## 5. Apply to the SignPath Foundation

Requirements they check (all prepared in this repository): OSI-approved license (GPL-3.0-or-later), public
repository, a real released project, builds made by a verifiable automated GitHub workflow, product name and
version in the program metadata, a public code signing policy (`docs/CODE_SIGNING_POLICY.md` and a section on the
website), no malware or hacking tools, MFA for all members.

1. Publish at least one release first (they want a released, maintained project).
2. Read <https://signpath.org/terms> and apply from <https://signpath.org/apply>.
3. Suggested answers:
   - **Project name:** WaqtWise
   - **Short description:** A free, offline Windows day planner that divides the day into five zones by the
     prayer times, with reminders, full-screen alerts and statistics. English and Arabic.
   - **Repository:** your repository URL. **License:** GPL-3.0-or-later.
   - **Download page:** your Pages website. **Code signing policy:** `<site>/code-signing.html` (or the file in `docs/`).
   - **Build system:** GitHub Actions (`.github/workflows/release.yml`), Windows runner, `npm ci` then `electron-builder`.
   - **What will be signed:** the NSIS installer `WaqtWise-Setup-<version>.exe` built from this repository.
   - **Maintainers:** you (all roles), with MFA enabled.
4. If accepted, SignPath gives you an organization and an artifact-signing policy. Then (a separate, small change):
   add their GitHub Action to `release.yml` to upload the unsigned artifact and download the signed one, keep
   *manual approval*, and change the text in `docs/CODE_SIGNING_POLICY.md`, `docs/WINDOWS_WARNING.md` and the site from
   "not signed yet" to "signed by SignPath Foundation". Ask for help with this step when you get there.
5. There is no promise: they may decline or ask for changes, and approval time is not stated. Publishing unsigned in the
   meantime is fine. Even a signed file may still show SmartScreen for a while until it earns reputation.

## 6. After publishing

- Put the repository link in the README badges if you like (replace the placeholders `OWNER/REPO`).
- Share the website link, not the zip. Answer issues; keep `docs/CHANGELOG.md` current.
- For every new version: tests green → build → test on Windows → draft release → publish.

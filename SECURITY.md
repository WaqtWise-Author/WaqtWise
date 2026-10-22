# Security Policy

## Supported Versions

Only the latest release receives fixes.

## Reporting a Vulnerability

Please **do not** open a public issue for a security problem.
Use GitHub's private reporting: on the repository page open **Security → Report a vulnerability**.
If you cannot, open an issue that says only "I have a security report" without details, and we will arrange a
private way to receive it.

Please include: the version, what you did, what happened, and what you expected. We will acknowledge within a
few days and aim to fix confirmed problems in the next release, crediting you if you wish.

## What the App Does to Be Safe

- No network access, no remote content, no telemetry.
- Strict content security policy; browser permissions are refused; requests from the window to the main process
  are validated against a fixed list.
- The packaged app uses Electron Fuses (it cannot run as a plain Node program or with Node debugging switches).
- Imported backups are validated; an imported file cannot switch on "Start with Windows".

## Checking a Download

Releases list SHA256 checksums; see [docs/WINDOWS_WARNING.md](docs/WINDOWS_WARNING.md).

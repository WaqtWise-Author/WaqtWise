# Code Signing Policy

**Current status: the installer is NOT signed yet.** We are applying to the
[SignPath Foundation](https://signpath.org/) for free code signing for open-source projects. This page is the
public policy that the programme requires. Until the application is accepted and the first signed release is
published, releases are unsigned and Windows SmartScreen shows a warning (see [WINDOWS_WARNING](WINDOWS_WARNING.md)).

Once accepted, this text will be shown on the download page:

> Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
> [SignPath Foundation](https://signpath.org/).

## What Is Signed

Only the Windows installer `WaqtWise-Setup-<version>.exe` (and the program files inside it) built by this project's
own GitHub workflow from the public source code in this repository. Nothing else is signed with this
certificate, and no third-party or closed-source binaries are added by us.

## How a Release Is Made

1. The source code is public in this repository under GPL-3.0-or-later.
2. A maintainer starts the **Release** workflow by hand. It builds on GitHub's own Windows runner from the exact
   commit, so the build is verifiable and repeatable.
3. The workflow sends the unsigned build to SignPath. A maintainer **approves each signing request manually**.
4. The signed installer is attached to a GitHub release together with its SHA256 checksum.

## Roles

| Role | Who | What they do |
| --- | --- | --- |
| Committer / author | Project maintainers and accepted contributors | Write code. Their changes go through review before a release. |
| Reviewer | Project maintainer | Reviews changes that go into a release. |
| Approver | Project maintainer | Approves each signing request. |

At the moment the project is small, so one maintainer may hold all roles; the approver always checks that the
build comes from this repository and the intended tag before approving. All team members with signing access use
multi-factor authentication on GitHub and SignPath.

## What the App Does (Privacy)

This program will not transfer any information to other networked systems unless specifically requested by the
user or the person installing or operating it. See [PRIVACY](../PRIVACY.md).

## Reporting Abuse or Problems with a Signed File

If you think a signed file is not from this project or behaves badly, please use the private report in the
[security policy](../SECURITY.md). We can ask SignPath to revoke a certificate or a file if needed.

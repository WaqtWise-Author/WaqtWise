# "Windows protected your PC" - why you see it and what to do

**Languages:** English · [العربية](WINDOWS_WARNING.ar.md)

When you run the installer for the first time, Windows may show a blue window:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

## Why it happens

SmartScreen is a Windows feature that warns about programs it does not know. A program is "known" when it is
**signed** with a certificate (a digital signature that proves who published it) and has been downloaded by many
people. WaqtWise is a free, open-source app by a small team. At the moment its installer is **not signed**, and it
is new, so Windows has no reputation for it yet.

This warning does **not** mean the file is infected. It means "Windows does not know this publisher".

We are applying for free code signing for open-source projects (SignPath Foundation); see
[the code signing policy](CODE_SIGNING_POLICY.md). Even after signing, SmartScreen may still show the warning for
a while until enough people have downloaded the app. That is normal.

## How to install anyway

1. In the blue window click **More info**.
2. Click **Run anyway**.
3. Continue with the installer as usual.

## Check that your download is genuine (recommended)

Download the installer only from this project's **Releases** page. Each release lists a **SHA256** checksum next
to the file (and a `SHA256SUMS.txt` file). To compare it:

1. Open **PowerShell** in the folder that contains the installer (Shift + right-click in the folder → *Open
   PowerShell window here*).
2. Run (change the name to match your file):
   ```
   Get-FileHash .\WaqtWise-Setup-1.1.0.exe -Algorithm SHA256
   ```
3. The long value in the **Hash** column must be **identical** to the one on the Releases page. If it is
   different, do not run the file; download it again.

You can also upload the file to [virustotal.com](https://www.virustotal.com) to see what many antivirus engines say.
A single "unknown" or a very rare false alarm from one engine can happen with new, unsigned programs.

## Other things worth knowing

- The app does not connect to the internet and needs no administrator rights.
- All the source code is public. You can read it, or build the installer yourself (see
  [DEVELOPMENT](DEVELOPMENT.md)). The release installer is built by an automatic GitHub workflow from the public code.
- If your antivirus quarantines the file, please [report it](../../../issues/new/choose) so that we can ask the
  vendor to review it.

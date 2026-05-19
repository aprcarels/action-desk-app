# Windows Pilot Build

## Commands

Install dependencies:

```bash
npm install
```

Build the unpacked desktop app directory:

```bash
npm run pack:desktop
```

Build the Windows installer:

```bash
npm run package:win
```

The installer writes `%APPDATA%\Action Desk\config.json` on first install with the packaged desktop default API URL:

```json
{
  "ACTION_DESK_API_URL": "http://localhost:3960"
}
```

To package an installer that points installed clients at a hosted backend instead, set `ACTION_DESK_INSTALLER_API_URL` before running the package command:

```powershell
$env:ACTION_DESK_INSTALLER_API_URL="https://api.actiondesk.example.com"
npm run package:win
```

Installer output is written to:

```text
release/
```

## What the packaged app does

- Builds the React/Vite frontend into `dist/`
- Builds the Electron-support TypeScript modules into `dist-electron/`
- Packages the Electron main/preload code from `electron/`
- Starts a local packaged app server on `http://localhost:3960`
- Loads the installed app from that local origin so inbox API routes and Microsoft popup auth still work outside Vite dev mode

## Pilot deployment notes

- Azure App Registration must include this redirect URI for the packaged desktop build:

```text
http://localhost:3960/auth/popup-callback.html
```

- The existing local dev redirect URI should remain registered too:

```text
https://localhost:5173/auth/popup-callback.html
```

- If `localhost:3960` is already occupied on a pilot machine, the packaged app will fail to start until that port is free.
- Windows SmartScreen warnings are expected on unsigned pilot builds. Code signing is strongly recommended before wider rollout.
- The installer currently targets `x64` Windows via NSIS.

## Installing on another computer

The installer does not bundle `.env` files. On first install, it automatically creates this runtime config file for the installing Windows user:

```text
%APPDATA%\Action Desk\config.json
```

Default contents:

```json
{
  "ACTION_DESK_API_URL": "http://localhost:3960"
}
```

The installer preserves an existing `config.json`; it will not overwrite an admin-customized API URL during reinstall or upgrade. `VITE_ACTION_DESK_API_URL` is also accepted by the app runtime, but `ACTION_DESK_API_URL` is preferred for desktop installs.

For the current Windows user, `%APPDATA%\Action Desk\config.json` normally expands to:

```text
C:\Users\<user>\AppData\Roaming\Action Desk\config.json
```

If the API URL is missing, the app exits on startup with an admin-facing error that includes the exact config path to create. Local development can still use `.env`; the runtime config only fills the API URL when no environment or `.env` value is already present.

The packaging config in `package.json` must continue to exclude `.env` and `.env.*` from installer contents.

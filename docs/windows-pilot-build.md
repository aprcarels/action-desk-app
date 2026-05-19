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

```powershell
$env:ACTION_DESK_INSTALLER_API_URL="http://localhost:3960"
$env:ACTION_DESK_INSTALLER_AZURE_CLIENT_ID="<client-id>"
$env:ACTION_DESK_INSTALLER_AZURE_TENANT_ID="<tenant-id>"
npm run package:win
```

`ACTION_DESK_INSTALLER_API_URL`, `ACTION_DESK_INSTALLER_AZURE_CLIENT_ID`, and `ACTION_DESK_INSTALLER_AZURE_TENANT_ID` are required. `npm run package:win` fails fast if any are missing so the installer cannot be built without the non-secret runtime values required for Microsoft sign-in and the backend API.

The installer runs `desktop:prep` before Electron Builder so `better-sqlite3` is rebuilt for Electron after any test run that rebuilt it for Node/Vitest.

The installer writes `%APPDATA%\action-desk-app\config.json` on first install with the packaged desktop runtime values:

```json
{
  "ACTION_DESK_API_URL": "http://localhost:3960",
  "VITE_AZURE_CLIENT_ID": "<client-id>",
  "VITE_AZURE_TENANT_ID": "<tenant-id>"
}
```

To package an installer that points installed clients at a hosted backend instead, change `ACTION_DESK_INSTALLER_API_URL` before running the package command:

```powershell
$env:ACTION_DESK_INSTALLER_API_URL="https://api.actiondesk.example.com"
$env:ACTION_DESK_INSTALLER_AZURE_CLIENT_ID="<client-id>"
$env:ACTION_DESK_INSTALLER_AZURE_TENANT_ID="<tenant-id>"
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
%APPDATA%\action-desk-app\config.json
```

Default contents:

```json
{
  "ACTION_DESK_API_URL": "http://localhost:3960",
  "VITE_AZURE_CLIENT_ID": "<client-id>",
  "VITE_AZURE_TENANT_ID": "<tenant-id>"
}
```

The installer preserves an existing `config.json`; it will not overwrite an admin-customized API URL during reinstall or upgrade. `VITE_ACTION_DESK_API_URL` is also accepted by the app runtime, but `ACTION_DESK_API_URL` is preferred for desktop installs.

For the current Windows user, `%APPDATA%\Action Desk\config.json` normally expands to:

```text
C:\Users\<user>\AppData\Roaming\action-desk-app\config.json
```

If the API URL is missing, the app exits on startup with an admin-facing error that includes the exact config path to create. If the Azure client or tenant IDs are missing, Microsoft sign-in cannot start. Local development can still use `.env`; the runtime config only fills values when no environment or `.env` value is already present.

Safe values to put in installer/runtime config:

- `ACTION_DESK_API_URL`
- `VITE_AZURE_CLIENT_ID`
- `VITE_AZURE_TENANT_ID`

Do not put client secrets, database passwords, API keys, or webhook secrets in installer/runtime config.

The packaging config in `package.json` must continue to exclude `.env` and `.env.*` from installer contents.

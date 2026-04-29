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

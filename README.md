Wheel of Wack — Streamable Wheel of Fortune Clone

Overview
- Two-tab setup: `board.html` (stream view) and `admin.html` (controller).
- Separate `create.html` for initial game setup and hosting sessions.
- Transparent background toggle for OBS in Admin settings.
- Admin controls the active player, guessed letters, and board↔wheel transition.
- Game creation: add puzzles, players, bonus items (with images), and customize the wheel slots.
- State sync across tabs via BroadcastChannel + localStorage.

This project contains no machine‑specific paths. You can unzip anywhere and run:
- `node server.js` (manual) or build the Server Manager EXE and use it to Start/Stop.

Quick Start
Recommended (Windows): Server Manager EXE
- Build once: `build-server-manager.bat` (or `build-server-manager.ps1`)
- Run `WheelOfWackServerManager.exe` (in repo root after build)
  - Start/Stop/Restart the Node server
  - Set port and open browser
  - Browse to set the project root (folder containing `server.js`) if needed

Alternative (manual):
- Node: `node server.js` then open http://localhost:8080
- Or use any static server you prefer

Open two tabs:
- http://localhost:8080/board.html (put this into OBS; toggle transparency from Admin)
- http://localhost:8080/admin.html (use this to run the game)

Create and host a game
- http://localhost:8080/create.html
  - Add players, puzzles, bonus items, and customize the wheel.
  - Click "Host Game" to create an active session (stored locally) and jump to Admin.

Sessions
- Admin shows a Sessions section to Load/Delete existing sessions and open the Creator.
- The Board reflects whichever session Admin loads (the currently managed session).

Notes
- Wheel is customizable; bonus items can be image-based and assigned to slots or randomized.
- Letters reveal on the Board based on Admin input. Punctuation/spaces always show.
- Players have inventories; Admin can award bonus items.

Windows Server Manager (EXE)

A simple Windows app is included to start/stop and monitor the server without PowerShell:

- Project: `ServerManagerWin` (WinForms, .NET 9)
- Features: start/stop/restart, show status/PID, open browser, auto-detect external `node server.js` and stop it safely.

Build (requires .NET 9 SDK on Windows):

```
dotnet build ServerManagerWin -c Release
```

Publish as a single-file EXE (no install needed):

```
dotnet publish ServerManagerWin -c Release -r win-x64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --self-contained false
```

The EXE will be at:
`ServerManagerWin\bin\Release\net9.0-windows\win-x64\publish\WheelOfWackServerManager.exe`

Usage:
- Run the EXE; click Browse… to point it at the folder containing `server.js` if needed.
- Click Start to launch Node (hidden) or attach to an already running server on the selected port; Stop to terminate.
- If a `node server.js` from this folder is already running, the manager detects/attaches and can stop it.

One‑click build (Windows):
- Run `build-server-manager.bat` (or `build-server-manager.ps1`) to publish and copy `WheelOfWackServerManager.exe` to the repo root.
- Optional args: `-Runtime win-x86` or `-SelfContained` to bundle the runtime.

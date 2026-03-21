# speech2text

Follow the global `~/.claude/CLAUDE.md` for all coding rules. This file covers project-specific context.

## Architecture

Tauri v2 desktop app. Rust backend, React + Vite frontend.

- `src-tauri/src/lib.rs` — all Rust logic: Groq API, clipboard paste (enigo), raw Win32 keyboard hook (WH_KEYBOARD_LL), system tray, overlay window, config persistence
- `src-tauri/src/main.rs` — just calls `run()`
- `src/app.jsx` — main React app: recording, visualizer, transcript history, settings toggle
- `src/components/visualizer.jsx` — canvas-based audio bar visualizer with lerped smoothing
- `src/components/settings.jsx` — settings modal: API key, language, keybind capture
- `src/overlay.jsx` — Dynamic Island overlay: shows recording/transcribing/done at top of screen
- `src/overlay.css` — overlay pill styling and animations
- `src/app.css` — main app dark theme

Two Tauri windows: `main` (the app) and `overlay` (transparent always-on-top status pill created dynamically in setup).

## Stack

- Rust (Tauri v2, reqwest, arboard, enigo, raw Win32 FFI for keyboard hook)
- React 19 + Vite 6 (multi-page: index.html + overlay.html)
- Groq Whisper Large v3 API for transcription
- NSIS installer for Windows distribution

## Building

```
npm install
npm run tauri dev       # dev with HMR
npx tauri build         # release build
```

For signed builds (needed for auto-updater):
```
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/speech2text.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npx tauri build
```

## Releasing a New Version

1. Bump `version` in `src-tauri/tauri.conf.json`
2. Build with signing key (see above)
3. Create `latest.json` with the new version, signature from `.exe.sig`, and download URL
4. `gh release create vX.Y.Z` with the `.exe`, `.exe.sig`, and `latest.json`
5. Users on old versions auto-update on next launch

The signing key is at `~/.tauri/speech2text.key`. Never commit it.

## Config

User config stored at `AppConfigDir/config.json` (Tauri resolves this per-platform). Contains `api_key`, `language`, `keybind`.

## Key Behaviors

- Keyboard hook runs on its own thread with a Win32 message loop
- Mic stream opens once at startup and stays alive (no getUserMedia delay per recording)
- X button exits the process. Minimize hides to system tray.
- Default keybind is Ctrl+Shift (hold to record, release to transcribe+paste)
- Mic button in the app toggles (click start, click stop)
- Overlay window is transparent, always-on-top, ignores cursor events

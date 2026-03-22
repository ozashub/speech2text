# speech2text

Follow the global `~/.claude/CLAUDE.md` for all coding rules. This file covers project-specific context.

## Architecture

Tauri v2 desktop app. Rust backend, React + Vite frontend.

- `src-tauri/src/lib.rs` — all Rust logic: Groq API, clipboard paste (enigo), raw Win32 keyboard hook (WH_KEYBOARD_LL), system tray, overlay window, config persistence, enhance LLM pass, encrypted key sharing
- `src-tauri/src/main.rs` — just calls `run()`
- `src/app.jsx` — main React app: recording, visualizer, transcript history, settings toggle
- `src/components/visualizer.jsx` — canvas-based audio bar visualizer with lerped smoothing
- `src/components/settings.jsx` — settings modal: API key, language, keybind capture, enhance toggle, custom prompt editor, key sharing, update checker
- `src/overlay.jsx` — Dynamic Island overlay: shows recording/transcribing/done at top of screen
- `src/overlay.css` — overlay pill styling and animations
- `src/app.css` — main app dark theme

Two Tauri windows: `main` (the app) and `overlay` (transparent always-on-top status pill created dynamically in setup).

## Stack

- Rust (Tauri v2, reqwest, arboard, enigo, raw Win32 FFI for keyboard hook)
- React 19 + Vite 6 (multi-page: index.html + overlay.html)
- Groq Whisper Large v3 API for transcription
- Groq llama-3.1-8b-instant for enhance mode
- NSIS installer for Windows distribution
- Cloudflare Worker + KV for encrypted key sharing

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

1. Bump `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Build with signing key (see above)
3. Create `latest.json` with the new version, signature from `.exe.sig`, and download URL
4. `gh release create vX.Y.Z` with the `.exe`, `.exe.sig`, and `latest.json`
5. Users on old versions auto-update on next launch
6. Update winget: `wingetcreate update ozas.speech2text -u <installer_url> -v <version> --submit`

The signing key is at `~/.tauri/speech2text.key`. Never commit it.

## Publishing to winget

Package ID: `ozas.speech2text`. After each release:

```
wingetcreate update ozas.speech2text -u https://github.com/ozashub/speech2text/releases/download/vX.Y.Z/speech2text_X.Y.Z_x64-setup.exe -v X.Y.Z --submit
```

This auto-generates the manifest, computes the hash, and PRs it to microsoft/winget-pkgs. Requires `wingetcreate` (installed via `winget install Microsoft.WingetCreate`).

## Config

User config stored at `AppConfigDir/config.json` (Tauri resolves this per-platform). Contains `api_key`, `language`, `keybind`, `enhance`, `enhance_prompt`.

## Key Behaviors

- Keyboard hook runs on its own thread with a Win32 message loop
- Mic stream opens once at startup and stays alive (no getUserMedia delay per recording)
- X button hides to system tray. Minimize minimizes to taskbar. Quit from tray menu exits.
- Default keybind is Ctrl+Shift (hold to record, release to transcribe+paste)
- Mic button in the app toggles (click start, click stop)
- Overlay window is transparent, always-on-top, ignores cursor events
- Overlay follows active monitor (multi-monitor support)
- Enhance mode sends transcription through LLM for cleanup (filler removal, grammar, formatting)
- Custom enhance prompt is user-editable and persisted in config
- Key sharing: AES-256-GCM encrypted, stored in Cloudflare KV, 5-min TTL, one-time read
- Deep link protocol: `speech2text://` for key import from shared links
- Auto-updater checks on startup, prompts user, shows download progress

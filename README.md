<p align="center">
  <img src="logo.svg" width="128" height="128" alt="speech2text">
</p>

<h1 align="center">speech2text</h1>

<p align="center">Desktop speech-to-text powered by Groq's Whisper v3 API.<br>Record your voice, get the transcription pasted directly into whatever you're typing.</p>

## How it works

1. Set your Groq API key in settings
2. Hold your keybind (default `Ctrl+Shift`) or click the mic button
3. Speak
4. Release the keys (or click again) — transcription gets pasted into the active text field

A Dynamic Island-style overlay appears at the top of your screen showing recording/transcribing/done status.

## Features

- Push-to-talk with configurable keybind (supports any key combo including modifier-only)
- Real-time audio visualizer
- Transcript history
- Language selection (24 languages or auto-detect)
- System tray with minimize-to-tray
- Lightweight native app (~5MB)

## Stack

- **Backend**: Rust via Tauri v2 — Groq API, clipboard, raw Win32 keyboard hook, keystroke simulation
- **Frontend**: React + Vite with Web Audio API visualizer
- **API**: Groq Whisper Large v3

## Building

Requires Rust and Node.js.

```
npm install
npm run tauri dev
```

Release build:

```
npx tauri build
```

Produces a standalone NSIS installer in `src-tauri/target/release/bundle/nsis/`.

## Getting a Groq API key

Sign up at [console.groq.com](https://console.groq.com), create an API key, and paste it into the app's settings panel.

## License

MIT

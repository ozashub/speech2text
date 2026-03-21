# whisper

Desktop speech-to-text powered by Groq's Whisper v3 API. Record your voice, get the transcription pasted directly into whatever you're typing.

Built with Tauri (Rust backend, vanilla JS frontend).

## How it works

1. Set your Groq API key in settings
2. Hit the record button or press `Ctrl + Shift + Space`
3. Speak
4. Press again to stop — your speech gets transcribed and pasted into the active text field

The audio visualizer at the top responds to your microphone input in real time.

## Stack

- **Backend**: Rust via Tauri v2 — handles API calls, clipboard, keystroke simulation
- **Frontend**: Vanilla JS with Web Audio API for the visualizer
- **API**: Groq Whisper Large v3 for transcription

## Building

You'll need Rust and Node.js installed. On Windows with the GNU toolchain, make sure MinGW's `dlltool` is on your PATH (e.g. via MSYS2).

```
npm install
npm run tauri dev
```

To create a release build:

```
npm run tauri build
```

## Getting a Groq API key

Sign up at [console.groq.com](https://console.groq.com), create an API key, and paste it into the app's settings panel.

## License

MIT

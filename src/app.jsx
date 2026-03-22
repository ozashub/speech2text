import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Visualizer from "./components/visualizer";
import Settings from "./components/settings";

const appWindow = getCurrentWindow();

function HistoryItem({ item, latest }) {
  const [copied, setCopied] = useState(false);
  const words = item.text.split(/\s+/).filter(Boolean).length;
  const chars = item.text.length;

  const copy = async () => {
    await invoke("paste_text", { text: item.text });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`history-item${latest ? " latest" : ""}`} onClick={copy}>
      <p>{item.text}</p>
      <div className="history-meta">
        <span className="history-stats">
          {words} words, {chars} chars
        </span>
        <span className="history-action">
          {copied ? "Pasted" : "Click to paste"}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [statusType, setStatusType] = useState("");
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [keybindLabel, setKeybindLabel] = useState("Ctrl+Shift");
  const [micReady, setMicReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [stats, setStats] = useState([0, 0, 0]);

  const recRef = useRef(false);
  const procRef = useRef(false);
  const keyRef = useRef(false);
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const ctxRef = useRef(null);
  const chunksRef = useRef([]);
  const sessionRef = useRef(0);
  const recStartRef = useRef(0);

  useEffect(() => {
    recRef.current = recording;
  }, [recording]);
  useEffect(() => {
    procRef.current = processing;
  }, [processing]);
  useEffect(() => {
    keyRef.current = hasKey;
  }, [hasKey]);

  const stat = (text, type = "") => {
    setStatus(text);
    setStatusType(type);
  };

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      })
      .then((stream) => {
        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;
        setMicReady(true);
        appWindow.show();
      })
      .catch(() => {
        stat("Mic denied", "err");
        appWindow.show();
      });
  }, []);

  const start = useCallback(() => {
    if (recRef.current || !streamRef.current) return;
    if (!keyRef.current) {
      setShowSettings(true);
      return;
    }

    chunksRef.current = [];
    sessionRef.current++;
    setProcessing(false);
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = done;
    rec.start(100);
    mediaRef.current = rec;

    recStartRef.current = Date.now();
    setRecording(true);
    stat("Recording", "rec");
    invoke("show_overlay", { state: "recording" }).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    if (!recRef.current || !mediaRef.current) return;
    mediaRef.current.stop();
    setRecording(false);
  }, []);

  const done = async () => {
    const sid = sessionRef.current;
    setProcessing(true);
    stat("Transcribing...", "");
    invoke("show_overlay", { state: "transcribing" }).catch(() => {});

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const buf = await blob.arrayBuffer();
    const b64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
    );

    try {
      const text = await invoke("transcribe", { audioBase64: b64 });
      if (sid !== sessionRef.current) return;
      setTranscript(text);
      setHistory((h) => [{ text, time: new Date() }, ...h].slice(0, 20));
      const secs = Math.round((Date.now() - recStartRef.current) / 1000);
      const wc = text.split(/\s+/).filter(Boolean).length;
      invoke("bump_stats", { words: wc, seconds: secs }).then(() => invoke("load_stats").then(setStats)).catch(() => {});
      stat("Pasting...", "done");
      await invoke("paste_text", { text });
      if (sid !== sessionRef.current) return;
      invoke("show_overlay", { state: "done" }).catch(() => {});
      stat("Done", "done");
      setTimeout(() => {
        if (sid === sessionRef.current && !recRef.current) stat("Ready", "");
      }, 2000);
    } catch (e) {
      if (sid !== sessionRef.current) return;
      stat(String(e), "err");
      invoke("hide_overlay").catch(() => {});
      setTimeout(() => {
        if (sid === sessionRef.current && !recRef.current) stat("Ready", "");
      }, 5000);
    }

    setProcessing(false);
  };

  useEffect(() => {
    invoke("load_api_key")
      .then((k) => {
        setHasKey(!!k);
        if (!k) setShowSettings(true);
      })
      .catch(() => {});
    invoke("load_keybind")
      .then((k) => {
        if (k?.length) setKeybindLabel(k.join("+"));
      })
      .catch(() => {});
    invoke("load_stats").then(setStats).catch(() => {});

    import("@tauri-apps/plugin-updater")
      .then(({ check }) => {
        check()
          .then((update) => {
            if (update) setUpdateAvailable(update);
          })
          .catch(() => {});
      })
      .catch(() => {});

    const u1 = listen("start-recording", () => start());
    const u2 = listen("stop-recording", () => stop());
    const u3 = listen("key-imported", () => {
      setHasKey(true);
      stat("Key imported", "done");
      setTimeout(() => stat("Ready", ""), 2000);
    });
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
      u3.then((f) => f());
    };
  }, [start, stop]);

  return (
    <>
      <header className="titlebar" data-tauri-drag-region>
        <span className="app-name" data-tauri-drag-region>
          Speech2Text
        </span>
        <div className="win-controls">
          <button className="win-btn" onClick={() => appWindow.minimize()}>
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="win-btn win-close"
            onClick={() => appWindow.hide()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M1 1l8 8M9 1l-8 8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>
        </div>
      </header>

      <main>
        {updateAvailable && (
          <div className="update-banner">
            <span>{updating ? "Updating..." : "Update available"}</span>
            <div className="update-banner-actions">
              <button
                onClick={async () => {
                  setUpdating(true);
                  await updateAvailable.downloadAndInstall();
                  invoke("exit_app");
                }}
              >
                Install Now
              </button>
              <button
                className="dismiss"
                onClick={() => setUpdateAvailable(null)}
              >
                Later
              </button>
            </div>
          </div>
        )}
        <Visualizer
          analyserRef={analyserRef}
          recording={recording}
          processing={processing}
        />

        <section className="record-section">
          <button
            className={`rec-btn${recording ? " on" : ""}${processing ? " busy" : ""}`}
            onClick={() => {
              if (recording) stop();
              else start();
            }}
          >
            {recording ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0014 0" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <span className={`status ${statusType}`}>{status}</span>
        </section>

        {history.length > 0 && (
          <section className="history">
            <div className="history-header">
              <h3>Transcripts</h3>
              <button
                className="clear-btn"
                onClick={() => {
                  setHistory([]);
                  setTranscript("");
                }}
              >
                Clear
              </button>
            </div>
            <div className="history-list">
              {history.map((h, i) => (
                <HistoryItem key={h.time.getTime()} item={h} latest={i === 0} />
              ))}
            </div>
          </section>
        )}
      </main>

      {(stats[0] > 0 || stats[1] > 0) && (
        <div className="stats-bar">
          {stats[0].toLocaleString()} word{stats[0] !== 1 ? "s" : ""} · {Math.round(stats[2] / 60)} min recorded · {stats[1]} recording{stats[1] !== 1 ? "s" : ""}
        </div>
      )}

      <footer>
        <kbd>hold {keybindLabel}</kbd>
        <button className="gear-btn" onClick={() => setShowSettings(true)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </footer>

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setHasKey(true);
            setShowSettings(false);
            stat("Ready", "");
            invoke("load_keybind")
              .then((k) => {
                if (k?.length) setKeybindLabel(k.join("+"));
              })
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}

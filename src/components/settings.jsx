import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

const LANGS = [
  ["", "auto-detect"], ["en", "English"], ["es", "Spanish"], ["fr", "French"],
  ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"],
  ["pl", "Polish"], ["ru", "Russian"], ["ja", "Japanese"], ["ko", "Korean"],
  ["zh", "Chinese"], ["ar", "Arabic"], ["hi", "Hindi"], ["tr", "Turkish"],
  ["sv", "Swedish"], ["da", "Danish"], ["no", "Norwegian"], ["fi", "Finnish"],
  ["cs", "Czech"], ["uk", "Ukrainian"], ["vi", "Vietnamese"], ["th", "Thai"],
  ["id", "Indonesian"],
];

function KeybindCapture({ value, onChange }) {
  const [capturing, setCapturing] = useState(false);
  const [display, setDisplay] = useState([]);
  const keysRef = useRef(new Set());
  const comboRef = useRef([]);

  useEffect(() => {
    if (!capturing) return;
    invoke("set_hook_enabled", { enabled: false }).catch(() => {});
    keysRef.current.clear();

    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      keysRef.current.add(e.key);
      comboRef.current = [...keysRef.current];
      setDisplay([...keysRef.current]);
    };

    const up = (e) => {
      e.preventDefault();
      keysRef.current.delete(e.key);
      if (keysRef.current.size === 0 && comboRef.current.length > 0) {
        onChange(comboRef.current);
        setCapturing(false);
        setDisplay([]);
        invoke("set_hook_enabled", { enabled: true }).catch(() => {});
      }
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      invoke("set_hook_enabled", { enabled: true }).catch(() => {});
    };
  }, [capturing, onChange]);

  return (
    <button
      className={`keybind-btn ${capturing ? "active" : ""}`}
      onClick={() => !capturing && setCapturing(true)}
      type="button"
    >
      {capturing
        ? display.length > 0 ? display.join(" + ") : "press keys..."
        : value.join(" + ") || "click to set"
      }
    </button>
  );
}

export default function Settings({ onClose, onSaved }) {
  const [key, setKey] = useState("");
  const [lang, setLang] = useState("");
  const [keybind, setKeybind] = useState(["Control", "Shift"]);
  const [visible, setVisible] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateProgress, setUpdateProgress] = useState(-1);
  const updateRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    invoke("load_language").then((l) => { if (l) setLang(l); }).catch(() => {});
    invoke("load_keybind").then((k) => { if (k?.length) setKeybind(k); }).catch(() => {});
    invoke("get_autostart").then(setAutostart).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const checkUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) { setUpdateStatus("uptodate"); return; }
      updateRef.current = update;
      setUpdateStatus("available");
    } catch {
      setUpdateStatus("error");
    }
  };

  const installUpdate = async () => {
    if (!updateRef.current) return;
    setUpdateStatus("downloading");
    setUpdateProgress(0);
    try {
      let total = 0;
      let received = 0;
      await updateRef.current.downloadAndInstall((e) => {
        if (e.event === "Started" && e.data.contentLength) total = e.data.contentLength;
        if (e.event === "Progress") {
          received += e.data.chunkLength;
          if (total > 0) setUpdateProgress((received / total) * 100);
        }
        if (e.event === "Finished") setUpdateStatus("installing");
      });
      await invoke("exit_app");
    } catch {
      setUpdateStatus("error");
    }
  };

  const save = async () => {
    try {
      if (key.trim()) await invoke("save_api_key", { key: key.trim() });
      await invoke("save_language", { language: lang });
      await invoke("save_keybind", { keys: keybind });
      await invoke("set_autostart", { enabled: autostart });
      onSaved();
    } catch {}
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>settings</h2>

        <div className="field-group">
          <label>groq api key</label>
          <div className="input-row">
            <input
              ref={inputRef}
              type={visible ? "text" : "password"}
              placeholder="gsk_..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="toggle-vis" onClick={() => setVisible(!visible)} type="button" tabIndex={-1}>
              {visible ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="key-hint">Need a key? Get one here</a>
        </div>

        <div className="field-group">
          <label>language</label>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>

        <div className="field-group">
          <label>push-to-talk keybind</label>
          <KeybindCapture value={keybind} onChange={setKeybind} />
        </div>

        <div className="field-group toggle-row">
          <label>launch on startup</label>
          <button
            className={`toggle ${autostart ? "on" : ""}`}
            onClick={() => setAutostart(!autostart)}
            type="button"
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn-save" onClick={save}>save</button>
          <button className="btn-cancel" onClick={onClose}>cancel</button>
        </div>

        <div className="update-section">
          {version && <span className="version-label">v{version}</span>}
          {updateStatus === "" && (
            <button className="update-btn" type="button" onClick={checkUpdate}>check for updates</button>
          )}
          {updateStatus === "checking" && <span className="update-status">checking...</span>}
          {updateStatus === "available" && (
            <button className="update-btn accent" type="button" onClick={installUpdate}>update available — install now</button>
          )}
          {updateStatus === "downloading" && (
            <div className="update-progress">
              <div className="update-bar"><div className="update-fill" style={{ width: `${Math.max(0, updateProgress)}%` }} /></div>
              <span className="update-status">{updateProgress >= 0 ? `${Math.round(updateProgress)}%` : "downloading..."}</span>
            </div>
          )}
          {updateStatus === "installing" && <span className="update-status">installing...</span>}
          {updateStatus === "uptodate" && <span className="update-status">you're on the latest version</span>}
          {updateStatus === "error" && <span className="update-status err">update failed</span>}
        </div>
      </div>
    </div>
  );
}

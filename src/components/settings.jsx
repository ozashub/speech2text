import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  const inputRef = useRef(null);

  useEffect(() => {
    invoke("load_language").then((l) => { if (l) setLang(l); }).catch(() => {});
    invoke("load_keybind").then((k) => { if (k?.length) setKeybind(k); }).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const save = async () => {
    try {
      if (key.trim()) await invoke("save_api_key", { key: key.trim() });
      await invoke("save_language", { language: lang });
      await invoke("save_keybind", { keys: keybind });
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

        <div className="modal-actions">
          <button className="btn-save" onClick={save}>save</button>
          <button className="btn-cancel" onClick={onClose}>cancel</button>
        </div>
      </div>
    </div>
  );
}

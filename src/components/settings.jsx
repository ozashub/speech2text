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

function SubModal({ open, title, text, onChange, placeholder, rows, hint, onSave, onClose, onReset }) {
  const [closing, setClosing] = useState(false);
  if (!open) return null;

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 200);
  };

  const save = () => {
    onSave();
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 200);
  };

  return (
    <div className={`prompt-overlay ${closing ? "out" : ""}`} onClick={dismiss}>
      <div className="prompt-editor" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-header">
          <h3>{title}</h3>
          <button className="prompt-reset" type="button" onClick={onReset}>Reset to default</button>
        </div>
        <textarea value={text} onChange={(e) => onChange(e.target.value)} spellCheck={false} placeholder={placeholder} rows={rows} />
        {hint && <span className="field-hint" style={{marginTop: 4}}>{hint}</span>}
        <div className="prompt-actions">
          <button className="btn-save" onClick={save}>Save</button>
          <button className="btn-cancel" onClick={dismiss}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ onClose, onSaved }) {
  const [key, setKey] = useState("");
  const [lang, setLang] = useState("");
  const [keybind, setKeybind] = useState(["Control", "Shift"]);
  const [visible, setVisible] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [enhance, setEnhance] = useState(false);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateProgress, setUpdateProgress] = useState(-1);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptSaved, setPromptSaved] = useState("");
  const [wordFixesOpen, setWordFixesOpen] = useState(false);
  const [wordFixesText, setWordFixesText] = useState("");
  const [wordFixesSaved, setWordFixesSaved] = useState("");
  const updateRef = useRef(null);
  const inputRef = useRef(null);

  const animateClose = (cb) => {
    setClosing(true);
    setTimeout(cb, 200);
  };

  useEffect(() => {
    Promise.all([
      invoke("load_api_key").then((k) => { if (k) setSavedKey(k); }).catch(() => {}),
      invoke("load_language").then((l) => { if (l) setLang(l); }).catch(() => {}),
      invoke("load_keybind").then((k) => { if (k?.length) setKeybind(k); }).catch(() => {}),
      invoke("get_autostart").then(setAutostart).catch(() => {}),
      invoke("load_enhance").then(setEnhance).catch(() => {}),
      invoke("load_enhance_prompt").then((p) => { setPromptText(p); setPromptSaved(p); }).catch(() => {}),
      invoke("load_word_fixes").then((w) => { setWordFixesText(w); setWordFixesSaved(w); }).catch(() => {}),
      getVersion().then(setVersion).catch(() => {}),
    ]).then(() => {
      setLoaded(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    });
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
      await invoke("save_enhance", { enabled: enhance });
      await invoke("save_word_fixes", { words: wordFixesText });
      await invoke("set_autostart", { enabled: autostart });
      onSaved(keybind);
      animateClose(onClose);
    } catch {}
  };

  const shareKey = async () => {
    const keyToShare = key.trim() || savedKey;
    if (!keyToShare) { setShareStatus("No key to share"); return; }

    setShareStatus("Encrypting...");
    try {
      const passphrase = crypto.getRandomValues(new Uint8Array(16));
      const pass = Array.from(passphrase, b => b.toString(36).padStart(2, "0")).join("").slice(0, 24);

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]
      );
      const aesKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
      );
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(keyToShare)
      );

      const combined = new Uint8Array([...salt, ...iv, ...new Uint8Array(encrypted)]);
      const b64 = btoa(String.fromCharCode(...combined));

      const resp = await fetch("https://speech2text.cc/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: b64 }),
      });
      const json = await resp.json();
      if (!json.code) throw new Error("Store failed");

      const link = `https://speech2text.cc/share#${json.code}${pass}`;
      await navigator.clipboard.writeText(link);
      setShareStatus("Link copied!");
      setTimeout(() => setShareStatus(""), 3000);
    } catch {
      setShareStatus("Failed");
      setTimeout(() => setShareStatus(""), 3000);
    }
  };

  const openPrompt = () => {
    setPromptText(promptSaved);
    setPromptOpen(true);
  };

  const resetPrompt = async () => {
    await invoke("save_enhance_prompt", { prompt: "" });
    const p = await invoke("load_enhance_prompt");
    setPromptText(p);
    setPromptSaved(p);
  };

  const resetWordFixes = async () => {
    await invoke("save_word_fixes", { words: "" });
    const w = await invoke("load_word_fixes");
    setWordFixesText(w);
    setWordFixesSaved(w);
  };

  return (
    <div className={`overlay ${closing ? "out" : ""}`} onClick={() => animateClose(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!loaded ? null : <>
        <h2>Settings</h2>

        <div className="settings-section">
          <div className="field-group">
            <label>API Key</label>
            <div className="input-row">
              <input
                ref={inputRef}
                type={visible ? "text" : "password"}
                placeholder="gsk_..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") animateClose(onClose); }}
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
            <div className="key-actions">
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="key-hint">Need a key? Get one here.</a>
              <button className="share-btn" type="button" onClick={shareKey}>
                {shareStatus || "Share key"}
              </button>
            </div>
          </div>

          <div className="field-group">
            <label>Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>

          <div className="field-group">
            <label>Keybind</label>
            <KeybindCapture value={keybind} onChange={setKeybind} />
          </div>
        </div>

        <div className="settings-section">
          <div className="field-group toggle-row">
            <label>Launch on Startup</label>
            <button className={`toggle ${autostart ? "on" : ""}`} onClick={() => setAutostart(!autostart)} type="button">
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="field-group toggle-row">
            <div>
              <label>Enhance</label>
              <span className="field-hint">Cleans up filler words and structures text</span>
              {enhance && <button className="edit-prompt-btn" type="button" onClick={openPrompt}>Edit prompt</button>}
            </div>
            <button className={`toggle ${enhance ? "on" : ""}`} onClick={() => setEnhance(!enhance)} type="button">
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="field-group">
            <label>Word Fixes</label>
            <span className="field-hint">Words Whisper often misspells. Comma-separated.</span>
            <button className="edit-prompt-btn" type="button" onClick={() => setWordFixesOpen(true)}>Edit words</button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-save" onClick={save}>Save</button>
          <button className="btn-cancel" onClick={() => animateClose(onClose)}>Cancel</button>
        </div>

        <div className="update-section">
            {version && <span className="version-label">v{version}</span>}
            {updateStatus === "" && (
              <button className="update-btn" type="button" onClick={checkUpdate}>Check for Updates</button>
            )}
            {updateStatus === "checking" && <span className="update-status">Checking...</span>}
            {updateStatus === "available" && (
              <button className="update-btn accent" type="button" onClick={installUpdate}>Update Available - Install Now</button>
            )}
            {updateStatus === "downloading" && (
              <div className="update-progress">
                <div className="update-bar"><div className="update-fill" style={{ width: `${Math.max(0, updateProgress)}%` }} /></div>
                <span className="update-status">{updateProgress >= 0 ? `${Math.round(updateProgress)}%` : "Downloading..."}</span>
              </div>
            )}
            {updateStatus === "installing" && <span className="update-status">Installing...</span>}
            {updateStatus === "uptodate" && <span className="update-status">You're on the latest version</span>}
            {updateStatus === "error" && <span className="update-status err">Update failed</span>}
        </div>
        </>}
      </div>

      <SubModal
        open={promptOpen}
        title="Enhance Prompt"
        text={promptText}
        onChange={setPromptText}
        placeholder="Enter your custom enhance prompt..."
        onClose={() => { setPromptOpen(false); setPromptText(promptSaved); }}
        onSave={async () => { await invoke("save_enhance_prompt", { prompt: promptText }).catch(() => {}); setPromptSaved(promptText); }}
        onReset={resetPrompt}
      />

      <SubModal
        open={wordFixesOpen}
        title="Word Fixes"
        text={wordFixesText}
        onChange={setWordFixesText}
        placeholder="Groq, GitHub, TypeScript, ..."
        rows={4}
        hint="Comma-separated. Whisper will prefer these exact spellings."
        onClose={() => { setWordFixesOpen(false); setWordFixesText(wordFixesSaved); }}
        onSave={async () => { await invoke("save_word_fixes", { words: wordFixesText }).catch(() => {}); setWordFixesSaved(wordFixesText); }}
        onReset={resetWordFixes}
      />
    </div>
  );
}

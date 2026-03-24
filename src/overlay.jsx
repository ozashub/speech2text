import { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./overlay.css";

function Overlay() {
  const [state, setState] = useState(null);
  const [hiding, setHiding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timersRef = useRef([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    const unlisten = listen("overlay-state", (e) => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (intervalRef.current) clearInterval(intervalRef.current);
      setHiding(false);
      setState(e.payload);

      if (e.payload === "recording") {
        setElapsed(0);
        const start = Date.now();
        intervalRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 200);
      }

      if (e.payload !== "recording" && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (e.payload === "done" || e.payload === "cancelled") {
        const delay = e.payload === "cancelled" ? 800 : 1200;
        const t1 = setTimeout(() => {
          setHiding(true);
          const t2 = setTimeout(() => {
            setState(null);
            invoke("hide_overlay").catch(() => {});
          }, 280);
          timersRef.current.push(t2);
        }, delay);
        timersRef.current.push(t1);
      }
    });
    return () => {
      unlisten.then((f) => f());
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!state) return null;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={`pill ${state} ${hiding ? "out" : ""}`}>
      {state === "recording" && <div className="dot pulse" />}
      {state === "transcribing" && <div className="dot spinner" />}
      {state === "done" && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44cc66" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {state === "cancelled" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      <span>
        {state === "recording"
          ? `Recording ${fmt(elapsed)}`
          : state === "transcribing"
            ? "Transcribing..."
            : state === "done"
              ? "Done"
              : state === "cancelled"
                ? "Cancelled"
                : state}
      </span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Overlay />);

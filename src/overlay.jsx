import { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./overlay.css";

function Overlay() {
  const [state, setState] = useState(null);
  const [hiding, setHiding] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    const unlisten = listen("overlay-state", (e) => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setHiding(false);
      setState(e.payload);

      if (e.payload === "done") {
        const t1 = setTimeout(() => {
          setHiding(true);
          const t2 = setTimeout(() => {
            setState(null);
            invoke("hide_overlay").catch(() => {});
          }, 280);
          timersRef.current.push(t2);
        }, 1200);
        timersRef.current.push(t1);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  if (!state) return null;

  return (
    <div className={`pill ${state} ${hiding ? "out" : ""}`}>
      {state === "recording" && <div className="dot pulse" />}
      {state === "transcribing" && <div className="dot spinner" />}
      {state === "done" && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44cc66" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span>{state === "transcribing" ? "transcribing..." : state}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Overlay />);

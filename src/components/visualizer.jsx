import { useEffect, useRef } from "react";

const BAR_COUNT = 64;
const BAR_WIDTH = 2.5;

export default function Visualizer({ analyserRef, recording, processing }) {
  const canvasRef = useRef(null);
  const smoothed = useRef(new Float32Array(BAR_COUNT));
  const freqBuf = useRef(null);
  const state = useRef({ recording, processing });
  state.current = { recording, processing };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      canvas.width = cssW * devicePixelRatio;
      canvas.height = cssH * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);

      const { recording: rec, processing: proc } = state.current;
      const gap = (cssW - BAR_COUNT * BAR_WIDTH) / (BAR_COUNT + 1);

      let data = null;
      const analyser = analyserRef.current;
      if (analyser && rec) {
        if (!freqBuf.current || freqBuf.current.length !== analyser.frequencyBinCount) {
          freqBuf.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqBuf.current);
        data = freqBuf.current;
      }

      const s = smoothed.current;
      const t = proc ? Date.now() / 400 : 0;

      for (let i = 0; i < BAR_COUNT; i++) {
        const x = gap + i * (BAR_WIDTH + gap);

        if (proc) {
          const wave = Math.sin(t + i * 0.18) * 0.5 + 0.5;
          const bh = 3 + wave * 16;
          const y = (cssH - bh) / 2;
          const grad = ctx.createLinearGradient(x, y, x, y + bh);
          grad.addColorStop(0, `rgba(124, 92, 252, ${wave * 0.6})`);
          grad.addColorStop(1, "rgba(124, 92, 252, 0.05)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, BAR_WIDTH, bh, 1);
          ctx.fill();
          continue;
        }

        const target = data ? data[Math.floor((i * data.length) / BAR_COUNT)] / 255 : 0;
        s[i] += (target - s[i]) * 0.12;
        if (s[i] < 0.004) s[i] = 0;

        const val = s[i];
        const bh = Math.max(2, val * (cssH - 8));
        const y = (cssH - bh) / 2;

        if (rec) {
          const grad = ctx.createLinearGradient(x, y, x, y + bh);
          grad.addColorStop(0, `rgba(124, 92, 252, ${0.3 + val * 0.7})`);
          grad.addColorStop(1, "rgba(124, 92, 252, 0.05)");
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        }

        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, bh, 1);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="visualizer" />;
}

import { useEffect, useRef } from "react";

export default function Visualizer({ analyserRef, recording, processing }) {
  const canvasRef = useRef(null);
  const smoothed = useRef(new Float32Array(64));
  const state = useRef({ recording, processing });
  state.current = { recording, processing };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function draw() {
      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);

      const { recording: rec, processing: proc } = state.current;
      const count = 64;
      const bw = 2.5;
      const gap = (w - count * bw) / (count + 1);

      let data = null;
      if (analyserRef.current && rec) {
        const buf = analyserRef.current.frequencyBinCount;
        data = new Uint8Array(buf);
        analyserRef.current.getByteFrequencyData(data);
      }

      const s = smoothed.current;
      for (let i = 0; i < count; i++) {
        let target = 0;
        if (data) {
          const idx = Math.floor((i * data.length) / count);
          target = data[idx] / 255;
        }
        s[i] += (target - s[i]) * 0.12;
        if (s[i] < 0.004) s[i] = 0;

        const x = gap + i * (bw + gap);

        if (proc) {
          const t = Date.now() / 400;
          const wave = Math.sin(t + i * 0.18) * 0.5 + 0.5;
          const bh = 3 + wave * 16;
          const grad = ctx.createLinearGradient(x, (h - bh) / 2, x, (h + bh) / 2);
          grad.addColorStop(0, `rgba(124, 92, 252, ${wave * 0.6})`);
          grad.addColorStop(1, `rgba(124, 92, 252, 0.05)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, (h - bh) / 2, bw, bh, 1);
          ctx.fill();
          continue;
        }

        const val = s[i];
        const bh = Math.max(2, val * (h - 8));
        const y = (h - bh) / 2;

        if (rec) {
          const grad = ctx.createLinearGradient(x, y, x, y + bh);
          grad.addColorStop(0, `rgba(124, 92, 252, ${0.3 + val * 0.7})`);
          grad.addColorStop(1, `rgba(124, 92, 252, 0.05)`);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        }

        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 1);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

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

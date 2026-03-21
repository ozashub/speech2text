const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

let recording = false;
let processing = false;
let mediaRecorder = null;
let audioStream = null;
let analyser = null;
let audioCtx = null;
let chunks = [];
let animFrame = null;
let hasKey = false;

const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const recordBtn = document.getElementById("record-btn");
const micIcon = document.getElementById("mic-icon");
const stopIcon = document.getElementById("stop-icon");
const status = document.getElementById("status");
const output = document.getElementById("output");
const outputText = document.getElementById("output-text");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");

function setStatus(text, cls) {
  status.textContent = text;
  status.className = "status" + (cls ? " " + cls : "");
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

function drawBars() {
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, w, h);

  const barCount = 64;
  const barW = 2;
  const gap = (w - barCount * barW) / (barCount + 1);

  let dataArray = null;
  if (analyser && recording) {
    const bufLen = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(dataArray);
  }

  for (let i = 0; i < barCount; i++) {
    let val = 0;
    if (dataArray) {
      const idx = Math.floor((i * dataArray.length) / barCount);
      val = dataArray[idx] / 255;
    }

    const barH = Math.max(2, val * (h - 8));
    const x = gap + i * (barW + gap);
    const y = (h - barH) / 2;

    if (recording) {
      ctx.fillStyle = `rgba(139, 92, 246, ${0.2 + val * 0.8})`;
    } else if (processing) {
      const wave = Math.sin(Date.now() / 300 + i * 0.2) * 0.3 + 0.3;
      ctx.fillStyle = `rgba(139, 92, 246, ${wave})`;
      const waveH = 4 + wave * 12;
      ctx.beginPath();
      ctx.roundRect(x, (h - waveH) / 2, barW, waveH, 1);
      ctx.fill();
      continue;
    } else {
      ctx.fillStyle = "rgba(82, 82, 82, 0.2)";
    }

    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 1);
    ctx.fill();
  }

  animFrame = requestAnimationFrame(drawBars);
}

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    setStatus("mic access denied", "err");
    return;
  }

  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(audioStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  chunks = [];
  mediaRecorder = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus" });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = handleRecordingDone;
  mediaRecorder.start();

  recording = true;
  recordBtn.classList.add("recording");
  micIcon.classList.add("hidden");
  stopIcon.classList.remove("hidden");
  setStatus("recording", "active");
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
  audioStream.getTracks().forEach((t) => t.stop());
  recording = false;
}

async function handleRecordingDone() {
  processing = true;
  recordBtn.classList.remove("recording");
  recordBtn.classList.add("processing");
  stopIcon.classList.add("hidden");
  micIcon.classList.remove("hidden");
  setStatus("transcribing...", "");

  const blob = new Blob(chunks, { type: "audio/webm" });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);

  try {
    const text = await invoke("transcribe", { audioBase64: b64 });
    outputText.textContent = text;
    output.classList.remove("hidden");
    setStatus("pasting...", "done");

    await invoke("paste_text", { text });
    setStatus("done", "done");
    setTimeout(() => {
      if (!recording && !processing) setStatus("ready", "");
    }, 2000);
  } catch (e) {
    setStatus(String(e), "err");
  }

  processing = false;
  recordBtn.classList.remove("processing");

  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
    analyser = null;
  }
}

function toggleRecording() {
  if (processing) return;
  if (!hasKey) {
    showSettings();
    return;
  }
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function showSettings() {
  settingsPanel.classList.remove("hidden");
  apiKeyInput.focus();
}

function hideSettings() {
  settingsPanel.classList.add("hidden");
}

async function saveKey() {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  try {
    await invoke("save_api_key", { key });
    hasKey = true;
    apiKeyInput.value = "";
    hideSettings();
    setStatus("ready", "");
  } catch (e) {
    setStatus("failed to save key", "err");
  }
}

async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const appWindow = getCurrentWindow();
  document.getElementById("btn-minimize").addEventListener("click", () => appWindow.minimize());
  document.getElementById("btn-close").addEventListener("click", () => appWindow.close());

  recordBtn.addEventListener("click", toggleRecording);
  document.getElementById("btn-settings").addEventListener("click", showSettings);
  document.getElementById("settings-overlay").addEventListener("click", hideSettings);
  document.getElementById("btn-cancel-settings").addEventListener("click", hideSettings);
  document.getElementById("btn-save-key").addEventListener("click", saveKey);

  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveKey();
    if (e.key === "Escape") hideSettings();
  });

  try {
    const key = await invoke("load_api_key");
    hasKey = !!key;
  } catch (_) {
    hasKey = false;
  }

  if (!hasKey) {
    showSettings();
  }

  await listen("toggle-recording", toggleRecording);

  drawBars();
}

document.addEventListener("DOMContentLoaded", init);

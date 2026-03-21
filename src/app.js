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
let hasKey = false;
let smoothed = new Float32Array(64);

const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const recordBtn = document.getElementById("record-btn");
const micIcon = document.getElementById("mic-icon");
const stopIcon = document.getElementById("stop-icon");
const statusEl = document.getElementById("status");
const output = document.getElementById("output");
const outputText = document.getElementById("output-text");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const languageSelect = document.getElementById("language-select");
const eyeOpen = document.getElementById("eye-open");
const eyeClosed = document.getElementById("eye-closed");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status" + (cls ? " " + cls : "");
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
    let target = 0;
    if (dataArray) {
      const idx = Math.floor((i * dataArray.length) / barCount);
      target = dataArray[idx] / 255;
    }

    smoothed[i] += (target - smoothed[i]) * 0.12;
    if (smoothed[i] < 0.005) smoothed[i] = 0;
    const val = smoothed[i];

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

  requestAnimationFrame(drawBars);
}

async function startRecording() {
  if (recording || processing) return;
  if (!hasKey) {
    showSettings();
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1,
      },
    });
  } catch (_) {
    setStatus("mic access denied", "err");
    return;
  }

  audioCtx = new AudioContext({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(audioStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);

  chunks = [];
  mediaRecorder = new MediaRecorder(audioStream, {
    mimeType: "audio/webm;codecs=opus",
  });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = handleRecordingDone;
  mediaRecorder.start(100);

  recording = true;
  recordBtn.classList.add("recording");
  micIcon.classList.add("hidden");
  stopIcon.classList.remove("hidden");
  setStatus("recording", "active");
}

function stopRecording() {
  if (!recording || !mediaRecorder || mediaRecorder.state === "inactive") return;
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

    const preview = text.length > 60 ? text.slice(0, 60) + "..." : text;
    invoke("notify", { body: preview }).catch(() => {});

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

function showSettings() {
  settingsPanel.classList.remove("hidden");
  apiKeyInput.focus();
}

function hideSettings() {
  settingsPanel.classList.add("hidden");
}

async function saveSettings() {
  const key = apiKeyInput.value.trim();
  if (!key && !hasKey) return;

  try {
    if (key) {
      await invoke("save_api_key", { key });
      hasKey = true;
      apiKeyInput.value = "";
    }
    await invoke("save_language", { language: languageSelect.value });
    hideSettings();
    setStatus("ready", "");
  } catch (e) {
    setStatus("failed to save", "err");
  }
}

function toggleKeyVisibility() {
  const showing = apiKeyInput.type === "text";
  apiKeyInput.type = showing ? "password" : "text";
  eyeOpen.classList.toggle("hidden", !showing);
  eyeClosed.classList.toggle("hidden", showing);
}

async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const appWindow = getCurrentWindow();
  document.getElementById("btn-minimize").addEventListener("click", () => appWindow.minimize());
  document.getElementById("btn-close").addEventListener("click", () => appWindow.hide());

  let mouseDown = false;
  recordBtn.addEventListener("mousedown", () => {
    mouseDown = true;
    startRecording();
  });
  recordBtn.addEventListener("mouseup", () => {
    if (mouseDown) stopRecording();
    mouseDown = false;
  });
  recordBtn.addEventListener("mouseleave", () => {
    if (mouseDown) stopRecording();
    mouseDown = false;
  });

  document.getElementById("btn-settings").addEventListener("click", showSettings);
  document.getElementById("settings-overlay").addEventListener("click", hideSettings);
  document.getElementById("btn-cancel-settings").addEventListener("click", hideSettings);
  document.getElementById("btn-save-key").addEventListener("click", saveSettings);
  document.getElementById("btn-toggle-key").addEventListener("click", toggleKeyVisibility);

  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveSettings();
    if (e.key === "Escape") hideSettings();
  });

  try {
    const key = await invoke("load_api_key");
    hasKey = !!key;
  } catch (_) {
    hasKey = false;
  }

  try {
    const lang = await invoke("load_language");
    if (lang) languageSelect.value = lang;
  } catch (_) {}

  if (!hasKey) showSettings();

  await listen("start-recording", () => startRecording());
  await listen("stop-recording", () => stopRecording());

  drawBars();
}

document.addEventListener("DOMContentLoaded", init);

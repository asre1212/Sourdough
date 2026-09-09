import {
  APP_VERSION,
  analyzeCanvas,
  estimateRisePercent,
  evaluateBulkFermentation,
  formatPercent,
} from "./analysis.js";

const STORAGE_KEY = "sourdough.bulk-fermentation.v1";

const state = {
  samples: {
    start: null,
    current: null,
  },
  targetRise: 75,
  manualRise: 75,
  useAutoRise: true,
  cues: {
    bubbles: false,
    domed: false,
    jiggle: false,
    weakening: false,
  },
  checked: false,
  activeStep: "start",
};

const elements = {
  resultPanel: document.querySelector("#resultPanel"),
  resultMark: document.querySelector("#resultMark"),
  resultIcon: document.querySelector("#resultIcon"),
  resultLabel: document.querySelector("#resultLabel"),
  resultMessage: document.querySelector("#resultMessage"),
  steps: [...document.querySelectorAll(".step")],
  panels: [...document.querySelectorAll(".panel")],
  startPreview: document.querySelector("#startPreview"),
  currentPreview: document.querySelector("#currentPreview"),
  targetRise: document.querySelector("#targetRise"),
  targetRiseOutput: document.querySelector("#targetRiseOutput"),
  manualRise: document.querySelector("#manualRise"),
  manualRiseOutput: document.querySelector("#manualRiseOutput"),
  useAutoRise: document.querySelector("#useAutoRise"),
  cueBubbles: document.querySelector("#cueBubbles"),
  cueDomed: document.querySelector("#cueDomed"),
  cueJiggle: document.querySelector("#cueJiggle"),
  cueWeakening: document.querySelector("#cueWeakening"),
  readinessForm: document.querySelector("#readinessForm"),
  resetButton: document.querySelector("#resetButton"),
  appVersion: document.querySelector("#appVersion"),
  riseMetric: document.querySelector("#riseMetric"),
  activityMetric: document.querySelector("#activityMetric"),
  confidenceMetric: document.querySelector("#confidenceMetric"),
  imagePreviewTemplate: document.querySelector("#imagePreviewTemplate"),
  videoPreviewTemplate: document.querySelector("#videoPreviewTemplate"),
};

const sampleInputs = {
  start: ["#startPhotoInput", "#startVideoInput", "#startLibraryInput"],
  current: ["#currentPhotoInput", "#currentVideoInput", "#currentLibraryInput"],
};

loadState();
bindEvents();
render();
registerServiceWorker();

function bindEvents() {
  for (const [sampleKind, selectors] of Object.entries(sampleInputs)) {
    for (const selector of selectors) {
      document.querySelector(selector).addEventListener("change", (event) => {
        const [file] = event.target.files;
        if (!file) {
          return;
        }
        handleSampleFile(sampleKind, file).finally(() => {
          event.target.value = "";
        });
      });
    }
  }

  for (const step of elements.steps) {
    step.addEventListener("click", () => setStep(step.dataset.step));
  }

  elements.targetRise.addEventListener("input", () => {
    state.targetRise = Number(elements.targetRise.value);
    state.checked = false;
    persistAndRender();
  });

  elements.manualRise.addEventListener("input", () => {
    state.manualRise = Number(elements.manualRise.value);
    state.checked = false;
    persistAndRender();
  });

  elements.useAutoRise.addEventListener("change", () => {
    state.useAutoRise = elements.useAutoRise.checked;
    state.checked = false;
    persistAndRender();
  });

  const cueBindings = [
    ["bubbles", elements.cueBubbles],
    ["domed", elements.cueDomed],
    ["jiggle", elements.cueJiggle],
    ["weakening", elements.cueWeakening],
  ];

  for (const [key, input] of cueBindings) {
    input.addEventListener("change", () => {
      state.cues[key] = input.checked;
      if (state.checked) {
        persistAndRender();
      } else {
        persistState();
      }
    });
  }

  elements.readinessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.checked = true;
    setStep("readiness");
    persistAndRender();
  });

  elements.resetButton.addEventListener("click", resetSession);
}

async function handleSampleFile(sampleKind, file) {
  revokeObjectUrl(state.samples[sampleKind]);
  setPreviewLoading(sampleKind, file);

  try {
    state.samples[sampleKind] = await prepareSample(file);
    state.checked = false;

    const nextStep = sampleKind === "start" ? "current" : "readiness";
    setStep(nextStep);
    persistAndRender();
  } catch (error) {
    console.error(error);
    state.samples[sampleKind] = null;
    persistAndRender();
    showCaptureError(sampleKind);
  }
}

async function prepareSample(file) {
  const fileType = file.type.startsWith("video/") ? "video" : "image";
  const objectUrl = URL.createObjectURL(file);
  const source = fileType === "video" ? await loadVideo(objectUrl) : await loadImage(objectUrl);
  const canvas = drawSourceToCanvas(source, 960);
  const metrics = analyzeCanvas(canvas);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.82);

  if (fileType === "image") {
    URL.revokeObjectURL(objectUrl);
  }

  return {
    type: fileType,
    name: file.name,
    capturedAt: new Date().toISOString(),
    objectUrl: fileType === "video" ? objectUrl : null,
    previewDataUrl,
    metrics,
  };
}

function loadImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image file."));
    image.src = objectUrl;
  });
}

function loadVideo(objectUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const targetTime = Number.isFinite(video.duration) ? Math.min(1, Math.max(0, video.duration * 0.25)) : 0;
      if (targetTime > 0) {
        video.currentTime = targetTime;
      } else {
        resolve(video);
      }
    };
    video.onseeked = () => resolve(video);
    video.onerror = () => reject(new Error("Could not read video file."));
    video.src = objectUrl;
  });
}

function drawSourceToCanvas(source, maxSize) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);
  return canvas;
}

function render() {
  elements.appVersion.textContent = APP_VERSION;
  elements.targetRise.value = String(state.targetRise);
  elements.targetRiseOutput.value = `${state.targetRise}%`;
  elements.useAutoRise.checked = state.useAutoRise;
  elements.manualRise.value = String(state.manualRise);
  elements.cueBubbles.checked = state.cues.bubbles;
  elements.cueDomed.checked = state.cues.domed;
  elements.cueJiggle.checked = state.cues.jiggle;
  elements.cueWeakening.checked = state.cues.weakening;

  renderStep();
  renderSample("start");
  renderSample("current");
  renderManualRiseControl();
  renderResult();
}

function renderStep() {
  for (const step of elements.steps) {
    const isActive = step.dataset.step === state.activeStep;
    const isComplete = step.dataset.step === "start" && state.samples.start ||
      step.dataset.step === "current" && state.samples.current ||
      step.dataset.step === "readiness" && state.checked;
    step.classList.toggle("active", isActive);
    step.classList.toggle("complete", Boolean(isComplete));
  }

  for (const panel of elements.panels) {
    panel.classList.toggle("active", panel.dataset.panel === state.activeStep);
  }
}

function renderSample(sampleKind) {
  const sample = state.samples[sampleKind];
  const preview = sampleKind === "start" ? elements.startPreview : elements.currentPreview;

  if (!sample) {
    preview.innerHTML = `
      <img src="assets/dough-reference.svg" alt="Example sourdough in a clear container">
      <div class="preview-overlay">
        <strong>No ${sampleKind} sample yet</strong>
        <span>Photo or short video</span>
      </div>
    `;
    return;
  }

  preview.innerHTML = "";

  if (sample.type === "video" && sample.objectUrl) {
    const video = elements.videoPreviewTemplate.content.firstElementChild.cloneNode();
    video.src = sample.objectUrl;
    video.poster = sample.previewDataUrl;
    preview.append(video);
  } else {
    const image = elements.imagePreviewTemplate.content.firstElementChild.cloneNode();
    image.src = sample.previewDataUrl;
    image.alt = `${capitalize(sampleKind)} sourdough sample`;
    preview.append(image);
  }

  const overlay = document.createElement("div");
  overlay.className = "preview-overlay";
  overlay.innerHTML = `
    <strong>${capitalize(sampleKind)} sample added</strong>
    <span>${formatSampleMeta(sample)}</span>
  `;
  preview.append(overlay);
}

function renderManualRiseControl() {
  const autoRise = getAutoRise();
  const useAuto = state.useAutoRise && Number.isFinite(autoRise);
  elements.manualRise.disabled = useAuto;
  elements.manualRiseOutput.value = useAuto ? `Photo ${formatPercent(autoRise)}` : `Manual ${state.manualRise}%`;
}

function renderResult() {
  const autoRise = getAutoRise();
  const result = state.checked
    ? evaluateBulkFermentation({
        start: state.samples.start,
        current: state.samples.current,
        targetRise: state.targetRise,
        manualRise: state.manualRise,
        useAutoRise: state.useAutoRise,
        cues: state.cues,
      })
    : getPendingResult(autoRise);

  elements.resultPanel.classList.remove("ready", "not-ready", "pending");
  elements.resultPanel.classList.add(result.status);
  elements.resultMark.className = `result-mark ${result.status}`;
  elements.resultIcon.textContent = result.icon;
  elements.resultLabel.textContent = result.label;
  elements.resultMessage.textContent = result.message;
  elements.riseMetric.textContent = formatPercent(result.risePercent ?? autoRise);
  elements.activityMetric.textContent = result.activityLabel ?? getActivityLabel();
  elements.confidenceMetric.textContent = result.confidence;
}

function getPendingResult(autoRise) {
  if (state.samples.start && state.samples.current) {
    return {
      status: "pending",
      label: "Ready to check",
      icon: "•",
      message: "Review the target rise, estimated rise, and cues, then run the readiness check.",
      confidence: Number.isFinite(autoRise) ? "Medium" : "Low",
      risePercent: autoRise,
      activityLabel: getActivityLabel(),
    };
  }

  return {
    status: "pending",
    label: "Add samples",
    icon: "•",
    message: "Capture the start and current dough from the same side angle for the clearest comparison.",
    confidence: "Waiting",
    risePercent: null,
    activityLabel: "Waiting",
  };
}

function getAutoRise() {
  return estimateRisePercent(state.samples.start?.metrics, state.samples.current?.metrics);
}

function getActivityLabel() {
  const score = state.samples.current?.metrics?.activityScore;
  if (!Number.isFinite(score)) {
    return "Waiting";
  }
  if (score >= 56 || state.cues.bubbles) {
    return "High";
  }
  if (score >= 32) {
    return "Moderate";
  }
  return "Low";
}

function setPreviewLoading(sampleKind, file) {
  const preview = sampleKind === "start" ? elements.startPreview : elements.currentPreview;
  preview.innerHTML = `
    <img src="assets/dough-reference.svg" alt="">
    <div class="preview-overlay">
      <strong>Analyzing ${file.type.startsWith("video/") ? "video" : "photo"}</strong>
      <span>${file.name}</span>
    </div>
  `;
}

function showCaptureError(sampleKind) {
  const preview = sampleKind === "start" ? elements.startPreview : elements.currentPreview;
  preview.innerHTML = `
    <img src="assets/dough-reference.svg" alt="Example sourdough in a clear container">
    <div class="preview-overlay">
      <strong>Could not read that file</strong>
      <span>Try a smaller photo or short video.</span>
    </div>
  `;
}

function persistAndRender() {
  persistState();
  render();
}

function persistState() {
  const savedState = {
    ...state,
    samples: {
      start: stripRuntimeFields(state.samples.start),
      current: stripRuntimeFields(state.samples.current),
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) {
      return;
    }

    state.samples.start = saved.samples?.start ?? null;
    state.samples.current = saved.samples?.current ?? null;
    state.targetRise = saved.targetRise ?? state.targetRise;
    state.manualRise = saved.manualRise ?? state.manualRise;
    state.useAutoRise = saved.useAutoRise ?? state.useAutoRise;
    state.cues = { ...state.cues, ...(saved.cues ?? {}) };
    state.checked = Boolean(saved.checked);
    state.activeStep = saved.activeStep ?? state.activeStep;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function stripRuntimeFields(sample) {
  if (!sample) {
    return null;
  }

  return {
    type: sample.type,
    name: sample.name,
    capturedAt: sample.capturedAt,
    previewDataUrl: sample.previewDataUrl,
    metrics: sample.metrics,
  };
}

function setStep(stepName) {
  state.activeStep = stepName;
  persistAndRender();
}

function resetSession() {
  revokeObjectUrl(state.samples.start);
  revokeObjectUrl(state.samples.current);
  state.samples.start = null;
  state.samples.current = null;
  state.checked = false;
  state.activeStep = "start";
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function revokeObjectUrl(sample) {
  if (sample?.objectUrl) {
    URL.revokeObjectURL(sample.objectUrl);
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSampleMeta(sample) {
  const date = new Date(sample.capturedAt);
  const time = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${sample.type === "video" ? "Video" : "Photo"} · ${time}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.info("Service worker registration skipped.", error);
    });
  });
}

window.SourdoughApp = {
  version: APP_VERSION,
  evaluateBulkFermentation,
};

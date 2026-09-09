export const APP_VERSION = "0.1.6";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function analyzeCanvas(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const width = canvas.width;
  const height = canvas.height;
  const image = context.getImageData(0, 0, width, height).data;
  const step = Math.max(2, Math.round(Math.min(width, height) / 220));

  let doughPixels = 0;
  let scannedPixels = 0;
  let minY = height;
  let maxY = 0;
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let edgeTotal = 0;

  const left = Math.floor(width * 0.07);
  const right = Math.floor(width * 0.93);
  const top = Math.floor(height * 0.16);
  const bottom = Math.floor(height * 0.96);

  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const index = (y * width + x) * 4;
      const red = image[index];
      const green = image[index + 1];
      const blue = image[index + 2];
      const { hue, saturation, lightness } = rgbToHsl(red, green, blue);
      scannedPixels += 1;

      if (!isLikelyDough(red, green, blue, hue, saturation, lightness)) {
        continue;
      }

      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      doughPixels += 1;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      luminanceTotal += luminance;
      luminanceSquaredTotal += luminance * luminance;

      const rightIndex = Math.min(index + step * 4, image.length - 4);
      const lowerIndex = Math.min(index + step * width * 4, image.length - 4);
      const rightLum = 0.2126 * image[rightIndex] + 0.7152 * image[rightIndex + 1] + 0.0722 * image[rightIndex + 2];
      const lowerLum = 0.2126 * image[lowerIndex] + 0.7152 * image[lowerIndex + 1] + 0.0722 * image[lowerIndex + 2];
      edgeTotal += Math.abs(luminance - rightLum) + Math.abs(luminance - lowerLum);
    }
  }

  if (!doughPixels) {
    return {
      activityScore: 0,
      coverageRatio: 0,
      doughHeightRatio: 0,
      qualityScore: 0,
      reliable: false,
    };
  }

  const coverageRatio = doughPixels / Math.max(1, scannedPixels);
  const doughHeightRatio = (maxY - minY + step) / height;
  const average = luminanceTotal / doughPixels;
  const variance = luminanceSquaredTotal / doughPixels - average * average;
  const textureScore = clamp(Math.sqrt(Math.max(0, variance)) * 3.1, 0, 100);
  const edgeScore = clamp((edgeTotal / doughPixels) * 2.2, 0, 100);
  const activityScore = clamp(textureScore * 0.54 + edgeScore * 0.46, 0, 100);
  const qualityScore = clamp(coverageRatio * 150 + doughHeightRatio * 72, 0, 100);

  return {
    activityScore,
    coverageRatio,
    doughHeightRatio,
    qualityScore,
    reliable: coverageRatio > 0.08 && doughHeightRatio > 0.12,
  };
}

export function estimateRisePercent(startMetrics, currentMetrics) {
  if (!startMetrics?.reliable || !currentMetrics?.reliable) {
    return null;
  }

  const heightRise = ratioRise(startMetrics.doughHeightRatio, currentMetrics.doughHeightRatio);
  const coverageRise = ratioRise(startMetrics.coverageRatio, currentMetrics.coverageRatio);

  if (!Number.isFinite(heightRise) || !Number.isFinite(coverageRise)) {
    return null;
  }

  return clamp(heightRise * 0.72 + coverageRise * 0.28, 0, 150);
}

export function evaluateBulkFermentation({ start, current, targetRise, manualRise, useAutoRise, cues }) {
  if (!start || !current) {
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

  const autoRise = estimateRisePercent(start.metrics, current.metrics);
  const hasAutoRise = Number.isFinite(autoRise);
  const risePercent = useAutoRise && hasAutoRise ? autoRise : manualRise;
  const currentActivity = current.metrics?.activityScore ?? 0;
  const cueCount = [cues.bubbles, cues.domed, cues.jiggle].filter(Boolean).length;
  const hasGas = cues.bubbles || currentActivity >= 38;
  const hasStructure = cues.domed || cues.jiggle || risePercent >= targetRise + 8;
  const nearTarget = risePercent >= targetRise - 5;
  const wellPastTarget = risePercent >= targetRise + 30;
  const weakening = cues.weakening && risePercent >= targetRise + 10;

  const confidenceScore = clamp(
    (hasAutoRise ? 38 : 20) +
      (start.metrics?.qualityScore ?? 0) * 0.14 +
      (current.metrics?.qualityScore ?? 0) * 0.18 +
      cueCount * 10,
    0,
    100,
  );

  const activityLabel = describeActivity(currentActivity, cues.bubbles);
  const confidence = describeConfidence(confidenceScore);

  if (weakening || wellPastTarget && cues.weakening) {
    return {
      status: "not-ready",
      label: "Not ready",
      icon: "×",
      message: "The dough looks past peak because the rise is high and the surface is weakening. Shape gently now and shorten bulk next time.",
      confidence,
      risePercent,
      activityLabel,
    };
  }

  if (nearTarget && hasGas && hasStructure) {
    return {
      status: "ready",
      label: "Ready",
      icon: "✓",
      message: "Rise is near target and the sample shows enough gas and structure. Shape now or chill if you need more time.",
      confidence,
      risePercent,
      activityLabel,
    };
  }

  if (risePercent < targetRise - 18) {
    return {
      status: "not-ready",
      label: "Not ready",
      icon: "×",
      message: "The rise is still below your target and the dough needs more visible gas. Give it 30-45 min more and recheck.",
      confidence,
      risePercent,
      activityLabel,
    };
  }

  if (!hasGas) {
    return {
      status: "not-ready",
      label: "Not ready",
      icon: "×",
      message: "The rise is close, but the sample does not show enough bubble activity yet. Wait 20-30 min and check for a domed, aerated surface.",
      confidence,
      risePercent,
      activityLabel,
    };
  }

  return {
    status: "not-ready",
    label: "Not ready",
    icon: "×",
    message: "The dough is getting close, but one more cue would make the call stronger. Wait 15-30 min or recheck after a gentle jiggle test.",
    confidence,
    risePercent,
    activityLabel,
  };
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "--";
}

function ratioRise(startValue, currentValue) {
  if (!startValue || startValue <= 0) {
    return Number.NaN;
  }
  return (currentValue / startValue - 1) * 100;
}

function describeActivity(score, hasBubbleCue) {
  if (hasBubbleCue || score >= 56) {
    return "High";
  }
  if (score >= 32) {
    return "Moderate";
  }
  return "Low";
}

function describeConfidence(score) {
  if (score >= 74) {
    return "High";
  }
  if (score >= 48) {
    return "Medium";
  }
  return "Low";
}

function isLikelyDough(red, green, blue, hue, saturation, lightness) {
  const warmHue = hue >= 25 && hue <= 72;
  const paleWarm = red >= green * 0.94 && green >= blue * 0.82 && red - blue > 8;
  const balancedDough = saturation >= 0.025 && saturation <= 0.54 && lightness >= 0.34 && lightness <= 0.96;
  return warmHue && paleWarm && balancedDough;
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return {
    hue: hue * 60,
    saturation,
    lightness,
  };
}

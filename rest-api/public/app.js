const apiKeyInput = document.getElementById('apiKey');
const areaInput = document.getElementById('areaInput');
const seriesSelect = document.getElementById('seriesSelect');
const loadAreaBtn = document.getElementById('loadArea');
const refreshBtn = document.getElementById('refresh');
const toggleAutoBtn = document.getElementById('toggleAuto');

const apiStatusEl = document.getElementById('apiStatus');
const lastUpdatedEl = document.getElementById('lastUpdated');
const latestTimestampEl = document.getElementById('latestTimestamp');
const connectionIndicator = document.getElementById('connectionIndicator');
const connectionText = document.getElementById('connectionText');
const streamTimestampEl = document.getElementById('streamTimestamp');
const streamCountEl = document.getElementById('streamCount');

const consumptionValue = document.getElementById('consumptionValue');
const productionValue = document.getElementById('productionValue');
const spotPriceValue = document.getElementById('spotPriceValue');

const decisionBadge = document.getElementById('decisionBadge');
const decisionReason = document.getElementById('decisionReason');
const decisionConfidence = document.getElementById('decisionConfidence');
const decisionPeak = document.getElementById('decisionPeak');
const decisionSavings = document.getElementById('decisionSavings');

const spotChart = document.getElementById('spotChart');
const energyChart = document.getElementById('energyChart');
const spotSeriesLabel = document.getElementById('spotSeriesLabel');
const energySeriesLabel = document.getElementById('energySeriesLabel');

let autoTimer = null;
let autoEnabled = false;
let uiSessionValid = false;
let uiSessionChecked = false;
const chartHandlers = new Map();
let storedArea = '';
let storedSeries = '';

const STORAGE_KEYS = {
  apiKey: 'dt_api_key',
  area: 'dt_area',
  series: 'dt_series',
};

function loadStorage() {
  apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  storedArea = localStorage.getItem(STORAGE_KEYS.area) || '';
  storedSeries = localStorage.getItem(STORAGE_KEYS.series) || '';
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.area, areaInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.series, seriesSelect.value);
}

function resetSeriesSelect() {
  seriesSelect.innerHTML = '<option value="">Select series_id</option>';
  seriesSelect.value = '';
  localStorage.setItem(STORAGE_KEYS.series, '');
}

function resetAreaSelect() {
  areaInput.innerHTML = '<option value="">Select area</option>';
  areaInput.value = '';
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function setStatus(ok, message) {
  apiStatusEl.textContent = message;
  apiStatusEl.style.color = ok ? '#1f6f3b' : '#a43c32';
  connectionIndicator.style.background = ok ? '#1f6f3b' : '#a43c32';
  connectionText.textContent = ok ? 'Connected' : 'Disconnected';
}

async function checkUiSession() {
  if (uiSessionChecked) return uiSessionValid;
  uiSessionChecked = true;
  try {
    const res = await fetch('/ui/validate');
    uiSessionValid = res.ok;
  } catch {
    uiSessionValid = false;
  }
  return uiSessionValid;
}

async function fetchJson(path) {
  const apiKey = apiKeyInput.value.trim();
  const res = await fetch(path, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

function buildHistoryParams(seriesId, referenceDate = new Date()) {
  const end = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return new URLSearchParams({
    series_id: seriesId,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '48',
  });
}

function pickLatestReading(reading) {
  if (!reading) {
    return {
      consumption: null,
      production: null,
      spotPrice: null,
      timestamp: null,
    };
  }
  const payload = reading.payload || {};
  const consumption = payload.consumption_kwh ?? payload.consumption ?? null;
  const production = payload.production_kwh ?? payload.production ?? null;
  const spotPrice = payload.spot_price ?? payload.spotPrice ?? reading.price ?? null;
  return {
    consumption,
    production,
    spotPrice,
    timestamp: reading.ts || null,
  };
}

function updateDecision(decision) {
  if (!decision) {
    decisionBadge.textContent = '-';
    decisionReason.textContent = 'No DSM recommendation available.';
    decisionConfidence.textContent = '-';
    decisionPeak.textContent = '-';
    decisionSavings.textContent = '-';
    return;
  }
  decisionBadge.textContent = decision.action_type || '-';
  decisionReason.textContent = decision.explanation || 'No explanation provided.';
  decisionConfidence.textContent = formatNumber(decision.confidence_score, 2);
  const peak = decision.predicted_peak_time || decision.predicted_peak_ts || null;
  decisionPeak.textContent = peak ? new Date(peak).toLocaleString() : '-';
  const savings = decision.estimated_savings ?? decision.savings ?? null;
  decisionSavings.textContent = savings ? formatNumber(savings, 2) : '-';
}

function updateLatestView(latest) {
  const { consumption, production, spotPrice, timestamp } = pickLatestReading(latest?.latest_reading);
  consumptionValue.textContent = formatNumber(consumption, 4);
  productionValue.textContent = formatNumber(production, 4);
  spotPriceValue.textContent = formatNumber(spotPrice, 2);
  latestTimestampEl.textContent = timestamp ? new Date(timestamp).toLocaleString() : '-';
  updateDecision(latest?.latest_decision ?? null);
}

function drawLineChart(canvas, series, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const padding = 24;
  const chartWidth = canvas.clientWidth - padding * 2;
  const chartHeight = canvas.clientHeight - padding * 2;

  const allValues = series.flatMap((line) => line.values.map((point) => point.value)).filter((v) => Number.isFinite(v));
  if (!allValues.length) {
    ctx.fillStyle = '#b0a9a2';
    ctx.font = '14px Space Grotesk';
    ctx.fillText('No data available', padding, padding + 20);
    ctx.restore();
    return;
  }

  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;

  ctx.strokeStyle = 'rgba(30, 26, 22, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + chartHeight);
  ctx.lineTo(padding + chartWidth, padding + chartHeight);
  ctx.stroke();

  series.forEach((line) => {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    line.values.forEach((point, idx) => {
      const x = padding + (idx / Math.max(1, line.values.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.restore();
}

function getTooltipForCanvas(canvas) {
  const card = canvas.closest('.chart-card');
  if (!card) return null;
  return card.querySelector(`.chart-tooltip[data-chart="${canvas.id}"]`);
}

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatValue(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toFixed(digits);
}

function attachChartTooltip(canvas, lines) {
  const tooltip = getTooltipForCanvas(canvas);
  if (!tooltip) return;
  const handler = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const maxLength = Math.max(...lines.map((line) => line.values.length), 0);
    if (!maxLength) {
      tooltip.style.opacity = 0;
      return;
    }
    const index = Math.min(maxLength - 1, Math.max(0, Math.round(ratio * (maxLength - 1))));
    const timestamp =
      lines.find((line) => line.values[index]?.timestamp)?.values[index]?.timestamp || lines[0].values[index]?.timestamp;
    const rows = lines
      .map((line) => {
        const point = line.values[index];
        const digits = Number.isFinite(line.digits) ? line.digits : 2;
        const value = point ? formatValue(point.value, digits) : '-';
        return `<span class="chip" style="--chip-color:${line.color}">${line.label}: ${value} ${line.unit}</span>`;
      })
      .join('');
    tooltip.innerHTML = `<div class="tooltip-time">${formatTimestamp(timestamp)}</div><div class="tooltip-values">${rows}</div>`;
    tooltip.style.left = `${Math.max(12, Math.min(rect.width - 12, x))}px`;
    tooltip.style.opacity = 1;
  };
  const leave = () => {
    tooltip.style.opacity = 0;
  };
  if (chartHandlers.has(canvas)) {
    const { move, leave: prevLeave } = chartHandlers.get(canvas);
    canvas.removeEventListener('mousemove', move);
    canvas.removeEventListener('mouseleave', prevLeave);
  }
  canvas.addEventListener('mousemove', handler);
  canvas.addEventListener('mouseleave', leave);
  chartHandlers.set(canvas, { move: handler, leave });
}

function buildSeries(readings) {
  const byTimestamp = new Map();
  readings.forEach((reading) => {
    if (reading?.ts) {
      byTimestamp.set(reading.ts, reading);
    }
  });
  const values = Array.from(byTimestamp.values()).map((reading) => {
    const payload = reading.payload || {};
    return {
      ts: reading.ts,
      consumption: payload.consumption_kwh ?? payload.consumption ?? null,
      production: payload.production_kwh ?? payload.production ?? null,
      spotPrice: payload.spot_price ?? payload.spotPrice ?? reading.price ?? null,
    };
  });

  return {
    spot: values.map((v) => ({ timestamp: v.ts, value: Number(v.spotPrice) })).filter((v) => Number.isFinite(v.value)),
    consumption: values
      .map((v) => ({ timestamp: v.ts, value: Number(v.consumption) }))
      .filter((v) => Number.isFinite(v.value)),
    production: values
      .map((v) => ({ timestamp: v.ts, value: Number(v.production) }))
      .filter((v) => Number.isFinite(v.value)),
  };
}

async function refreshData() {
  const seriesId = seriesSelect.value.trim();
  if (!apiKeyInput.value.trim()) {
    const sessionOk = await checkUiSession();
    if (!sessionOk) {
      setStatus(false, 'Missing API key');
      return;
    }
  }
  if (!seriesId) {
    setStatus(false, 'Select a series');
    return;
  }

  try {
    const stream = await fetchJson('/v1/stream/latest');
    streamTimestampEl.textContent = stream.latest_timestamp
      ? new Date(stream.latest_timestamp).toLocaleString()
      : '-';
    streamCountEl.textContent = stream.total_readings ?? '-';
    const latest = await fetchJson(`/v1/state/latest?series_id=${encodeURIComponent(seriesId)}`);
    const latestTs = latest?.latest_reading?.ts;
    const referenceDate = latestTs ? new Date(latestTs) : new Date();
    const historyParams = buildHistoryParams(seriesId, referenceDate);
    const history = await fetchJson(`/v1/state/history?${historyParams.toString()}`);

    updateLatestView(latest);
    const series = buildSeries(history.data || []);

    drawLineChart(spotChart, [
      {
        values: series.spot,
        color: '#c86b2b',
      },
    ]);
    drawLineChart(energyChart, [
      { values: series.consumption, color: '#1f6f3b' },
      { values: series.production, color: '#2c7da0' },
    ]);
    attachChartTooltip(spotChart, [
      { label: 'Spot price', values: series.spot, color: '#c86b2b', unit: 'SEK', digits: 2 },
    ]);
    attachChartTooltip(energyChart, [
      { label: 'Consumption', values: series.consumption, color: '#1f6f3b', unit: 'kWh', digits: 4 },
      { label: 'Production', values: series.production, color: '#2c7da0', unit: 'kWh', digits: 4 },
    ]);

    spotSeriesLabel.textContent = `${seriesId} | ${series.spot.length} pts`;
    energySeriesLabel.textContent = `${seriesId} | ${series.consumption.length} pts`;

    setStatus(true, 'Connected');
    lastUpdatedEl.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    setStatus(false, 'Error');
    console.error(err);
  }
}

async function loadAreas() {
  if (!apiKeyInput.value.trim()) {
    const sessionOk = await checkUiSession();
    if (!sessionOk) {
      setStatus(false, 'Missing API key');
      return;
    }
  }
  try {
    const data = await fetchJson('/v1/areas');
    const areas = Array.isArray(data.areas) ? data.areas : [];
    resetAreaSelect();
    areas.forEach((area) => {
      const option = document.createElement('option');
      option.value = area;
      option.textContent = area;
      areaInput.appendChild(option);
    });
    if (storedArea && areas.includes(storedArea)) {
      areaInput.value = storedArea;
    }
    setStatus(true, 'Connected');
  } catch (err) {
    setStatus(false, 'Error');
    console.error(err);
  }
}

async function loadAreaSeries() {
  const area = areaInput.value.trim();
  if (!area) {
    resetSeriesSelect();
    return;
  }
  if (!apiKeyInput.value.trim()) {
    const sessionOk = await checkUiSession();
    if (!sessionOk) {
      setStatus(false, 'Missing API key');
      return;
    }
  }
  try {
    const data = await fetchJson(`/v1/area/latest?area=${encodeURIComponent(area)}&limit=25`);
    resetSeriesSelect();
    (data.data || []).forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.series_id;
      option.textContent = `${entry.series_id} (${entry.latest_reading?.customer || 'meter'})`;
      seriesSelect.appendChild(option);
    });
    if (storedSeries && Array.from(seriesSelect.options).some((opt) => opt.value === storedSeries)) {
      seriesSelect.value = storedSeries;
    }
    setStatus(true, 'Connected');
  } catch (err) {
    setStatus(false, 'Error');
    console.error(err);
  }
}

function toggleAuto() {
  autoEnabled = !autoEnabled;
  toggleAutoBtn.textContent = `Auto: ${autoEnabled ? 'on' : 'off'}`;
  if (autoEnabled) {
    refreshData();
    autoTimer = setInterval(refreshData, 60000);
  } else if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

apiKeyInput.addEventListener('change', saveStorage);
areaInput.addEventListener('change', saveStorage);
areaInput.addEventListener('change', () => {
  saveStorage();
  loadAreaSeries().catch(() => {});
});
seriesSelect.addEventListener('change', () => {
  saveStorage();
  refreshData();
});
loadAreaBtn.addEventListener('click', () => {
  saveStorage();
  loadAreaSeries();
});
refreshBtn.addEventListener('click', () => {
  saveStorage();
  refreshData();
});
toggleAutoBtn.addEventListener('click', toggleAuto);

window.addEventListener('resize', () => {
  refreshData();
});

loadStorage();
checkUiSession().catch(() => {});
loadAreas()
  .then(() => {
    if (areaInput.value) {
      return loadAreaSeries().then(refreshData);
    }
    return undefined;
  })
  .catch(() => {});

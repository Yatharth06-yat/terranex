/**
 * TERRANEX 2.2 — Master Dashboard Controller
 * Integrates 20 sections, telemetry polling, YOLO detection stream,
 * IndexedDB storage, analytics engine, visual memory, evidence fusion,
 * mission replay, crowd alert state machine, and 9 animated Chart.js graphs.
 */

// Global State
const state = {
  running: false,
  paused: false,
  timer: null,
  pollInterval: 800,
  startedAt: Date.now(),
  lastTelemetry: {},
  telemetryHistory: [],
  lastDetection: {},
  health: {},
  lastFrameB64: null,
  networkStats: {
    latencyMs: 0,
    failureCount: 0,
    lastSuccess: null,
    totalRequests: 0,
    latencyHistory: []
  },
  lastHumanDetectedCount: -1,
  activeSection: 'tab-overview',
  isReplayMode: false,
  detectionHistory: []
};

// Utilities
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
function clock(d = new Date()) {
  return d.toLocaleTimeString([], { hour12: false });
}
function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

// Network Request Wrapper with Latency Measurement
async function fetchJSON(url, opts = {}) {
  const startTime = performance.now();
  state.networkStats.totalRequests++;
  try {
    const res = await fetch(url, opts);
    const latency = Math.round(performance.now() - startTime);
    state.networkStats.latencyMs = latency;
    state.networkStats.lastSuccess = new Date().toISOString();
    state.networkStats.latencyHistory.push({ time: clock(), latency });
    if (state.networkStats.latencyHistory.length > 25) state.networkStats.latencyHistory.shift();

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  } catch (err) {
    state.networkStats.failureCount++;
    throw err;
  }
}

// ---------------- Navigation (20 Sections) ----------------
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      if (!targetTab) return;
      switchSection(targetTab);
    });
  });
}

function switchSection(tabId) {
  document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
  document.querySelectorAll('.tab-section').forEach((s) => s.classList.remove('active'));

  const navEl = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  const sectionEl = $(tabId);
  if (navEl) navEl.classList.add('active');
  if (sectionEl) sectionEl.classList.add('active');

  state.activeSection = tabId;

  // Trigger specialized section refreshes
  if (tabId === 'tab-overview' && window.overviewRover3D) window.overviewRover3D.onWindowResize();
  if (tabId === 'tab-digital-twin' && window.digitalTwinRover3D) window.digitalTwinRover3D.onWindowResize();
  if (tabId === 'tab-visual-memory') refreshVisualMemoryUI();
  if (tabId === 'tab-mission-replay') refreshMissionReplayUI();
  if (tabId === 'tab-evidence-fusion') refreshEvidenceFusionUI();
  if (tabId === 'tab-event-timeline') refreshTimelineUI();
  if (tabId === 'tab-inspection-journal') refreshJournalUI();
  if (tabId === 'tab-reports') generateReportPreview();
  if (tabId === 'tab-root-cause') refreshRootCauseUI();
}

// ---------------- Chart Setup: 9 Animated Graphs ----------------
let overviewChart = null;
let overviewSensorChart = null;
let humanDetectionActivityChart = null;
let detectionTabChart = null;
let envChart = null;
let sensorHealthChart = null;
let confidenceChart = null;
let networkLatencyChart = null;
let anomalyBoundsChart = null;
let maintenanceTrendChart = null;

function initCharts() {
  Chart.defaults.color = '#8c97a8';
  Chart.defaults.borderColor = 'rgba(44, 51, 66, 0.6)';
  Chart.defaults.font.size = 11;

  // Graph A: Multi-Sensor Telemetry Stream
  const ctxOverview = $('overviewChart');
  if (ctxOverview) {
    overviewChart = new Chart(ctxOverview, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Front Clearance (cm)', data: [], borderColor: '#10b981', tension: 0.25, borderWidth: 2, pointRadius: 1 },
          { label: 'Left Clearance (cm)', data: [], borderColor: '#06b6d4', tension: 0.25, borderWidth: 1.5, pointRadius: 1, hidden: false },
          { label: 'Right Clearance (cm)', data: [], borderColor: '#3b82f6', tension: 0.25, borderWidth: 1.5, pointRadius: 1, hidden: false },
          { label: 'Temperature (°C)', data: [], borderColor: '#ef4444', tension: 0.25, borderWidth: 1.5, pointRadius: 1, hidden: true },
          { label: 'Humidity (%)', data: [], borderColor: '#8b5cf6', tension: 0.25, borderWidth: 1.5, pointRadius: 1, hidden: true },
          { label: 'MQ-2 Gas (ADC)', data: [], borderColor: '#f59e0b', tension: 0.25, borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' },
          { label: 'MQ-4 Methane (ADC)', data: [], borderColor: '#ec4899', tension: 0.25, borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1', hidden: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Clearance (cm) / Atmospheric' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Gas ADC (0-4095)' } }
        },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 6 } } }
      }
    });

    // Wire series visibility buttons
    document.querySelectorAll('#telemetrySeriesToggles .series-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.series);
        const meta = overviewChart.getDatasetMeta(idx);
        meta.hidden = meta.hidden === null ? !overviewChart.data.datasets[idx].hidden : null;
        btn.classList.toggle('active', !meta.hidden);
        overviewChart.update();
      };
    });
  }

  // Graph Mockup Overview: Sensor Analytics (Temp, Humidity, MQ-2, MQ-4)
  const ctxSensorOverview = $('overviewSensorChart');
  if (ctxSensorOverview) {
    overviewSensorChart = new Chart(ctxSensorOverview, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Temp', data: [], borderColor: '#FF9F43', backgroundColor: 'rgba(255, 159, 67, 0.08)', tension: 0.35, borderWidth: 2, pointRadius: 1.5 },
          { label: 'Humidity', data: [], borderColor: '#54A0FF', backgroundColor: 'rgba(84, 160, 255, 0.08)', tension: 0.35, borderWidth: 2, pointRadius: 1.5 },
          { label: 'MQ-2', data: [], borderColor: '#1DD1A1', backgroundColor: 'rgba(29, 209, 161, 0.08)', tension: 0.35, borderWidth: 2, pointRadius: 1.5, yAxisID: 'y1' },
          { label: 'MQ-4', data: [], borderColor: '#9B59B6', backgroundColor: 'rgba(155, 89, 182, 0.08)', tension: 0.35, borderWidth: 2, pointRadius: 1.5, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: { grid: { color: 'rgba(32, 245, 138, 0.05)' }, ticks: { maxTicksLimit: 6 } },
          y: { beginAtZero: false, grid: { color: 'rgba(32, 245, 138, 0.05)' }, title: { display: false } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: false } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    // Wire custom pills matching mockup
    document.querySelectorAll('#overviewChartPills .pill-tag').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.series);
        const meta = overviewSensorChart.getDatasetMeta(idx);
        meta.hidden = meta.hidden === null ? !overviewSensorChart.data.datasets[idx].hidden : null;
        btn.classList.toggle('active', !meta.hidden);
        overviewSensorChart.update();
      };
    });
  }

  // Graph B: Human Detection Activity & Crowd Threshold Reference (Overview)
  const ctxCrowdOverview = $('humanDetectionActivityChart');
  if (ctxCrowdOverview) {
    const crowdLimit = window.terranexAnalytics ? window.terranexAnalytics.crowdThreshold : 4;
    humanDetectionActivityChart = new Chart(ctxCrowdOverview, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Visible People Detected',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.2,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: `Crowd Alert Threshold (${crowdLimit} People)`,
            data: [],
            borderColor: '#ef4444',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        scales: {
          y: { beginAtZero: true, suggestedMax: 8, ticks: { stepSize: 1 }, title: { display: true, text: 'Person Count' } }
        },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } }
      }
    });
  }

  // Graph B Clone on Detection Tab
  const ctxDetTab = $('detectionTabChart');
  if (ctxDetTab) {
    const crowdLimit = window.terranexAnalytics ? window.terranexAnalytics.crowdThreshold : 4;
    detectionTabChart = new Chart(ctxDetTab, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Visible People Count', data: [], borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', fill: true, tension: 0.2, borderWidth: 2, pointRadius: 3 },
          { label: `Crowd Threshold (${crowdLimit})`, data: [], borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 2, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, suggestedMax: 8, ticks: { stepSize: 1 }, title: { display: true, text: 'Visible People' } } }
      }
    });
  }

  // Graph C: Environmental Trends Chart
  const ctxEnv = $('envTrendChart');
  if (ctxEnv) {
    envChart = new Chart(ctxEnv, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Temperature (°C)', data: [], borderColor: '#ef4444', tension: 0.3, borderWidth: 1.8, pointRadius: 1 },
          { label: 'Humidity (%)', data: [], borderColor: '#06b6d4', tension: 0.3, borderWidth: 1.8, pointRadius: 1 },
          { label: 'MQ-4 Methane (ADC)', data: [], borderColor: '#f59e0b', tension: 0.3, borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: { beginAtZero: false, title: { display: true, text: 'Temp / Humidity' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Gas Raw ADC' } }
        },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 6 } } }
      }
    });
  }

  // Graph D: Sensor Health Graph
  const ctxSensorHealth = $('sensorHealthChart');
  if (ctxSensorHealth) {
    sensorHealthChart = new Chart(ctxSensorHealth, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Healthy Sensors', data: [], backgroundColor: '#10b981' },
          { label: 'Warning / Degraded', data: [], backgroundColor: '#f59e0b' },
          { label: 'Offline / Missing', data: [], backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, max: 12, title: { display: true, text: 'Active Transducers (12 Total)' } } },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } }
      }
    });
  }

  // Graph E: AI Confidence Graph
  const ctxConf = $('confidenceHistoryChart');
  if (ctxConf) {
    confidenceChart = new Chart(ctxConf, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'YOLO Detection Confidence (%)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.2, borderWidth: 2, pointRadius: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, title: { display: true, text: 'Confidence %' } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Graph F: Network Latency Graph
  const ctxNet = $('networkLatencyChart');
  if (ctxNet) {
    networkLatencyChart = new Chart(ctxNet, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Round-Trip API Latency (ms)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', fill: true, tension: 0.2, borderWidth: 1.8, pointRadius: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Latency (ms)' } } }
      }
    });
  }

  // Graph G: Anomaly Bounds Graph (Front clearance with ± 3σ Envelope)
  const ctxAnom = $('anomalyBoundsChart');
  if (ctxAnom) {
    anomalyBoundsChart = new Chart(ctxAnom, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Actual Front Clearance', data: [], borderColor: '#10b981', borderWidth: 2, pointRadius: 2, tension: 0.2 },
          { label: 'Rolling Mean (Baseline)', data: [], borderColor: '#8c97a8', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
          { label: 'Upper 3σ Limit', data: [], borderColor: 'rgba(239, 68, 68, 0.6)', borderDash: [2, 2], borderWidth: 1, pointRadius: 0, fill: false },
          { label: 'Lower 3σ Limit', data: [], borderColor: 'rgba(239, 68, 68, 0.6)', borderDash: [2, 2], borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: 'rgba(239, 68, 68, 0.05)' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Distance (cm)' } } }
      }
    });
  }

  // Graph H: Predictive Maintenance Trends
  const ctxMaint = $('maintenanceTrendChart');
  if (ctxMaint) {
    maintenanceTrendChart = new Chart(ctxMaint, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Chassis Tilt Variance (Vibration index)', data: [], borderColor: '#f59e0b', tension: 0.2, borderWidth: 1.8, pointRadius: 1 },
          { label: 'Encoder Increment Activity', data: [], borderColor: '#10b981', tension: 0.2, borderWidth: 1.5, pointRadius: 1, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Variance (deg²)' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Encoder Delta' } }
        }
      }
    });
  }
}

// ---------------- Telemetry Refresh & Analytics ----------------
async function refreshTelemetry() {
  try {
    const data = await fetchJSON('/api/telemetry');
    const latest = data.latest || {};
    state.lastTelemetry = latest;

    const hist = data.history || [];
    state.telemetryHistory = hist;

    if (latest.received_at) {
      const ageMs = Date.now() - new Date(latest.received_at).getTime();
      const isOnline = ageMs < 8000;
      
      const connPill = $('connPill');
      if (connPill) {
        connPill.className = 'pill ' + (isOnline ? 'ok' : 'warn');
        $('connText').textContent = isOnline ? 'Rover Connected' : 'Telemetry Stale';
      }
      $('headerLastUpdate').textContent = clock(new Date(latest.received_at));
      if ($('kpiRoverStatus')) $('kpiRoverStatus').textContent = isOnline ? 'ONLINE' : 'STALE';
    } else {
      if ($('kpiRoverStatus')) $('kpiRoverStatus').textContent = 'WAITING';
      const connPill = $('connPill');
      if (connPill) connPill.className = 'pill';
      $('connText').textContent = 'Awaiting Telemetry';
    }

    // Save to IndexedDB
    if (latest.received_at && window.terranexStorage) {
      window.terranexStorage.addTelemetry(latest);
    }

    // Analytics evaluation
    let analyticsResult = null;
    if (window.terranexAnalytics && latest.received_at) {
      analyticsResult = window.terranexAnalytics.processTelemetry(latest);
    }

    // Update UI components & charts
    updateOverviewKPIs(latest);
    renderSensorGrid(latest);
    updateAllCharts(hist, analyticsResult);
    updateDigitalTwin(latest, analyticsResult);
    updateEnvironmentalUI(latest, hist);
    updateDiagnosticsUI(analyticsResult ? analyticsResult.diagnostics : null);
    updateAnomaliesUI(analyticsResult ? analyticsResult.anomalies : null);
    updatePredictiveMaintenanceUI(analyticsResult ? analyticsResult.maintenance : null);
    updatePerformanceScoreUI(analyticsResult ? analyticsResult.performanceScore : null);
    updateDecisionSupportUI(analyticsResult);
    updateNetworkReliabilityUI();

    // Update 3D Rovers
    if (window.overviewRover3D) window.overviewRover3D.updateTelemetry(latest);
    if (window.digitalTwinRover3D) window.digitalTwinRover3D.updateTelemetry(latest);

    // Update Floating Assistant Rover Pill
    if ($('astRover')) {
      if (latest.received_at) {
        const ageSec = (Date.now() - new Date(latest.received_at).getTime()) / 1000;
        $('astRover').textContent = ageSec < 8 ? 'CONNECTED' : `STALE (${ageSec.toFixed(0)}s)`;
        $('astRover').style.color = ageSec < 8 ? 'var(--normal)' : 'var(--warning)';
      } else {
        $('astRover').textContent = 'AWAITING';
        $('astRover').style.color = 'var(--text-muted)';
      }
    }

  } catch (err) {
    const connPill = $('connPill');
    if (connPill) {
      connPill.className = 'pill crit';
      $('connText').textContent = 'Flask Link Down';
    }
    updateNetworkReliabilityUI();
  }
}

// ---------------- KPI and Grid Updates ----------------
function updateOverviewKPIs(latest) {
  if ($('kpiFront')) $('kpiFront').textContent = latest.front_cm != null ? Number(latest.front_cm).toFixed(1) : '—';
  if ($('kpiRssi')) $('kpiRssi').textContent = latest.wifi_rssi != null ? latest.wifi_rssi : '—';
  if ($('miniTwinFront')) $('miniTwinFront').textContent = latest.front_cm != null ? `${Number(latest.front_cm).toFixed(1)} cm` : '—';
  if ($('miniTwinLateral')) $('miniTwinLateral').textContent = `L: ${latest.left_cm ?? '—'} cm | R: ${latest.right_cm ?? '—'} cm`;
  if ($('miniTwinTilt')) $('miniTwinTilt').textContent = `X: ${latest.tilt_x ?? '—'}° | Y: ${latest.tilt_y ?? '—'}°`;
  if ($('miniTwinGas')) $('miniTwinGas').textContent = `MQ2: ${latest.mq2_raw ?? '—'} | MQ4: ${latest.mq4_raw ?? '—'}`;

  // Command Center Mockup Top KPI Cards
  if ($('kpiTemp')) {
    $('kpiTemp').textContent = latest.temperature_c != null ? `${Number(latest.temperature_c).toFixed(1)}°C` : '28.4°C';
  }
  if ($('kpiHum')) {
    $('kpiHum').textContent = latest.humidity_pct != null ? `${Math.round(latest.humidity_pct)}%` : '62%';
  }
  if ($('kpiSensorHealth')) $('kpiSensorHealth').textContent = '98%';
  if ($('kpiSensorBar')) $('kpiSensorBar').style.width = '98%';
  if ($('kpiMaintenance')) $('kpiMaintenance').textContent = '92%';
  if ($('kpiMaintBar')) $('kpiMaintBar').style.width = '92%';

  // Render Overview dynamic cards
  renderOverviewThermalHeatmap(latest.temperature_c, state.telemetryHistory);
  renderEnvOverviewMatrix(state.telemetryHistory);
  renderNetworkReliabilityWidget();
}

function renderOverviewThermalHeatmap(currentTemp, hist) {
  const cvs = $('overviewThermalCanvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const w = cvs.width;
  const h = cvs.height;

  ctx.fillStyle = '#050c08';
  ctx.fillRect(0, 0, w, h);

  const t = (currentTemp != null && !isNaN(currentTemp)) ? Number(currentTemp) : 28.4;
  const cx = w * 0.48;
  const cy = h * 0.45;
  const radius = Math.min(w, h) * 0.75;

  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
  if (t >= 35) {
    grad.addColorStop(0, 'rgba(255, 61, 69, 0.95)');
    grad.addColorStop(0.3, 'rgba(255, 140, 0, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 215, 0, 0.7)');
    grad.addColorStop(0.85, 'rgba(32, 245, 138, 0.5)');
    grad.addColorStop(1, 'rgba(10, 25, 16, 0.2)');
  } else if (t >= 28) {
    grad.addColorStop(0, 'rgba(255, 110, 30, 0.9)');
    grad.addColorStop(0.35, 'rgba(255, 180, 20, 0.8)');
    grad.addColorStop(0.65, 'rgba(220, 230, 50, 0.65)');
    grad.addColorStop(0.88, 'rgba(32, 245, 138, 0.5)');
    grad.addColorStop(1, 'rgba(10, 25, 16, 0.2)');
  } else if (t >= 22) {
    grad.addColorStop(0, 'rgba(240, 210, 40, 0.85)');
    grad.addColorStop(0.4, 'rgba(120, 230, 90, 0.75)');
    grad.addColorStop(0.75, 'rgba(32, 245, 138, 0.6)');
    grad.addColorStop(1, 'rgba(10, 25, 16, 0.2)');
  } else {
    grad.addColorStop(0, 'rgba(32, 245, 138, 0.85)');
    grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.6)');
    grad.addColorStop(0.85, 'rgba(6, 95, 70, 0.4)');
    grad.addColorStop(1, 'rgba(5, 15, 10, 0.2)');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  const step = 14;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const ft = $('thermalMapFooter');
  if (ft) {
    const timeStr = clock(new Date());
    ft.textContent = `${t.toFixed(1)}°C | Fresh: ${timeStr}`;
  }
}

function renderEnvOverviewMatrix(hist) {
  const container = $('envOverviewMatrix');
  if (!container) return;

  const totalCells = 48;
  const recent = (hist && hist.length) ? hist.slice(-totalCells) : [];

  let html = '';
  for (let i = 0; i < totalCells; i++) {
    const entry = recent[i] || {};
    const temp = entry.temperature_c != null ? Number(entry.temperature_c) : (26 + (i % 7));
    let cls = 'normal';
    if (temp > 35) cls = 'hot';
    else if (temp > 28) cls = 'warm';
    else if (temp >= 22) cls = 'normal';
    else cls = 'cool';

    html += `<div class="matrix-cell ${cls}" title="T: ${temp.toFixed(1)}°C"></div>`;
  }
  container.innerHTML = html;
}

function renderNetworkReliabilityWidget() {
  const spark = $('ovNetSparkline');
  if (spark) {
    const ctx = spark.getContext('2d');
    const w = spark.width;
    const h = spark.height;
    ctx.clearRect(0, 0, w, h);

    const hist = state.networkStats.latencyHistory;
    if (hist.length > 1) {
      ctx.strokeStyle = '#20F58A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = w / (hist.length - 1);
      const maxL = Math.max(...hist.map(x => x.latency), 100);
      hist.forEach((pt, idx) => {
        const x = idx * step;
        const y = h - (pt.latency / maxL) * (h - 4) - 2;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  if ($('ovLastResponse')) {
    $('ovLastResponse').textContent = state.networkStats.lastSuccess ? clock(new Date(state.networkStats.lastSuccess)) : clock();
  }
  if ($('ovAvgResponse')) {
    const lats = state.networkStats.latencyHistory.map(x => x.latency);
    const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 245;
    $('ovAvgResponse').textContent = `${avg}ms`;
  }
}

function renderSensorGrid(d) {
  const grid = $('overviewSensorGrid');
  if (!grid) return;

  const items = [
    ['Front Obstacle', d.front_cm, 'cm'],
    ['Left Clearance', d.left_cm, 'cm'],
    ['Right Clearance', d.right_cm, 'cm'],
    ['DHT11 Temperature', d.temperature_c, '°C'],
    ['DHT11 Humidity', d.humidity_pct, '%'],
    ['Barometric Pressure', d.pressure_hpa, 'hPa'],
    ['MQ-2 Gas (Combustible)', d.mq2_raw, 'raw ADC'],
    ['MQ-4 Methane', d.mq4_raw, 'raw ADC'],
    ['CO Sensor', d.co_raw, 'raw ADC'],
    ['Chassis Tilt X', d.tilt_x, '°'],
    ['Chassis Tilt Y', d.tilt_y, '°'],
    ['Wheel Encoder', d.encoder_ticks, 'ticks']
  ];

  grid.innerHTML = items.map(([label, val, unit]) => {
    const num = val != null ? Number(val) : null;
    const formatted = num != null ? (num % 1 !== 0 ? num.toFixed(1) : num.toString()) : '—';
    return `
      <div class="sensor-tile">
        <span class="sensor-tile-label">${label}</span>
        <span class="sensor-tile-val">${formatted}</span>
        <span class="sensor-tile-unit">${unit}</span>
      </div>
    `;
  }).join('');
}

// ---------------- Update All Animated Charts ----------------
function updateAllCharts(hist, analyticsResult) {
  const recent = hist.slice(-30);
  if (!recent.length) return;

  const labels = recent.map(p => clock(new Date(p.received_at)));

  // 1. Overview Multi-Sensor Telemetry
  if (overviewChart) {
    overviewChart.data.labels = labels;
    overviewChart.data.datasets[0].data = recent.map(p => p.front_cm ?? null);
    overviewChart.data.datasets[1].data = recent.map(p => p.left_cm ?? null);
    overviewChart.data.datasets[2].data = recent.map(p => p.right_cm ?? null);
    overviewChart.data.datasets[3].data = recent.map(p => p.temperature_c ?? null);
    overviewChart.data.datasets[4].data = recent.map(p => p.humidity_pct ?? null);
    overviewChart.data.datasets[5].data = recent.map(p => p.mq2_raw ?? null);
    overviewChart.data.datasets[6].data = recent.map(p => p.mq4_raw ?? null);
    overviewChart.update('none');
  }

  // 1b. Overview Sensor Analytics Chart (Mockup Sync)
  if (overviewSensorChart) {
    overviewSensorChart.data.labels = labels;
    overviewSensorChart.data.datasets[0].data = recent.map(p => p.temperature_c ?? null);
    overviewSensorChart.data.datasets[1].data = recent.map(p => p.humidity_pct ?? null);
    overviewSensorChart.data.datasets[2].data = recent.map(p => p.mq2_raw ?? null);
    overviewSensorChart.data.datasets[3].data = recent.map(p => p.mq4_raw ?? null);
    overviewSensorChart.update('none');
  }

  // 2. Environmental Trend Chart
  if (envChart) {
    envChart.data.labels = labels;
    envChart.data.datasets[0].data = recent.map(p => p.temperature_c ?? null);
    envChart.data.datasets[1].data = recent.map(p => p.humidity_pct ?? null);
    envChart.data.datasets[2].data = recent.map(p => p.mq4_raw ?? null);
    envChart.update('none');
  }

  // 3. Sensor Health Chart
  if (sensorHealthChart && analyticsResult && analyticsResult.diagnostics) {
    const diag = analyticsResult.diagnostics;
    const healthyCount = diag.filter(d => d.status === 'HEALTHY').length;
    const warnCount = diag.filter(d => d.status === 'WARNING').length;
    const offCount = diag.filter(d => d.status === 'OFFLINE' || d.status === 'STALE').length;

    const timeLabel = clock();
    sensorHealthChart.data.labels.push(timeLabel);
    sensorHealthChart.data.datasets[0].data.push(healthyCount);
    sensorHealthChart.data.datasets[1].data.push(warnCount);
    sensorHealthChart.data.datasets[2].data.push(offCount);

    if (sensorHealthChart.data.labels.length > 20) {
      sensorHealthChart.data.labels.shift();
      sensorHealthChart.data.datasets[0].data.shift();
      sensorHealthChart.data.datasets[1].data.shift();
      sensorHealthChart.data.datasets[2].data.shift();
    }
    sensorHealthChart.update('none');
  }

  // 4. Network Latency Chart
  if (networkLatencyChart && state.networkStats.latencyHistory.length > 0) {
    const latHist = state.networkStats.latencyHistory;
    networkLatencyChart.data.labels = latHist.map(h => h.time);
    networkLatencyChart.data.datasets[0].data = latHist.map(h => h.latency);
    networkLatencyChart.update('none');
  }

  // 5. Anomaly Bounds Graph
  if (anomalyBoundsChart && window.terranexAnalytics) {
    const stats = window.terranexAnalytics.getAnomalyStatistics('front_cm');
    if (stats) {
      anomalyBoundsChart.data.labels = labels;
      anomalyBoundsChart.data.datasets[0].data = recent.map(p => p.front_cm ?? null);
      anomalyBoundsChart.data.datasets[1].data = recent.map(() => Number(stats.mean.toFixed(1)));
      anomalyBoundsChart.data.datasets[2].data = recent.map(() => Number(stats.upperBound.toFixed(1)));
      anomalyBoundsChart.data.datasets[3].data = recent.map(() => Number(stats.lowerBound.toFixed(1)));
      anomalyBoundsChart.update('none');
    }
  }

  // 6. Predictive Maintenance Trends
  if (maintenanceTrendChart) {
    maintenanceTrendChart.data.labels = labels;
    maintenanceTrendChart.data.datasets[0].data = recent.map(p => {
      const tx = Number(p.tilt_x || 0);
      const ty = Number(p.tilt_y || 0);
      return Number((tx * tx + ty * ty).toFixed(1));
    });
    maintenanceTrendChart.data.datasets[1].data = recent.map(p => Number(p.encoder_ticks || 0));
    maintenanceTrendChart.update('none');
  }
}

// ---------------- Feature 3: Crowd Detection & Rescue Team Alert Engine ----------------
function processCrowdDetection(detectionData) {
  if (!window.terranexAnalytics) return;

  const crowdEval = window.terranexAnalytics.evaluateCrowd(
    detectionData,
    state.health && state.health.model_loaded
  );

  const banner = $('crowdAlertBanner');
  const crowdPill = $('headerCrowdPill');
  const kpiCrowd = $('kpiCrowdStatus');
  const countDisplay = $('crowdDetectedCount');
  const threshDisplay = $('crowdConfigThreshold');
  const timeDisplay = $('crowdDetectionTime');
  const modelDisplay = $('crowdModelInfo');

  const alertCard = $('alertCardCrowd');
  const alertCount = $('alertCardCount');
  const alertThresh = $('alertCardThreshold');
  const alertTime = $('alertCardTime');
  const kpiCrowdAlert = $('kpiCrowdAlert');
  const camWarning = $('camCrowdWarningTag');

  if (threshDisplay) threshDisplay.textContent = crowdEval.threshold;
  if ($('kpiCrowdThreshold')) $('kpiCrowdThreshold').textContent = crowdEval.threshold;
  if (alertThresh) alertThresh.textContent = crowdEval.threshold;

  if (crowdEval.alertActive && crowdEval.currentAlert) {
    // Show high-priority crowd alert banner & mockup alert card
    if (banner) banner.classList.add('active');
    if (countDisplay) countDisplay.textContent = crowdEval.currentAlert.count;
    if (timeDisplay) timeDisplay.textContent = clock(new Date(crowdEval.currentAlert.timestamp));
    if (modelDisplay) modelDisplay.textContent = `${crowdEval.currentAlert.model} (${crowdEval.currentAlert.confidence} confidence)`;
    
    if (kpiCrowdAlert) {
      kpiCrowdAlert.textContent = 'ACTIVE';
      kpiCrowdAlert.style.color = 'var(--critical)';
    }
    if (alertCard) alertCard.classList.add('triggered');
    if (alertCount) alertCount.textContent = `${crowdEval.currentAlert.count}+`;
    if (alertTime) alertTime.textContent = clock(new Date(crowdEval.currentAlert.timestamp));
    if (camWarning) camWarning.style.display = 'inline-flex';

    if (crowdPill) {
      crowdPill.style.color = 'var(--critical)';
      crowdPill.textContent = `🚨 CROWD DETECTED (${crowdEval.currentAlert.count})`;
    }
    if (kpiCrowd) {
      kpiCrowd.style.color = 'var(--critical)';
      kpiCrowd.textContent = `🚨 CROWD (${crowdEval.currentAlert.count} Visible)`;
    }

    // Save event on initial transition
    if (crowdEval.event && crowdEval.event.type === 'TRIGGERED' && window.terranexStorage) {
      if (window.terranexCinematic) {
        window.terranexCinematic.playChime('alert');
      }
      window.terranexStorage.addEvent({
        id: crowdEval.currentAlert.id,
        category: 'crowd',
        severity: 'critical',
        title: crowdEval.currentAlert.title,
        description: `Visible human count of ${crowdEval.currentAlert.count} exceeded threshold of ${crowdEval.threshold}. Immediate rescue assessment recommended.`,
        source: 'YOLO Crowd Monitor',
        value: crowdEval.currentAlert.count
      });
      refreshTimelineUI();
      toast('🚨 HIGH PRIORITY: Crowd detected above threshold!');
    }
  } else {
    // Normal / Subsided state
    if (banner) banner.classList.remove('active');
    if (kpiCrowdAlert) {
      kpiCrowdAlert.textContent = 'OFF';
      kpiCrowdAlert.style.color = 'var(--text-muted)';
    }
    if (alertCard) alertCard.classList.remove('triggered');
    if (alertCount) alertCount.textContent = '4+';
    if (alertTime) alertTime.textContent = clock();
    if (camWarning) camWarning.style.display = 'none';

    if (crowdPill) {
      crowdPill.style.color = 'var(--normal)';
      crowdPill.textContent = `NORMAL (≤${crowdEval.threshold})`;
    }
    if (kpiCrowd) {
      kpiCrowd.style.color = 'var(--normal)';
      kpiCrowd.textContent = `NORMAL (≤${crowdEval.threshold})`;
    }

    // Record resolution event
    if (crowdEval.event && crowdEval.event.type === 'RESOLVED' && window.terranexStorage) {
      window.terranexStorage.addEvent({
        category: 'crowd',
        severity: 'info',
        title: 'Crowd Detection Cleared',
        description: `Visible human detection count returned to normal safe threshold (≤${crowdEval.threshold}).`,
        source: 'YOLO Crowd Monitor',
        value: crowdEval.count
      });
      refreshTimelineUI();
    }
  }

  // Update Human Detection Activity Graphs with Threshold Reference Line
  updateCrowdActivityGraphs(detectionData.count || 0, crowdEval.threshold);
}

function updateCrowdActivityGraphs(count, threshold) {
  const timeLabel = clock();

  const updateChart = (chartInstance) => {
    if (!chartInstance) return;
    chartInstance.data.labels.push(timeLabel);
    chartInstance.data.datasets[0].data.push(count);
    chartInstance.data.datasets[1].data.push(threshold);
    chartInstance.data.datasets[1].label = `Crowd Alert Threshold (${threshold} Persons)`;

    if (chartInstance.data.labels.length > 30) {
      chartInstance.data.labels.shift();
      chartInstance.data.datasets[0].data.shift();
      chartInstance.data.datasets[1].data.shift();
    }
    chartInstance.update('none');
  };

  updateChart(humanDetectionActivityChart);
  updateChart(detectionTabChart);
}

// ---------------- Feature 1: Digital Twin Rover ----------------
function updateDigitalTwin(latest, analytics) {
  const twin = $('digitalTwinSvg');
  if (!twin) return;

  const getStatusColor = (val, min, max, warnLimit) => {
    if (val == null || isNaN(val)) return '#64748b';
    const num = Number(val);
    if (warnLimit !== undefined && num >= warnLimit) return '#f59e0b';
    if (min !== undefined && num <= min) return '#ef4444';
    return '#10b981';
  };

  const frontColor = getStatusColor(latest.front_cm, 20, 400);
  const leftColor = getStatusColor(latest.left_cm, 15, 400);
  const rightColor = getStatusColor(latest.right_cm, 15, 400);
  const mq2Color = getStatusColor(latest.mq2_raw, 0, 4095, 3000);
  const mq4Color = getStatusColor(latest.mq4_raw, 0, 4095, 3000);
  const dhtColor = getStatusColor(latest.temperature_c, 0, 60, 45);
  const mpuColor = Math.abs(Number(latest.tilt_x || 0)) > 30 || Math.abs(Number(latest.tilt_y || 0)) > 30 ? '#ef4444' : '#10b981';
  const encoderColor = latest.encoder_ticks != null ? '#10b981' : '#64748b';
  const camColor = state.lastDetection && state.lastDetection.available ? '#10b981' : (state.lastDetection && state.lastDetection.error ? '#ef4444' : '#64748b');

  if ($('twin-node-front')) $('twin-node-front').setAttribute('fill', frontColor);
  if ($('twin-node-left')) $('twin-node-left').setAttribute('fill', leftColor);
  if ($('twin-node-right')) $('twin-node-right').setAttribute('fill', rightColor);
  if ($('twin-node-mq2')) $('twin-node-mq2').setAttribute('fill', mq2Color);
  if ($('twin-node-mq4')) $('twin-node-mq4').setAttribute('fill', mq4Color);
  if ($('twin-node-dht')) $('twin-node-dht').setAttribute('fill', dhtColor);
  if ($('twin-node-mpu')) $('twin-node-mpu').setAttribute('fill', mpuColor);
  if ($('twin-node-encoder')) $('twin-node-encoder').setAttribute('fill', encoderColor);
  if ($('twin-node-camera')) $('twin-node-camera').setAttribute('fill', camColor);

  if ($('twinReadoutFront')) $('twinReadoutFront').textContent = latest.front_cm != null ? `${Number(latest.front_cm).toFixed(1)} cm` : 'OFFLINE';
  if ($('twinReadoutLeft')) $('twinReadoutLeft').textContent = latest.left_cm != null ? `${Number(latest.left_cm).toFixed(1)} cm` : 'OFFLINE';
  if ($('twinReadoutRight')) $('twinReadoutRight').textContent = latest.right_cm != null ? `${Number(latest.right_cm).toFixed(1)} cm` : 'OFFLINE';
  if ($('twinReadoutTilt')) $('twinReadoutTilt').textContent = latest.tilt_x != null ? `X:${Number(latest.tilt_x).toFixed(1)}° Y:${Number(latest.tilt_y).toFixed(1)}°` : 'OFFLINE';
  if ($('twinReadoutGases')) $('twinReadoutGases').textContent = `MQ2:${latest.mq2_raw ?? '—'} MQ4:${latest.mq4_raw ?? '—'}`;
  if ($('twinReadoutMotion')) $('twinReadoutMotion').textContent = `${(latest.command || 'STOP').toUpperCase()} (${latest.encoder_ticks ?? 0} ticks)`;
}

// ---------------- Feature 3: Environmental Intelligence UI ----------------
function updateEnvironmentalUI(latest, hist) {
  if ($('envCurTemp')) $('envCurTemp').textContent = latest.temperature_c != null ? `${Number(latest.temperature_c).toFixed(1)} °C` : '—';
  if ($('envCurHum')) $('envCurHum').textContent = latest.humidity_pct != null ? `${Number(latest.humidity_pct).toFixed(1)} %` : '—';
  if ($('envCurPress')) $('envCurPress').textContent = latest.pressure_hpa != null ? `${Number(latest.pressure_hpa).toFixed(1)} hPa` : '—';
  if ($('envCurMq2')) $('envCurMq2').textContent = latest.mq2_raw != null ? latest.mq2_raw : '—';
  if ($('envCurMq4')) $('envCurMq4').textContent = latest.mq4_raw != null ? latest.mq4_raw : '—';
  if ($('envCurCo')) $('envCurCo').textContent = latest.co_raw != null ? latest.co_raw : '—';

  const heatmap = $('envHeatmapGrid');
  if (heatmap && hist.length > 0) {
    const recentCells = hist.slice(-48);
    heatmap.innerHTML = recentCells.map((cell, idx) => {
      const mq2 = Number(cell.mq2_raw || 0);
      let bg = '#18202c';
      if (mq2 > 3200) bg = 'rgba(239, 68, 68, 0.7)';
      else if (mq2 > 2400) bg = 'rgba(245, 158, 11, 0.6)';
      else if (mq2 > 1200) bg = 'rgba(16, 185, 129, 0.35)';

      const tStr = cell.received_at ? clock(new Date(cell.received_at)) : `#${idx}`;
      return `
        <div class="heatmap-cell" style="background:${bg}" title="Time: ${tStr}\nMQ-2: ${mq2} ADC\nTemp: ${cell.temperature_c ?? '—'}°C">
          <span>${idx + 1}</span>
          <b>${mq2}</b>
        </div>
      `;
    }).join('');
  }

  // Update Environmental Thermal Map (Sensor-Based)
  const tempHeatmap = $('envTempHeatmapGrid');
  const curTempEl = $('thermalMapCurrent');
  const minTempEl = $('thermalMapMin');
  const maxTempEl = $('thermalMapMax');
  const freshTempEl = $('thermalMapFreshness');

  if (curTempEl) {
    curTempEl.textContent = latest.temperature_c != null ? `${Number(latest.temperature_c).toFixed(1)} °C` : '—';
  }

  if (latest.received_at && freshTempEl) {
    const ageSec = Math.max(0, (Date.now() - new Date(latest.received_at).getTime()) / 1000);
    freshTempEl.textContent = ageSec < 5 ? `${ageSec.toFixed(1)}s ago (FRESH)` : `${ageSec.toFixed(0)}s ago (STALE)`;
    freshTempEl.style.color = ageSec < 5 ? 'var(--normal)' : 'var(--warning)';
  }

  // Calculate session Min/Max observed temperatures
  const validTemps = (hist || [])
    .map(c => Number(c.temperature_c))
    .filter(n => !isNaN(n) && n > -40 && n < 125);

  if (validTemps.length > 0) {
    const minT = Math.min(...validTemps);
    const maxT = Math.max(...validTemps);
    if (minTempEl) minTempEl.textContent = `${minT.toFixed(1)} °C`;
    if (maxTempEl) maxTempEl.textContent = `${maxT.toFixed(1)} °C`;
  }

  if (tempHeatmap && hist.length > 0) {
    const recentCells = hist.slice(-48);
    tempHeatmap.innerHTML = recentCells.map((cell, idx) => {
      const tempVal = cell.temperature_c != null ? Number(cell.temperature_c) : null;
      let bg = '#18202c';
      let label = '—';
      if (tempVal != null && !isNaN(tempVal)) {
        label = `${tempVal.toFixed(1)}°`;
        if (tempVal > 35) bg = 'rgba(239, 68, 68, 0.9)'; // High (>35°C): red
        else if (tempVal > 28) bg = 'rgba(249, 115, 22, 0.8)'; // Elevated (28-35°C): orange
        else if (tempVal >= 22) bg = 'rgba(234, 179, 8, 0.7)'; // Moderate (22-28°C): yellow
        else bg = 'rgba(16, 185, 129, 0.7)'; // Cool (<22°C): green
      }

      const tStr = cell.received_at ? clock(new Date(cell.received_at)) : `#${idx}`;
      return `
        <div class="heatmap-cell" style="background:${bg}" title="Time: ${tStr}\nTemp: ${tempVal != null ? tempVal + '°C' : 'UNKNOWN'}\nDHT11 Sensor Observation">
          <span>${idx + 1}</span>
          <b>${label}</b>
        </div>
      `;
    }).join('');
  }
}

// ---------------- Feature 4: Anomaly Detection UI ----------------
function updateAnomaliesUI(anomalies) {
  const tableBody = $('anomalyTableBody');
  if (!tableBody) return;

  const list = (window.terranexAnalytics && window.terranexAnalytics.recentAnomalies) || [];
  if (list.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">No rule-based anomalies detected in current operating window.</td></tr>`;
    return;
  }

  tableBody.innerHTML = list.slice(0, 15).map(a => `
    <tr>
      <td><span class="pill ${a.severity === 'critical' ? 'crit' : 'warn'}"><i class="dot"></i>${a.severity.toUpperCase()}</span></td>
      <td><b>${a.sensor}</b></td>
      <td>${a.reading}</td>
      <td>${a.baseline}</td>
      <td><span style="color:${a.severity === 'critical' ? 'var(--critical)' : 'var(--warning)'};font-weight:600;">${a.deviation}</span></td>
      <td style="max-width:240px;font-size:11px;color:var(--text-muted);">${a.explanation}</td>
      <td style="font-family:monospace;font-size:10px;">${clock(new Date(a.timestamp))}</td>
    </tr>
  `).join('');
}

// ---------------- Feature 13: Sensor Diagnostics UI ----------------
function updateDiagnosticsUI(diagnostics) {
  const tableBody = $('diagnosticsTableBody');
  if (!tableBody || !diagnostics) return;

  tableBody.innerHTML = diagnostics.map(d => {
    let pillClass = 'ok';
    if (d.status === 'WARNING') pillClass = 'warn';
    else if (d.status === 'OFFLINE' || d.status === 'STALE') pillClass = 'crit';
    else if (d.status === 'UNKNOWN') pillClass = '';

    return `
      <tr>
        <td><b>${d.name}</b></td>
        <td><code>${d.key}</code></td>
        <td>${d.value} <small style="color:var(--text-sub);">${d.unit}</small></td>
        <td><span class="pill ${pillClass}"><i class="dot"></i>${d.status}</span></td>
        <td style="color:var(--text-muted);">${d.message}</td>
        <td>${d.confidence}%</td>
      </tr>
    `;
  }).join('');
}

// ---------------- Feature 2: Predictive Maintenance UI ----------------
function updatePredictiveMaintenanceUI(advisories) {
  const container = $('predictiveAdvisoryContainer');
  if (!container) return;

  if (advisories && advisories.length > 0 && window.terranexStorage) {
    advisories.forEach(adv => window.terranexStorage.saveMaintenanceAdvisory(adv));
  }

  if (window.terranexStorage) {
    window.terranexStorage.getMaintenanceHistory().then(history => {
      if (history.length === 0) {
        container.innerHTML = `<div style="padding:16px;color:var(--text-muted);text-align:center;">No predictive maintenance actions currently required. All monitored components operating nominally.</div>`;
        return;
      }

      container.innerHTML = history.slice(0, 8).map(adv => `
        <div class="advisory-card ${adv.severity}">
          <div class="advisory-header">
            <span class="advisory-title">${adv.component}</span>
            <span class="pill ${adv.severity === 'critical' ? 'crit' : 'warn'}">${adv.severity.toUpperCase()}</span>
          </div>
          <div style="font-size:12px;color:var(--text);">${adv.condition}</div>
          <div style="font-size:11px;color:var(--text-muted);background:var(--bg-panel-alt);padding:8px;border-radius:4px;">
            <b>Action Recommendation:</b> ${adv.recommendation}
          </div>
          <div style="font-size:10px;color:var(--text-sub);display:flex;justify-content:space-between;">
            <span>Rule Evaluation Time: ${clock(new Date(adv.timestamp))}</span>
            <span>Advisory Notice (Non-Mechanical Certification)</span>
          </div>
        </div>
      `).join('');
    });
  }
}

// ---------------- Feature 15: Rover Performance Score UI ----------------
function updatePerformanceScoreUI(scoreObj) {
  if (!scoreObj) return;

  if ($('perfScoreValue')) $('perfScoreValue').textContent = scoreObj.total;
  if ($('headerScorePill')) $('headerScorePill').textContent = `${scoreObj.total}/100`;

  const bd = scoreObj.breakdown;
  if ($('perfScoreBreakdown') && bd) {
    $('perfScoreBreakdown').innerHTML = Object.entries(bd).map(([k, item]) => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(44,51,66,0.3);font-size:11px;">
        <span style="color:var(--text-muted);">${item.desc}:</span>
        <b>${item.score} / ${item.max} pts</b>
      </div>
    `).join('');
  }
}

// ---------------- Feature 14: Network Reliability UI ----------------
function updateNetworkReliabilityUI() {
  const stats = state.networkStats;
  if ($('netLatency')) $('netLatency').textContent = `${stats.latencyMs} ms`;
  if ($('netFailures')) $('netFailures').textContent = stats.failureCount;
  if ($('netTotalReqs')) $('netTotalReqs').textContent = stats.totalRequests;
  if ($('netLastSuccess')) $('netLastSuccess').textContent = stats.lastSuccess ? clock(new Date(stats.lastSuccess)) : '—';
}

// ---------------- Feature 16: Operator Decision Support UI ----------------
function updateDecisionSupportUI(analytics) {
  const container = $('decisionSupportList');
  if (!container) return;

  const issues = [];

  // Active Crowd Alert
  if (window.terranexAnalytics && window.terranexAnalytics.isCrowdActive) {
    const ca = window.terranexAnalytics.activeCrowdAlert;
    issues.push({
      title: '🚨 High-Priority Crowd Detection Alert',
      source: 'YOLO Vision Inference Engine',
      why: `Visible person detection count of ${ca.count} exceeded threshold of ${ca.threshold}.`,
      supporting: `Confidence: ${ca.confidence} | Model: ${ca.model} | Camera: ${ca.cameraStatus}`,
      freshness: clock(new Date(ca.timestamp)),
      action: ca.action,
      severity: 'critical'
    });
  }

  // Telemetry stale
  if (state.lastTelemetry.received_at) {
    const age = Date.now() - new Date(state.lastTelemetry.received_at).getTime();
    if (age > 8000) {
      issues.push({
        title: 'Telemetry Heartbeat Timeout',
        source: 'Main ESP32 Wi-Fi / Flask API',
        why: `No packet received for ${(age / 1000).toFixed(1)}s (Heartbeat deadline: 8.0s).`,
        supporting: `Last RSSI: ${state.lastTelemetry.wifi_rssi ?? '—'} dBm`,
        freshness: `${(age / 1000).toFixed(1)}s ago`,
        action: 'Verify rover battery power and check 2.4GHz Wi-Fi router connectivity.',
        severity: 'critical'
      });
    }
  }

  // Critical Gas Elevation
  if (Number(state.lastTelemetry.mq2_raw || 0) >= 3000) {
    issues.push({
      title: 'Combustible Gas Sensor Elevation (MQ-2)',
      source: 'MQ-2 Gas Sensor (GPIO 34 ADC)',
      why: `Analog reading ${state.lastTelemetry.mq2_raw} exceeds caution threshold 3000.`,
      supporting: `MQ-4: ${state.lastTelemetry.mq4_raw ?? '—'} | Temp: ${state.lastTelemetry.temperature_c ?? '—'}°C`,
      freshness: clock(new Date(state.lastTelemetry.received_at)),
      action: 'Ensure rover explosion-proof compliance or retreat to ventilated sector.',
      severity: 'critical'
    });
  }

  if (issues.length === 0) {
    container.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text-muted);">No urgent operator decisions required. Nominal operating profile confirmed.</div>`;
    return;
  }

  container.innerHTML = issues.map((iss, idx) => `
    <div class="advisory-card ${iss.severity}">
      <div class="advisory-header">
        <span class="advisory-title">${iss.title}</span>
        <span class="pill ${iss.severity === 'critical' ? 'crit' : 'warn'}">${iss.severity.toUpperCase()}</span>
      </div>
      <div class="advisory-grid">
        <div class="advisory-item"><span>Observation Source:</span><b>${iss.source}</b></div>
        <div class="advisory-item"><span>Trigger Condition:</span><b>${iss.why}</b></div>
        <div class="advisory-item"><span>Corroborating Telemetry:</span><b>${iss.supporting}</b></div>
        <div class="advisory-item"><span>Observation Timestamp:</span><b>${iss.freshness}</b></div>
      </div>
      <div style="font-size:12px;color:var(--text);background:var(--bg-panel-alt);padding:8px 10px;border-radius:4px;border:1px solid var(--border);">
        <b>Suggested Inspection Protocol:</b> ${iss.action}
      </div>
      <div class="advisory-actions">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--text-muted);font-size:11px;">
          <input type="checkbox" id="ack_chk_${idx}"> Acknowledge Advisory (Logged in Audit Journal)
        </label>
      </div>
    </div>
  `).join('');
}

// ---------------- Camera & YOLO Detection Stream ----------------
async function inferOnce() {
  try {
    const data = await fetchJSON('/api/detection');
    state.lastDetection = data;

    const feed = $('feed');
    const video = $('video');
    const hudModel = $('hudModel');
    const hudCount = $('hudCount');
    const hudTime = $('hudTime');
    const statusText = $('statusText');

    if (data.available && data.annotated_image) {
      const src = 'data:image/jpeg;base64,' + data.annotated_image;
      if (video) video.src = src;
      if (feed) feed.classList.add('live');
      state.lastFrameB64 = src;

      if ($('btnSnap')) $('btnSnap').disabled = false;
      if ($('camFullBtnSnap')) $('camFullBtnSnap').disabled = false;

      // Update dedicated camera page feed as well
      const camFullVideo = $('camFullVideo');
      const camFullFeed = $('camFullFeed');
      if (camFullVideo) camFullVideo.src = src;
      if (camFullFeed) camFullFeed.classList.add('live');

      if ($('peopleCount')) $('peopleCount').textContent = data.count;
      if ($('camCountLabel')) $('camCountLabel').textContent = data.count;
      if ($('camConfLabel')) {
        const confs = (data.detections || []).map(d => d.confidence).filter(c => c != null);
        const avg = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length * 100).toFixed(1) : '92.5';
        $('camConfLabel').textContent = `${avg}%`;
      }
      if (hudCount) hudCount.textContent = `PERSONS ${data.count}`;
      if (hudModel) hudModel.textContent = `YOLO ${data.model || ''}`;
      if (hudTime) hudTime.textContent = clock(new Date(data.updated_at));
      if (statusText) statusText.textContent = data.human_detected ? 'PERSON DETECTED' : 'Monitoring Active';

      // Feature 3: Evaluate Crowd Alert State Machine
      processCrowdDetection(data);

      // Transition-based Deduplicated Event Logging (Feature 5)
      if (data.count !== state.lastHumanDetectedCount) {
        state.lastHumanDetectedCount = data.count;
        if (data.count > 0) {
          const summary = data.detections.map(x => `person ${(x.confidence * 100).toFixed(1)}%`).join(', ');
          addDetectionLogRow(data.updated_at, data.count, summary);

          if (window.terranexStorage) {
            window.terranexStorage.addDetection({
              count: data.count,
              human_detected: true,
              updated_at: data.updated_at,
              summary
            });
            window.terranexStorage.addEvent({
              category: 'detection',
              severity: 'warning',
              title: `Person Sighting (${data.count} visible)`,
              description: summary,
              source: 'YOLO 11n'
            });
          }
        }
      }

      // Feature 7: AI Confidence Monitor Updates
      updateConfidenceMonitorUI(data);

    } else if (data.error) {
      if (statusText) statusText.textContent = 'Camera / Model Error';
      if (hudTime) hudTime.textContent = 'ERROR';
      processCrowdDetection({ available: false, error: data.error });
      updateConfidenceMonitorUI(data);
    }

    // Update Floating Assistant Camera & Model indicators
    if ($('astCamera')) {
      $('astCamera').textContent = data.available ? 'STREAMING' : (data.error ? 'ERROR' : 'IDLE');
      $('astCamera').style.color = data.available ? 'var(--normal)' : (data.error ? 'var(--critical)' : 'var(--text-muted)');
    }
    if ($('astModel')) {
      $('astModel').textContent = `YOLO ${data.model || '11n'}`;
      $('astModel').style.color = 'var(--normal)';
    }
  } catch (err) {
    if ($('statusText')) $('statusText').textContent = err.message;
  }
}

function addDetectionLogRow(timestamp, count, summary) {
  const logBox = $('detectionLog');
  if (!logBox) return;

  const none = logBox.querySelector('.none');
  if (none) logBox.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'log-entry warn';
  row.innerHTML = `
    <time class="log-time">${clock(new Date(timestamp))}</time>
    <div class="log-content"><b>${count} Person(s):</b> ${summary}</div>
  `;
  logBox.prepend(row);
}

// ---------------- Feature 7: Confidence Monitor UI ----------------
function updateConfidenceMonitorUI(detection) {
  const aiEval = window.terranexAnalytics
    ? window.terranexAnalytics.evaluateAiConfidence(detection, state.health)
    : null;
  if (!aiEval) return;

  if ($('confLevelBadge')) {
    $('confLevelBadge').textContent = aiEval.level;
    $('confLevelBadge').className = `pill ${aiEval.class}`;
  }
  if ($('confScoreDisplay')) $('confScoreDisplay').textContent = `${aiEval.confidenceVal}%`;
  if ($('confExplanationText')) $('confExplanationText').textContent = aiEval.explanation;

  // Update chart
  if (confidenceChart && detection.available) {
    const timeLabel = clock(new Date(detection.updated_at));
    confidenceChart.data.labels.push(timeLabel);
    confidenceChart.data.datasets[0].data.push(Number(aiEval.confidenceVal));
    if (confidenceChart.data.labels.length > 25) {
      confidenceChart.data.labels.shift();
      confidenceChart.data.datasets[0].data.shift();
    }
    confidenceChart.update('none');
  }
}

// ---------------- Feature 6: Visual Change Memory UI ----------------
async function refreshVisualMemoryUI() {
  if (!window.terranexVisualMemory) return;

  const snapshots = await window.terranexVisualMemory.loadSnapshots();
  const gallery = $('snapshotGallery');
  const selA = $('selectSnapshotA');
  const selB = $('selectSnapshotB');

  if (selA && selB) {
    const options = snapshots.map(s => `<option value="${s.id}">${clock(new Date(s.timestamp))} — ${s.label} (${s.detectionsCount} persons)</option>`).join('');
    selA.innerHTML = '<option value="">Select Baseline Snapshot A</option>' + options;
    selB.innerHTML = '<option value="">Select Comparison Snapshot B</option>' + options;
  }

  if (gallery) {
    if (snapshots.length === 0) {
      gallery.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-muted);">No snapshots saved in Visual Memory. Capture snapshots using "Save Snapshot" button.</div>`;
      return;
    }

    gallery.innerHTML = snapshots.map(s => `
      <div class="panel" style="padding:8px;">
        <div style="aspect-ratio:4/3;background:#000;overflow:hidden;border-radius:4px;margin-bottom:6px;">
          <img src="${s.image}" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="font-size:11px;font-weight:600;">${s.label}</div>
        <div style="font-size:10px;color:var(--text-sub);">${new Date(s.timestamp).toLocaleString()}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span class="pill sm">${s.detectionsCount} visible</span>
          <button class="sm danger" onclick="deleteSnapshotItem('${s.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }
}

window.deleteSnapshotItem = async (id) => {
  if (confirm('Delete this stored snapshot from Visual Change Memory?')) {
    await window.terranexVisualMemory.deleteSnapshot(id);
    refreshVisualMemoryUI();
    toast('Snapshot deleted');
  }
};

function initVisualMemoryControls() {
  const btnCompare = $('btnRunComparison');
  if (btnCompare) {
    btnCompare.addEventListener('click', async () => {
      const idA = $('selectSnapshotA').value;
      const idB = $('selectSnapshotB').value;
      if (!idA || !idB) {
        toast('Please select both Snapshot A and Snapshot B');
        return;
      }
      window.terranexVisualMemory.selectSnapshots(idA, idB);

      $('previewImgA').src = window.terranexVisualMemory.selectedA.image;
      $('previewImgB').src = window.terranexVisualMemory.selectedB.image;

      const canvas = $('diffCanvas');
      try {
        const result = await window.terranexVisualMemory.computeDifference(canvas);
        $('diffMetrics').textContent = `Computed difference: ${result.changePct}% altered pixels between ${clock(new Date(result.timestampA))} and ${clock(new Date(result.timestampB))}`;
      } catch (err) {
        toast(err.message);
      }
    });
  }
}

// ---------------- Feature 8: Multi-Modal Evidence Fusion UI ----------------
function refreshEvidenceFusionUI() {
  if (!window.terranexEvidenceFusion) return;

  const detections = state.lastDetection.detections || [];
  const telemetry = state.telemetryHistory;
  const anomalies = window.terranexAnalytics ? window.terranexAnalytics.recentAnomalies : [];

  const fused = window.terranexEvidenceFusion.fuseEvidence(
    state.lastDetection.count > 0 ? [state.lastDetection] : [],
    telemetry,
    [],
    anomalies
  );

  const container = $('fusionRecordsList');
  if (!container) return;

  if (fused.length === 0) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">No multi-modal correlation clusters detected in current inspection window.</div>`;
    return;
  }

  container.innerHTML = fused.map(rec => `
    <div class="panel" style="border-left:4px solid var(--accent);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b>${rec.anchorLabel}</b>
        <span class="pill"><time>${new Date(rec.eventTime).toLocaleTimeString()}</time></span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${rec.rationale}</div>
      <div style="background:var(--bg-surface);padding:8px;border-radius:4px;border:1px solid var(--border);">
        ${rec.sources.map(s => `
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid rgba(44,51,66,0.3);">
            <span style="color:var(--accent);font-weight:600;">${s.source} (${s.timeDelta}):</span>
            <span style="color:var(--text);">${s.description}</span>
          </div>
        `).join('')}
      </div>
      <div style="font-size:10px;color:var(--text-sub);margin-top:6px;font-style:italic;">${rec.disclaimer}</div>
    </div>
  `).join('');
}

// ---------------- Feature 10: Root Cause Explorer UI ----------------
function refreshRootCauseUI() {
  const container = $('rootCauseTreeContainer');
  if (!container || !window.terranexEvidenceFusion) return;

  const anomalies = (window.terranexAnalytics && window.terranexAnalytics.recentAnomalies) || [];
  const activeIncident = anomalies[0] || {
    title: 'Baseline Inspection State',
    timestamp: new Date().toISOString(),
    sources: [
      { source: 'Ultrasonic Sensors', description: 'Front clearance nominal', timeDelta: '0.0s' },
      { source: 'MQ Gas Array', description: 'Combustible gases below threshold', timeDelta: '+0.2s' },
      { source: 'MPU6500', description: 'Chassis stable on level surface', timeDelta: '-0.1s' }
    ]
  };

  const tree = window.terranexEvidenceFusion.buildCausalTree(activeIncident);
  if (!tree) return;

  container.innerHTML = `
    <div class="panel" style="border:1px solid var(--accent);margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:4px;">Incident Investigation: ${tree.incident.sensor ? tree.incident.sensor + ' Anomaly' : tree.incident.title}</div>
      <div style="font-size:11px;color:var(--text-sub);">${tree.disclaimer}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${tree.nodes.filter(n => n.type !== 'incident').map(n => `
        <div style="padding:10px;background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;border-left:3px solid ${n.type === 'hypothesis' ? 'var(--warning)' : 'var(--accent)'};">
          <div style="font-size:10px;text-transform:uppercase;color:var(--text-sub);">${n.type}</div>
          <div style="font-size:12px;color:var(--text);margin-top:2px;">${n.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------------- Feature 9: Mission Replay Studio UI ----------------
function refreshMissionReplayUI() {
  if (!window.terranexMissionReplay) return;

  window.terranexMissionReplay.loadSessionFromStorage().then(session => {
    const countEl = $('replayPacketCount');
    if (countEl) countEl.textContent = `${session.length} telemetry packets loaded from browser storage`;

    const slider = $('replaySlider');
    if (slider) {
      slider.max = Math.max(0, session.length - 1);
      slider.value = 0;
    }

    renderReplayMarkers();
  });
}

function renderReplayMarkers() {
  const container = $('timelineMarkersContainer');
  if (!container || !window.terranexMissionReplay) return;

  const markers = window.terranexMissionReplay.getTimelineMarkers();
  container.innerHTML = markers.map(m => `
    <div class="timeline-marker ${m.type === 'detection' ? 'det' : (m.type === 'snapshot' ? 'snap' : 'alr')}"
         style="left:${m.pct}%;"
         title="${m.label} (${clock(new Date(m.time))})"></div>
  `).join('');
}

function initReplayControls() {
  if (!window.terranexMissionReplay) return;

  window.terranexMissionReplay.setFrameCallback((frame) => {
    const banner = $('replayBanner');
    if (banner) banner.classList.add('visible');
    $('replayBannerTime').textContent = clock(new Date(frame.timestamp));

    if ($('replaySlider')) $('replaySlider').value = frame.index;
    if ($('replayTimestampDisplay')) $('replayTimestampDisplay').textContent = `${clock(new Date(frame.timestamp))} (Frame ${frame.index + 1}/${frame.totalFrames})`;

    updateOverviewKPIs(frame.telemetry);
    renderSensorGrid(frame.telemetry);
    updateDigitalTwin(frame.telemetry, null);

    if (frame.snapshot && $('replaySnapshotImg')) {
      $('replaySnapshotImg').src = frame.snapshot.image;
      $('replaySnapshotBox').style.display = 'block';
    }
  });

  const btnPlay = $('btnReplayPlay');
  const btnPause = $('btnReplayPause');
  const btnStop = $('btnReplayStop');
  const slider = $('replaySlider');
  const speedSelect = $('replaySpeedSelect');

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      try {
        window.terranexMissionReplay.startReplay();
        state.isReplayMode = true;
        toast('Mission replay started');
      } catch (e) {
        toast(e.message);
      }
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      window.terranexMissionReplay.pauseReplay();
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', () => {
      window.terranexMissionReplay.stopReplay();
      state.isReplayMode = false;
      const banner = $('replayBanner');
      if (banner) banner.classList.remove('visible');
      toast('Returned to live telemetry');
    });
  }

  if (slider) {
    slider.addEventListener('input', (e) => {
      window.terranexMissionReplay.seek(Number(e.target.value));
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      window.terranexMissionReplay.setSpeed(Number(e.target.value));
    });
  }

  const exitBtn = $('btnExitReplay');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      window.terranexMissionReplay.stopReplay();
      const banner = $('replayBanner');
      if (banner) banner.classList.remove('visible');
    });
  }
}

// ---------------- Feature 11: What-If Simulation Lab UI ----------------
function initSimulationControls() {
  const btnRun = $('btnRunSimulation');
  if (!btnRun) return;

  btnRun.addEventListener('click', () => {
    const customConfig = {
      frontCollisionThreshold: Number($('simFrontThreshold').value),
      mq2GasThreshold: Number($('simMq2Threshold').value),
      mq4GasThreshold: Number($('simMq4Threshold').value),
      tiltLimitThreshold: Number($('simTiltThreshold').value),
      crowdThreshold: Number($('simCrowdThreshold').value)
    };

    if (!window.terranexAnalytics) return;
    const results = window.terranexAnalytics.runSimulation(state.telemetryHistory, customConfig);

    if ($('simOriginalAlerts')) $('simOriginalAlerts').textContent = results.originalAlertsCount;
    if ($('simSimulatedAlerts')) $('simSimulatedAlerts').textContent = results.simulatedAlertsCount;
    if ($('simDeltaAlerts')) {
      $('simDeltaAlerts').textContent = `${results.delta >= 0 ? '+' : ''}${results.delta}`;
      $('simDeltaAlerts').style.color = results.delta > 0 ? 'var(--warning)' : 'var(--normal)';
    }

    const logEl = $('simResultsLog');
    if (logEl) {
      if (results.triggeredSimulations.length === 0) {
        logEl.innerHTML = `<div style="padding:14px;color:var(--text-muted);text-align:center;">No simulated threshold violations triggered across analyzed history.</div>`;
      } else {
        logEl.innerHTML = results.triggeredSimulations.map(s => `
          <div class="log-entry warn" style="margin-bottom:4px;">
            <time class="log-time">${clock(new Date(s.timestamp))}</time>
            <div class="log-content"><b>Simulation Alert:</b> ${s.reasons.join('; ')}</div>
          </div>
        `).join('');
      }
    }
  });

  const btnReset = $('btnResetSimulation');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      $('simFrontThreshold').value = 25;
      $('simCrowdThreshold').value = 4;
      $('simMq2Threshold').value = 3000;
      $('simMq4Threshold').value = 3000;
      $('simTiltThreshold').value = 30;
      toast('Simulation thresholds reset to defaults');
    });
  }
}

// ---------------- Feature 12: Smart Event Timeline UI ----------------
function refreshTimelineUI() {
  if (!window.terranexStorage) return;

  const categoryFilter = $('timelineCategoryFilter') ? $('timelineCategoryFilter').value : 'all';
  const severityFilter = $('timelineSeverityFilter') ? $('timelineSeverityFilter').value : 'all';
  const search = $('timelineSearchInput') ? $('timelineSearchInput').value : '';

  window.terranexStorage.getEvents({
    category: categoryFilter,
    severity: severityFilter,
    search
  }).then(events => {
    const container = $('timelineEventsList');
    const miniContainer = $('miniTimelinePreview');

    if (container) {
      if (events.length === 0) {
        container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">No timeline events match the selected criteria.</div>`;
      } else {
        container.innerHTML = events.map(evt => `
          <div class="log-entry ${evt.severity === 'critical' ? 'crit' : (evt.severity === 'warning' ? 'warn' : 'info')}">
            <time class="log-time">${clock(new Date(evt.timestamp))}</time>
            <div class="log-content">
              <b>${evt.title}</b> — ${evt.description}
              <div style="font-size:10px;color:var(--text-sub);margin-top:2px;">Source: ${evt.source} | Category: ${evt.category}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="sm" onclick="ackTimelineEvent('${evt.id}')" ${evt.acknowledged ? 'disabled' : ''}>
                ${evt.acknowledged ? 'Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    if (miniContainer) {
      if (events.length === 0) {
        miniContainer.innerHTML = `<div class="none" style="padding:10px;color:var(--text-muted);text-align:center;">No recent events recorded.</div>`;
      } else {
        miniContainer.innerHTML = events.slice(0, 4).map(evt => `
          <div class="log-entry ${evt.severity === 'critical' ? 'crit' : 'warn'}" style="padding:4px 8px;font-size:10px;">
            <time class="log-time">${clock(new Date(evt.timestamp))}</time>
            <div class="log-content" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><b>${evt.title}</b></div>
          </div>
        `).join('');
      }
    }
  });
}

window.ackTimelineEvent = async (id) => {
  if (window.terranexStorage) {
    await window.terranexStorage.updateEvent(id, { acknowledged: true });
    refreshTimelineUI();
    toast('Event acknowledged');
  }
};

// ---------------- Feature 17 & 18: Inspection Journal & Reports UI ----------------
function refreshJournalUI() {
  if (!window.terranexStorage) return;

  window.terranexStorage.getJournalNotes().then(notes => {
    const listEl = $('journalNotesList');
    if (!listEl) return;

    if (notes.length === 0) {
      listEl.innerHTML = `<div style="padding:14px;color:var(--text-muted);text-align:center;">No operator notes recorded for this session.</div>`;
      return;
    }

    listEl.innerHTML = notes.map(n => `
      <div class="panel" style="margin-bottom:8px;padding:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-sub);margin-bottom:4px;">
          <span>${n.author}</span>
          <time>${new Date(n.timestamp).toLocaleString()}</time>
        </div>
        <div style="font-size:12px;color:var(--text);">${n.text}</div>
      </div>
    `).join('');
  });
}

function initJournalControls() {
  const btnSave = $('btnSaveJournalNote');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const input = $('journalNoteInput');
      if (!input || !input.value.trim()) return;
      await window.terranexStorage.saveJournalNote(input.value.trim());
      input.value = '';
      refreshJournalUI();
      toast('Note saved to session journal');
    });
  }

  const btnExport = $('btnExportJournalCsv');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const notes = await window.terranexStorage.getJournalNotes();
      const csv = 'Timestamp,Author,Note\n' + notes.map(n => `"${n.timestamp}","${n.author}","${n.text.replace(/"/g, '""')}"`).join('\n');
      downloadBlob(csv, 'terranex-journal.csv', 'text/csv');
    });
  }
}

function generateReportPreview() {
  const preview = $('reportPreviewContent');
  if (!preview) return;

  const uptimeSec = Math.floor((Date.now() - state.startedAt) / 1000);
  const uptimeStr = `${pad(Math.floor(uptimeSec / 3600))}:${pad(Math.floor((uptimeSec % 3600) / 60))}:${pad(uptimeSec % 60)}`;
  const crowdAlertsCount = (window.terranexAnalytics && window.terranexAnalytics.crowdAlertHistory) ? window.terranexAnalytics.crowdAlertHistory.length : 0;

  preview.innerHTML = `
    <div style="border:1px solid var(--border);padding:24px;background:#fff;color:#111;border-radius:4px;font-family:serif;">
      <h2 style="margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;color:#0f172a;">TERRANEX Industrial Inspection & Rescue Report</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Generated: ${new Date().toLocaleString()} | Rover ID: ${state.lastTelemetry.rover_id || 'ROVER_1'} | Session Duration: ${uptimeStr}</div>
      
      <h4 style="border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:16px;color:#1e293b;">1. Mission & Telemetry Executive Summary</h4>
      <p style="font-size:12px;line-height:1.6;margin-top:6px;">
        Operational deployment completed with ${state.telemetryHistory.length} recorded telemetry packets.
        Wi-Fi RSSI link maintained at ${state.lastTelemetry.wifi_rssi ?? '—'} dBm.
        Ultrasonic frontal clearance: ${state.lastTelemetry.front_cm ?? '—'} cm.
      </p>

      <h4 style="border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:16px;color:#1e293b;">2. Human Detection & Crowd Alert Audit</h4>
      <p style="font-size:12px;line-height:1.6;margin-top:6px;">
        Visible person sightings recorded: ${state.lastDetection.count || 0}.
        Crowd Threshold Configured: ${window.terranexAnalytics ? window.terranexAnalytics.crowdThreshold : 4} visible people.
        High-Priority Crowd Alert Events: ${crowdAlertsCount}.
        Inference checkpoint: YOLO 11n (${state.lastDetection.model || 'yolo11n.pt'}).
      </p>

      <h4 style="border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:16px;color:#1e293b;">3. Environmental & Atmospheric Audit</h4>
      <p style="font-size:12px;line-height:1.6;margin-top:6px;">
        Temperature: ${state.lastTelemetry.temperature_c ?? '—'} °C | Humidity: ${state.lastTelemetry.humidity_pct ?? '—'} % |
        MQ-2 Raw ADC: ${state.lastTelemetry.mq2_raw ?? '—'} | MQ-4 Raw ADC: ${state.lastTelemetry.mq4_raw ?? '—'}.
      </p>

      <h4 style="border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:16px;color:#1e293b;">4. Operational Compliance & Advisory Notice</h4>
      <p style="font-size:10px;color:#64748b;margin-top:12px;line-height:1.5;">
        NOTICE: This document is an automated supervisory summary compiled from real-time rover telemetry and assistive YOLO inference.
        Readings represent raw uncalibrated sensor data. Visual classifications require confirmation by certified rescue personnel.
      </p>
    </div>
  `;
}

function initReportControls() {
  const btnPrint = $('btnPrintReport');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  const btnExportCsv = $('btnExportReportCsv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const hist = state.telemetryHistory;
      if (!hist.length) return toast('No telemetry history to export');
      const keys = Object.keys(hist[0]);
      const csv = keys.join(',') + '\n' + hist.map(row => keys.map(k => JSON.stringify(row[k] ?? '')).join(',')).join('\n');
      downloadBlob(csv, `terranex-report-${Date.now()}.csv`, 'text/csv');
    });
  }
}

// ---------------- Existing Dashboard Controls & API Preservation ----------------
function initExistingControls() {
  // Start / Pause / Stop Monitoring
  const btnStart = $('btnStart');
  const btnPause = $('btnPause');
  const btnStop = $('btnStop');

  if (btnStart) {
    btnStart.onclick = async () => {
      try {
        await fetchJSON('/api/monitoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true })
        });
        state.running = true;
        state.paused = false;
        if ($('statusText')) $('statusText').textContent = 'Monitoring Active';
        btnStart.disabled = true;
        if (btnPause) btnPause.disabled = false;
        if (btnStop) btnStop.disabled = false;
        tick();
        toast('Inference monitoring started');
      } catch (e) {
        toast(e.message);
      }
    };
  }

  if (btnPause) {
    btnPause.onclick = async () => {
      state.paused = true;
      clearTimeout(state.timer);
      await fetchJSON('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      });
      btnPause.disabled = true;
      if (btnStart) btnStart.disabled = false;
      if ($('statusText')) $('statusText').textContent = 'Paused';
      toast('Monitoring paused');
    };
  }

  if (btnStop) {
    btnStop.onclick = async () => {
      state.running = false;
      state.paused = false;
      clearTimeout(state.timer);
      await fetchJSON('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      });
      if (btnStart) btnStart.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      if ($('statusText')) $('statusText').textContent = 'Stopped';
      toast('Monitoring stopped');
    };
  }

  // Fullscreen
  const btnFull = $('btnFull');
  if (btnFull) {
    btnFull.onclick = () => {
      const feed = $('feed');
      if (!feed) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else feed.requestFullscreen?.();
    };
  }

  // Save Snapshot
  const snapHandler = async () => {
    if (!state.lastFrameB64) return toast('No image frame available to capture');
    if (window.terranexVisualMemory) {
      await window.terranexVisualMemory.captureCurrentFrame(
        state.lastFrameB64,
        state.lastDetection.count || 0,
        'Manual Operator Snapshot',
        state.lastTelemetry
      );
    }
    const a = document.createElement('a');
    a.href = state.lastFrameB64;
    a.download = `terranex-yolo-${Date.now()}.jpg`;
    a.click();
    toast('Snapshot captured & stored in Visual Memory');
  };

  if ($('btnSnap')) $('btnSnap').onclick = snapHandler;
  if ($('camFullBtnSnap')) $('camFullBtnSnap').onclick = snapHandler;

  // Manual Drive Controls
  document.querySelectorAll('[data-cmd]').forEach(b => {
    b.onclick = async () => {
      try {
        const cmd = b.dataset.cmd;
        const res = await fetchJSON('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });
        if ($('commandStatus')) $('commandStatus').textContent = `Last command: ${res.command.toUpperCase()}`;
        toast(`Command sent: ${res.command.toUpperCase()}`);
      } catch (e) {
        toast(e.message);
      }
    };
  });

  // Settings Save (Including Crowd Threshold)
  const btnSaveSettings = $('saveSettings');
  if (btnSaveSettings) {
    btnSaveSettings.onclick = async () => {
      try {
        const url = $('cameraUrl').value;
        const conf = Number($('conf').value);
        const crowdThresh = Number($('settingCrowdThreshold').value) || 4;

        if (window.terranexAnalytics) {
          window.terranexAnalytics.setCrowdThreshold(crowdThresh);
        }

        await fetchJSON('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_url: url, confidence: conf })
        });
        state.pollInterval = Number($('interval').value) || 800;
        toast(`Settings saved (Crowd Threshold: ${crowdThresh})`);
      } catch (e) {
        toast(e.message);
      }
    };
  }

  // Crowd Alert Operator Acknowledgment
  const btnAckCrowd = $('btnAckCrowdAlert');
  if (btnAckCrowd) {
    btnAckCrowd.onclick = async () => {
      const note = $('crowdOperatorNote') ? $('crowdOperatorNote').value.trim() : '';
      if (window.terranexAnalytics) {
        const acked = window.terranexAnalytics.acknowledgeCrowdAlert(note);
        if (acked && window.terranexStorage) {
          window.terranexStorage.addEvent({
            category: 'crowd',
            severity: 'info',
            title: 'Crowd Alert Acknowledged by Operator',
            description: `Operator acknowledged crowd sighting of ${acked.count} people. Audit note: "${note || 'Assessment in progress'}"`,
            source: 'Operator Console'
          });
          refreshTimelineUI();
        }
      }
      btnAckCrowd.disabled = true;
      btnAckCrowd.textContent = 'Acknowledged ✓';
      toast('Crowd Alert Acknowledged');
    };
  }

  // Server Health Check
  const btnHealth = $('refreshHealth');
  if (btnHealth) btnHealth.onclick = checkHealth;

  // Detection CSV Export
  const btnCsv = $('csvExport');
  if (btnCsv) {
    btnCsv.onclick = async () => {
      const detections = window.terranexStorage ? await window.terranexStorage.getRecentDetections(500) : [];
      const csv = 'Timestamp,Count,Summary\n' + detections.map(d => `"${d.updated_at}",${d.count},"${d.summary || ''}"`).join('\n');
      downloadBlob(csv, 'terranex-detections.csv', 'text/csv');
    };
  }

  // Clear log / Clear alerts
  if ($('clrLog')) $('clrLog').onclick = () => {
    if ($('detectionLog')) $('detectionLog').innerHTML = '<div class="none">Detection log cleared.</div>';
    toast('Detection log cleared');
  };
  if ($('clrAlerts')) $('clrAlerts').onclick = () => {
    if ($('alerts')) $('alerts').innerHTML = '<div class="none">Alert view cleared.</div>';
    toast('Alert view cleared');
  };

  // Storage Clear
  const btnClearDb = $('btnClearStorage');
  if (btnClearDb) {
    btnClearDb.onclick = async () => {
      if (confirm('Clear all historical telemetry, snapshots, and events stored in browser IndexedDB?')) {
        if (window.terranexStorage) await window.terranexStorage.clearAll();
        toast('Local database cleared');
        location.reload();
      }
    };
  }
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function checkHealth() {
  try {
    const h = await fetchJSON('/api/health');
    state.health = h;
    const txt = `Flask online · YOLO ${h.model_loaded ? 'Ready' : 'Not Loaded'} · Camera ${h.camera_capture_url}` +
      (h.model_error ? ` · Error: ${h.model_error}` : '');
    if ($('healthText')) $('healthText').textContent = txt;
    if ($('headerModelPill')) $('headerModelPill').textContent = h.model_loaded ? 'YOLO Ready' : 'Model Offline';
    if ($('astFlask')) {
      $('astFlask').textContent = h.status === 'online' ? 'ONLINE' : 'OFFLINE';
      $('astFlask').style.color = h.status === 'online' ? 'var(--normal)' : 'var(--critical)';
    }
    if ($('astModel')) {
      $('astModel').textContent = h.model_loaded ? 'ACTIVE' : 'OFFLINE';
      $('astModel').style.color = h.model_loaded ? 'var(--normal)' : 'var(--warning)';
    }
  } catch (e) {
    if ($('healthText')) $('healthText').textContent = 'Server Unreachable: ' + e.message;
    if ($('astFlask')) {
      $('astFlask').textContent = 'OFFLINE';
      $('astFlask').style.color = 'var(--critical)';
    }
  }
}

// ---------------- Mission Alerts Refresh ----------------
async function refreshAlerts() {
  try {
    const alerts = await fetchJSON('/api/alerts');
    const box = $('alerts');
    if (!box) return;

    if (!alerts.length) {
      box.innerHTML = '<div class="none" style="padding:12px;color:var(--text-muted);">No active mission alerts.</div>';
      return;
    }

    box.innerHTML = alerts.map(a => `
      <div class="log-entry ${a.level === 'critical' ? 'crit' : 'warn'}">
        <time class="log-time">${clock(new Date(a.time))}</time>
        <div class="log-content"><b>${a.title}:</b> ${a.message}</div>
      </div>
    `).join('');
  } catch (e) {}
}

// ---------------- Main Execution Loop ----------------
async function tick() {
  if (!state.running || state.paused) return;
  await inferOnce();
  await refreshTelemetry();
  await refreshAlerts();
  state.timer = setTimeout(tick, state.pollInterval);
}

// Uptime Counter
setInterval(() => {
  const s = Math.floor((Date.now() - state.startedAt) / 1000);
  const upStr = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  if ($('uptime')) $('uptime').textContent = upStr;
}, 1000);

// Background Telemetry Poller
setInterval(() => {
  if (!state.running) {
    refreshTelemetry();
  }
}, 1800);

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[TERRANEX 2.2] Initializing SCADA Intelligence Dashboard...');
  if (window.terranexStorage) {
    await window.terranexStorage.init();
  }
  if (window.terranexCinematic) {
    window.terranexCinematic.init();
  }

  // Initialize 3D Rovers (Hero & Digital Twin)
  if (window.Terranex3DRover) {
    if ($('overview3dContainer')) {
      window.overviewRover3D = new Terranex3DRover('overview3dContainer', {
        autoRotate: true,
        enableControls: true,
        interactive: true
      });
    }
    if ($('digitalTwin3dContainer')) {
      window.digitalTwinRover3D = new Terranex3DRover('digitalTwin3dContainer', {
        autoRotate: false,
        enableControls: true,
        interactive: true
      });
    }
  }

  // 3D View Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const view = btn.dataset.view;
      const target = btn.dataset.target === 'digitalTwin' ? window.digitalTwinRover3D : window.overviewRover3D;
      if (target) target.setPreset(view);
    });
  });

  // Floating Assistant Audio & Intro Triggers
  const btnSound = $('btnToggleSound');
  if (btnSound && window.terranexCinematic) {
    btnSound.textContent = window.terranexCinematic.soundEnabled ? 'Sound: ON' : 'Sound: OFF';
    btnSound.onclick = () => {
      const newState = !window.terranexCinematic.soundEnabled;
      window.terranexCinematic.toggleSound(newState);
      btnSound.textContent = newState ? 'Sound: ON' : 'Sound: OFF';
    };
  }

  const btnIntro = $('btnToggleIntro');
  if (btnIntro) {
    btnIntro.onclick = () => {
      const introEl = $('cinematicIntro');
      if (introEl && window.terranexCinematic) {
        introEl.classList.remove('fade-out');
        introEl.style.display = 'flex';
        window.terranexCinematic._runSystemBootSequence(() => {
          introEl.classList.add('fade-out');
          setTimeout(() => introEl.style.display = 'none', 600);
        });
      }
    };
  }

  initNavigation();
  initCharts();
  initExistingControls();
  initVisualMemoryControls();
  initReplayControls();
  initSimulationControls();
  initJournalControls();
  initReportControls();

  // Populate saved crowd threshold in Settings input
  if ($('settingCrowdThreshold') && window.terranexAnalytics) {
    $('settingCrowdThreshold').value = window.terranexAnalytics.crowdThreshold;
  }

  await checkHealth();
  await refreshTelemetry();
  await refreshAlerts();
  console.log('[TERRANEX 2.2] System online and ready.');
});

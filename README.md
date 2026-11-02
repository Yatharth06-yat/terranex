# TERRANEX 2.2 — Industrial Rover Intelligence SCADA Dashboard

TERRANEX 2.2 upgrades the single-rover AquaCare-style inspection package into a high-density, AI-powered industrial SCADA monitoring and diagnostics console.

## Architecture Highlights
- **Single-Server Simplicity**: Flask (`app.py`) remains the single backend application server.
- **Strict Stack Adherence**: Pure HTML5, Vanilla CSS (`dashboard.css`), Modular Vanilla JS, and Chart.js. No React, Node.js, Vite, or secondary servers.
- **Hardware & Firmware Integrity Preserved**:
  - `firmware/rover_esp32/rover_esp32.ino` was **NOT modified**.
  - `firmware/esp32_cam/esp32_cam.ino` was **NOT modified**.
  - No changes were made to sensor pin assignments, communication protocols, or hardware API contracts.
- **API Contracts Preserved**:
  - `GET /`
  - `GET /api/health`
  - `POST /api/telemetry`
  - `GET /api/telemetry`
  - `GET /api/detection`
  - `GET /api/alerts`
  - `POST /api/monitoring`
  - `POST /api/settings`
  - `POST /api/command`
  - `GET /api/command/current`
- **Browser-Side Persistence**: IndexedDB (`TerranexIntelligenceDB`) stores historical telemetry, deduplicated human sightings, visual change snapshots, and audit events so historical data survives Flask restarts.

---

## The 20 Dashboard Sections

1. **Overview**: Executive SCADA summary with live camera feed, instantaneous spatial KPIs, sensor telemetry grid, and mission alert stream.
2. **Human Detection**: YOLO inference feed with bounding boxes, confidence telemetry, visible candidate count, and transition-based deduplicated event logging.
3. **Live Camera**: Full-resolution dedicated vision panel with real-time HUD metrics (model, timestamp, resolution) and snapshot triggers.
4. **Digital Twin**: 2D top-view schematic of the rover chassis displaying real-time sensor placements (US-Front, US-Left, US-Right, MQ-2, MQ-4, DHT11, MPU6500, Encoder, Camera) with live color-coded operational statuses (Normal, Warning, Hazard, Offline).
5. **Environmental Intelligence**: Multi-gas atmospheric analysis (MQ-2, MQ-4, CO raw ADC), temperature, humidity, pressure, trend curves, and a chronological software observation heatmap grid.
6. **Visual Change Memory**: IndexedDB snapshot gallery, side-by-side comparison tool, and an HTML5 Canvas pixel difference highlighter computing visual altered-area percentages.
7. **Evidence Fusion**: Temporally synchronizes multi-modal observations (vision sightings, ultrasonic clearances, and gas spikes) within a ±6.0s window into clustered inspection records. *(Explicitly notes: correlation does not imply causation).*
8. **Mission Replay Studio**: Historical playback controller with timeline scrubbing, speed toggles (0.5x, 1x, 2x, 5x), synchronized sensor telemetry, and visual timeline markers. Distinctly flags recorded replay vs live telemetry.
9. **AI Confidence Monitor**: Real-time evaluation of YOLO confidence ratings (High Confidence, Low Confidence, Model Unavailable), confidence history graph, and explainability notes.
10. **Anomaly Detection**: Client-side statistical analytics labeled *RULE-BASED ANOMALY DETECTION* using rolling Z-score deviations (3σ), sudden step change detection, frozen reading detection, and threshold limits.
11. **Predictive Maintenance**: Trend and vibration monitoring from MPU tilt variance, encoder activity vs motor drive commands (stall detection), and sensor saturation wear advisories.
12. **Root Cause Explorer**: Interactive causal hypothesis tree connecting mission alerts, sensor readings, and vision sightings into structured investigative pathways.
13. **What-If Simulation Lab**: Software-only threshold simulator allowing operators to test custom proximity, gas, and tilt limits against recorded telemetry without altering physical hardware.
14. **Sensor Diagnostics**: Granular health matrix evaluating all 12 rover transducer channels with status flags: `HEALTHY`, `WARNING`, `OFFLINE`, `STALE`, `UNKNOWN`.
15. **Network Reliability**: Real-time latency tracking (in milliseconds), consecutive failure counters, transmission timestamps, and handshake verification.
16. **Event Timeline**: Centralized audit log with category filters (detection, alert, anomaly), severity filters, text search, and operator acknowledgement checkboxes.
17. **Operator Decision Support**: Structured advisory protocol cards outlining what was observed, triggering conditions, corroborating sensor data, and suggested inspection procedures.
18. **Inspection Journal**: Mission audit journal for recording timestamped operator field notes with CSV export.
19. **Reports**: Printable formal inspection report with mission summaries, sensor metrics, and CSV dataset export.
20. **Settings**: Connection parameters (ESP32-CAM URL, polling interval, YOLO confidence), manual 5-button drive keypad with obstacle interlock notice, server health check, and IndexedDB local storage management.

---

## Getting Started

### 1) Python Environment

Ensure Python 3.10+ is installed:

```bash
# Optional: create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### 2) Launch the Server

```bash
python3 app.py
```

Open your browser to:
```
http://localhost:5000
```

### 3) Hardware Configuration (Existing Arduino Sketches)

1. **Main ESP32**:
   - Sketch: `firmware/rover_esp32/rover_esp32.ino` (Untouched)
   - Configure your Wi-Fi SSID and `SERVER_URL` (e.g. `http://192.168.1.25:5000`)
   - Flash to ESP32 board.
2. **ESP32-CAM**:
   - Sketch: `firmware/esp32_cam/esp32_cam.ino` (Untouched)
   - Configure Wi-Fi credentials.
   - Flash to AI Thinker ESP32-CAM board.
   - Capture endpoint: `http://<CAM_IP>/capture`.

---

## Safety & Operational Disclaimers

- **Assistive Vision**: Ultralytics YOLO person detection is an assistive signal and is not a certified life-safety system.
- **Uncalibrated Sensor ADC**: Gas values from MQ-2, MQ-4, and CO represent uncalibrated 12-bit ADC readings (0–4095) from analog pins. Do not interpret as calibrated PPM values.
- **Advisory Decision Support**: Predictive maintenance recommendations, causal hypotheses, and decision support actions are rule-based software aids and do not constitute certified mechanical diagnostics.

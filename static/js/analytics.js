/**
 * TERRANEX 2.2 — Intelligence & Analytics Engine
 * Rule-Based Anomaly Detection, Sensor Diagnostics, Predictive Maintenance,
 * Rover Performance Score, AI Confidence Monitor, and What-If Simulation.
 */

class TerranexAnalytics {
  constructor() {
    this.historyBuffer = []; // telemetry history for rolling metrics
    this.bufferMaxSize = 60; // 60 samples for rolling analytics (~1 minute at 1Hz)
    this.previousTelemetry = null;
    this.repeatCounters = {}; // tracks identical consecutive readings
    this.recentAnomalies = [];
    this.maxAnomalies = 50;
    
    // Configurable thresholds for Rule-Based Anomaly Detection
    this.thresholds = {
      front_cm: { min: 2, max: 400, suddenDelta: 80, warnMin: 20 },
      left_cm: { min: 2, max: 400, suddenDelta: 80, warnMin: 15 },
      right_cm: { min: 2, max: 400, suddenDelta: 80, warnMin: 15 },
      temperature_c: { min: -10, max: 65, suddenDelta: 8, warnMax: 45 },
      humidity_pct: { min: 5, max: 98, suddenDelta: 25, warnMax: 85 },
      pressure_hpa: { min: 800, max: 1200, suddenDelta: 30 },
      mq2_raw: { min: 50, max: 4095, suddenDelta: 800, warnMax: 2800 },
      mq4_raw: { min: 50, max: 4095, suddenDelta: 800, warnMax: 2800 },
      co_raw: { min: 50, max: 4095, suddenDelta: 700, warnMax: 2500 },
      tilt_x: { min: -85, max: 85, suddenDelta: 35, warnMax: 30 },
      tilt_y: { min: -85, max: 85, suddenDelta: 35, warnMax: 30 },
      wifi_rssi: { min: -100, max: -20, suddenDelta: 30, warnMin: -85 }
    };

    // Sensor definitions for diagnostics
    this.sensorDefs = [
      { key: 'front_cm', name: 'Front Ultrasonic', unit: 'cm', analog: false },
      { key: 'left_cm', name: 'Left Ultrasonic', unit: 'cm', analog: false },
      { key: 'right_cm', name: 'Right Ultrasonic', unit: 'cm', analog: false },
      { key: 'temperature_c', name: 'DHT11 Temp', unit: '°C', analog: false },
      { key: 'humidity_pct', name: 'DHT11 Humidity', unit: '%', analog: false },
      { key: 'pressure_hpa', name: 'BME280 Pressure', unit: 'hPa', analog: false },
      { key: 'mq2_raw', name: 'MQ-2 Combustible Gas', unit: 'raw ADC', analog: true },
      { key: 'mq4_raw', name: 'MQ-4 Methane', unit: 'raw ADC', analog: true },
      { key: 'co_raw', name: 'CO Sensor', unit: 'raw ADC', analog: true },
      { key: 'tilt_x', name: 'MPU6500 Tilt X', unit: '°', analog: false },
      { key: 'tilt_y', name: 'MPU6500 Tilt Y', unit: '°', analog: false },
      { key: 'encoder_ticks', name: 'Wheel Encoder', unit: 'ticks', analog: false }
    ];

    // Crowd Detection State Machine (Critical Feature 3)
    let savedThreshold = null;
    try { savedThreshold = localStorage.getItem('terranex_crowd_threshold'); } catch (e) {}
    this.crowdThreshold = savedThreshold ? Number(savedThreshold) : 4;
    this.isCrowdActive = false;
    this.activeCrowdAlert = null;
    this.crowdAlertHistory = [];

    // Simulation parameters
    this.simulationConfig = {
      frontCollisionThreshold: 25,
      mq2GasThreshold: 3000,
      mq4GasThreshold: 3000,
      tiltLimitThreshold: 30,
      yoloConfidenceThreshold: 0.35,
      crowdThreshold: this.crowdThreshold
    };
  }

  // --- Feature 3: Crowd Detection & Rescue Team Alert Engine ---
  evaluateCrowd(detectionData, cameraAvailable = true) {
    if (!cameraAvailable || !detectionData || detectionData.available === false) {
      return {
        status: 'CAMERA_UNAVAILABLE',
        isStaleOrOffline: true,
        count: null,
        threshold: this.crowdThreshold,
        alertActive: this.isCrowdActive,
        warning: 'Vision stream unavailable or offline. Not interpreted as zero people.'
      };
    }

    const count = Number(detectionData.count || 0);
    const timestamp = detectionData.updated_at || new Date().toISOString();
    const detections = detectionData.detections || [];
    const maxConf = detections.length > 0 ? Math.max(...detections.map(d => d.confidence || 0)) : 0;

    let event = null;

    if (count > this.crowdThreshold) {
      if (!this.isCrowdActive) {
        // Transition: count rose from <= threshold to > threshold -> TRIGGER HIGH-PRIORITY CROWD ALERT
        this.isCrowdActive = true;
        this.activeCrowdAlert = {
          id: 'crowd_alert_' + Date.now(),
          timestamp,
          count,
          threshold: this.crowdThreshold,
          priority: 'HIGH PRIORITY',
          title: '🚨 CROWD DETECTED — RESCUE TEAM ATTENTION REQUIRED',
          model: detectionData.model || 'yolo11n.pt',
          confidence: maxConf > 0 ? (maxConf * 100).toFixed(1) + '%' : 'N/A',
          action: 'Notify the rescue coordinator and arrange appropriate rescue-team assessment.',
          acknowledged: false,
          acknowledgedAt: null,
          operatorNotes: '',
          cameraStatus: 'ONLINE'
        };
        this.crowdAlertHistory.unshift({ ...this.activeCrowdAlert });
        event = { type: 'TRIGGERED', alert: this.activeCrowdAlert };
      } else {
        // Continuous: update displayed count in real-time without duplicate events
        this.activeCrowdAlert.count = count;
        event = { type: 'UPDATED', alert: this.activeCrowdAlert };
      }
    } else {
      if (this.isCrowdActive) {
        // Transition: count dropped to <= threshold -> RESOLVE CROWD ALERT
        this.isCrowdActive = false;
        const resolvedAlert = { ...this.activeCrowdAlert, resolvedAt: timestamp };
        this.activeCrowdAlert = null;
        event = { type: 'RESOLVED', alert: resolvedAlert };
      }
    }

    return {
      status: this.isCrowdActive ? 'CROWD_ALERT_ACTIVE' : 'NORMAL',
      count,
      threshold: this.crowdThreshold,
      alertActive: this.isCrowdActive,
      currentAlert: this.activeCrowdAlert,
      event
    };
  }

  setCrowdThreshold(val) {
    const num = Math.max(1, Math.min(50, Number(val) || 4));
    this.crowdThreshold = num;
    this.simulationConfig.crowdThreshold = num;
    try { localStorage.setItem('terranex_crowd_threshold', String(num)); } catch (e) {}
    return this.crowdThreshold;
  }

  acknowledgeCrowdAlert(notes = '') {
    if (this.activeCrowdAlert) {
      this.activeCrowdAlert.acknowledged = true;
      this.activeCrowdAlert.acknowledgedAt = new Date().toISOString();
      this.activeCrowdAlert.operatorNotes = notes;
      return this.activeCrowdAlert;
    }
    return null;
  }

  // Calculate rolling mean & moving standard deviation envelope for Anomaly Graph
  getAnomalyStatistics(sensorKey = 'front_cm') {
    const values = this.historyBuffer
      .map(h => h[sensorKey])
      .filter(v => v !== undefined && v !== null && !isNaN(v))
      .map(Number);

    if (values.length < 5) return null;

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      upperBound: mean + (3 * stdDev),
      lowerBound: Math.max(0, mean - (3 * stdDev)),
      sampleCount: values.length
    };
  }


  // Add new telemetry to buffer
  processTelemetry(telemetry) {
    if (!telemetry || !telemetry.received_at) return null;

    this.historyBuffer.push(telemetry);
    if (this.historyBuffer.length > this.bufferMaxSize) {
      this.historyBuffer.shift();
    }

    const anomalies = this.detectAnomalies(telemetry);
    const diagnostics = this.runDiagnostics(telemetry);
    const maintenance = this.evaluateMaintenance(telemetry);
    const performanceScore = this.calculatePerformanceScore(telemetry, diagnostics);

    this.previousTelemetry = { ...telemetry };

    return {
      anomalies,
      diagnostics,
      maintenance,
      performanceScore
    };
  }

  // --- Feature 4: Rule-Based Anomaly Detection ---
  detectAnomalies(current) {
    const anomalies = [];
    const timestamp = current.received_at || new Date().toISOString();
    const ageMs = Date.now() - new Date(timestamp).getTime();

    // 1. Stale Data Check
    if (ageMs > 8000) {
      anomalies.push({
        id: 'anom_stale_' + Date.now(),
        sensor: 'Telemetry Stream',
        reading: `${(ageMs / 1000).toFixed(1)}s age`,
        baseline: '< 2.0s',
        deviation: `${(ageMs / 1000).toFixed(1)}s delay`,
        timestamp,
        severity: 'critical',
        explanation: 'Telemetry stream packet age exceeds 8000ms heartbeat threshold. Connection stale or suspended.',
        dataQuality: 'POOR'
      });
    }

    // Check each numeric sensor against rolling statistics and rules
    for (const [key, conf] of Object.entries(this.thresholds)) {
      const val = current[key];
      if (val === undefined || val === null || isNaN(val)) continue;

      const numVal = Number(val);
      const prevVal = this.previousTelemetry ? this.previousTelemetry[key] : null;

      // Track frozen/repeated readings for noise-expected sensors
      if (prevVal !== null && prevVal !== undefined && prevVal === numVal) {
        this.repeatCounters[key] = (this.repeatCounters[key] || 0) + 1;
      } else {
        this.repeatCounters[key] = 0;
      }

      if (this.repeatCounters[key] > 20 && conf.min !== undefined) {
        anomalies.push({
          id: `anom_frozen_${key}_${Date.now()}`,
          sensor: key.toUpperCase(),
          reading: numVal,
          baseline: 'Dynamic fluctuating signal',
          deviation: `Constant across ${this.repeatCounters[key]} frames`,
          timestamp,
          severity: 'warning',
          explanation: `Sensor reading has remained completely static for ${this.repeatCounters[key]} consecutive packets. Possible locked ADC or disconnected pin.`,
          dataQuality: 'QUESTIONABLE'
        });
      }

      // 2. Sudden Step Change
      if (prevVal !== null && prevVal !== undefined && !isNaN(prevVal)) {
        const delta = Math.abs(numVal - Number(prevVal));
        if (conf.suddenDelta && delta > conf.suddenDelta) {
          anomalies.push({
            id: `anom_jump_${key}_${Date.now()}`,
            sensor: key.toUpperCase(),
            reading: numVal,
            baseline: prevVal,
            deviation: `+${delta.toFixed(1)} jump`,
            timestamp,
            severity: 'warning',
            explanation: `Sudden abrupt transition of ${delta.toFixed(1)} units detected between consecutive frames (Threshold: ${conf.suddenDelta}).`,
            dataQuality: 'SUSPICIOUS'
          });
        }
      }

      // 3. Statistical Z-Score (Rolling Mean & StdDev)
      if (this.historyBuffer.length >= 10) {
        const values = this.historyBuffer
          .map(h => h[key])
          .filter(v => v !== undefined && v !== null && !isNaN(v))
          .map(Number);

        if (values.length >= 10) {
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);

          // Only apply Z-score if baseline has non-trivial standard deviation
          if (stdDev > 0.05) {
            const zScore = Math.abs(numVal - mean) / stdDev;
            if (zScore > 3.0) { // 3 sigma event
              anomalies.push({
                id: `anom_stat_${key}_${Date.now()}`,
                sensor: key.toUpperCase(),
                reading: numVal.toFixed(1),
                baseline: `${mean.toFixed(1)} ± ${stdDev.toFixed(1)}`,
                deviation: `${zScore.toFixed(1)}σ deviation`,
                timestamp,
                severity: zScore > 4.5 ? 'critical' : 'warning',
                explanation: `Value deviated ${zScore.toFixed(1)} standard deviations from rolling baseline mean of ${mean.toFixed(1)} (p < 0.003).`,
                dataQuality: 'STATISTICAL_OUTLIER'
              });
            }
          }
        }
      }

      // 4. Fixed Threshold Violations
      if (conf.warnMax && numVal > conf.warnMax) {
        anomalies.push({
          id: `anom_max_${key}_${Date.now()}`,
          sensor: key.toUpperCase(),
          reading: numVal,
          baseline: `< ${conf.warnMax}`,
          deviation: `+${(numVal - conf.warnMax).toFixed(1)} above limit`,
          timestamp,
          severity: numVal > conf.warnMax * 1.2 ? 'critical' : 'warning',
          explanation: `Telemetry exceeded safety threshold of ${conf.warnMax}. Elevated risk observed.`,
          dataQuality: 'VERIFIED'
        });
      }

      if (conf.warnMin && numVal > 0 && numVal < conf.warnMin) {
        anomalies.push({
          id: `anom_min_${key}_${Date.now()}`,
          sensor: key.toUpperCase(),
          reading: numVal,
          baseline: `> ${conf.warnMin}`,
          deviation: `-${(conf.warnMin - numVal).toFixed(1)} below limit`,
          timestamp,
          severity: 'warning',
          explanation: `Proximity boundary violation detected: distance ${numVal.toFixed(1)} is below safe operational clearance (${conf.warnMin}).`,
          dataQuality: 'VERIFIED'
        });
      }
    }

    if (anomalies.length > 0) {
      this.recentAnomalies.unshift(...anomalies);
      if (this.recentAnomalies.length > this.maxAnomalies) {
        this.recentAnomalies = this.recentAnomalies.slice(0, this.maxAnomalies);
      }
    }

    return anomalies;
  }

  // --- Feature 13: Sensor Self-Diagnostics ---
  runDiagnostics(telemetry) {
    const results = [];
    const ageMs = telemetry.received_at ? (Date.now() - new Date(telemetry.received_at).getTime()) : Infinity;
    const isTelemetryStale = ageMs > 8000;

    for (const def of this.sensorDefs) {
      const val = telemetry[def.key];
      let status = 'UNKNOWN';
      let message = 'No data observed';
      let confidence = 0;

      if (isTelemetryStale) {
        status = 'STALE';
        message = `Telemetry stream delayed by ${(ageMs / 1000).toFixed(1)}s`;
        confidence = 40;
      } else if (val === null || val === undefined || isNaN(val)) {
        status = 'OFFLINE';
        message = 'Sensor value is null or missing in payload';
        confidence = 0;
      } else {
        const num = Number(val);
        const repeatCount = this.repeatCounters[def.key] || 0;

        // Check for specific hardware conditions
        if (def.key.includes('_cm') && num <= 0) {
          status = 'WARNING';
          message = 'Ultrasonic echo timeout or invalid range (< 0)';
          confidence = 50;
        } else if (def.analog && (num === 0 || num >= 4095)) {
          status = 'WARNING';
          message = num === 0 ? 'ADC grounded / no signal' : 'ADC saturated at 4095 (rail limit)';
          confidence = 60;
        } else if (repeatCount > 25 && def.analog) {
          status = 'WARNING';
          message = `Analog voltage frozen across ${repeatCount} packets`;
          confidence = 65;
        } else if (def.key === 'pressure_hpa' && isNaN(num)) {
          status = 'OFFLINE';
          message = 'BME280 I2C bus device not detected';
          confidence = 0;
        } else {
          status = 'HEALTHY';
          message = 'Operational within nominal parameters';
          confidence = 98;
        }
      }

      results.push({
        key: def.key,
        name: def.name,
        value: val !== null && val !== undefined && !isNaN(val) ? Number(val).toFixed(1) : '—',
        unit: def.unit,
        status,
        message,
        confidence
      });
    }

    return results;
  }

  // --- Feature 2: Predictive Maintenance ---
  evaluateMaintenance(telemetry) {
    const advisories = [];
    const timestamp = telemetry.received_at || new Date().toISOString();

    // 1. Wheel / Motor Encoder Stall Detection
    const currentCmd = (telemetry.command || '').toLowerCase();
    if (currentCmd === 'forward' || currentCmd === 'backward') {
      const recentPackets = this.historyBuffer.slice(-6); // last ~6 seconds
      if (recentPackets.length >= 5) {
        const encoderValues = recentPackets
          .map(p => Number(p.encoder_ticks || 0))
          .filter(v => !isNaN(v));

        const ticksChanged = encoderValues.length > 1 &&
          Math.abs(encoderValues[encoderValues.length - 1] - encoderValues[0]) > 2;

        if (!ticksChanged) {
          advisories.push({
            id: 'maint_motor_stall_' + Date.now(),
            component: 'Drive Motors / Encoder Pin 33',
            severity: 'warning',
            condition: `Command active '${currentCmd.toUpperCase()}' but encoder ticks stationary (${telemetry.encoder_ticks || 0})`,
            recommendation: 'Inspect drive wheels for mechanical entrapment, wheel slip, or check encoder optocoupler wiring.',
            metrics: { command: currentCmd, ticks: telemetry.encoder_ticks },
            timestamp
          });
        }
      }
    }

    // 2. MPU6500 High Tilt & Rollover Hazard
    const tiltX = Math.abs(Number(telemetry.tilt_x || 0));
    const tiltY = Math.abs(Number(telemetry.tilt_y || 0));
    if (tiltX > 32 || tiltY > 32) {
      advisories.push({
        id: 'maint_tilt_hazard_' + Date.now(),
        component: 'Chassis Stability (MPU6500)',
        severity: 'critical',
        condition: `Excessive chassis inclination: Tilt X = ${telemetry.tilt_x}°, Tilt Y = ${telemetry.tilt_y}°`,
        recommendation: 'Halt forward progression immediately. Rover is operating on steep gradient with imminent risk of chassis tip-over.',
        metrics: { tiltX, tiltY },
        timestamp
      });
    }

    // 3. Structural Vibration / Rough Terrain Indication
    if (this.historyBuffer.length >= 10) {
      const tilts = this.historyBuffer.map(h => Number(h.tilt_x || 0)).filter(t => !isNaN(t));
      if (tilts.length >= 10) {
        const mean = tilts.reduce((a, b) => a + b, 0) / tilts.length;
        const variance = tilts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / tilts.length;
        if (variance > 45) {
          advisories.push({
            id: 'maint_vibration_' + Date.now(),
            component: 'Suspension / Terrain Coupling',
            severity: 'advisory',
            condition: `High tilt variance (${variance.toFixed(1)} deg²) indicates sustained mechanical vibration or rugged rubble surface.`,
            recommendation: 'Inspect chassis mounting hardware, camera bracket tension, and sensor standoff screws after current sortie.',
            metrics: { tiltVariance: variance.toFixed(1) },
            timestamp
          });
        }
      }
    }

    // 4. Gas Sensor Saturation Wear
    if (Number(telemetry.mq2_raw || 0) > 3500 || Number(telemetry.mq4_raw || 0) > 3500) {
      advisories.push({
        id: 'maint_gas_sat_' + Date.now(),
        component: 'Metal Oxide Gas Sensors (MQ-2 / MQ-4)',
        severity: 'advisory',
        condition: 'Sustained exposure to high gas concentration near ADC 4095 saturation limit.',
        recommendation: 'Allow 15 minutes of clean air aeration before recalibrating baseline voltage. High gas exposure temporarily affects tin dioxide heating element.',
        metrics: { mq2: telemetry.mq2_raw, mq4: telemetry.mq4_raw },
        timestamp
      });
    }

    return advisories;
  }

  // --- Feature 15: Rover Performance Score ---
  calculatePerformanceScore(telemetry, diagnostics) {
    // Transparent breakdown weights:
    // 1. Sensor Availability: 30 pts
    // 2. Telemetry Freshness & Latency: 25 pts
    // 3. Communication Link Reliability: 20 pts
    // 4. Camera & YOLO Health: 15 pts (evaluated dynamically)
    // 5. Diagnostic Health (no critical warnings): 10 pts

    let sensorScore = 0;
    if (diagnostics && diagnostics.length > 0) {
      const healthyCount = diagnostics.filter(d => d.status === 'HEALTHY').length;
      sensorScore = Math.round((healthyCount / diagnostics.length) * 30);
    }

    let freshnessScore = 25;
    if (telemetry.received_at) {
      const ageMs = Date.now() - new Date(telemetry.received_at).getTime();
      if (ageMs > 8000) freshnessScore = 0;
      else if (ageMs > 3000) freshnessScore = 12;
      else if (ageMs > 1500) freshnessScore = 20;
    } else {
      freshnessScore = 0;
    }

    let commScore = 20;
    const rssi = Number(telemetry.wifi_rssi || -100);
    if (rssi > -65) commScore = 20;
    else if (rssi > -78) commScore = 15;
    else if (rssi > -88) commScore = 10;
    else commScore = 4;

    let cameraScore = 15; // default full if detection online, will be modified by dashboard orchestrator

    let diagnosticBonus = 10;
    if (telemetry.front_cm !== undefined && Number(telemetry.front_cm) < 15 && Number(telemetry.front_cm) > 0) {
      diagnosticBonus -= 5;
    }
    if (Number(telemetry.tilt_x) > 30 || Number(telemetry.tilt_y) > 30) {
      diagnosticBonus -= 5;
    }
    if (diagnosticBonus < 0) diagnosticBonus = 0;

    const total = sensorScore + freshnessScore + commScore + cameraScore + diagnosticBonus;

    return {
      total: Math.min(100, Math.max(0, total)),
      breakdown: {
        sensors: { score: sensorScore, max: 30, desc: 'Hardware sensor availability & health' },
        freshness: { score: freshnessScore, max: 25, desc: 'Telemetry packet latency & freshness' },
        connectivity: { score: commScore, max: 20, desc: 'Wi-Fi RSSI signal stability' },
        camera: { score: cameraScore, max: 15, desc: 'Vision feed & YOLO model availability' },
        diagnostics: { score: diagnosticBonus, max: 10, desc: 'Absence of operational hazards' }
      },
      formula: 'Score = Sensor(30) + Freshness(25) + Link(20) + Vision(15) + Hazards(10)'
    };
  }

  // --- Feature 7: AI Confidence Monitor ---
  evaluateAiConfidence(detectionState, healthState) {
    if (!healthState || !healthState.model_loaded) {
      return {
        level: 'MODEL UNAVAILABLE',
        class: 'bad',
        confidenceVal: 0,
        explanation: healthState && healthState.model_error ? healthState.model_error : 'YOLO model weights not initialized.'
      };
    }

    if (!detectionState || !detectionState.available) {
      return {
        level: 'UNKNOWN',
        class: 'muted',
        confidenceVal: 0,
        explanation: detectionState && detectionState.error ? detectionState.error : 'Camera inference paused or no image received.'
      };
    }

    const detections = detectionState.detections || [];
    if (detections.length === 0) {
      return {
        level: 'NO DETECTIONS',
        class: 'ok',
        confidenceVal: 0,
        explanation: 'Model active and scanning frame; no persons detected in scene.'
      };
    }

    // Calculate maximum and average confidence
    const maxConf = Math.max(...detections.map(d => d.confidence || 0));
    const avgConf = detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / detections.length;

    if (maxConf >= 0.65) {
      return {
        level: 'HIGH CONFIDENCE',
        class: 'ok',
        confidenceVal: (maxConf * 100).toFixed(1),
        avgConfidence: (avgConf * 100).toFixed(1),
        count: detections.length,
        explanation: `Model reports strong visual features (${(maxConf * 100).toFixed(1)}% max confidence).`
      };
    } else {
      return {
        level: 'LOW CONFIDENCE',
        class: 'warn',
        confidenceVal: (maxConf * 100).toFixed(1),
        avgConfidence: (avgConf * 100).toFixed(1),
        count: detections.length,
        explanation: `Model detected candidate features but confidence (${(maxConf * 100).toFixed(1)}%) is below high reliability threshold. Visual verification advised.`
      };
    }
  }

  // --- Feature 11: What-If Simulation Lab ---
  runSimulation(historicalPackets, customConfig) {
    const config = { ...this.simulationConfig, ...customConfig };
    const results = {
      analyzedPackets: historicalPackets.length,
      originalAlertsCount: 0,
      simulatedAlertsCount: 0,
      triggeredSimulations: [],
      config
    };

    historicalPackets.forEach((packet, idx) => {
      const origTriggered = (Number(packet.mq2_raw || 0) >= 3000) ||
                            (Number(packet.mq4_raw || 0) >= 3000) ||
                            (Number(packet.co_raw || 0) >= 3000);
      if (origTriggered) results.originalAlertsCount++;

      // Evaluate simulated thresholds
      const simReasons = [];
      const front = Number(packet.front_cm);
      if (!isNaN(front) && front > 0 && front <= config.frontCollisionThreshold) {
        simReasons.push(`Front obstacle proximity (${front.toFixed(1)} cm <= ${config.frontCollisionThreshold} cm)`);
      }

      const mq2 = Number(packet.mq2_raw);
      if (!isNaN(mq2) && mq2 >= config.mq2GasThreshold) {
        simReasons.push(`MQ-2 simulated threshold exceeded (${mq2} >= ${config.mq2GasThreshold})`);
      }

      const mq4 = Number(packet.mq4_raw);
      if (!isNaN(mq4) && mq4 >= config.mq4GasThreshold) {
        simReasons.push(`MQ-4 simulated threshold exceeded (${mq4} >= ${config.mq4GasThreshold})`);
      }

      const tilt = Math.max(Math.abs(Number(packet.tilt_x || 0)), Math.abs(Number(packet.tilt_y || 0)));
      if (tilt >= config.tiltLimitThreshold) {
        simReasons.push(`Tilt instability exceeded (${tilt.toFixed(1)}° >= ${config.tiltLimitThreshold}°)`);
      }

      if (simReasons.length > 0) {
        results.simulatedAlertsCount++;
        results.triggeredSimulations.push({
          packetIndex: idx,
          timestamp: packet.received_at || 'Packet ' + idx,
          reasons: simReasons,
          data: { front, mq2, mq4, tilt }
        });
      }
    });

    results.delta = results.simulatedAlertsCount - results.originalAlertsCount;
    return results;
  }
}

// Global analytics singleton
window.terranexAnalytics = new TerranexAnalytics();

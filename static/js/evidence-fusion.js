/**
 * TERRANEX 2.2 — Evidence Fusion & Root Cause Explorer
 * Multi-Modal Evidence Fusion (Temporal Correlation of Detections, Telemetry & Alerts)
 * Interactive Root Cause Explorer with structured causal hypotheses.
 */

class TerranexEvidenceFusion {
  constructor() {
    this.fusedRecords = [];
    this.correlationWindowMs = 6000; // ±6 seconds temporal clustering window
  }

  /**
   * Correlates recent detections, telemetry packets, and alerts into Fused Inspection Evidence Records.
   * Strict adherence: Correlation is NOT represented as proof of causation.
   */
  fuseEvidence(detections = [], telemetryList = [], alerts = [], anomalies = []) {
    const records = [];

    // Base anchors: detections, high alerts, and critical anomalies
    const anchorEvents = [];

    // Add detections as anchors
    detections.forEach(det => {
      if (det.count > 0 || det.human_detected) {
        anchorEvents.push({
          type: 'detection',
          timestamp: det.updated_at || det.timestamp,
          raw: det,
          label: `Human Detection (${det.count || 1} visible)`
        });
      }
    });

    // Add alerts as anchors
    alerts.forEach(al => {
      anchorEvents.push({
        type: 'alert',
        timestamp: al.time || al.timestamp,
        raw: al,
        label: `Mission Alert: ${al.title || 'Alert'}`
      });
    });

    // Add anomalies as anchors
    anomalies.forEach(an => {
      if (an.severity === 'critical' || an.severity === 'warning') {
        anchorEvents.push({
          type: 'anomaly',
          timestamp: an.timestamp,
          raw: an,
          label: `Anomaly: ${an.sensor} (${an.deviation})`
        });
      }
    });

    // Sort anchors chronologically
    anchorEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to latest 30 anchors to prevent UI overload
    const selectedAnchors = anchorEvents.slice(0, 30);

    selectedAnchors.forEach((anchor, idx) => {
      const anchorTime = new Date(anchor.timestamp).getTime();
      if (isNaN(anchorTime)) return;

      // Find all telemetry packets within correlation window
      const matchedTelemetry = telemetryList.filter(t => {
        const tTime = new Date(t.received_at || t.timestamp).getTime();
        return !isNaN(tTime) && Math.abs(tTime - anchorTime) <= this.correlationWindowMs;
      });

      // Find closest telemetry packet
      let closestTelemetry = null;
      let minDelta = Infinity;
      matchedTelemetry.forEach(t => {
        const delta = Math.abs(new Date(t.received_at || t.timestamp).getTime() - anchorTime);
        if (delta < minDelta) {
          minDelta = delta;
          closestTelemetry = t;
        }
      });

      // Find companion alerts in window
      const matchedAlerts = alerts.filter(a => {
        const aTime = new Date(a.time || a.timestamp).getTime();
        return !isNaN(aTime) && Math.abs(aTime - anchorTime) <= this.correlationWindowMs && a !== anchor.raw;
      });

      // Build evidence items
      const evidenceSources = [];
      evidenceSources.push({
        source: anchor.type.toUpperCase(),
        description: anchor.label,
        timeDelta: '0.0s (Anchor)',
        data: anchor.raw
      });

      if (closestTelemetry) {
        const deltaSec = ((new Date(closestTelemetry.received_at).getTime() - anchorTime) / 1000).toFixed(1);
        evidenceSources.push({
          source: 'TELEMETRY SENSORS',
          description: `Front: ${closestTelemetry.front_cm ?? '—'}cm | MQ-2: ${closestTelemetry.mq2_raw ?? '—'} | Temp: ${closestTelemetry.temperature_c ?? '—'}°C | Tilt: ${closestTelemetry.tilt_x ?? '—'}°`,
          timeDelta: `${deltaSec > 0 ? '+' : ''}${deltaSec}s`,
          data: closestTelemetry
        });
      }

      matchedAlerts.forEach(ma => {
        const deltaSec = ((new Date(ma.time).getTime() - anchorTime) / 1000).toFixed(1);
        evidenceSources.push({
          source: 'CORRELATED ALERT',
          description: `${ma.title}: ${ma.message}`,
          timeDelta: `${deltaSec > 0 ? '+' : ''}${deltaSec}s`,
          data: ma
        });
      });

      // Formulate grouping explanation
      let rationale = `Grouped ${evidenceSources.length} synchronized observations recorded within ±${(this.correlationWindowMs / 1000).toFixed(0)}s temporal window.`;
      if (anchor.type === 'detection' && closestTelemetry && Number(closestTelemetry.front_cm) < 40 && Number(closestTelemetry.front_cm) > 0) {
        rationale += ' Spatial proximity corroboration: Ultrasonic sensor reports frontal barrier while vision model detected person.';
      } else if (anchor.type === 'detection' && closestTelemetry && Number(closestTelemetry.mq2_raw) > 2500) {
        rationale += ' Compound environmental hazard: Human presence observed in vicinity of elevated combustible gas reading.';
      }

      records.push({
        id: 'fusion_' + idx + '_' + anchorTime,
        eventTime: anchor.timestamp,
        anchorType: anchor.type,
        anchorLabel: anchor.label,
        evidenceCount: evidenceSources.length,
        sources: evidenceSources,
        rationale,
        disclaimer: 'Advisory Note: Correlation indicates temporal alignment across sensors, not mechanical or environmental causation.'
      });
    });

    this.fusedRecords = records;
    return records;
  }

  /**
   * Feature 10 — Root Cause Explorer
   * Builds an interactive causal investigation graph model for a selected incident.
   */
  buildCausalTree(targetIncident) {
    if (!targetIncident) return null;

    const nodes = [];
    const edges = [];

    // Root incident node
    const rootId = 'node_root';
    nodes.push({
      id: rootId,
      label: targetIncident.anchorLabel || targetIncident.title || 'Target Incident',
      type: 'incident',
      timestamp: targetIncident.eventTime || targetIncident.timestamp,
      severity: targetIncident.severity || 'warning'
    });

    // Evidence branches
    if (targetIncident.sources && targetIncident.sources.length > 0) {
      targetIncident.sources.forEach((src, idx) => {
        const srcId = `node_src_${idx}`;
        nodes.push({
          id: srcId,
          label: `${src.source}: ${src.description}`,
          type: 'evidence',
          timeDelta: src.timeDelta
        });
        edges.push({ from: rootId, to: srcId, relation: 'observed simultaneously' });

        // Generate plausible operational hypotheses
        const hypId = `node_hyp_${idx}`;
        let hypothesis = 'Standard baseline telemetry capture';
        if (src.description.includes('MQ-2') || src.description.includes('Gas')) {
          hypothesis = 'Possible ventilation deficit or localized gas vapor accumulation.';
        } else if (src.description.includes('Front:')) {
          hypothesis = 'Physical obstacle or survivor located within radar/ultrasonic field of view.';
        } else if (src.description.includes('Tilt:')) {
          hypothesis = 'Irregular rubble traversal or chassis gradient displacement.';
        } else if (src.source === 'DETECTION') {
          hypothesis = 'Visual silhouette matched YOLO COCO person features with positive confidence.';
        }

        nodes.push({
          id: hypId,
          label: `Hypothesis: ${hypothesis}`,
          type: 'hypothesis'
        });
        edges.push({ from: srcId, to: hypId, relation: 'suggests hypothesis' });
      });
    }

    return {
      incident: targetIncident,
      nodes,
      edges,
      disclaimer: 'Exploratory hypothesis model: Causal pathways are generated for investigative assistance and must be physically verified.'
    };
  }
}

// Global evidence fusion singleton
window.terranexEvidenceFusion = new TerranexEvidenceFusion();

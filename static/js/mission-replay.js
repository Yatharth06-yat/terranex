/**
 * TERRANEX 2.2 — Mission Replay Studio
 * Interactive historical inspection playback, timeline seeking,
 * synchronized sensor telemetry, detection markers, and alert markers.
 */

class TerranexMissionReplay {
  constructor() {
    this.sessionData = [];
    this.detections = [];
    this.snapshots = [];
    this.alerts = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.playSpeed = 1.0;
    this.timer = null;
    this.onFrameCallback = null;
    this.isReplayActive = false;
  }

  async loadSessionFromStorage() {
    if (!window.terranexStorage) return [];
    
    // Load historical telemetry from IndexedDB
    const telemetry = await window.terranexStorage.getAllTelemetry();
    const detections = await window.terranexStorage.getRecentDetections(200);
    const snapshots = await window.terranexStorage.getSnapshots();
    const alerts = await window.terranexStorage.getEvents({ category: 'alert' });

    // Sort chronologically
    this.sessionData = telemetry.sort((a, b) => new Date(a.received_at || a.client_timestamp) - new Date(b.received_at || b.client_timestamp));
    this.detections = detections;
    this.snapshots = snapshots;
    this.alerts = alerts;

    this.currentIndex = 0;
    return this.sessionData;
  }

  setFrameCallback(cb) {
    this.onFrameCallback = cb;
  }

  startReplay() {
    if (this.sessionData.length === 0) {
      throw new Error('No recorded mission history available to replay. Run telemetry or monitoring to capture session data.');
    }
    this.isReplayActive = true;
    this.isPlaying = true;
    this._scheduleNext();
  }

  pauseReplay() {
    this.isPlaying = false;
    clearTimeout(this.timer);
  }

  stopReplay() {
    this.isPlaying = false;
    this.isReplayActive = false;
    clearTimeout(this.timer);
    this.currentIndex = 0;
  }

  seek(index) {
    if (index < 0) index = 0;
    if (index >= this.sessionData.length) index = this.sessionData.length - 1;
    this.currentIndex = index;
    this._broadcastCurrentFrame();
  }

  setSpeed(speed) {
    this.playSpeed = Number(speed) || 1.0;
    if (this.isPlaying) {
      clearTimeout(this.timer);
      this._scheduleNext();
    }
  }

  _scheduleNext() {
    if (!this.isPlaying) return;
    
    const intervalMs = Math.max(100, Math.floor(1000 / this.playSpeed));
    this.timer = setTimeout(() => {
      if (this.currentIndex < this.sessionData.length - 1) {
        this.currentIndex++;
        this._broadcastCurrentFrame();
        this._scheduleNext();
      } else {
        this.pauseReplay();
      }
    }, intervalMs);
  }

  _broadcastCurrentFrame() {
    const currentFrame = this.sessionData[this.currentIndex];
    if (!currentFrame) return;

    const frameTime = new Date(currentFrame.received_at || currentFrame.client_timestamp).getTime();

    // Check for matching detections within ±1.5s
    const matchedDetection = this.detections.find(d => {
      const dt = new Date(d.updated_at || d.timestamp).getTime();
      return Math.abs(dt - frameTime) < 2000;
    });

    // Check for matching snapshots within ±2.5s
    const matchedSnapshot = this.snapshots.find(s => {
      const st = new Date(s.timestamp).getTime();
      return Math.abs(st - frameTime) < 3000;
    });

    // Check for matching alerts
    const matchedAlert = this.alerts.find(a => {
      const at = new Date(a.timestamp).getTime();
      return Math.abs(at - frameTime) < 2000;
    });

    if (this.onFrameCallback) {
      this.onFrameCallback({
        index: this.currentIndex,
        totalFrames: this.sessionData.length,
        telemetry: currentFrame,
        detection: matchedDetection || null,
        snapshot: matchedSnapshot || null,
        alert: matchedAlert || null,
        timestamp: currentFrame.received_at || new Date(currentFrame.client_timestamp).toISOString()
      });
    }
  }

  getTimelineMarkers() {
    if (this.sessionData.length === 0) return [];

    const startTime = new Date(this.sessionData[0].received_at || this.sessionData[0].client_timestamp).getTime();
    const endTime = new Date(this.sessionData[this.sessionData.length - 1].received_at || this.sessionData[this.sessionData.length - 1].client_timestamp).getTime();
    const duration = endTime - startTime;

    if (duration <= 0) return [];

    const markers = [];

    this.detections.forEach(d => {
      const dt = new Date(d.updated_at || d.timestamp).getTime();
      if (dt >= startTime && dt <= endTime) {
        const pct = ((dt - startTime) / duration) * 100;
        markers.push({ type: 'detection', pct, label: `Human (${d.count || 1})`, time: d.updated_at });
      }
    });

    this.snapshots.forEach(s => {
      const st = new Date(s.timestamp).getTime();
      if (st >= startTime && st <= endTime) {
        const pct = ((st - startTime) / duration) * 100;
        markers.push({ type: 'snapshot', pct, label: s.label || 'Snapshot', time: s.timestamp });
      }
    });

    this.alerts.forEach(a => {
      const at = new Date(a.timestamp).getTime();
      if (at >= startTime && at <= endTime) {
        const pct = ((at - startTime) / duration) * 100;
        markers.push({ type: 'alert', pct, label: a.title || 'Alert', time: a.timestamp });
      }
    });

    return markers;
  }
}

// Global mission replay singleton
window.terranexMissionReplay = new TerranexMissionReplay();

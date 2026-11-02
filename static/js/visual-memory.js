/**
 * TERRANEX 2.2 — Visual Change Memory System
 * Snapshot persistence in IndexedDB, Side-by-side comparison,
 * Difference highlighter canvas, and temporal visual observation analysis.
 */

class TerranexVisualMemory {
  constructor() {
    this.snapshots = [];
    this.selectedA = null;
    this.selectedB = null;
    this.diffThreshold = 35; // RGB pixel difference sensitivity
  }

  async loadSnapshots() {
    if (window.terranexStorage) {
      this.snapshots = await window.terranexStorage.getSnapshots();
    }
    return this.snapshots;
  }

  async captureCurrentFrame(imageBase64, detectionsCount = 0, label = 'Operator Snapshot', telemetry = null) {
    if (!imageBase64) throw new Error('No camera image available to capture.');
    
    // Normalize base64 URL
    const fullDataUrl = imageBase64.startsWith('data:') ? imageBase64 : 'data:image/jpeg;base64,' + imageBase64;
    
    const snap = {
      id: 'snap_' + Date.now(),
      timestamp: new Date().toISOString(),
      image: fullDataUrl,
      label,
      detectionsCount,
      telemetrySummary: telemetry ? {
        front_cm: telemetry.front_cm,
        mq2_raw: telemetry.mq2_raw,
        temperature_c: telemetry.temperature_c,
        command: telemetry.command
      } : null
    };

    if (window.terranexStorage) {
      await window.terranexStorage.saveSnapshot(snap);
      await this.loadSnapshots();
    } else {
      this.snapshots.unshift(snap);
    }

    return snap;
  }

  async deleteSnapshot(id) {
    if (window.terranexStorage) {
      await window.terranexStorage.deleteSnapshot(id);
      await this.loadSnapshots();
    } else {
      this.snapshots = this.snapshots.filter(s => s.id !== id);
    }
  }

  selectSnapshots(idA, idB) {
    this.selectedA = this.snapshots.find(s => s.id === idA) || null;
    this.selectedB = this.snapshots.find(s => s.id === idB) || null;
    return { a: this.selectedA, b: this.selectedB };
  }

  // Load an image into an Image object
  _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image for visual comparison.'));
      img.src = src;
    });
  }

  /**
   * Compute visual pixel-by-pixel difference map on HTML5 Canvas.
   * Compares Snapshot A (baseline) against Snapshot B (comparison).
   * Renders difference heatmap overlay on targetCanvas.
   */
  async computeDifference(canvasElement, threshold = this.diffThreshold) {
    if (!this.selectedA || !this.selectedB) {
      throw new Error('Please select two snapshots (Baseline A and Comparison B) to compute difference.');
    }

    const [imgA, imgB] = await Promise.all([
      this._loadImage(this.selectedA.image),
      this._loadImage(this.selectedB.image)
    ]);

    const width = Math.min(imgA.naturalWidth || 640, imgB.naturalWidth || 640) || 640;
    const height = Math.min(imgA.naturalHeight || 480, imgB.naturalHeight || 480) || 480;

    canvasElement.width = width;
    canvasElement.height = height;
    const ctx = canvasElement.getContext('2d');

    // Create offscreen contexts to extract pixels
    const offA = document.createElement('canvas');
    offA.width = width; offA.height = height;
    const ctxA = offA.getContext('2d');
    ctxA.drawImage(imgA, 0, 0, width, height);
    const dataA = ctxA.getImageData(0, 0, width, height).data;

    const offB = document.createElement('canvas');
    offB.width = width; offB.height = height;
    const ctxB = offB.getContext('2d');
    ctxB.drawImage(imgB, 0, 0, width, height);
    const dataB = ctxB.getImageData(0, 0, width, height).data;

    // Output difference image
    const diffImgData = ctx.createImageData(width, height);
    const out = diffImgData.data;

    let changedPixels = 0;
    const totalPixels = width * height;

    for (let i = 0; i < dataA.length; i += 4) {
      const rDiff = Math.abs(dataA[i] - dataB[i]);
      const gDiff = Math.abs(dataA[i + 1] - dataB[i + 1]);
      const bDiff = Math.abs(dataA[i + 2] - dataB[i + 2]);
      const delta = (rDiff + gDiff + bDiff) / 3;

      if (delta > threshold) {
        changedPixels++;
        // Highlight altered areas in high-visibility amber/red SCADA overlay
        out[i] = 245;       // R
        out[i + 1] = 158;   // G
        out[i + 2] = 11;    // B
        out[i + 3] = Math.min(255, Math.floor(delta * 3.5)); // Alpha based on intensity
      } else {
        // Muted monochrome background for unchanged regions
        const gray = Math.floor((dataB[i] + dataB[i + 1] + dataB[i + 2]) / 3 * 0.35);
        out[i] = gray;
        out[i + 1] = gray;
        out[i + 2] = gray;
        out[i + 3] = 200;
      }
    }

    ctx.putImageData(diffImgData, 0, 0);

    const changePct = ((changedPixels / totalPixels) * 100).toFixed(2);

    return {
      width,
      height,
      changedPixels,
      totalPixels,
      changePct,
      threshold,
      timestampA: this.selectedA.timestamp,
      timestampB: this.selectedB.timestamp
    };
  }
}

// Global visual memory singleton
window.terranexVisualMemory = new TerranexVisualMemory();

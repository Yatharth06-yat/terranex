/**
 * TERRANEX 2.2 — Cinematic UI & Ambient Mission Control Engine
 * 1. Animated Tactical Background Canvas (Radar, Grid, Ambient Particles)
 * 2. Fullscreen Cinematic Welcome Intro with live subsystem hardware checks
 * 3. Lower-Right Floating Mission Assistant Widget with subsystem status
 * 4. Web Audio API Alert Chimes (synthesized, zero audio files required)
 */

class TerranexCinematicUI {
  constructor() {
    this.soundEnabled = localStorage.getItem('terranex_sound_enabled') === 'true';
    this.audioCtx = null;
    this.bgCanvas = null;
    this.bgCtx = null;
    this.particles = [];
    this.animFrameId = null;
    this.introActive = false;
  }

  init() {
    this._initBackgroundCanvas();
    this._initFloatingAssistant();
    this._initCinematicIntro();
    this._initLiveClocks();
    this._initSidebarEqualizer();
  }

  // --- Live Clocks & Date in Header & Camera ---
  _initLiveClocks() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateStr = `${months[now.getMonth()]} ${now.getDate().toString().padStart(2, '0')}, ${now.getFullYear()}`;

      const topClock = document.getElementById('topLiveClock');
      if (topClock) topClock.textContent = timeStr;

      const topDate = document.getElementById('topLiveDate');
      if (topDate) topDate.textContent = dateStr;

      const camClock = document.getElementById('camLiveClock');
      if (camClock) camClock.textContent = timeStr;
    };
    update();
    setInterval(update, 1000);
  }

  // --- Animated Equalizer Canvas in Sidebar ---
  _initSidebarEqualizer() {
    const cvs = document.getElementById('sidebarEqualizer');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const barCount = 18;
    const barHeights = new Array(barCount).fill(10).map(() => Math.random() * 20 + 4);
    const targetHeights = new Array(barCount).fill(10).map(() => Math.random() * 20 + 4);

    const drawEq = () => {
      if (document.hidden) {
        requestAnimationFrame(drawEq);
        return;
      }
      const w = cvs.width;
      const h = cvs.height;
      ctx.clearRect(0, 0, w, h);

      const barWidth = (w - (barCount - 1) * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        // Interpolate towards target
        barHeights[i] += (targetHeights[i] - barHeights[i]) * 0.15;
        if (Math.abs(targetHeights[i] - barHeights[i]) < 1) {
          targetHeights[i] = Math.random() * (h - 4) + 3;
        }

        const barH = Math.max(2, Math.min(h, barHeights[i]));
        const x = i * (barWidth + 2);
        const y = h - barH;

        // Gradient for each bar
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, '#20F58A');
        grad.addColorStop(0.7, '#10b981');
        grad.addColorStop(1, '#059669');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barH);

        // Subtle cap
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, barWidth, 1);
      }

      requestAnimationFrame(drawEq);
    };

    drawEq();
  }

  // --- 1. Ambient Background Canvas ---
  _initBackgroundCanvas() {
    this.bgCanvas = document.getElementById('bgCanvas');
    if (!this.bgCanvas) return;
    this.bgCtx = this.bgCanvas.getContext('2d');

    const resize = () => {
      this.bgCanvas.width = window.innerWidth;
      this.bgCanvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize subtle floating particles
    this.particles = [];
    for (let i = 0; i < 35; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.25 + 0.08
      });
    }

    let scanlineY = 0;

    const render = () => {
      if (document.hidden) {
        this.animFrameId = requestAnimationFrame(render);
        return;
      }

      const w = this.bgCanvas.width;
      const h = this.bgCanvas.height;
      this.bgCtx.clearRect(0, 0, w, h);

      // Subtle technical grid
      this.bgCtx.strokeStyle = 'rgba(32, 245, 138, 0.03)';
      this.bgCtx.lineWidth = 1;
      const gridSize = 48;
      for (let x = 0; x < w; x += gridSize) {
        this.bgCtx.beginPath();
        this.bgCtx.moveTo(x, 0);
        this.bgCtx.lineTo(x, h);
        this.bgCtx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        this.bgCtx.beginPath();
        this.bgCtx.moveTo(0, y);
        this.bgCtx.lineTo(w, y);
        this.bgCtx.stroke();
      }

      // Moving scanning beam line
      scanlineY = (scanlineY + 0.5) % h;
      const grad = this.bgCtx.createLinearGradient(0, scanlineY - 24, 0, scanlineY + 24);
      grad.addColorStop(0, 'rgba(32, 245, 138, 0)');
      grad.addColorStop(0.5, 'rgba(32, 245, 138, 0.03)');
      grad.addColorStop(1, 'rgba(32, 245, 138, 0)');
      this.bgCtx.fillStyle = grad;
      this.bgCtx.fillRect(0, scanlineY - 24, w, 48);

      // Draw Ambient Particles
      this.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        this.bgCtx.fillStyle = `rgba(32, 245, 138, ${p.alpha})`;
        this.bgCtx.beginPath();
        this.bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.bgCtx.fill();
      });

      this.animFrameId = requestAnimationFrame(render);
    };

    render();
  }

  // --- 2. Cinematic Welcome Intro Sequence ---
  _initCinematicIntro() {
    const introEl = document.getElementById('cinematicIntro');
    if (!introEl) return;

    // Check if operator disabled intro in settings or prefers-reduced-motion
    const skipIntroPref = localStorage.getItem('terranex_skip_intro') === 'true';
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (skipIntroPref || prefersReducedMotion) {
      introEl.style.display = 'none';
      return;
    }

    this.introActive = true;
    introEl.style.display = 'flex';

    // Setup 3D wireframe preview inside intro
    if (window.Terranex3DRover && document.getElementById('intro3dContainer')) {
      new Terranex3DRover('intro3dContainer', {
        wireframe: true,
        autoRotate: true,
        enableControls: false,
        interactive: false,
        showGrid: true
      });
    }

    // Skip Button & ESC key
    const skipBtn = document.getElementById('btnSkipIntro');
    const closeIntro = () => {
      this.introActive = false;
      introEl.classList.add('fade-out');
      setTimeout(() => {
        introEl.style.display = 'none';
      }, 600);
    };

    if (skipBtn) skipBtn.onclick = closeIntro;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.introActive) closeIntro();
    });

    // Run Real Subsystem Verification Sequence
    this._runSystemBootSequence(closeIntro);
  }

  async _runSystemBootSequence(onComplete) {
    const setStep = (id, status, text) => {
      const el = document.getElementById(id);
      if (el) {
        el.className = `intro-check-item ${status}`;
        el.innerHTML = `<span class="check-icon">${status === 'ok' ? '✓' : (status === 'fail' ? '✕' : '⏳')}</span> <span>${text}</span>`;
      }
    };

    const pBar = document.getElementById('introProgressBar');
    const updateProgress = (pct) => {
      if (pBar) pBar.style.width = pct + '%';
    };

    updateProgress(15);
    await new Promise((r) => setTimeout(r, 400));

    // Step 1: Flask Backend Handshake
    try {
      const res = await fetch('/api/health');
      const h = await res.json();
      updateProgress(35);
      setStep('bootStepFlask', 'ok', `Flask Backend Online (${h.status.toUpperCase()})`);

      // Step 2: YOLO AI Model
      if (h.model_loaded) {
        setStep('bootStepYolo', 'ok', `YOLO 11n Neural Engine Active (${h.model_path})`);
      } else {
        setStep('bootStepYolo', 'fail', `YOLO Model Offline (${h.model_error || 'Not initialized'})`);
      }
    } catch (e) {
      setStep('bootStepFlask', 'fail', 'Flask API Unreachable');
      setStep('bootStepYolo', 'fail', 'Inference Engine Suspended');
    }

    updateProgress(65);
    await new Promise((r) => setTimeout(r, 400));

    // Step 3: Rover Communication Telemetry
    try {
      const res = await fetch('/api/telemetry');
      const t = await res.json();
      updateProgress(85);
      if (t.latest && t.latest.received_at) {
        const age = (Date.now() - new Date(t.latest.received_at).getTime()) / 1000;
        setStep('bootStepRover', age < 8 ? 'ok' : 'warn', `Rover Link: ${age < 8 ? 'ACTIVE' : 'STALE (' + age.toFixed(1) + 's)'}`);
      } else {
        setStep('bootStepRover', 'warn', 'Rover Link: AWAITING TELEMETRY');
      }
    } catch (e) {
      setStep('bootStepRover', 'fail', 'Telemetry Endpoint Error');
    }

    // Step 4: Vision Stream Camera
    try {
      const res = await fetch('/api/detection');
      const d = await res.json();
      updateProgress(98);
      if (d.available) {
        setStep('bootStepCamera', 'ok', 'ESP32-CAM Stream Online (640x480 MJPEG)');
      } else {
        setStep('bootStepCamera', 'warn', `Camera Stream: ${d.error ? 'WAITING START' : 'IDLE'}`);
      }
    } catch (e) {
      setStep('bootStepCamera', 'fail', 'Camera Link Disconnected');
    }

    updateProgress(100);
    await new Promise((r) => setTimeout(r, 600));
    onComplete();
  }

  // --- 3. Lower-Right Floating Operator Assistant ---
  _initFloatingAssistant() {
    const badge = document.getElementById('assistantBadge');
    const panel = document.getElementById('assistantPanel');
    const closeBtn = document.getElementById('btnAssistantClose');

    if (!badge || !panel) return;

    // Restore preference
    const isOpen = localStorage.getItem('terranex_assistant_open') === 'true';
    if (isOpen) panel.classList.add('open');

    badge.onclick = () => {
      panel.classList.toggle('open');
      localStorage.setItem('terranex_assistant_open', panel.classList.contains('open'));
      this.playChime('click');
    };

    if (closeBtn) {
      closeBtn.onclick = () => {
        panel.classList.remove('open');
        localStorage.setItem('terranex_assistant_open', 'false');
      };
    }
  }

  // --- 4. Web Audio API Tactical Chimes ---
  playChime(type = 'alert') {
    if (!this.soundEnabled) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'alert') {
        // High-low dual tactical pulse
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'click') {
        // High-tech subtle confirmation pip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.start(now);
        osc.stop(now + 0.06);
      }
    } catch (e) {
      // AudioContext policy restrictions
    }
  }

  toggleSound(enable) {
    this.soundEnabled = enable;
    localStorage.setItem('terranex_sound_enabled', String(enable));
    if (enable) this.playChime('click');
    return this.soundEnabled;
  }
}

// Global cinematic UI singleton
window.terranexCinematic = new TerranexCinematicUI();

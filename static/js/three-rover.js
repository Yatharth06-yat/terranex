/**
 * TERRANEX 2.2 — 3D Rover Model & Digital Twin Engine
 * Built with Three.js (Procedural Industrial Inspection Rover)
 * Features: Metallic textures, interactive sensor raycasting, real-time LED status glow,
 * OrbitControls, view presets, and lightweight WebGL fallback.
 */

class Terranex3DRover {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = Object.assign({
      wireframe: false,
      autoRotate: true,
      enableControls: true,
      interactive: true,
      showGrid: true,
      onSelectComponent: null
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.roverGroup = null;
    this.sensorMeshes = {};
    this.radarSweep = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);
    this.hoveredComponent = null;
    this.animFrameId = null;
    this.isDisposed = false;
    this.isInitialized = false;

    if (this.container && window.THREE) {
      this.init();
    }
  }

  init() {
    if (!this.container) return;
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 300;

    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.025);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(4.5, 3.2, 5.0);

    // 2. Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
    } catch (e) {
      console.warn('[Terranex3D] WebGL not supported, using fallback.', e);
      this._renderFallback();
      return;
    }

    // 3. Orbit Controls
    if (this.options.enableControls && window.THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent flipping below ground
      this.controls.minDistance = 2.0;
      this.controls.maxDistance = 12.0;
      this.controls.autoRotate = this.options.autoRotate;
      this.controls.autoRotateSpeed = 0.8;
    }

    // 4. Lighting (Industrial High-Tech Lighting)
    this._setupLighting();

    // 5. Build Procedural Industrial Rover
    this._buildRoverModel();

    // 6. Ground Radar Grid
    if (this.options.showGrid) {
      this._buildRadarGrid();
    }

    // 7. Event Listeners
    this._bindEvents();

    this.isInitialized = true;
    this.animate();
  }

  _setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x2d3748, 1.2);
    this.scene.add(ambientLight);

    // Main Key Light
    const keyLight = new THREE.DirectionalLight(0xe2e8f0, 2.0);
    keyLight.position.set(6, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // Cyan Tactical Rim Light
    const rimLight = new THREE.DirectionalLight(0x06b6d4, 2.5);
    rimLight.position.set(-6, 3, -6);
    this.scene.add(rimLight);

    // Undercarriage Ground Glow
    const underLight = new THREE.PointLight(0x10b981, 1.5, 3);
    underLight.position.set(0, 0.2, 0);
    this.scene.add(underLight);
  }

  _buildRoverModel() {
    this.roverGroup = new THREE.Group();

    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.35,
      metalness: 0.85,
      wireframe: this.options.wireframe
    });

    const armorPlatesMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      roughness: 0.2,
      metalness: 0.9,
      wireframe: this.options.wireframe
    });

    const treadMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.2,
      wireframe: this.options.wireframe
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.3
    });

    // 1. Main Monocoque Chassis
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.45, 2.4);
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.65;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.roverGroup.add(chassis);

    // Beveled Upper Avionics Enclosure
    const avionicsGeo = new THREE.BoxGeometry(1.2, 0.35, 1.6);
    const avionics = new THREE.Mesh(avionicsGeo, armorPlatesMat);
    avionics.position.set(0, 0.98, -0.1);
    avionics.castShadow = true;
    this.roverGroup.add(avionics);

    // Tactical Roll Cage Tubes
    const barMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.95, roughness: 0.2 });
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5);
    const barLeft = new THREE.Mesh(barGeo, barMat);
    barLeft.rotation.x = Math.PI / 2;
    barLeft.position.set(-0.6, 1.18, -0.1);
    this.roverGroup.add(barLeft);

    const barRight = barLeft.clone();
    barRight.position.x = 0.6;
    this.roverGroup.add(barRight);

    // 2. Heavy-Duty All-Terrain Wheels (4 Wheels)
    const wheelPositions = [
      { x: -0.98, y: 0.45, z: 0.8 },
      { x: 0.98, y: 0.45, z: 0.8 },
      { x: -0.98, y: 0.45, z: -0.8 },
      { x: 0.98, y: 0.45, z: -0.8 }
    ];

    wheelPositions.forEach((pos) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(pos.x, pos.y, pos.z);

      // Tire Tread
      const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 24);
      const tire = new THREE.Mesh(tireGeo, treadMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      // Hubcap Rim
      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.29, 16);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      // Axle Link
      const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25);
      const axle = new THREE.Mesh(axleGeo, armorPlatesMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.x = pos.x > 0 ? -0.16 : 0.16;
      wheelGroup.add(axle);

      this.roverGroup.add(wheelGroup);
    });

    // 3. Sensor Modules (Interactive Raycasting Targets)
    this._attachSensorModules();

    this.scene.add(this.roverGroup);
  }

  _attachSensorModules() {
    // Helper to create glowing sensor indicator material
    const createLedMat = (colorHex) => new THREE.MeshBasicMaterial({ color: colorHex });

    // A. Front Camera Pan-Tilt Turret (ESP32-CAM)
    const camTurret = new THREE.Group();
    camTurret.position.set(0, 1.25, 0.8);
    const camBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 }));
    const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.9 }));
    camBox.position.y = 0.14;

    // Camera Lens (Reflective dark glass)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.1, metalness: 1.0 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.14, 0.12);

    const camLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    camLed.position.set(0.08, 0.2, 0.11);

    camTurret.add(camBase, camBox, lens, camLed);
    camTurret.name = 'ESP32_CAM';
    camTurret.userData = { id: 'camera', name: 'ESP32-CAM Vision Module', key: 'vision', desc: '640x480 MJPEG Stream + YOLO 11n Inference Engine' };
    this.sensorMeshes['camera'] = { mesh: camTurret, led: camLed };
    this.roverGroup.add(camTurret);

    // B. Front Ultrasonic Sensor (US-Front: GPIO 16/19)
    const frontUsGroup = new THREE.Group();
    frontUsGroup.position.set(0, 0.65, 1.25);
    const usPcb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 }));
    const barrelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16);
    const barrelLeft = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 }));
    barrelLeft.rotation.x = Math.PI / 2;
    barrelLeft.position.set(-0.1, 0, 0.04);
    const barrelRight = barrelLeft.clone();
    barrelRight.position.x = 0.1;

    const frontLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    frontLed.position.set(0, 0.05, 0.03);

    frontUsGroup.add(usPcb, barrelLeft, barrelRight, frontLed);
    frontUsGroup.name = 'US_FRONT';
    frontUsGroup.userData = { id: 'front_cm', name: 'Front Ultrasonic Sensor', key: 'front_cm', desc: 'GPIO 16 Trig / GPIO 19 Echo Clearance Radar' };
    this.sensorMeshes['front_cm'] = { mesh: frontUsGroup, led: frontLed };
    this.roverGroup.add(frontUsGroup);

    // C. Left Ultrasonic Sensor (US-Left: GPIO 17/21)
    const leftUsGroup = new THREE.Group();
    leftUsGroup.position.set(-0.85, 0.65, 0);
    leftUsGroup.rotation.y = Math.PI / 2;
    const leftPcb = usPcb.clone();
    const leftB1 = barrelLeft.clone();
    const leftB2 = barrelRight.clone();
    const leftLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    leftLed.position.set(0, 0.05, 0.03);
    leftUsGroup.add(leftPcb, leftB1, leftB2, leftLed);
    leftUsGroup.name = 'US_LEFT';
    leftUsGroup.userData = { id: 'left_cm', name: 'Left Lateral Clearance', key: 'left_cm', desc: 'GPIO 17 Trig / GPIO 21 Echo Side Clearance' };
    this.sensorMeshes['left_cm'] = { mesh: leftUsGroup, led: leftLed };
    this.roverGroup.add(leftUsGroup);

    // D. Right Ultrasonic Sensor (US-Right: GPIO 18/22)
    const rightUsGroup = new THREE.Group();
    rightUsGroup.position.set(0.85, 0.65, 0);
    rightUsGroup.rotation.y = -Math.PI / 2;
    const rightPcb = usPcb.clone();
    const rightB1 = barrelLeft.clone();
    const rightB2 = barrelRight.clone();
    const rightLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    rightLed.position.set(0, 0.05, 0.03);
    rightUsGroup.add(rightPcb, rightB1, rightB2, rightLed);
    rightUsGroup.name = 'US_RIGHT';
    rightUsGroup.userData = { id: 'right_cm', name: 'Right Lateral Clearance', key: 'right_cm', desc: 'GPIO 18 Trig / GPIO 22 Echo Side Clearance' };
    this.sensorMeshes['right_cm'] = { mesh: rightUsGroup, led: rightLed };
    this.roverGroup.add(rightUsGroup);

    // E. Gas Sensor Pod (MQ-2 / MQ-4 Gas Detection)
    const gasGroup = new THREE.Group();
    gasGroup.position.set(-0.35, 1.25, -0.3);
    const gasBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    const gasMeshCover = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.9 }));
    gasMeshCover.position.y = 0.08;
    const gasLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    gasLed.position.set(0, 0.18, 0);
    gasGroup.add(gasBase, gasMeshCover, gasLed);
    gasGroup.name = 'GAS_ARRAY';
    gasGroup.userData = { id: 'mq2_raw', name: 'MQ-2 / MQ-4 Gas Array', key: 'mq2_raw', desc: 'Analog Gas Transducers (GPIO 34 MQ-2 & GPIO 35 MQ-4)' };
    this.sensorMeshes['mq2_raw'] = { mesh: gasGroup, led: gasLed };
    this.roverGroup.add(gasGroup);

    // F. Atmospheric Sensor (DHT11 / BME280)
    const envGroup = new THREE.Group();
    envGroup.position.set(0.35, 1.25, -0.3);
    const dhtBlueBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }));
    dhtBlueBox.position.y = 0.08;
    const envLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    envLed.position.set(0, 0.18, 0);
    envGroup.add(dhtBlueBox, envLed);
    envGroup.name = 'DHT11';
    envGroup.userData = { id: 'temperature_c', name: 'DHT11 Temp & Humidity', key: 'temperature_c', desc: 'Digital Humidity & Temperature Transducer (GPIO 5)' };
    this.sensorMeshes['temperature_c'] = { mesh: envGroup, led: envLed };
    this.roverGroup.add(envGroup);

    // G. MPU6500 IMU & Encoder Status Node
    const mpuGroup = new THREE.Group();
    mpuGroup.position.set(0, 1.18, -0.6);
    const mpuChip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9 }));
    const mpuLed = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), createLedMat(0x10b981));
    mpuLed.position.set(0, 0.04, 0);
    mpuGroup.add(mpuChip, mpuLed);
    mpuGroup.name = 'MPU6500';
    mpuGroup.userData = { id: 'tilt_x', name: 'MPU6500 6-Axis IMU', key: 'tilt_x', desc: 'I2C 0x68 Pitch/Roll Inclinometer & Gyroscope' };
    this.sensorMeshes['tilt_x'] = { mesh: mpuGroup, led: mpuLed };
    this.roverGroup.add(mpuGroup);
  }

  _buildRadarGrid() {
    const grid = new THREE.GridHelper(10, 20, 0x20f58a, 0x14281e);
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Glowing Neon Green Radar Concentric Rings
    const ringGeo = new THREE.RingGeometry(1.6, 1.63, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x20f58a, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);

    const ringGeo2 = new THREE.RingGeometry(3.2, 3.24, 64);
    const ring2 = new THREE.Mesh(ringGeo2, ringMat.clone());
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.03;
    this.scene.add(ring2);

    const ringGeo3 = new THREE.RingGeometry(4.8, 4.83, 64);
    const ring3 = new THREE.Mesh(ringGeo3, new THREE.MeshBasicMaterial({ color: 0x20f58a, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
    ring3.rotation.x = Math.PI / 2;
    ring3.position.y = 0.03;
    this.scene.add(ring3);

    // Sweeping Radar Beam
    const sweepGeo = new THREE.PlaneGeometry(3.2, 0.04);
    const sweepMat = new THREE.MeshBasicMaterial({ color: 0x20f58a, transparent: true, opacity: 0.85 });
    this.radarSweep = new THREE.Mesh(sweepGeo, sweepMat);
    this.radarSweep.rotation.x = Math.PI / 2;
    this.radarSweep.position.y = 0.04;
    this.scene.add(this.radarSweep);
  }

  _bindEvents() {
    if (!this.container) return;

    this.onPointerMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.onClick = () => {
      if (this.hoveredComponent && this.options.onSelectComponent) {
        this.options.onSelectComponent(this.hoveredComponent.userData);
      }
    };

    this.container.addEventListener('mousemove', this.onPointerMove);
    this.container.addEventListener('click', this.onClick);

    window.addEventListener('resize', () => this.resize());
  }

  // Update sensor LEDs and pinned HUD readouts based on actual live telemetry
  updateTelemetry(telemetry) {
    if (!telemetry) return;

    const setLedColor = (key, hex) => {
      if (this.sensorMeshes[key] && this.sensorMeshes[key].led) {
        this.sensorMeshes[key].led.material.color.setHex(hex);
      }
    };

    // Front Distance LED & HUD
    const front = Number(telemetry.front_cm);
    if (isNaN(front) || front <= 0) setLedColor('front_cm', 0xef4444);
    else if (front < 25) setLedColor('front_cm', 0xf59e0b);
    else setLedColor('front_cm', 0x20f58a);

    const fEl = document.getElementById('hudTwinFront');
    if (fEl) fEl.textContent = telemetry.front_cm != null ? `${Number(telemetry.front_cm).toFixed(1)} cm` : 'Active';

    // Left Distance LED & HUD
    const left = Number(telemetry.left_cm);
    if (isNaN(left) || left <= 0) setLedColor('left_cm', 0x64748b);
    else if (left < 15) setLedColor('left_cm', 0xf59e0b);
    else setLedColor('left_cm', 0x20f58a);

    const lEl = document.getElementById('hudTwinLeft');
    if (lEl) lEl.textContent = telemetry.left_cm != null ? `${Number(telemetry.left_cm).toFixed(1)} cm` : 'Active';

    // Right Distance LED & HUD
    const right = Number(telemetry.right_cm);
    if (isNaN(right) || right <= 0) setLedColor('right_cm', 0x64748b);
    else if (right < 15) setLedColor('right_cm', 0xf59e0b);
    else setLedColor('right_cm', 0x20f58a);

    const rEl = document.getElementById('hudTwinRight');
    if (rEl) rEl.textContent = telemetry.right_cm != null ? `${Number(telemetry.right_cm).toFixed(1)} cm` : 'Active';

    // DHT11 Temp/Hum HUD
    const dhtEl = document.getElementById('hudTwinDht');
    if (dhtEl) dhtEl.textContent = telemetry.temperature_c != null ? `${Number(telemetry.temperature_c).toFixed(1)}°C` : 'Active';

    // Gas LED & HUD
    const mq2 = Number(telemetry.mq2_raw || 0);
    if (mq2 >= 3000) setLedColor('mq2_raw', 0xef4444);
    else if (mq2 >= 2000) setLedColor('mq2_raw', 0xf59e0b);
    else setLedColor('mq2_raw', 0x20f58a);

    const gasEl = document.getElementById('hudTwinGases');
    if (gasEl) gasEl.textContent = `MQ2:${telemetry.mq2_raw ?? '—'} MQ4:${telemetry.mq4_raw ?? '—'}`;

    // Encoder HUD
    const encEl = document.getElementById('hudTwinEncoder');
    if (encEl) encEl.textContent = telemetry.encoder_ticks != null ? `${telemetry.encoder_ticks} ticks` : 'Active';

    // Orientation HUD & MPU LED
    const tilt = Math.max(Math.abs(Number(telemetry.tilt_x || 0)), Math.abs(Number(telemetry.tilt_y || 0)));
    if (tilt > 30) setLedColor('tilt_x', 0xef4444);
    else if (tilt > 15) setLedColor('tilt_x', 0xf59e0b);
    else setLedColor('tilt_x', 0x20f58a);

    const oriEl = document.getElementById('hudTwinOrientation');
    if (oriEl) {
      const tx = telemetry.tilt_x != null ? Number(telemetry.tilt_x).toFixed(1) : '0.0';
      const ty = telemetry.tilt_y != null ? Number(telemetry.tilt_y).toFixed(1) : '0.0';
      oriEl.textContent = `${tx}°, ${ty}°, 0.0°`;
    }

    // Wi-Fi RSSI HUD
    const wifiEl = document.getElementById('twinWifiRssi');
    if (wifiEl && telemetry.wifi_rssi != null) {
      wifiEl.textContent = `${telemetry.wifi_rssi} dBm Connected`;
    }
  }

  // Camera Presets
  setCameraPreset(presetName) {
    if (!this.camera || !this.controls) return;
    const target = this.controls.target;

    switch (presetName) {
      case 'top':
        this.camera.position.set(0, 7.5, 0.01);
        break;
      case 'front':
        this.camera.position.set(0, 1.2, 5.5);
        break;
      case 'side':
        this.camera.position.set(5.5, 1.2, 0);
        break;
      case 'iso':
      default:
        this.camera.position.set(4.5, 3.2, 5.0);
        break;
    }
    this.controls.update();
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    if (this.isDisposed) return;
    this.animFrameId = requestAnimationFrame(() => this.animate());

    // Rotate Radar Sweep
    if (this.radarSweep) {
      this.radarSweep.rotation.z += 0.025;
    }

    // Raycast Interactive Components
    if (this.options.interactive && this.camera && this.roverGroup) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.roverGroup.children, true);

      let found = null;
      for (const hit of intersects) {
        let curr = hit.object;
        while (curr && curr !== this.roverGroup) {
          if (curr.userData && curr.userData.id) {
            found = curr;
            break;
          }
          curr = curr.parent;
        }
        if (found) break;
      }

      if (found !== this.hoveredComponent) {
        this.hoveredComponent = found;
        this.container.style.cursor = found ? 'pointer' : 'default';

        const tooltipEl = document.getElementById('rover3dTooltip');
        if (tooltipEl) {
          if (found) {
            tooltipEl.style.display = 'block';
            tooltipEl.innerHTML = `<b>${found.userData.name}</b><br><small>${found.userData.desc}</small>`;
          } else {
            tooltipEl.style.display = 'none';
          }
        }
      }
    }

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _renderFallback() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;padding:20px;text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">🤖</div>
        <b>TERRANEX 2D Digital Twin Active</b>
        <div style="font-size:10px;color:var(--text-sub);margin-top:4px;">WebGL hardware acceleration unavailable. 2D telemetry schematic mode engaged.</div>
      </div>
    `;
  }

  dispose() {
    this.isDisposed = true;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.container && this.onPointerMove) {
      this.container.removeEventListener('mousemove', this.onPointerMove);
      this.container.removeEventListener('click', this.onClick);
    }
    if (this.renderer && this.renderer.domElement) {
      this.renderer.dispose();
      this.container.innerHTML = '';
    }
  }
}

// Global 3D helper singleton
window.Terranex3DRover = Terranex3DRover;

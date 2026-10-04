'use strict';
/*
  Ported from the "Particle Saturn" Three.js React component (originkit) to
  plain JS. Same shaders/math/drag-orbit behaviour, mounted into any element
  with [data-particle-saturn]. Requires THREE to be loaded globally first.
*/
(function () {
  if (typeof THREE === 'undefined') {
    console.warn('ParticleSaturn: THREE.js not loaded, skipping');
    return;
  }

  const IS_LITE = (typeof matchMedia === 'function') &&
    (matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches);
  const MAX_DPR = IS_LITE ? 1.5 : 2;

  const PERSPECTIVE = 0.15;
  const VIEW_SPAN = 6.4;
  const CORE_RADIUS = 1;
  const MAX_MOTES = 90000;
  const RING_THICKNESS = 0.011;
  const RING_MOTE_FACTOR = 1.35;
  const TAU = Math.PI * 2;

  const DEFAULTS = {
    coreColor: '#99000B',
    ringColor: '#83030C',
    density: 10,
    particleSize: 14,
    glow: 20,
    tilt: 20,
    roll: 0,
    spinSpeed: 7,
    ringOptions: { innerRadius: 105, outerRadius: 262, gaps: 1, orbitSpeed: 9 },
    dragSensitivity: 2,
    sizePercent: 78,
  };

  function clamp(v, lo, hi, fallback) {
    const n = typeof v === 'number' && isFinite(v) ? v : fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  function settingsFor(cfg) {
    const ring = cfg.ringOptions || DEFAULTS.ringOptions;
    const density = clamp(cfg.density, 1, 20, DEFAULTS.density);
    const baseMotes = 600 + density * density * 95;
    const coreMotes = Math.min(MAX_MOTES, Math.round(baseMotes));
    const ringMotes = Math.min(MAX_MOTES, Math.round(baseMotes * RING_MOTE_FACTOR));
    const innerFraction = clamp(ring.innerRadius, 105, 200, DEFAULTS.ringOptions.innerRadius) / 100;
    const outerFraction = clamp(ring.outerRadius, 110, 300, DEFAULTS.ringOptions.outerRadius) / 100;

    return {
      coreMotes, ringMotes,
      moteSize: 0.5 + clamp(cfg.particleSize, 1, 20, DEFAULTS.particleSize) * 0.13,
      glow: 0.15 + clamp(cfg.glow, 1, 20, DEFAULTS.glow) * 0.055,
      tiltRadians: (clamp(cfg.tilt, -80, 80, DEFAULTS.tilt) * Math.PI) / 180,
      rollRadians: (clamp(cfg.roll, -90, 90, DEFAULTS.roll) * Math.PI) / 180,
      spinRate: clamp(cfg.spinSpeed, 0, 20, DEFAULTS.spinSpeed) * 0.05,
      innerRadius: innerFraction * CORE_RADIUS,
      outerRadius: Math.max(innerFraction + 0.08, outerFraction) * CORE_RADIUS,
      gapCount: Math.round(clamp(ring.gaps, 0, 4, DEFAULTS.ringOptions.gaps)),
      ringThickness: RING_THICKNESS,
      orbitRate: clamp(ring.orbitSpeed, 0, 20, DEFAULTS.ringOptions.orbitSpeed) * 0.11,
    };
  }

  function insideGap(S, radius, span) {
    for (let g = 0; g < S.gapCount; g++) {
      const centre = S.innerRadius + span * ((g + 1) / (S.gapCount + 1));
      const halfWidth = span * (0.075 - g * 0.011);
      if (Math.abs(radius - centre) < halfWidth) return true;
    }
    return false;
  }

  function pickRingRadius(S, span) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const u = Math.sqrt(Math.random());
      const radius = S.innerRadius + u * span;
      if (!insideGap(S, radius, span)) return radius;
    }
    return S.outerRadius;
  }

  function buildCloud(S) {
    const count = S.coreMotes + S.ringMotes;
    const position = new Float32Array(count * 3);
    const kind = new Float32Array(count);
    const along = new Float32Array(count);
    const seed = new Float32Array(count);
    const radius = new Float32Array(count);

    for (let i = 0; i < S.coreMotes; i++) {
      kind[i] = 0;
      along[i] = (i + 0.5) / S.coreMotes;
      seed[i] = Math.random();
      radius[i] = 0;
    }

    const span = S.outerRadius - S.innerRadius;
    for (let i = 0; i < S.ringMotes; i++) {
      const k = S.coreMotes + i;
      kind[k] = 1;
      along[k] = i / Math.max(1, S.ringMotes - 1);
      seed[k] = Math.random();
      radius[k] = pickRingRadius(S, span);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    return geometry;
  }

  const SATURN_VERTEX = `
    attribute float aKind;
    attribute float aAlong;
    attribute float aSeed;
    attribute float aRadius;

    uniform float uTime;
    uniform float uMoteSize;
    uniform float uOrbitRate;
    uniform float uRingThickness;
    uniform float uCoreRadius;
    uniform float uPixelRatio;

    varying float vKind;
    varying float vBright;

    const float TAU = 6.28318530718;

    float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

    void main() {
      vec3 modelPos;
      float bright = 1.0;

      if (aKind < 0.5) {
        float y = 1.0 - aAlong * 2.0;
        float ringRadius = sqrt(max(0.0, 1.0 - y * y));
        float theta = aAlong * 2399.96;
        modelPos = vec3(cos(theta) * ringRadius, y, sin(theta) * ringRadius) * uCoreRadius;
        modelPos *= 1.0 + (hash11(aSeed * 91.7) - 0.5) * 0.012;
        bright = 0.55 + hash11(aSeed * 13.1) * 0.6;
      } else {
        float orbitRadius = aRadius;
        float rate = uOrbitRate / pow(max(orbitRadius, 0.2), 1.5);
        float theta = aSeed * TAU + uTime * rate;
        float lift = (hash11(aSeed * 37.9) - 0.5) * 2.0 * uRingThickness;
        modelPos = vec3(cos(theta) * orbitRadius, lift, sin(theta) * orbitRadius);
        float lane = hash11(floor(orbitRadius * 46.0));
        bright = (0.35 + lane * 0.95) * (0.6 + hash11(aSeed * 5.3) * 0.7);
      }

      vec4 viewPos = modelViewMatrix * vec4(modelPos, 1.0);
      vec3 modelCentre = modelViewMatrix[3].xyz;
      vec3 fromCamera = viewPos.xyz;
      float rayLength = max(length(fromCamera), 1e-5);
      vec3 rayDir = fromCamera / rayLength;

      float alongRay = dot(modelCentre, rayDir);
      float offAxis = length(modelCentre - rayDir * alongRay);

      bool occluded;
      if (aKind < 0.5) {
        occluded = dot(viewPos.xyz - modelCentre, rayDir) > 0.0;
      } else {
        float inside = uCoreRadius * uCoreRadius - offAxis * offAxis;
        float nearHit = alongRay - sqrt(max(inside, 0.0));
        occluded = inside > 0.0 && rayLength > nearHit;
      }

      if (occluded) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vKind = aKind;
        vBright = 0.0;
        return;
      }

      gl_Position = projectionMatrix * viewPos;
      gl_PointSize = uMoteSize * uPixelRatio * (9.0 / max(0.001, -viewPos.z));
      vKind = aKind;
      vBright = bright;
    }
  `;

  const SATURN_FRAGMENT = `
    precision highp float;
    uniform vec3 uCoreColor;
    uniform vec3 uRingColor;
    uniform float uGlow;
    varying float vKind;
    varying float vBright;

    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float fall = 1.0 - d;
      float shape = pow(fall, 5.0) + pow(fall, 1.6) * 0.3;
      vec3 col = vKind < 0.5 ? uCoreColor : uRingColor;
      float a = shape * vBright * (0.35 + uGlow);
      gl_FragColor = vec4(col * a, a);
    }
  `;

  class SaturnScene {
    constructor(container, cfg) {
      this.container = container;
      this.cfg = cfg;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
      this.group = new THREE.Group();
      this.time = 0;
      this.spinAngle = 0;
      this.dragYaw = 0;
      this.dragPitch = 0;
      this.velocityYaw = 0;
      this.velocityPitch = 0;
      this.isDragging = false;
      this.lastX = 0;
      this.lastY = 0;
      this.width = 0;
      this.height = 0;
      this.frameId = 0;
      this.lastT = 0;
      this.disposed = false;
      this.unbind = () => {};

      const S = settingsFor(cfg);

      this.renderer = new THREE.WebGLRenderer({ antialias: !IS_LITE, alpha: true });
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      this.renderer.setPixelRatio(dpr);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      const el = this.renderer.domElement;
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.cursor = 'grab';
      el.style.touchAction = 'none';
      container.appendChild(el);

      this.material = new THREE.ShaderMaterial({
        vertexShader: SATURN_VERTEX,
        fragmentShader: SATURN_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uMoteSize: { value: S.moteSize },
          uOrbitRate: { value: S.orbitRate },
          uRingThickness: { value: S.ringThickness },
          uCoreRadius: { value: CORE_RADIUS },
          uPixelRatio: { value: dpr },
          uCoreColor: { value: new THREE.Color(cfg.coreColor) },
          uRingColor: { value: new THREE.Color(cfg.ringColor) },
          uGlow: { value: S.glow },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });

      this.cloudGeometry = buildCloud(S);
      this.cloud = new THREE.Points(this.cloudGeometry, this.material);
      this.cloud.frustumCulled = false;
      this.group.add(this.cloud);
      this.group.rotation.order = 'ZXY';
      this.scene.add(this.group);

      this.bindEvents();
    }

    bindEvents() {
      const el = this.renderer.domElement;
      const down = (e) => {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.velocityYaw = 0;
        this.velocityPitch = 0;
        el.style.cursor = 'grabbing';
      };
      const move = (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        const s = clamp(this.cfg.dragSensitivity, 0, 10, 3) * 0.007;
        this.dragYaw += dx * s;
        this.dragPitch += dy * s;
        this.velocityYaw = dx * s;
        this.velocityPitch = dy * s;
      };
      const up = () => { this.isDragging = false; el.style.cursor = 'grab'; };

      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);

      this.unbind = () => {
        el.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    }

    start() {
      this.lastT = performance.now();
      const loop = () => {
        this.frameId = requestAnimationFrame(loop);
        this.step();
      };
      loop();
    }

    setSize(width, height) {
      if (this.disposed || width <= 0 || height <= 0) return;
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.updateCamera();
    }

    updateCamera() {
      const w = Math.max(1, this.width);
      const h = Math.max(1, this.height);
      const aspect = w / h;
      const distance = 1 / PERSPECTIVE;
      const sizePct = clamp(this.cfg.sizePercent, 20, 200, 90);
      const span = VIEW_SPAN * (100 / sizePct);
      const visibleHeight = aspect < 1 ? span / aspect : span;

      this.camera.aspect = aspect;
      this.camera.position.set(0, 0, distance);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = 2 * Math.atan(visibleHeight / 2 / distance) * (180 / Math.PI);
      this.camera.near = Math.max(0.1, distance - 20);
      this.camera.far = distance + 20;
      this.camera.updateProjectionMatrix();
    }

    step() {
      if (this.disposed) return;
      const now = performance.now();
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;

      const S = settingsFor(this.cfg);
      this.time += dt;

      if (!this.isDragging) {
        const decay = Math.exp(-dt * 3);
        this.dragYaw += this.velocityYaw;
        this.dragPitch += this.velocityPitch;
        this.velocityYaw *= decay;
        this.velocityPitch *= decay;
        this.spinAngle += S.spinRate * dt;
      }

      const pitch = Math.max(-1.2, Math.min(1.2, this.dragPitch));
      this.group.rotation.set(S.tiltRadians + pitch, this.dragYaw + this.spinAngle, S.rollRadians);

      this.material.uniforms.uTime.value = this.time;
      this.renderer.render(this.scene, this.camera);
    }

    dispose() {
      this.disposed = true;
      cancelAnimationFrame(this.frameId);
      this.unbind();
      this.cloudGeometry.dispose();
      this.material.dispose();
      this.renderer.dispose();
      const el = this.renderer.domElement;
      if (el.parentNode === this.container) this.container.removeChild(el);
    }
  }

  /* Mount/unmount on viewport visibility so at most one extra WebGL
     context (besides the always-on Predictive Arc background) is ever
     alive from this component. It frees its context once scrolled well
     out of view, and re-creates it on return. */
  function watch(container) {
    if (!container || container.dataset.saturnWatched) return;
    container.dataset.saturnWatched = '1';

    const cfg = { ...DEFAULTS };
    let scene = null;
    let ro = null;

    function start() {
      if (scene) return;
      try {
        scene = new SaturnScene(container, cfg);
      } catch (e) {
        console.warn('ParticleSaturn init failed:', e);
        return;
      }
      scene.setSize(container.clientWidth, container.clientHeight);
      scene.start();
      ro = new ResizeObserver(() => scene && scene.setSize(container.clientWidth, container.clientHeight));
      ro.observe(container);
    }

    function stop() {
      if (ro) { ro.disconnect(); ro = null; }
      if (scene) { scene.dispose(); scene = null; }
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
      }, { rootMargin: '600px 0px' });
      io.observe(container);
    } else {
      start();
    }
  }

  function boot() {
    document.querySelectorAll('[data-particle-saturn]').forEach(watch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

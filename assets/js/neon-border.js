'use strict';
/*
  Ported from the "Neon Border" React component (originkit) to plain JS.
  Mounts an animated conic-gradient border+glow overlay into any element
  with [data-neon-border] (that element should be position:relative).
  Preset color: #4C0909, rest at component defaults.
*/
(function () {
  const DEFAULTS = {
    color: '#4C0909',
    rounded: 24,
    thickness: 6,
    borderSize: 50,
    glow: 100,
    movement: 'continuous',
    speed: 16,
  };

  const GLOW_LAYERS = [
    { blur: 8, opacity: 0.5, reach: 0.3 },
    { blur: 15, opacity: 0.3, reach: 0.6 },
    { blur: 57, opacity: 0.18, reach: 1 },
  ];
  const MAX_GLOW_BLUR = Math.max(...GLOW_LAYERS.map((l) => l.blur));
  const MAX_GLOW_REACH = 36;
  const ARC_SAMPLES = 24;
  const MIN_ARC = 0.015;

  const SLOWEST_CYCLE = 30, FASTEST_CYCLE = 4, SLOWEST_STEP = 3, FASTEST_STEP = 0.35;
  const STEP_EASE = [0.72, 0.16, 0.18, 1.05];
  const GLIDE_EASE = [0.65, 0, 0.35, 1];

  function withAlpha(input, alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    const s = String(input).trim();
    const hex = s.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h.slice(0, 6), 16);
      if (!Number.isFinite(n)) return `rgba(0,0,0,${a})`;
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    return `rgba(0,0,0,${a})`;
  }

  function perimeterPoint(u, w, h) {
    const d = (((u % 1) + 1) % 1) * 2 * (w + h);
    if (d < w) return [d, 0];
    if (d < w + h) return [w, d - w];
    if (d < w * 2 + h) return [w - (d - w - h), h];
    return [0, h - (d - w * 2 - h)];
  }

  function cornerLap(k, w, h) {
    const p = 2 * (w + h);
    const at = [0, w / p, (w + h) / p, (w * 2 + h) / p];
    return Math.floor(k / 4) + at[((k % 4) + 4) % 4];
  }

  function perimeterAngle(u, w, h) {
    const [x, y] = perimeterPoint(u, w, h);
    return (Math.atan2(x - w / 2, h / 2 - y) * 180) / Math.PI;
  }

  function buildArc(lap, lengthPct, w, h, color) {
    const fw = w > 0 ? w : 100;
    const fh = h > 0 ? h : 100;
    const len = Math.max(0, Math.min(100, lengthPct));
    const span = Math.max(MIN_ARC, (len / 100) * 0.5);
    const solidT = len / 100;

    const stops = [];
    let base = 0, prev = 0, acc = 0;

    for (let i = 0; i <= ARC_SAMPLES; i++) {
      const f = i / ARC_SAMPLES;
      const angle = perimeterAngle(lap + (f - 0.5) * span, fw, fh);
      if (i === 0) base = angle;
      else {
        let d = angle - prev;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        acc += d;
      }
      prev = angle;

      const t = Math.abs(f - 0.5) * 2;
      const k = solidT >= 1 ? 1 : t <= solidT ? 1 : 1 - (t - solidT) / (1 - solidT);
      stops.push(`${withAlpha(color, k * k * (3 - 2 * k))} ${acc.toFixed(2)}deg`);
    }

    const end = acc.toFixed(2);
    stops.push(`${withAlpha(color, 0)} ${end}deg`);
    stops.push(`${withAlpha(color, 0)} 360deg`);

    return `conic-gradient(from ${base.toFixed(2)}deg at 50% 50%, ${stops.join(', ')})`;
  }

  function makeEaseFn(pts) {
    const [x1, y1, x2, y2] = pts;
    const bez = (a, b, t) => { const u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; };
    return (t) => {
      const x = Math.max(0, Math.min(1, t));
      let s = x;
      for (let i = 0; i < 8; i++) {
        const cx = bez(x1, x2, s) - x;
        const u = 1 - s;
        const dx = 3 * u * u * x1 + 6 * u * s * (x2 - x1) + 3 * s * s * (1 - x2);
        if (Math.abs(dx) < 1e-6) break;
        s -= cx / dx;
        s = Math.max(0, Math.min(1, s));
      }
      return bez(y1, y2, s);
    };
  }
  const stepEase = makeEaseFn(STEP_EASE);
  const glideEase = makeEaseFn(GLIDE_EASE);

  function band(r, offset, radius) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:${offset - r}px;box-sizing:border-box;padding:${r}px;border-radius:${radius > 0 ? radius + r : 0}px;background:var(--arc);-webkit-mask-image:linear-gradient(#fff 0 0),linear-gradient(#fff 0 0);-webkit-mask-clip:content-box,border-box;-webkit-mask-composite:xor;mask-image:linear-gradient(#fff 0 0),linear-gradient(#fff 0 0);mask-clip:content-box,border-box;mask-composite:exclude;`;
    return el;
  }

  function mount(host, opts) {
    if (!host || host.dataset.neonMounted) return;
    host.dataset.neonMounted = '1';
    const cfg = { ...DEFAULTS, ...(opts || {}) };

    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    // Match the host's own CSS corner radius exactly, rather than the
    // original component's percentage-of-box-size guess — otherwise the
    // animated band's corner curve disagrees with the actual rounded
    // corner and the background shows through in a sliver at each corner.
    const cssRadius = parseFloat(cs.borderRadius) || 0;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;';
    host.appendChild(wrap);

    const groupA = document.createElement('div');
    const groupB = document.createElement('div');
    [groupA, groupB].forEach((g) => { g.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;'; wrap.appendChild(g); });

    let size = { w: host.clientWidth, h: host.clientHeight };
    const thick = Math.max(1, Math.min(10, cfg.thickness));
    const amount = Math.max(0, Math.min(100, cfg.glow)) / 100;

    function radius() {
      return cssRadius;
    }

    function buildGroup(group, startLap) {
      group.innerHTML = '';
      const r = radius();
      group.style.setProperty('--arc', buildArc(startLap, cfg.borderSize, size.w, size.h, cfg.color));

      if (amount > 0) {
        GLOW_LAYERS.forEach((l) => {
          const ringAt = thick + amount * MAX_GLOW_REACH * l.reach;
          const glowOuter = 10 + MAX_GLOW_REACH + MAX_GLOW_BLUR * 2;
          const layer = document.createElement('div');
          layer.style.cssText = `position:absolute;inset:${-glowOuter}px;box-sizing:border-box;padding:${glowOuter}px;border-radius:${r > 0 ? r + glowOuter : 0}px;opacity:${l.opacity};mix-blend-mode:plus-lighter;filter:${l.blur ? `blur(${l.blur}px)` : 'none'};`;
          layer.appendChild(band(ringAt, glowOuter, r));
          group.appendChild(layer);
        });
      }
      for (let i = 0; i < 2; i++) {
        const edge = document.createElement('div');
        edge.style.cssText = 'position:absolute;inset:0;mix-blend-mode:plus-lighter;';
        edge.appendChild(band(thick, 0, r));
        group.appendChild(edge);
      }
    }

    buildGroup(groupA, 0);
    buildGroup(groupB, 0.5);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        if (r.width === size.w && r.height === size.h) return;
        size = { w: r.width, h: r.height };
      });
      ro.observe(host);
    }

    let lap = 0, corner = 0, stepT = 0, last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const s = Math.max(0, Math.min(20, cfg.speed));

      if (s > 0) {
        const step = cfg.movement === 'step';
        const beat = step
          ? SLOWEST_STEP + ((FASTEST_STEP - SLOWEST_STEP) * (s - 1)) / 19
          : (SLOWEST_CYCLE + ((FASTEST_CYCLE - SLOWEST_CYCLE) * (s - 1)) / 19) / 4;

        stepT += dt / beat;
        while (stepT >= 1) { stepT -= 1; corner += 1; }
        const eased = step ? stepEase(Math.min(1, stepT * 2)) : glideEase(stepT);

        const fw = size.w > 0 ? size.w : 100;
        const fh = size.h > 0 ? size.h : 100;
        const from = cornerLap(corner, fw, fh);
        const to = cornerLap(corner + 1, fw, fh);
        lap = from + (to - from) * eased;

        groupA.style.setProperty('--arc', buildArc(lap, cfg.borderSize, size.w, size.h, cfg.color));
        groupB.style.setProperty('--arc', buildArc(lap + 0.5, cfg.borderSize, size.w, size.h, cfg.color));
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    document.querySelectorAll('[data-neon-border]').forEach((el) => {
      const color = el.getAttribute('data-neon-color') || undefined;
      mount(el, color ? { color } : undefined);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

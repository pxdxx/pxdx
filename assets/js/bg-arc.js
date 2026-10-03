'use strict';
/*
  Ported from the "Predictive Arc Echo" WebGL background (originkit) React
  component to plain JS — same shaders/math (multiple stacked echo arcs),
  driven by requestAnimationFrame instead of React state. Config below is
  the component's own preset resolved through its default-merging logic.
*/
(function () {
  const MAX_DPR = 2;
  const PTR_RATE = 6.0;

  const VERT_SRC = `
    attribute vec2 a_pos;
    void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG_SRC = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform vec2  uRes;
    uniform float uTime, uDpr, uCell, uDot, uHover;
    uniform vec2  uPtr;
    uniform float uA, uB, uC, uD;
    uniform vec3  uBg, uBase, uAccent, uHigh;

    void main(){
      float cs = max(uCell, 2.0);
      vec2 ci = floor(gl_FragCoord.xy / cs);
      vec2 cc = (ci + 0.5) * cs;

      float x = cc.x / uDpr;
      float y = (uRes.y - cc.y) / uDpr;
      float w = uRes.x / uDpr;
      float h = uRes.y / uDpr;
      float t = uTime;

      float i = 0.0;
      float leanX = (uPtr.x - w * 0.5) * 0.5 * uHover;
      float leanY = (uPtr.y - h * 0.5) * 0.25 * uHover;
      float n1 = max(uA, 1.0);
      for (int n = 0; n < 8; n++) {
        float fn = float(n);
        if (fn >= n1) break;
        float par = 1.0 - 0.6 * fn / n1;
        float cx = w * 0.5 + leanX * par;
        float normX = (x - cx) / (w * 0.75);
        float curveY = h * 0.3 + fn * h * uB + leanY * par
                     + normX * normX * h * uC * (1.0 + 0.08 * fn);
        float th = (40.0 + (1.0 - min(abs(normX), 1.0)) * 25.0) * uD;
        float dist = abs(y - curveY);
        if (dist < th) {
          float b = 1.0 - dist / th;
          float waveX = sin(x * 0.015 + t);
          float waveY = cos(y * 0.02 + t);
          b = b * 0.7 + waveX * waveY * 0.3 * b;
          b *= max(0.0, 1.0 - pow(abs(normX), 2.5));
          b *= 0.45 + 0.55 * (0.5 + 0.5 * sin(t * 1.5 - fn * 0.9));
          i = max(i, b);
        }
      }

      vec3 col = uBg;
      if (i > 0.02) {
        float side = uDot * i * uDpr;
        vec2 d = abs(gl_FragCoord.xy - cc);
        float cov = 1.0 - smoothstep(side * 0.5 - 1.0, side * 0.5 + 1.0, max(d.x, d.y));

        vec3 ink = mix(uBase, uAccent, clamp(pow(i, 1.1), 0.0, 1.0));
        ink = mix(ink, uHigh, smoothstep(0.72, 1.0, i));
        col = mix(uBg, ink, cov * clamp(i * 1.6, 0.0, 1.0));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // Resolved from the component's __originkitPresetProps.
  const CFG = {
    bg:     [0, 0, 0],                     // #000000
    base:   [1, 0, 0],                     // #FF0000
    accent: [0.5059, 0.0157, 0.0157],      // #810404
    high:   [1, 1, 1],                     // #FFFFFF (alpha suffix ignored, as upstream)
    density: 165,
    dotSize: 1.05,
    speed: 1.0,
    hover: 0,
    count: 5,       // uA — number of stacked echo arcs
    gap: 0.09,       // uB — vertical gap between echoes (fraction of height)
    archHeight: 0.7, // uC
    thickness: 1.0,  // uD
  };

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('bg-arc shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function start() {
    const canvas = document.createElement('canvas');
    canvas.id = 'bgArc';
    document.body.insertBefore(canvas, document.body.firstChild);

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) { console.warn('bg-arc: WebGL unavailable, keeping flat background'); return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('bg-arc link error:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const locs = {};
    const u = (name) => (name in locs) ? locs[name] : (locs[name] = gl.getUniformLocation(prog, name));

    const ptr = { tx: 0.5, ty: 0.5, x: 0.5, y: 0.5 };

    window.addEventListener('pointermove', (e) => {
      ptr.tx = Math.min(1, Math.max(0, e.clientX / window.innerWidth));
      ptr.ty = Math.min(1, Math.max(0, 1 - e.clientY / window.innerHeight));
    }, { passive: true });
    document.addEventListener('mouseleave', () => { ptr.tx = 0.5; ptr.ty = 0.5; });

    let raf = 0;
    let last = performance.now();
    let clock = 0;

    function render(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock = (clock + dt * 0.9 * CFG.speed) % 6283;

      const k = 1 - Math.exp(-dt * PTR_RATE);
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = window.innerWidth, ch = window.innerHeight;
      const bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      gl.viewport(0, 0, bw, bh);

      const pitchCss = Math.min(bw, bh) / dpr / CFG.density;

      gl.uniform2f(u('uRes'), bw, bh);
      gl.uniform1f(u('uTime'), clock);
      gl.uniform1f(u('uDpr'), dpr);
      gl.uniform1f(u('uCell'), Math.max(2, pitchCss * dpr));
      gl.uniform1f(u('uDot'), pitchCss * 1.2 * CFG.dotSize);
      gl.uniform1f(u('uA'), CFG.count);
      gl.uniform1f(u('uB'), CFG.gap);
      gl.uniform1f(u('uC'), CFG.archHeight);
      gl.uniform1f(u('uD'), CFG.thickness);
      gl.uniform1f(u('uHover'), CFG.hover);
      gl.uniform2f(u('uPtr'), ptr.x * cw, ptr.y * ch);
      gl.uniform3f(u('uBg'), CFG.bg[0], CFG.bg[1], CFG.bg[2]);
      gl.uniform3f(u('uBase'), CFG.base[0], CFG.base[1], CFG.base[2]);
      gl.uniform3f(u('uAccent'), CFG.accent[0], CFG.accent[1], CFG.accent[2]);
      gl.uniform3f(u('uHigh'), CFG.high[0], CFG.high[1], CFG.high[2]);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

// Hero particle field: a starfield whose densest region traces the "Ora" arc,
// with soft additive point sprites, per-particle twinkle, gentle curl drift,
// mouse parallax, and a scroll-driven dispersion. Replaces the static SVG arc.

import * as THREE from 'three';

const RING_COUNT = 16000;
const STAR_COUNT = 3500;

// Horizontal gradient across the dome. Left → right = warm amber → plum,
// matching the SVG oraCol stops.
const G1 = new THREE.Color('#F3841D'); // 0.00
const G2 = new THREE.Color('#EA582C'); // 0.35
const G3 = new THREE.Color('#BE4046'); // 0.70
const G4 = new THREE.Color('#70385D'); // 1.00

function gradientColor(t: number, out: THREE.Color): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.35) return out.copy(G1).lerp(G2, t / 0.35);
  if (t < 0.70) return out.copy(G2).lerp(G3, (t - 0.35) / 0.35);
  return out.copy(G3).lerp(G4, (t - 0.70) / 0.30);
}

export interface HeroParticles {
  dispose: () => void;
}

export function initHeroParticles(canvas: HTMLCanvasElement, host: HTMLElement): HeroParticles {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  // Orthographic camera in normalized pixel space so sampled DOM coords map
  // 1:1 to particle positions. z=1 keeps everything in a single depth plane.
  let W = host.clientWidth || window.innerWidth;
  let H = host.clientHeight || window.innerHeight;
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -1000, 1000);
  camera.position.z = 10;

  const total = RING_COUNT + STAR_COUNT;
  const positions = new Float32Array(total * 3); // rest position (target)
  const seeds = new Float32Array(total * 3);     // random per-particle offsets
  const sizes = new Float32Array(total);
  const colors = new Float32Array(total * 3);

  layoutParticles(positions, seeds, sizes, colors, W, H);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uScroll: { value: 0 },
    uViewport: { value: new THREE.Vector2(W, H) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aSeed;
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uMouse;
      uniform float uScroll;
      uniform vec2 uViewport;
      varying vec3 vColor;
      varying float vTwinkle;

      // Cheap 2D pseudo-curl based on stacked sines. Not a true curl-noise but
      // divergence-free enough to read as an organic swirl at this scale.
      vec2 flow(vec2 p, float t) {
        float a = sin(p.y * 0.6 + t) + cos(p.x * 0.4 - t * 0.7);
        float b = sin(p.x * 0.5 - t * 0.9) + cos(p.y * 0.7 + t * 0.6);
        return vec2(a, b);
      }

      void main() {
        vec3 pos = position;
        float t = uTime * 0.18;

        // Organic drift (kept small so the Ora silhouette stays legible).
        vec2 f = flow(pos.xy * 0.004 + aSeed.xy * 6.28, t + aSeed.z * 6.28);
        pos.xy += f * (3.0 + aSeed.z * 5.0);

        // Radial dispersion tied to scroll — particles bloom outward as the
        // user scrolls past the hero, then re-converge on the way back up.
        float dispersion = uScroll;
        vec2 fromCenter = pos.xy;
        pos.xy += normalize(fromCenter + vec2(0.0001)) * dispersion * (120.0 + aSeed.z * 240.0);

        // Mouse parallax — depth is faked from the seed so nearer particles
        // parallax more, giving a subtle 3D shear against cursor motion.
        float depth = 0.35 + aSeed.z * 0.65;
        pos.xy += uMouse * depth * 40.0;

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;

        // Twinkle: individual sinusoids with de-synced phases.
        float tw = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed.z * 2.4) + aSeed.x * 12.5);
        vTwinkle = tw;
        vColor = aColor;

        gl_PointSize = aSize * uPixelRatio * (0.6 + tw * 0.8);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vColor;
      varying float vTwinkle;

      void main() {
        // Circular soft-edged sprite via gl_PointCoord.
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;

        // Bright core + wide falloff = additive bloom look.
        float core = smoothstep(0.5, 0.0, d);
        float glow = smoothstep(0.5, 0.15, d) * 0.35;
        float alpha = (core + glow) * (0.35 + vTwinkle * 0.65);

        vec3 col = vColor * (0.6 + vTwinkle * 0.8);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  scene.add(points);

  // ── interaction & resize ──────────────────────────────────────────────
  const targetMouse = new THREE.Vector2(0, 0);
  const onPointerMove = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    targetMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    targetMouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const heroScroll = document.getElementById('heroScroll');
  const readScroll = () => {
    if (!heroScroll) return 0;
    const total = heroScroll.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const raw = -heroScroll.getBoundingClientRect().top / total;
    return Math.max(0, Math.min(1, raw));
  };

  const resize = () => {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2;
    camera.top = H / 2; camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    uniforms.uViewport.value.set(W, H);
    // Re-layout so the ring silhouette rescales with the viewport.
    layoutParticles(positions, seeds, sizes, colors, W, H);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  };
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    const dt = clock.getDelta();
    uniforms.uTime.value += dt;
    // Ease mouse toward target so parallax feels weighty rather than jittery.
    uniforms.uMouse.value.x += (targetMouse.x - uniforms.uMouse.value.x) * 0.06;
    uniforms.uMouse.value.y += (targetMouse.y - uniforms.uMouse.value.y) * 0.06;
    uniforms.uScroll.value += (readScroll() - uniforms.uScroll.value) * 0.08;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      geo.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}

function layoutParticles(
  positions: Float32Array,
  seeds: Float32Array,
  sizes: Float32Array,
  colors: Float32Array,
  W: number,
  H: number,
) {
  // Parametric annulus (top half) — angle θ swept uniformly across [0, π]
  // so the crown of the dome under the hero copy is as dense as the flanks.
  // Radii are sized to match the old SVG's dome proportions and clamped so
  // the top of the arc never gets clipped by the viewport.
  const rOuter = Math.min(W * 0.42, H * 0.78);
  const rInner = rOuter * 0.66;
  const centerX = 0;
  // Anchor the ring center just below the hero's bottom edge so only the
  // top dome is visible, mirroring the old `bottom:-8%` placement.
  const centerY = -H / 2 - H * 0.05;

  const arcMinX = centerX - rOuter;
  const arcMaxX = centerX + rOuter;

  const col = new THREE.Color();

  for (let i = 0; i < RING_COUNT; i++) {
    // Uniform-area sampling: r = sqrt(mix(rIn², rOut², u)).
    const ur = Math.random();
    const r = Math.sqrt(rInner * rInner + ur * (rOuter * rOuter - rInner * rInner));
    // Uniform θ in [0, π] → top half only. Tiny jitter (<0.5°) softens the
    // angular banding on the outer edge without smearing the silhouette.
    const theta = Math.random() * Math.PI + (Math.random() - 0.5) * 0.008;

    const x = centerX + Math.cos(theta) * r;
    const y = centerY + Math.sin(theta) * r;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;

    seeds[i * 3 + 0] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    // aSeed.z is reused in the shader as a "is ring" flag by encoding a
    // lower drift budget for ring particles (0..0.5) vs stars (0.5..1).
    seeds[i * 3 + 2] = Math.random() * 0.5;

    // Horizontal 4-stop gradient — the SVG oraCol stops mapped left→right.
    if (Math.random() < 0.03) {
      col.set('#ffffff');
    } else {
      const t = (x - arcMinX) / (arcMaxX - arcMinX);
      gradientColor(t, col);
    }
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    sizes[i] = 1.6 + Math.random() * 3.0;
  }

  // Ambient starfield — full viewport, sparse, mostly white with warm tints.
  for (let i = RING_COUNT; i < RING_COUNT + STAR_COUNT; i++) {
    const x = (Math.random() - 0.5) * W * 1.15;
    const y = (Math.random() - 0.5) * H * 1.15;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;

    seeds[i * 3 + 0] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = 0.5 + Math.random() * 0.5; // stars: higher drift/parallax band

    let col: THREE.Color;
    const r = Math.random();
    if (r < 0.75) col = new THREE.Color('#ffffff');
    else if (r < 0.92) col = new THREE.Color('#FFB48A');
    else col = new THREE.Color('#F3841D');
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    sizes[i] = 0.8 + Math.random() * 1.8;
  }
}

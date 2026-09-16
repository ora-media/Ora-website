// Live configurator for the Glass Arc. Mounts a lil-gui panel bound to the
// arc handles exposed by initHero3D(). Gated behind a URL flag so it never
// ships to normal visitors:
//
//   http://localhost:4321/?arc         — opens the panel
//   http://localhost:4321/?arc=closed  — mounts collapsed
//
// Preset flow:
//   • Tweak values live (all changes render immediately).
//   • "Copy preset" → JSON on the clipboard.
//   • Paste that JSON into arcCfg defaults in hero3d.ts to bake it in.

import GUI from 'lil-gui';
import type * as THREE from 'three';

type ArcAPI = {
  cfg: any;
  applyMaterial: () => void;
  regenGradient: () => void;
  applyBackdrop: () => void;
  applyTransform: () => void;
  rebuildArc: () => void;
  rebuildCubeRT: () => void;
  exportPreset: () => string;
  importPreset: (json: string) => void;
};

export function mountArcConfig(arc: ArcAPI, opts: { open?: boolean } = {}) {
  const gui = new GUI({ title: 'Glass Arc — Live Config', width: 320 });
  if (opts.open === false) gui.close();
  // Push above hero content
  Object.assign(gui.domElement.style, {
    position: 'fixed', top: '12px', right: '12px', zIndex: '99999',
    maxHeight: 'calc(100vh - 24px)', overflow: 'auto',
  });

  const cfg = arc.cfg;
  const applyMat = () => arc.applyMaterial();
  const rebuild = () => arc.rebuildArc();
  const xform = () => arc.applyTransform();
  const regenGrad = () => arc.regenGradient();
  const backdrop = () => { arc.applyBackdrop(); arc.rebuildArc(); };

  // ── Geometry ────────────────────────────────────────────────────────
  const fG = gui.addFolder('Geometry');
  fG.add(cfg, 'majorMul', 0.05, 1.0, 0.01).name('major radius × vw').onChange(rebuild);
  fG.add(cfg, 'majorMax', 100, 2000, 10).name('major radius max px').onChange(rebuild);
  fG.add(cfg, 'minorMul', 0.005, 0.2, 0.001).name('tube × vw').onChange(rebuild);
  fG.add(cfg, 'minorMax', 10, 300, 1).name('tube max px').onChange(rebuild);
  fG.add(cfg, 'radialSegments', 6, 128, 1).name('radial segs').onChange(rebuild);
  fG.add(cfg, 'tubularSegments', 16, 512, 1).name('tubular segs').onChange(rebuild);
  fG.add(cfg, 'arcAngleDeg', 30, 360, 1).name('arc angle°').onChange(rebuild);
  fG.add(cfg, 'visible').name('visible').onChange(xform);

  // ── Transform ───────────────────────────────────────────────────────
  const fT = gui.addFolder('Transform');
  fT.add(cfg, 'posXMul', -1, 1, 0.01).name('pos X × vw').onChange(xform);
  fT.add(cfg, 'posYMul', -1, 1, 0.01).name('pos Y × vh').onChange(xform);
  fT.add(cfg, 'posZ', -500, 500, 1).name('pos Z (px)').onChange(xform);
  fT.add(cfg, 'rotX', -180, 180, 1).name('rot X°').onChange(xform);
  fT.add(cfg, 'rotY', -180, 180, 1).name('rot Y°').onChange(xform);
  fT.add(cfg, 'rotZ', -180, 180, 1).name('rot Z°').onChange(xform);

  // ── Material ────────────────────────────────────────────────────────
  const fM = gui.addFolder('Material');
  fM.addColor(cfg, 'baseColor').name('base color').onChange(applyMat);
  fM.add(cfg, 'roughness', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'metalness', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'clearcoat', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'clearcoatRoughness', 0, 1, 0.01).name('clearcoat rough').onChange(applyMat);
  fM.add(cfg, 'reflectivity', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'envMapIntensity', 0, 4, 0.05).name('envMap intensity').onChange(applyMat);
  fM.add(cfg, 'transmission', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'thickness', 0, 10, 0.05).onChange(applyMat);
  fM.add(cfg, 'ior', 1, 2.333, 0.01).onChange(applyMat);
  fM.addColor(cfg, 'attenuationColor').name('atten color').onChange(applyMat);
  fM.add(cfg, 'attenuationDistance', 0.1, 50, 0.1).name('atten dist').onChange(applyMat);
  fM.add(cfg, 'sheen', 0, 1, 0.01).onChange(applyMat);
  fM.addColor(cfg, 'sheenColor').onChange(applyMat);
  fM.add(cfg, 'sheenRoughness', 0, 1, 0.01).name('sheen rough').onChange(applyMat);
  fM.add(cfg, 'iridescence', 0, 1, 0.01).onChange(applyMat);
  fM.add(cfg, 'iridescenceIOR', 1, 2.333, 0.01).name('iridescence IOR').onChange(applyMat);
  fM.add(cfg, 'dispersion', 0, 0.5, 0.005).name('dispersion (chromatic)').onChange(applyMat);
  fM.add(cfg, 'doubleSide').onChange(applyMat);

  // ── Backdrop (refracted sunset) ─────────────────────────────────────
  const fB = gui.addFolder('Backdrop');
  fB.add(cfg.backdrop, 'enabled').onChange(backdrop);
  fB.add(cfg.backdrop, 'widthMul', 0.5, 4, 0.05).name('width × R').onChange(backdrop);
  fB.add(cfg.backdrop, 'heightMul', 0.3, 3, 0.05).name('height × R').onChange(backdrop);
  fB.add(cfg.backdrop, 'zOffset', -800, 0, 5).name('Z offset (px)').onChange(backdrop);
  fB.add(cfg.backdrop, 'opacity', 0, 1, 0.01).onChange(backdrop);
  fB.add(cfg.backdrop, 'angleDeg', 0, 360, 1).name('gradient angle°').onChange(regenGrad);
  fB.add(cfg.backdrop, 'emissive', 0, 3, 0.05).name('emissive boost').onChange(backdrop);

  // ── Motion ──────────────────────────────────────────────────────────
  const fMo = gui.addFolder('Motion');
  fMo.add(cfg.motion, 'bobAmp', 0, 40, 0.5).name('bob amp (px)');
  fMo.add(cfg.motion, 'bobSpeed', 0, 3, 0.01).name('bob speed');
  fMo.add(cfg.motion, 'tiltAmpX', 0, 0.3, 0.005).name('tilt X (rad)');
  fMo.add(cfg.motion, 'tiltAmpZ', 0, 0.3, 0.005).name('tilt Z (rad)');
  fMo.add(cfg.motion, 'tiltSpeed', 0, 3, 0.01).name('tilt speed');
  fMo.add(cfg.motion, 'parallaxRot', 0, 0.5, 0.005).name('parallax rot');
  fMo.add(cfg.motion, 'parallaxPos', 0, 120, 1).name('parallax pos (px)');

  // ── Gradient (4 stops) ──────────────────────────────────────────────
  const fGr = gui.addFolder('Gradient');
  cfg.grad.forEach((stop: { pos: number; color: string }, i: number) => {
    const sub = fGr.addFolder(`stop ${i + 1}`);
    sub.add(stop, 'pos', 0, 1, 0.001).name('position').onChange(regenGrad);
    sub.addColor(stop, 'color').name('color').onChange(regenGrad);
  });

  // ── Reflection pipeline ─────────────────────────────────────────────
  const fR = gui.addFolder('Reflection Pipeline');
  fR.add(cfg, 'cubeRTSize', { '128': 128, '256': 256, '384': 384, '512': 512, '768': 768 })
    .name('cube RT size')
    .onChange((v: number) => { cfg.cubeRTSize = +v; arc.rebuildCubeRT(); });
  fR.add(cfg, 'updateEveryNthFrame', 1, 6, 1).name('update every N frames');
  fR.add(cfg, 'cubeCamYOffsetMul', -1, 1, 0.01).name('cubeCam Y offset × R').onChange(xform);

  // ── Presets ─────────────────────────────────────────────────────────
  const fP = gui.addFolder('Preset');
  fP.add({
    copy: async () => {
      const json = arc.exportPreset();
      try { await navigator.clipboard.writeText(json); console.log('[arc preset]\n' + json); }
      catch { console.log('[arc preset]\n' + json); }
    },
  }, 'copy').name('Copy preset → clipboard');
  fP.add({
    paste: async () => {
      const json = prompt('Paste arc preset JSON');
      if (json) arc.importPreset(json);
      gui.controllersRecursive().forEach(c => c.updateDisplay());
    },
  }, 'paste').name('Import preset');
  fP.add({ log: () => console.log(arc.exportPreset()) }, 'log').name('Log preset to console');

  return { gui, destroy: () => gui.destroy() };
}

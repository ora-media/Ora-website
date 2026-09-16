// Hero 3D scene — vanilla Three.js, no framework runtime.
//
// Pipeline A: 2.5D depth + normal-mapped planes.
//   • Each hero object is a PNG cutout mapped onto a subdivided plane.
//   • If a matching *_normal.png and/or *_depth.png sits next to the cutout,
//     it is auto-loaded and wired into a MeshPhysicalMaterial for real volume.
//   • Missing maps? The plane renders as a lit, glossy cutout — no error.
//
// ── Generating the maps (one-time, offline) ─────────────────────────────
//   Normal maps: https://cpetry.github.io/NormalMap-Online/  (drag PNG, export)
//               Photoshop → Filter → 3D → Generate Normal Map.
//   Depth maps : https://huggingface.co/spaces/LiheYoung/Depth-Anything
//               Or Photoshop → Filter → 3D → Generate Bump Map.
//   Naming     : /images/retro-floppy.png
//                /images/retro-floppy_normal.png
//                /images/retro-floppy_depth.png
//   Drop them in /public/images/ and the scene picks them up on next reload.
//
// ── Upgrading to real 3D (Pipeline B) ───────────────────────────────────
//   Replace an entry's `image` with `glb: '/models/floppy.glb'` and the loader
//   swaps in a full GLTF asset (uses the same lighting + env). See loadObject().

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

type ObjSpec = {
  id: string;
  image?: string;           // PNG cutout (Pipeline A)
  glb?: string;             // Optional GLB (Pipeline B)
  // Placement in viewport %: center of the object.
  cx: number; cy: number;
  // Intrinsic size in CSS pixels at rest.
  w: number; h: number;
  z: number;                // World z-depth (px). Negative = further back.
  float: { amp: number; speed: number; phase: number };
  wobble: { x: number; y: number; speed: number };
  parallax: number;         // 0..1 — how much this object responds to mouse.
  displacement?: number;    // Override displacement strength (px).
};

const SCENE: ObjSpec[] = [
  // Astronaut / character — front-right, biggest parallax response.
  { id: 'mascot',
    image: '/images/astronaut.webp',
    cx: 78, cy: 62, w: 460, h: 528, z: 40,
    float:   { amp: 10, speed: 0.9, phase: 0.0 },
    wobble:  { x: 0.03, y: 0.04, speed: 0.7 },
    parallax: 1.0,
    displacement: 14 },

  { id: 'keyboard',
    image: '/images/retro-keyboard.png',
    cx: 58, cy: 78, w: 200, h: 145, z: -60,
    float:   { amp: 8,  speed: 1.2, phase: 1.3 },
    wobble:  { x: 0.06, y: 0.10, speed: 1.1 },
    parallax: 0.55,
    displacement: 10 },

  { id: 'floppy',
    image: '/images/retro-floppy.png',
    cx: 60, cy: 46, w: 110, h: 130, z: 20,
    float:   { amp: 14, speed: 1.6, phase: 2.4 },
    wobble:  { x: 0.10, y: 0.12, speed: 1.4 },
    parallax: 0.75,
    displacement: 8 },

  { id: 'paper1',
    image: '/images/retro-paper1.png',
    cx: 68, cy: 90, w: 150, h: 108, z: -20,
    float:   { amp: 10, speed: 1.35, phase: 0.7 },
    wobble:  { x: 0.05, y: 0.09, speed: 0.9 },
    parallax: 0.4,
    displacement: 6 },

  { id: 'paper2',
    image: '/images/retro-paper2.png',
    cx: 90, cy: 66, w: 115, h: 132, z: -10,
    float:   { amp: 12, speed: 1.05, phase: 3.1 },
    wobble:  { x: 0.07, y: 0.06, speed: 1.2 },
    parallax: 0.5,
    displacement: 6 },
];

const CAMERA_FOV = 35;

// Layer 0 = default (reflectable props, background).
// Layer 2 = the glass arc itself — excluded from the CubeCamera capture so
//           it never reflects itself (prevents feedback + recursion).
const LAYER_ARC = 2;

export function initHero3D(canvas: HTMLCanvasElement) {
  // Respect reduced-motion + low-end devices.
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();

  // Perspective sized so 1 world unit = 1 CSS pixel at z=0.
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 10, 5000);
  camera.layers.enable(0);
  camera.layers.enable(LAYER_ARC);
  const setCameraDistance = (h: number) => {
    camera.position.z = (h / 2) / Math.tan((CAMERA_FOV * Math.PI / 180) / 2);
  };

  // Lighting rig — warm key from bottom-left, cool rim from top-right.
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const key = new THREE.DirectionalLight(0xff8b3a, 1.7);
  key.position.set(-600, -400, 600);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.9);
  rim.position.set(500, 500, -200);
  const fill = new THREE.HemisphereLight(0xffe0c2, 0x1a1030, 0.35);
  // Mouse-tracked spec highlight.
  const mouseLight = new THREE.PointLight(0xffffff, 0.9, 1400, 2);
  mouseLight.position.set(0, 0, 400);
  scene.add(ambient, key, rim, fill, mouseLight);

  // Environment (subtle — big impact on physical materials without an HDR).
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  {
    // Procedural night-warm gradient env, no external file.
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#1a1130');
    grad.addColorStop(0.55, '#2a1a2e');
    grad.addColorStop(0.85, '#ff7a2e');
    grad.addColorStop(1.00, '#ffb060');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
  }

  // ── Glass Arc ──────────────────────────────────────────────────────
  // Torus-knot-inspired striped clear glass. The sunset colors don't tint
  // the glass — they live on a backplane behind the arc and are pulled
  // through it via refraction + dispersion.
  //
  // Every knob lives on `arcCfg` so the configurator can mutate it live.
  const arcCfg = {
    // Geometry
    majorMul: 0.42, majorMax: 820,
    minorMul: 0.08,  minorMax: 130,        // thicker tube = stronger lensing
    radialSegments: 64,
    tubularSegments: 320,
    arcAngleDeg: 180,
    // Transform
    posXMul: 0, posYMul: -0.45, posZ: -40,
    rotX: 0, rotY: 0, rotZ: 0,
    // Backdrop gradient (sunset — refracted THROUGH the arc)
    grad: [
      { pos: 0.00, color: '#181111' },
      { pos: 0.35, color: '#F25C05' },
      { pos: 0.65, color: '#F07167' },
      { pos: 1.00, color: '#181111' },
    ] as { pos: number; color: string }[],
    // Backdrop plane behind the arc — carries the sunset that gets refracted.
    backdrop: {
      enabled: false,
      widthMul: 1.6,     // × arc major radius
      heightMul: 1.1,    // × arc major radius
      zOffset: -260,     // px behind the arc
      angleDeg: 0,       // rotate gradient direction
      opacity: 0.9,      // 0 = invisible plane, still bleeds through refraction
      emissive: 0.35,    // extra brightness so refracted colors punch through
    },
    // Material — pure crystal glass. No map, no stripes, no tint.
    baseColor: '#ffffff',
    roughness: 0.02,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 0.9,
    envMapIntensity: 1.4,
    transmission: 1.0,
    thickness: 1.2,
    ior: 1.35,             // gentle bend — high IOR was breaking the bg
    dispersion: 0.05,      // subtle rainbow on outer rim only
    attenuationColor: '#ffffff',
    attenuationDistance: 40,
    sheen: 0.0,
    sheenColor: '#ffffff',
    sheenRoughness: 0.5,
    iridescence: 0.0,
    iridescenceIOR: 1.3,
    doubleSide: true,
    // Idle motion (bob + tilt oscillation)
    motion: {
      bobAmp: 8,        // px vertical
      bobSpeed: 0.55,   // rad/s
      tiltAmpX: 0.04,   // radians
      tiltAmpZ: 0.03,
      tiltSpeed: 0.4,
      parallaxRot: 0.06, // radians per unit mouse
      parallaxPos: 20,   // px per unit mouse
    },
    // Reflection pipeline
    cubeRTSize: 384,
    updateEveryNthFrame: 2,
    cubeCamYOffsetMul: 0.55,
    visible: false,
  };

  let cubeRT = new THREE.WebGLCubeRenderTarget(arcCfg.cubeRTSize, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  cubeRT.texture.colorSpace = THREE.SRGBColorSpace;
  let cubeCam = new THREE.CubeCamera(1, 5000, cubeRT);
  cubeCam.layers.set(0);
  scene.add(cubeCam);

  function rebuildCubeRT() {
    scene.remove(cubeCam);
    cubeRT.dispose();
    cubeRT = new THREE.WebGLCubeRenderTarget(arcCfg.cubeRTSize, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    cubeRT.texture.colorSpace = THREE.SRGBColorSpace;
    cubeCam = new THREE.CubeCamera(1, 5000, cubeRT);
    cubeCam.layers.set(0);
    scene.add(cubeCam);
    arcMat.envMap = cubeRT.texture;
    arcMat.needsUpdate = true;
    placeCubeCam();
  }

  // ── Backdrop gradient (sunset seen THROUGH the glass) ─────────────
  // RGBA with radial alpha so the plane only shows where it sits behind
  // the arc — it never renders as a flat rectangle across the hero.
  const backdropGradientMap = new THREE.CanvasTexture(document.createElement('canvas'));
  backdropGradientMap.colorSpace = THREE.SRGBColorSpace;
  function regenGradient() {
    const c = backdropGradientMap.image as HTMLCanvasElement;
    const S = 1024; c.width = S; c.height = S;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    const angle = arcCfg.backdrop.angleDeg * Math.PI / 180;
    const cx = S / 2, cy = S / 2, len = S * 0.7;
    const x0 = cx - Math.cos(angle) * len, y0 = cy - Math.sin(angle) * len;
    const x1 = cx + Math.cos(angle) * len, y1 = cy + Math.sin(angle) * len;
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    for (const s of arcCfg.grad) grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color);
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    // Radial alpha mask → soft elliptical fade.
    const mask = g.createRadialGradient(cx, cy, S * 0.15, cx, cy, S * 0.5);
    mask.addColorStop(0.0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.7, 'rgba(0,0,0,1)');
    mask.addColorStop(1.0, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = mask; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    backdropGradientMap.needsUpdate = true;
  }
  regenGradient();

  // ── Arc material — pure crystal glass, no textures at all. ────────
  const arcMat = new THREE.MeshPhysicalMaterial({
    envMap: cubeRT.texture,
    side: THREE.DoubleSide,
    transparent: true,
  });
  function applyMaterial() {
    arcMat.color.set(arcCfg.baseColor);
    arcMat.roughness = arcCfg.roughness;
    arcMat.metalness = arcCfg.metalness;
    arcMat.clearcoat = arcCfg.clearcoat;
    arcMat.clearcoatRoughness = arcCfg.clearcoatRoughness;
    arcMat.reflectivity = arcCfg.reflectivity;
    arcMat.envMapIntensity = arcCfg.envMapIntensity;
    arcMat.transmission = arcCfg.transmission;
    arcMat.thickness = arcCfg.thickness;
    arcMat.ior = arcCfg.ior;
    // Dispersion is r166+. Guarded so older three still runs.
    (arcMat as any).dispersion = arcCfg.dispersion;
    arcMat.attenuationColor.set(arcCfg.attenuationColor);
    arcMat.attenuationDistance = arcCfg.attenuationDistance;
    arcMat.sheen = arcCfg.sheen;
    arcMat.sheenColor.set(arcCfg.sheenColor);
    arcMat.sheenRoughness = arcCfg.sheenRoughness;
    arcMat.iridescence = arcCfg.iridescence;
    arcMat.iridescenceIOR = arcCfg.iridescenceIOR;
    arcMat.side = arcCfg.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
    arcMat.needsUpdate = true;
  }
  applyMaterial();

  // ── Backdrop plane (source of the refracted sunset) ────────────────
  const backdropMat = new THREE.MeshBasicMaterial({
    map: backdropGradientMap,
    transparent: true,
    opacity: arcCfg.backdrop.opacity,
    toneMapped: true,
    side: THREE.DoubleSide,
  });
  const backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMat);
  backdropMesh.layers.set(0); // captured by the CubeCamera so it also reflects
  scene.add(backdropMesh);
  function applyBackdrop() {
    backdropMat.opacity = arcCfg.backdrop.opacity;
    backdropMesh.visible = arcCfg.backdrop.enabled;
  }

  const arcGroup = new THREE.Group();
  scene.add(arcGroup);
  let arcMesh: THREE.Mesh | null = null;
  let currentMajorR = 0;

  function placeCubeCam() {
    cubeCam.position.set(
      arcGroup.position.x,
      arcGroup.position.y + currentMajorR * arcCfg.cubeCamYOffsetMul,
      arcGroup.position.z,
    );
  }

  function buildArc(vw: number, vh: number) {
    if (arcMesh) { arcGroup.remove(arcMesh); arcMesh.geometry.dispose(); }
    const R = Math.min(vw * arcCfg.majorMul, arcCfg.majorMax);
    const r = Math.min(vw * arcCfg.minorMul, arcCfg.minorMax);
    currentMajorR = R;
    const geo = new THREE.TorusGeometry(
      R, r,
      Math.max(6, arcCfg.radialSegments | 0),
      Math.max(8, arcCfg.tubularSegments | 0),
      arcCfg.arcAngleDeg * Math.PI / 180,
    );
    // Guarantee smooth shading — no visible facets on the glass.
    geo.computeVertexNormals();
    arcMesh = new THREE.Mesh(geo, arcMat);
    arcMesh.layers.set(LAYER_ARC);
    arcMesh.visible = arcCfg.visible;
    arcGroup.add(arcMesh);
    arcGroup.position.set(vw * arcCfg.posXMul, vh * arcCfg.posYMul, arcCfg.posZ);
    arcGroup.rotation.set(
      arcCfg.rotX * Math.PI / 180,
      arcCfg.rotY * Math.PI / 180,
      arcCfg.rotZ * Math.PI / 180,
    );
    // Fit the backdrop plane to the arc silhouette.
    backdropMesh.geometry.dispose();
    backdropMesh.geometry = new THREE.PlaneGeometry(
      R * 2 * arcCfg.backdrop.widthMul,
      R * arcCfg.backdrop.heightMul,
    );
    backdropMesh.position.set(
      arcGroup.position.x,
      arcGroup.position.y + R * 0.5,
      arcGroup.position.z + arcCfg.backdrop.zOffset,
    );
    applyBackdrop();
    applyTransform();
  }

  // Base transform — tick loop adds bob/tilt/parallax on top of this.
  const arcBase = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  function applyTransform() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    arcBase.x = w * arcCfg.posXMul;
    arcBase.y = h * arcCfg.posYMul;
    arcBase.z = arcCfg.posZ;
    arcBase.rx = arcCfg.rotX * Math.PI / 180;
    arcBase.ry = arcCfg.rotY * Math.PI / 180;
    arcBase.rz = arcCfg.rotZ * Math.PI / 180;
    arcGroup.position.set(arcBase.x, arcBase.y, arcBase.z);
    arcGroup.rotation.set(arcBase.rx, arcBase.ry, arcBase.rz);
    if (arcMesh) arcMesh.visible = arcCfg.visible;
    backdropMesh.position.set(
      arcBase.x,
      arcBase.y + currentMajorR * 0.5,
      arcBase.z + arcCfg.backdrop.zOffset,
    );
    placeCubeCam();
  }

  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();

  // Try to load a texture; resolve to null if it 404s. Keeps the pipeline
  // graceful when normal/depth maps have not been generated yet.
  const tryLoad = (url: string, srgb = false): Promise<THREE.Texture | null> =>
    new Promise(res => {
      texLoader.load(
        url,
        t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); },
        undefined,
        () => res(null),
      );
    });

  type Obj = ObjSpec & {
    group: THREE.Group;
    mesh: THREE.Mesh | THREE.Object3D;
    baseX: number; baseY: number; baseZ: number;
  };
  const objects: Obj[] = [];

  const mapsFor = (imagePath: string) => {
    const dot = imagePath.lastIndexOf('.');
    const stem = imagePath.slice(0, dot);
    return { normal: `${stem}_normal.png`, depth: `${stem}_depth.png`, rough: `${stem}_rough.png` };
  };

  async function buildPlane(spec: ObjSpec): Promise<THREE.Mesh> {
    const src = spec.image!;
    const paths = mapsFor(src);
    const [colorMap, normalMap, depthMap, roughMap] = await Promise.all([
      tryLoad(src, true),
      tryLoad(paths.normal, false),
      tryLoad(paths.depth, false),
      tryLoad(paths.rough, false),
    ]);
    if (!colorMap) throw new Error(`Hero3D: failed to load ${src}`);

    const geom = new THREE.PlaneGeometry(spec.w, spec.h, 96, 96);
    const mat = new THREE.MeshPhysicalMaterial({
      map: colorMap,
      transparent: true,
      alphaTest: 0.35,
      depthWrite: true,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.08,
      clearcoat: 0.25,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.9,
    });
    if (normalMap) {
      mat.normalMap = normalMap;
      mat.normalScale = new THREE.Vector2(1.1, 1.1);
    }
    if (depthMap) {
      mat.displacementMap = depthMap;
      mat.displacementScale = spec.displacement ?? 8;
      mat.displacementBias = -(spec.displacement ?? 8) * 0.5;
    }
    if (roughMap) mat.roughnessMap = roughMap;

    return new THREE.Mesh(geom, mat);
  }

  async function loadObject(spec: ObjSpec): Promise<Obj | null> {
    let mesh: THREE.Object3D;
    try {
      if (spec.glb) {
        const gltf = await gltfLoader.loadAsync(spec.glb);
        mesh = gltf.scene;
        // Normalize model to spec.w / spec.h bounds.
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3(); box.getSize(size);
        const scale = Math.min(spec.w / size.x, spec.h / size.y);
        mesh.scale.setScalar(scale);
      } else if (spec.image) {
        mesh = await buildPlane(spec);
      } else return null;
    } catch (err) {
      console.warn('Hero3D: failed to load', spec.id, err);
      return null;
    }

    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    return { ...spec, group, mesh, baseX: 0, baseY: 0, baseZ: spec.z };
  }

  // Convert viewport-percent centers into world coordinates (world = pixels).
  function place(obj: Obj, vw: number, vh: number) {
    obj.baseX = (obj.cx / 100) * vw - vw / 2;
    obj.baseY = -((obj.cy / 100) * vh - vh / 2);
    obj.group.position.set(obj.baseX, obj.baseY, obj.baseZ);
  }

  // ── Mouse parallax with spring damping ────────────────────────────────
  const mouse = { x: 0, y: 0 };      // -1..1
  const mouseSmooth = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    setCameraDistance(h);
    camera.updateProjectionMatrix();
    for (const o of objects) place(o, w, h);
    buildArc(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ── Render loop, gated by visibility ──────────────────────────────────
  let running = false;
  let raf = 0;
  let frame = 0;
  const clock = new THREE.Clock();

  function tick() {
    const t = clock.getElapsedTime();
    // Damped mouse follow (~120ms half-life).
    mouseSmooth.x += (mouse.x - mouseSmooth.x) * 0.08;
    mouseSmooth.y += (mouse.y - mouseSmooth.y) * 0.08;

    // Mouse light rides in front of the scene.
    const halfW = canvas.clientWidth / 2, halfH = canvas.clientHeight / 2;
    mouseLight.position.set(mouseSmooth.x * halfW, -mouseSmooth.y * halfH, 350);

    // Camera micro-parallax.
    camera.position.x = mouseSmooth.x * 40;
    camera.position.y = -mouseSmooth.y * 25;
    camera.lookAt(0, 0, 0);

    if (!prefersReducedMotion) {
      for (const o of objects) {
        const floatY = Math.sin(t * o.float.speed + o.float.phase) * o.float.amp;
        const floatX = Math.cos(t * o.float.speed * 0.7 + o.float.phase) * o.float.amp * 0.4;
        const parX = mouseSmooth.x * 30 * o.parallax;
        const parY = -mouseSmooth.y * 20 * o.parallax;
        o.group.position.set(o.baseX + floatX + parX, o.baseY + floatY + parY, o.baseZ);
        o.group.rotation.x = Math.sin(t * o.wobble.speed + o.float.phase) * o.wobble.x
                            + mouseSmooth.y * 0.12 * o.parallax;
        o.group.rotation.y = Math.cos(t * o.wobble.speed * 0.8 + o.float.phase) * o.wobble.y
                            + mouseSmooth.x * 0.18 * o.parallax;
      }
    }

    // Arc idle motion + mouse parallax on the arc itself.
    if (arcMesh) {
      const m = arcCfg.motion;
      const bobY = Math.sin(t * m.bobSpeed) * m.bobAmp;
      const tiltX = Math.sin(t * m.tiltSpeed) * m.tiltAmpX + mouseSmooth.y * m.parallaxRot;
      const tiltZ = Math.cos(t * m.tiltSpeed * 0.7) * m.tiltAmpZ + mouseSmooth.x * m.parallaxRot;
      const parX = mouseSmooth.x * m.parallaxPos;
      const parY = -mouseSmooth.y * m.parallaxPos;
      arcGroup.position.set(arcBase.x + parX, arcBase.y + bobY + parY, arcBase.z);
      arcGroup.rotation.set(arcBase.rx + tiltX, arcBase.ry, arcBase.rz + tiltZ);
      // Backdrop drifts opposite → subtle depth parallax through the glass.
      backdropMesh.position.x = arcBase.x - parX * 0.35;
      backdropMesh.position.y = arcBase.y + currentMajorR * 0.5 - parY * 0.35;
    }

    // Dynamic reflection capture. Throttled to every other frame — with a
     // 384px cube RT this keeps the scene at 60fps on integrated GPUs while
     // still tracking the astronaut/keyboard/floppy bobbing in real time.
    if (arcMesh && arcCfg.visible && (frame % Math.max(1, arcCfg.updateEveryNthFrame | 0) === 0)) {
      cubeCam.update(renderer, scene);
    }
    frame++;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  function start() { if (running) return; running = true; clock.start(); tick(); }
  function stop()  { if (!running) return; running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver(
    ([entry]) => { entry.isIntersecting ? start() : stop(); },
    { threshold: 0.01 },
  );
  io.observe(canvas);

  // Kick off loading.
  (async () => {
    const loaded = await Promise.all(SCENE.map(loadObject));
    for (const o of loaded) if (o) objects.push(o);
    resize();
    // Signal ready — used by Hero.astro to fade out the PNG fallback layer.
    canvas.dataset.ready = 'true';
    canvas.dispatchEvent(new CustomEvent('hero3d:ready'));
  })();

  return {
    // Live handles for the configurator. Mutate arcCfg then call the matching
    // helper to apply. `rebuildArc()` re-runs geometry sizing against current
    // viewport dimensions.
    arc: {
      cfg: arcCfg,
      applyMaterial,
      regenGradient,
      applyBackdrop,
      applyTransform,
      rebuildArc: () => buildArc(canvas.clientWidth, canvas.clientHeight),
      rebuildCubeRT,
      exportPreset: () => JSON.stringify(arcCfg, null, 2),
      importPreset: (json: string) => { Object.assign(arcCfg, JSON.parse(json));
        regenGradient(); applyMaterial(); applyBackdrop();
        buildArc(canvas.clientWidth, canvas.clientHeight); rebuildCubeRT(); },
    },
    dispose() {
      stop(); io.disconnect(); ro.disconnect();
      renderer.dispose(); pmrem.dispose();
      cubeRT.dispose(); backdropGradientMap.dispose();
      arcMat.dispose(); backdropMat.dispose(); backdropMesh.geometry.dispose();
      scene.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else if (mat) mat.dispose();
      });
    },
  };
}

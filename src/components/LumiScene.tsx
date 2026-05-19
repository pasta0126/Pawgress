import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { EmotionalState } from "./Lumi";

export type { EmotionalState };

interface Props {
  emotion: EmotionalState;
  isBurst: boolean;
  petId:   string;
}

// 3-step toon gradient
const gradientMap = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([48, 140, 220]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });

// ─────────────────────────────────────────────────
// Per-pet colour configs  (Y bounds from GLB data)
// ─────────────────────────────────────────────────

type RGB = [number, number, number];

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

interface PetConfig {
  minY: number;
  rangeY: number;
  getColor(t: number, absX: number, nz: number): RGB;
}

const PET_CONFIG: Record<string, PetConfig> = {
  lumi: {
    minY: -0.9405, rangeY: 1.879,
    getColor(t, absX, nz) {
      if (t > 0.88) return [0.863, 0.784, 1.000];           // antlers — light lavender
      if (t > 0.80 && absX > 0.40 && nz < 0.10)
        return [0.953, 0.725, 0.839];                        // inner ears — pink
      if (t > 0.70) return lerp([0.800,0.667,0.937], [0.863,0.784,1.000], (t-0.70)/0.18);
      if (t > 0.38 && t < 0.72 && nz > 0.30)
        return lerp([0.784,0.643,0.957], [0.969,0.910,0.839], Math.min((nz-0.30)/0.50, 1));
      if (t > 0.30) return [0.784, 0.643, 0.957];           // body lavender
      if (t > 0.10) return lerp([0.753,0.612,0.941], [0.784,0.643,0.957], (t-0.10)/0.20);
      return [0.753, 0.612, 0.941];                          // paws
    },
  },

  bytee: {
    minY: -0.9504, rangeY: 1.899,
    getColor(t, _absX, nz) {
      if (t > 0.92) return [0.608, 0.439, 0.910];           // purple gem on top
      if (t > 0.70) return [0.941, 0.902, 0.773];           // cream helmet
      if (t > 0.55) {
        // Visor: facing forward → dark face; sides/back → cream
        const dark: RGB = [0.071, 0.059, 0.149];
        const crem: RGB = [0.941, 0.902, 0.773];
        return nz > 0.20 ? lerp(crem, dark, Math.min((nz-0.20)/0.40, 1)) : crem;
      }
      if (t > 0.38) return [0.231, 0.180, 0.478];           // dark purple cape
      if (t > 0.14) return [0.910, 0.847, 0.706];           // cream body / arms
      return [0.165, 0.125, 0.251];                          // dark base / feet
    },
  },

  cthulhy: {
    minY: -0.8957, rangeY: 1.785,
    getColor(t, absX, nz) {
      // Wing tips: far lateral in mid range
      if (t > 0.30 && t < 0.75 && absX > 0.60 && nz < 0.05)
        return [0.298, 0.412, 0.302];                        // darker wing membrane
      if (t > 0.80) return [0.580, 0.769, 0.580];           // light top / head bumps
      if (t > 0.55) return [0.478, 0.671, 0.478];           // head
      if (t > 0.30) return [0.416, 0.604, 0.427];           // body
      if (t > 0.12) return [0.361, 0.541, 0.365];           // tentacles / lower
      return [0.306, 0.471, 0.318];                          // darkest base
    },
  },

  pedri: {
    minY: -0.9502, rangeY: 1.898,
    getColor(t, _absX, _nz) {
      if (t > 0.88) return [0.137, 0.129, 0.118];           // hat crown — dark charcoal
      if (t > 0.72) return [0.224, 0.208, 0.192];           // hat brim
      if (t > 0.60) return lerp([0.224,0.208,0.192], [0.631,0.624,0.612], (t-0.60)/0.12);
      if (t > 0.35) return [0.631, 0.624, 0.612];           // light stone face
      if (t > 0.12) return [0.549, 0.541, 0.529];           // medium stone body
      return [0.349, 0.424, 0.318];                          // mossy base
    },
  },

  galaxy: {
    minY: -0.9508, rangeY: 1.899,
    getColor(t, _absX, nz) {
      // White areas: chest + face where normals face forward
      if (t > 0.40 && t < 0.88 && nz > 0.22) {
        const w = Math.min((nz - 0.22) / 0.40, 1.0);
        return lerp([0.094,0.082,0.188], [0.953,0.941,1.000], w);
      }
      if (t > 0.75) return [0.082, 0.071, 0.165];           // very dark top / ears
      if (t > 0.45) return [0.118, 0.102, 0.220];           // dark upper body
      if (t > 0.20) return [0.094, 0.082, 0.188];           // dark lower body
      return [0.714, 0.702, 0.867];                          // light paws
    },
  },
};

// ─────────────────────────────────────────────────

function buildVertexColors(geo: THREE.BufferGeometry, cfg: PetConfig): void {
  const pos   = geo.attributes.position as THREE.BufferAttribute;
  const nor   = geo.attributes.normal   as THREE.BufferAttribute;
  const count = pos.count;
  const buf   = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - cfg.minY) / cfg.rangeY));
    const c = cfg.getColor(t, Math.abs(pos.getX(i)), nor.getZ(i));
    buf[i * 3]     = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }

  geo.setAttribute("color", new THREE.BufferAttribute(buf, 3));
}

// ─────────────────────────────────────────────────

function Model({ emotion, isBurst, petId }: Props) {
  const { scene } = useGLTF(`/${petId}.glb`);
  const ref        = useRef<THREE.Group>(null);
  const clock      = useRef(0);
  const burstDecay = useRef(0);

  useMemo(() => {
    const cfg = PET_CONFIG[petId] ?? PET_CONFIG.lumi;
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const geo = node.geometry;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      // Always recompute so switching back to a pet shows its correct colours
      geo.deleteAttribute("color");
      buildVertexColors(geo, cfg);
      node.material = MAT;
    });
  }, [scene, petId]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    clock.current += dt;
    const t = clock.current;

    // Burst flash
    burstDecay.current = isBurst
      ? Math.min(burstDecay.current + dt * 12, 1)
      : Math.max(burstDecay.current - dt * 1.6, 0);
    const wave = burstDecay.current > 0 ? Math.sin(t * 5) * 0.010 * burstDecay.current : 0;

    // Slow peaceful breathing (~3.5 s period)
    const breath = (Math.sin(t * 0.28 * Math.PI * 2) + 1) * 0.5;
    ref.current.scale.set(1 + breath * 0.004, 1 + breath * 0.009, 1 + breath * 0.004);
    ref.current.position.y = -0.08 + wave;

    ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, 0, 0.08);
    ref.current.rotation.x = THREE.MathUtils.lerp(
      ref.current.rotation.x, emotion === "Tired" ? 0.04 : 0, 0.03,
    );
  });

  return <group ref={ref}><primitive object={scene} /></group>;
}

function Spinner() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 2; });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.18]} />
      <meshBasicMaterial color={0xc8aeff} wireframe />
    </mesh>
  );
}

export default function LumiScene({ emotion, isBurst, petId }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2.6], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      dpr={Math.min(window.devicePixelRatio, 2)}
      style={{ background: "transparent", pointerEvents: "none" }}
    >
      <directionalLight position={[-2, 3, 2]} intensity={0.9} color={0xfff4e0} />
      <directionalLight position={[2, 0, 1]}  intensity={0.45} color={0xb095f0} />
      <pointLight       position={[0, -1.5, 1]} intensity={0.35} color={0xf3c8d8} />
      <ambientLight intensity={0.40} color={0xe0d0ff} />
      <Suspense fallback={<Spinner />}>
        <Model emotion={emotion} isBurst={isBurst} petId={petId} />
      </Suspense>
    </Canvas>
  );
}

// Preload all pets in background so switching is instant
(["lumi", "bytee", "cthulhy", "pedri", "galaxy"] as const)
  .forEach((id) => useGLTF.preload(`/${id}.glb`));

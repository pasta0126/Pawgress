import { Suspense, useRef } from "react";
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

function Model({ emotion, isBurst, petId }: Props) {
  const { scene } = useGLTF(`/${petId}.glb`);
  const ref        = useRef<THREE.Group>(null);
  const clock      = useRef(0);
  const burstDecay = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    clock.current += dt;
    const t = clock.current;

    burstDecay.current = isBurst
      ? Math.min(burstDecay.current + dt * 12, 1)
      : Math.max(burstDecay.current - dt * 1.6, 0);
    const wave = burstDecay.current > 0 ? Math.sin(t * 5) * 0.010 * burstDecay.current : 0;

    ref.current.scale.set(1, 1, 1);
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
      gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
      dpr={Math.min(window.devicePixelRatio, 2)}
      style={{ background: "transparent", pointerEvents: "none" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <directionalLight position={[3, 5, 2]}  intensity={2.0} />
      <directionalLight position={[-2, 2, -1]} intensity={0.5} />
      <ambientLight intensity={0.5} />
      <Suspense fallback={<Spinner />}>
        <Model emotion={emotion} isBurst={isBurst} petId={petId} />
      </Suspense>
    </Canvas>
  );
}

(["lumi", "cthulhy", "pedri"] as const)
  .forEach((id) => useGLTF.preload(`/${id}.glb`));

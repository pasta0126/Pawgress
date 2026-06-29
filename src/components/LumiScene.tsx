import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import type { EmotionalState } from "./Lumi";

export type { EmotionalState };

interface Props {
  emotion: EmotionalState;
  isBurst: boolean;
  petId:   string; // kept for API compat; only bytee is active
}

// EmotionalState → looping idle animation clip name
const EMOTION_ANIM: Record<EmotionalState, string> = {
  Excited: "HappyIdle",
  Happy:   "HappyIdle",
  Neutral: "BreathingIdle",
  Tired:   "SadIdle",
};

function ByteeModel({ emotion, isBurst }: Omit<Props, "petId">) {
  const group   = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/bytee.glb");
  const { actions } = useAnimations(animations, group);
  const current = useRef("");

  useEffect(() => {
    const keys = Object.keys(actions);
    if (!keys.length) return;

    const target = isBurst ? "AirSquat" : EMOTION_ANIM[emotion];
    if (target === current.current) return;
    current.current = target;

    const next = actions[target];
    if (!next) return;

    // Crossfade: fade out everything else, fade in target
    Object.values(actions).forEach(a => { if (a !== next) a?.fadeOut(0.4); });
    next.reset().fadeIn(0.4).play();

    if (isBurst) {
      // Play once — App.tsx will flip isBurst back to false after 1.2s,
      // which will trigger the emotion-idle again via the dependency above.
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = false;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
  }, [emotion, isBurst, actions]);

  return <group ref={group}><primitive object={scene} /></group>;
}

function Spinner() {
  const ref = useRef<THREE.Mesh>(null);
  // simple rotating octahedron while GLB loads
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.18]} />
      <meshBasicMaterial color={0xc8aeff} wireframe />
    </mesh>
  );
}

export default function LumiScene({ emotion, isBurst }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2.6], fov: 42 }}
      gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
      dpr={Math.min(window.devicePixelRatio, 2)}
      style={{ background: "transparent", pointerEvents: "none" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <directionalLight position={[3, 5, 2]}   intensity={2.0} />
      <directionalLight position={[-2, 2, -1]} intensity={0.5} />
      <ambientLight intensity={0.5} />
      <Suspense fallback={<Spinner />}>
        <ByteeModel emotion={emotion} isBurst={isBurst} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/bytee.glb");

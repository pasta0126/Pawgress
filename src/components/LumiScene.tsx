import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import type { EmotionalState } from "./Lumi";

export type { EmotionalState };
export interface AnimOffset { x: number; y: number; scale: number; }

// ── Animation state machine ───────────────────────────────────────────────

type AnimState =
  | "landing"     // startup one-shot: pet "falls in"
  | "breathing"   // base idle
  | "happy"       // mood > 60 idle
  | "pockets"     // random life injection
  | "briefcase"   // pre-sad (long inactivity)
  | "sad"         // sad idle
  | "dazed"       // sitting dazed (loop)
  | "standingUp"  // one-shot recovery from dazed/hyperfail
  | "hyperfocus"  // AirSquat loop (hyperfocus active)
  | "hyperfail";  // StandingUp frozen at start (hyperfocus abandoned)

const STATE_ANIM: Record<AnimState, string> = {
  landing:    "Landing",
  breathing:  "BreathingIdle",
  happy:      "HappyIdle",
  pockets:    "SearchingPockets",
  briefcase:  "BriefcaseIdle",
  sad:        "SadIdle",
  dazed:      "SittingDazed",
  standingUp: "StandingUp",
  hyperfocus: "AirSquat",
  hyperfail:  "StandingUp",
};

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  mood:               number;
  idleSecs:           number;
  isIdle:             boolean;
  isBurst:            boolean;
  hyperfocus:         boolean;
  petId:              string;
  requestPockets?:    number;   // increment to trigger SearchingPockets once
  forceAnim?:         string;
  posOffset?:         AnimOffset;
  onAnimsReady?:      (names: string[]) => void;
  onAnimChange?:      (name: string)   => void;
  onHyperfocusEnd?:   ()               => void;
}

// ── ByteeModel ────────────────────────────────────────────────────────────

function ByteeModel({
  mood, idleSecs, isIdle, isBurst, hyperfocus, requestPockets,
  forceAnim, posOffset, onAnimsReady, onAnimChange, onHyperfocusEnd,
}: Omit<Props, "petId">) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/bytee.glb");
  const { actions, mixer }    = useAnimations(animations, group);

  const [animState, _setAnimState] = useState<AnimState>("landing");
  const stateRef  = useRef<AnimState>("landing");

  // Stable refs for values used in callbacks
  const moodRef    = useRef(mood);    moodRef.current    = mood;
  const idleRef    = useRef(idleSecs); idleRef.current   = idleSecs;
  const isIdleRef  = useRef(isIdle);  isIdleRef.current  = isIdle;
  const hfRef      = useRef(hyperfocus); hfRef.current   = hyperfocus;

  const onReadyRef  = useRef(onAnimsReady); onReadyRef.current  = onAnimsReady;
  const onChangeRef = useRef(onAnimChange); onChangeRef.current = onAnimChange;
  const onHfEndRef  = useRef(onHyperfocusEnd); onHfEndRef.current = onHyperfocusEnd;

  const burstBlockRef    = useRef(false);
  const hyperfailRec     = useRef(false); // was standingUp from hyperfail?
  const hyperfocusDone   = useRef(false); // squats finished, don't re-enter
  const reported         = useRef(false);

  function transition(next: AnimState) {
    if (stateRef.current === next) return;
    stateRef.current = next;
    _setAnimState(next);
  }

  // ── Report available animation names once ────────────────────────────────
  useEffect(() => {
    const keys = Object.keys(actions);
    if (keys.length > 0 && !reported.current) {
      reported.current = true;
      onReadyRef.current?.(keys);
    }
  }, [actions]);

  // ── Mixer "finished" — handle one-shot completions ───────────────────────
  useEffect(() => {
    if (!mixer) return;
    const onFinished = (e: any) => {
      const clip: string = e.action.getClip().name;
      const s = stateRef.current;
      // AirSquat x5 done → return to idle (hyperfocus mode stays active in App)
      if (s === "hyperfocus" && clip === "AirSquat") {
        hyperfocusDone.current = true;
        transition(moodRef.current > 60 ? "happy" : "breathing");
        return;
      }
      if (
        (s === "landing"    && clip === "Landing")    ||
        (s === "standingUp" && clip === "StandingUp")
      ) {
        if (s === "standingUp" && hyperfailRec.current) {
          hyperfailRec.current = false;
          onHfEndRef.current?.();
        }
        transition(moodRef.current > 60 ? "happy" : "breathing");
      }
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [mixer]);

  // ── Idle / mood / hyperfocus transitions ─────────────────────────────────
  useEffect(() => {
    if (burstBlockRef.current) return;
    const s = stateRef.current;

    // One-shots must complete uninterrupted
    if (s === "landing" || s === "standingUp") return;
    // Pocket timer self-manages its return
    if (s === "pockets") return;

    // ── Hyperfocus path ──
    if (hyperfocus) {
      if (s === "hyperfocus") {
        // still playing squats — don't interrupt
        return;
      } else if (s === "hyperfail") {
        if (!isIdle) {
          hyperfailRec.current = true;
          transition("standingUp");
        }
        return;
      } else if (!hyperfocusDone.current) {
        // squats not yet played — enter hyperfocus
        transition("hyperfocus");
        return;
      }
      // squats done: fall through to normal idle logic
    } else {
      // Hyperfocus deactivated externally
      if (s === "hyperfocus" || s === "hyperfail") {
        hyperfocusDone.current = false;
        transition(mood > 60 ? "happy" : "breathing");
        return;
      }
      // Reset so next hyperfocus session plays squats again
      if (!hyperfocus) hyperfocusDone.current = false;
    }

    // ── Normal inactivity progression ──
    if (s === "dazed") {
      if (!isIdle) transition("standingUp");
      return;
    }

    if (idleSecs > 300) {
      transition("dazed");
    } else if (idleSecs > 120) {
      transition("sad");
    } else if (idleSecs > 45) {
      transition("briefcase");
    } else {
      const target: AnimState = mood > 60 ? "happy" : "breathing";
      if (s !== target) transition(target);
    }
  }, [idleSecs, isIdle, mood, hyperfocus]);

  // ── Burst → brief happy flash ─────────────────────────────────────────────
  useEffect(() => {
    if (!isBurst) return;
    const s = stateRef.current;
    if (["dazed", "standingUp", "landing", "hyperfocus", "hyperfail", "pockets"].includes(s)) return;

    burstBlockRef.current = true;
    transition("happy");
    const t = setTimeout(() => {
      burstBlockRef.current = false;
      if (stateRef.current === "happy" && !hfRef.current) {
        const idle = idleRef.current;
        if      (idle > 300) transition("dazed");
        else if (idle > 120) transition("sad");
        else if (idle > 45)  transition("briefcase");
        else                 transition(moodRef.current > 60 ? "happy" : "breathing");
      }
    }, 1200);
    return () => { clearTimeout(t); burstBlockRef.current = false; };
  }, [isBurst]);

  // ── Manual pockets trigger (gotchi click) ────────────────────────────────
  useEffect(() => {
    if (!requestPockets) return;
    const s = stateRef.current;
    if (["breathing", "happy", "briefcase"].includes(s)) {
      const back = s as AnimState;
      transition("pockets");
      setTimeout(() => {
        if (stateRef.current === "pockets") transition(back);
      }, 4000 + Math.random() * 2000);
    }
  }, [requestPockets]);

  // ── Random SearchingPockets injection ────────────────────────────────────
  useEffect(() => {
    let outer: ReturnType<typeof setTimeout>;
    let inner: ReturnType<typeof setTimeout>;
    const schedule = () => {
      outer = setTimeout(() => {
        const s = stateRef.current;
        if (s === "breathing" || s === "happy") {
          const back = s;
          transition("pockets");
          inner = setTimeout(() => {
            if (stateRef.current === "pockets") transition(back);
          }, 5000 + Math.random() * 4000);
        }
        schedule();
      }, 40000 + Math.random() * 50000); // 40–90 s
    };
    schedule();
    return () => { clearTimeout(outer); clearTimeout(inner); };
  }, []); // set up once on mount

  // ── Play animation whenever animState or forceAnim changes ───────────────
  useEffect(() => {
    if (!Object.keys(actions).length) return;

    // Debug override: play any animation on loop
    if (forceAnim) {
      const next = actions[forceAnim];
      if (!next) return;
      Object.values(actions).forEach(a => { if (a !== next) a?.fadeOut(0.3); });
      next.reset().fadeIn(0.3).play();
      next.setLoop(THREE.LoopRepeat, Infinity);
      onChangeRef.current?.(forceAnim);
      return;
    }

    const animName = STATE_ANIM[animState];
    const next = actions[animName];
    if (!next) return;

    Object.values(actions).forEach(a => { if (a !== next) a?.fadeOut(0.3); });
    next.reset().fadeIn(0.3).play();
    onChangeRef.current?.(animName);

    if (animState === "hyperfocus") {
      // Play 5 squats then fire "finished" → return to idle
      next.setLoop(THREE.LoopRepeat, 5);
      next.clampWhenFinished = false;
    } else if (animState === "landing" || animState === "standingUp") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else if (animState === "hyperfail") {
      // Play StandingUp then freeze in sitting pose (start of anim)
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      requestAnimationFrame(() => { next.paused = true; });
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
  }, [animState, forceAnim, actions]);

  const ox = posOffset?.x     ?? 0;
  const oy = posOffset?.y     ?? 0;
  const sc = posOffset?.scale ?? 1;

  return (
    <group ref={group} position={[ox, oy, 0]} scale={[sc, sc, sc]}>
      <primitive object={scene} />
    </group>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <mesh>
      <octahedronGeometry args={[0.18]} />
      <meshBasicMaterial color={0xc8aeff} wireframe />
    </mesh>
  );
}

// ── LumiScene ────────────────────────────────────────────────────────────

export default function LumiScene({
  mood, idleSecs, isIdle, isBurst, hyperfocus, requestPockets,
  forceAnim, posOffset, onAnimsReady, onAnimChange, onHyperfocusEnd,
}: Props) {
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
        <ByteeModel
          mood={mood} idleSecs={idleSecs} isIdle={isIdle}
          isBurst={isBurst} hyperfocus={hyperfocus} requestPockets={requestPockets}
          forceAnim={forceAnim} posOffset={posOffset}
          onAnimsReady={onAnimsReady} onAnimChange={onAnimChange}
          onHyperfocusEnd={onHyperfocusEnd}
        />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/bytee.glb");

"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, ContactShadows, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { Montserrat } from "next/font/google";
import gsap from "gsap";
import * as THREE from "three";

const showcaseFont = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const CARS = [
  {
    id: "white-sedan",
    name: "White Sedan",
    src: "/models/optimized-models/White Sedan-optimized.glb",
    phrase: "Quiet luxury for every city mile.",
    color: "#F4F4F4",
    accentText: "#d8d8d8",
  },
  {
    id: "red-taxi",
    name: "Red Taxi",
    src: "/models/optimized-models/Red Taxi-optimized.glb",
    phrase: "Iconic Dubai rides, ready when you are.",
    color: "#B84A4A",
    accentText: "#f5d0d0",
  },
  {
    id: "big-suv",
    name: "Big SUV Black",
    src: "/models/optimized-models/BIg SUV Black-optimized.glb",
    phrase: "Command the road in bold black presence.",
    color: "#4A6FA5",
    accentText: "#c5d6f0",
  },
  {
    id: "dubai-bus",
    name: "Dubai Bus",
    src: "/models/optimized-models/Dubai Bus-optimized.glb",
    phrase: "Move the city together, in style.",
    color: "#C4A35A",
    accentText: "#f0e4c4",
  },
  {
    id: "self-driving",
    name: "Self Driving Taxi",
    src: "/models/optimized-models/Self Driving Taxi-optimized.glb",
    phrase: "The future of rides, already here.",
    color: "#5B8A9A",
    accentText: "#c8e4ec",
  },
  {
    id: "white-van",
    name: "White Van",
    src: "/models/optimized-models/White Van-optimized.glb",
    phrase: "Space for the trip, polish for the ride.",
    color: "#6B8F71",
    accentText: "#d0e4d4",
  },
];

const AUTO_ROTATE_SPEED = 0.28;
const MODEL_TARGET_SIZE = 2.7;
const AUTO_SWITCH_MS = 7000;
const EXIT_X = 6;

// Shared start framing for every car (from orbit tracker).
const CAMERA_START = [2.807, 2.058, -3.179];
const ORBIT_TARGET = [0, 0.45, 0];
const LOCKED_CAMERA_Y = CAMERA_START[1];
const LOCKED_POLAR_ANGLE = (() => {
  const dx = CAMERA_START[0] - ORBIT_TARGET[0];
  const dy = CAMERA_START[1] - ORBIT_TARGET[1];
  const dz = CAMERA_START[2] - ORBIT_TARGET[2];
  const radius = Math.hypot(dx, dy, dz) || 1;
  return Math.acos(THREE.MathUtils.clamp(dy / radius, -1, 1));
})();

function centerModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.1);
  root.scale.setScalar(MODEL_TARGET_SIZE / maxDim);

  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const fittedCenter = new THREE.Vector3();
  fitted.getCenter(fittedCenter);
  // Center on XZ, plant bottom on the shadow plane (y = 0).
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fitted.min.y;
}

function ShowcaseCar({ src, groupRef, autoSpin, paused }) {
  const { scene } = useGLTF(src);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material = child.material.clone();
      }
    });
    centerModel(clone);
    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (!groupRef.current || !autoSpin || paused) return;
    groupRef.current.rotation.y += delta * AUTO_ROTATE_SPEED;
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

function ShowcaseLights() {
  return (
    <>
      <ambientLight intensity={0.75} color="#f5f8ff" />
      <directionalLight
        position={[3.2, 5.5, 2.4]}
        intensity={1.55}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.00035}
      />
      <directionalLight position={[-3, 2.2, -2]} intensity={0.4} color="#d8e4ff" />
    </>
  );
}

function CameraAim() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...CAMERA_START);
    camera.lookAt(...ORBIT_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function resetCameraToStart(camera, controls) {
  camera.position.set(...CAMERA_START);
  camera.lookAt(...ORBIT_TARGET);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.set(...ORBIT_TARGET);
    controls.update();
  }
}

function CarTransitionDriver({
  transitionId,
  isTransitioning,
  outgoingRef,
  incomingRef,
  controlsRef,
  onComplete,
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!isTransitioning || !transitionId) return undefined;

    let cancelled = false;
    let timeline = null;
    let attempts = 0;

    const tryStart = () => {
      const outG = outgoingRef.current;
      const inG = incomingRef.current;

      if (!outG || !inG) {
        attempts += 1;
        if (attempts < 30) {
          requestAnimationFrame(tryStart);
        } else if (!cancelled) {
          onComplete();
        }
        return;
      }

      gsap.killTweensOf([outG.position, outG.rotation, inG.position, inG.rotation]);

      // Always start from the same framing + car pose, even after user orbit/spin.
      resetCameraToStart(camera, controlsRef.current);
      outG.position.set(0, 0, 0);
      outG.rotation.set(0, 0, 0);
      inG.position.set(EXIT_X, 0, 0);
      inG.rotation.set(0, 0, 0);

      timeline = gsap.timeline({
        onComplete: () => {
          if (cancelled) return;
          inG.position.set(0, 0, 0);
          inG.rotation.set(0, 0, 0);
          resetCameraToStart(camera, controlsRef.current);
          onComplete();
        },
      });

      timeline.to(outG.position, {
        x: -EXIT_X,
        duration: 1.15,
        ease: "power2.inOut",
      });
      timeline.to(
        inG.position,
        { x: 0, duration: 1.15, ease: "power2.inOut" },
        "<"
      );
    };

    tryStart();

    return () => {
      cancelled = true;
      if (timeline) timeline.kill();
    };
  }, [
    transitionId,
    isTransitioning,
    outgoingRef,
    incomingRef,
    controlsRef,
    camera,
    onComplete,
  ]);

  return null;
}

function CarScene({
  activeSrc,
  incomingSrc,
  isTransitioning,
  transitionId,
  onTransitionComplete,
  onUserRotate,
}) {
  const controlsRef = useRef(null);
  const outgoingRef = useRef(null);
  const incomingRef = useRef(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const logOrbit = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.y = LOCKED_CAMERA_Y;
    const { x, y, z } = controls.object.position;
    const t = controls.target;
    console.log("[Car tracker] orbit", {
      camera: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
      target: { x: +t.x.toFixed(3), y: +t.y.toFixed(3), z: +t.z.toFixed(3) },
    });
  }, []);

  useEffect(() => {
    if (isTransitioning) return;
    const group = outgoingRef.current;
    if (!group) return;
    gsap.killTweensOf([group.position, group.rotation]);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
  }, [isTransitioning, activeSrc]);

  const paused = isInteracting || isTransitioning;

  return (
    <>
      <CameraAim />
      <ShowcaseLights />
      <Suspense fallback={null}>
        <ShowcaseCar
          key={`out-${activeSrc}`}
          src={activeSrc}
          groupRef={outgoingRef}
          autoSpin={!isTransitioning}
          paused={paused}
        />
      </Suspense>
      {isTransitioning && incomingSrc ? (
        <Suspense fallback={null}>
          <ShowcaseCar
            key={`in-${incomingSrc}-${transitionId}`}
            src={incomingSrc}
            groupRef={incomingRef}
            autoSpin={false}
            paused
          />
        </Suspense>
      ) : null}
      <CarTransitionDriver
        transitionId={transitionId}
        isTransitioning={isTransitioning}
        outgoingRef={outgoingRef}
        incomingRef={incomingRef}
        controlsRef={controlsRef}
        onComplete={onTransitionComplete}
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.45}
        scale={6}
        blur={2.6}
        far={3.5}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!isTransitioning}
        enablePan={false}
        enableZoom={false}
        autoRotate={false}
        target={ORBIT_TARGET}
        minPolarAngle={LOCKED_POLAR_ANGLE}
        maxPolarAngle={LOCKED_POLAR_ANGLE}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        onStart={() => {
          setIsInteracting(true);
          onUserRotate?.();
        }}
        onEnd={() => {
          setIsInteracting(false);
          logOrbit();
        }}
      />
    </>
  );
}

const MIN_LOADER_MS = 1500;

function MobileLoadingOverlay({ progress, fadeOut, onExitComplete }) {
  const overlayRef = useRef(null);
  const carWrapRef = useRef(null);
  const carRef = useRef(null);
  const wheelFrontRef = useRef(null);
  const wheelRearRef = useRef(null);
  const roadRef = useRef(null);
  const glowRef = useRef(null);
  const barRef = useRef(null);
  const percentRef = useRef(null);
  const labelRef = useRef(null);
  const exitStartedRef = useRef(false);
  const roundedProgress = Math.min(100, Math.round(progress));

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(overlayRef.current, { opacity: 1 });
      gsap.fromTo(
        [labelRef.current, carWrapRef.current, percentRef.current],
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" }
      );

      gsap.to(carRef.current, {
        x: 10,
        y: -1.5,
        duration: 0.55,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      gsap.to(wheelRearRef.current, {
        rotation: 360,
        svgOrigin: "52 58",
        duration: 0.42,
        ease: "none",
        repeat: -1,
      });

      gsap.to(wheelFrontRef.current, {
        rotation: 360,
        svgOrigin: "128 58",
        duration: 0.42,
        ease: "none",
        repeat: -1,
      });

      gsap.to(roadRef.current, {
        x: -56,
        duration: 0.38,
        ease: "none",
        repeat: -1,
      });

      gsap.to(glowRef.current, {
        opacity: 0.55,
        scale: 1.08,
        duration: 1.1,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, overlayRef);

    // Do not ctx.revert() — that restores opacity:1 for a frame on unmount.
    return () => {
      gsap.killTweensOf([
        overlayRef.current,
        carRef.current,
        carWrapRef.current,
        wheelFrontRef.current,
        wheelRearRef.current,
        roadRef.current,
        glowRef.current,
        labelRef.current,
        percentRef.current,
        barRef.current,
      ]);
    };
  }, []);

  useEffect(() => {
    if (percentRef.current) {
      percentRef.current.textContent = `${roundedProgress}%`;
    }
    if (barRef.current) {
      gsap.to(barRef.current, {
        width: `${roundedProgress}%`,
        duration: 0.4,
        ease: "power2.out",
      });
    }
  }, [roundedProgress]);

  useEffect(() => {
    if (!fadeOut || !overlayRef.current || exitStartedRef.current) return;

    exitStartedRef.current = true;
    gsap.killTweensOf(overlayRef.current);

    const tween = gsap.to(overlayRef.current, {
      opacity: 0,
      duration: 0.55,
      ease: "power2.inOut",
      onComplete: () => {
        if (overlayRef.current) {
          overlayRef.current.style.visibility = "hidden";
          overlayRef.current.style.pointerEvents = "none";
        }
        onExitComplete();
      },
    });

    return () => {
      tween.kill();
    };
  }, [fadeOut, onExitComplete]);

  return (
    <div
      ref={overlayRef}
      className={`${showcaseFont.className} absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black text-white`}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute left-1/2 top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c4a35a]/35 blur-3xl"
        aria-hidden
      />

      <p
        ref={labelRef}
        className="relative z-10 mb-10 text-[0.72rem] font-medium uppercase tracking-[0.32em] text-white/70"
      >
        OTO CAR
      </p>

      <div ref={carWrapRef} className="relative z-10 w-[280px]">
        <svg
          ref={carRef}
          viewBox="0 0 180 78"
          className="mx-auto h-[84px] w-[200px] drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
          aria-hidden
        >
          <defs>
            <linearGradient id="loaderCarBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f7f7f7" />
              <stop offset="55%" stopColor="#d9d9d9" />
              <stop offset="100%" stopColor="#b8b8b8" />
            </linearGradient>
            <linearGradient id="loaderCarGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a8c9c" />
              <stop offset="100%" stopColor="#2f3a46" />
            </linearGradient>
          </defs>

          {/* soft ground shadow */}
          <ellipse cx="90" cy="70" rx="58" ry="4" fill="#000" opacity="0.4" />

          {/* full body + cabin silhouette */}
          <path
            d="M28 50
               c0-3 2-5 5-6
               l12-3
               c3-9 12-15 23-15
               h36
               c11 0 20 6 23 15
               l14 3
               c5 1 9 4 9 9
               v2
               c0 2.5-2 4.5-4.5 4.5
               H32.5
               C30 59.5 28 57.5 28 55
               z"
            fill="url(#loaderCarBody)"
          />

          {/* glass clipped to cabin opening */}
          <path
            d="M70 29
               h28
               c7.5 0 13.5 4 16 10
               H56
               c2.5-6 8-10 14-10
               z"
            fill="url(#loaderCarGlass)"
          />
          {/* window divider */}
          <path d="M84 30.5v8.5" stroke="#1a1a1a" strokeWidth="1.4" opacity="0.45" />
          {/* glass highlight */}
          <path
            d="M72 31h10c1.2 0 2 0.8 2 2v5H70v-5c0-1.2 0.9-2 2-2z"
            fill="#b8c8d6"
            opacity="0.35"
          />

          {/* side stripe */}
          <path d="M40 46h100" stroke="#c4a35a" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />

          {/* bumper */}
          <path d="M36 55.5h108" stroke="#888" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" />

          {/* rear wheel — sits into the body */}
          <g ref={wheelRearRef}>
            <circle cx="52" cy="58" r="11" fill="#0d0d0d" />
            <circle cx="52" cy="58" r="7.2" fill="#2a2a2a" stroke="#666" strokeWidth="1" />
            <circle cx="52" cy="58" r="2.8" fill="#aaa" />
            <path d="M52 49.2v17.6M43.2 58h17.6" stroke="#777" strokeWidth="1.3" />
            <path d="M46 51.8l12 12.4M46 64.2l12-12.4" stroke="#555" strokeWidth="1" />
          </g>

          {/* front wheel */}
          <g ref={wheelFrontRef}>
            <circle cx="128" cy="58" r="11" fill="#0d0d0d" />
            <circle cx="128" cy="58" r="7.2" fill="#2a2a2a" stroke="#666" strokeWidth="1" />
            <circle cx="128" cy="58" r="2.8" fill="#aaa" />
            <path d="M128 49.2v17.6M119.2 58h17.6" stroke="#777" strokeWidth="1.3" />
            <path d="M122 51.8l12 12.4M122 64.2l12-12.4" stroke="#555" strokeWidth="1" />
          </g>

          {/* motion lines */}
          <g opacity="0.35" stroke="#fff" strokeLinecap="round">
            <path d="M16 40h12" strokeWidth="1.5" />
            <path d="M12 48h11" strokeWidth="1.2" />
            <path d="M18 55h9" strokeWidth="1" />
          </g>
        </svg>

        <div className="relative -mt-1 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div ref={roadRef} className="absolute inset-y-0 left-0 flex gap-3" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="inline-block h-[3px] w-7 rounded-full bg-white/50" />
            ))}
          </div>
        </div>

        <div className="mt-5 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            ref={barRef}
            className="h-full rounded-full bg-[#c4a35a]"
            style={{ width: "0%" }}
          />
        </div>
      </div>

      <p ref={percentRef} className="relative z-10 mt-7 text-2xl font-semibold tracking-tight tabular-nums">
        0%
      </p>
      <p className="relative z-10 mt-2 text-[0.7rem] uppercase tracking-[0.22em] text-white/45">
        Preparing models
      </p>
    </div>
  );
}

export default function MobileCarShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionId, setTransitionId] = useState(0);
  const [loading, setLoading] = useState({ active: true, progress: 0 });
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderFadeOut, setLoaderFadeOut] = useState(false);
  const [loaderDone, setLoaderDone] = useState(false);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(true);
  const accentRef = useRef(null);
  const copyRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const skipFirstTween = useRef(true);
  const loaderShownAtRef = useRef(Date.now());
  const nextIndexRef = useRef(null);

  const activeCar = CARS[activeIndex];
  const incomingCar = nextIndex != null ? CARS[nextIndex] : null;
  const otherCars = CARS.filter((_, i) => i !== activeIndex);

  const goTo = useCallback(
    (index) => {
      const target = ((index % CARS.length) + CARS.length) % CARS.length;
      if (target === activeIndex || isTransitioning) return;
      nextIndexRef.current = target;
      setNextIndex(target);
      setIsTransitioning(true);
      setTransitionId((id) => id + 1);
    },
    [activeIndex, isTransitioning]
  );

  const handleUserRotate = useCallback(() => {
    setAutoSwitchEnabled(false);
  }, []);

  const handleTransitionComplete = useCallback(() => {
    const target = nextIndexRef.current;
    if (target != null) {
      setActiveIndex(target);
    }
    nextIndexRef.current = null;
    setNextIndex(null);
    setIsTransitioning(false);
  }, []);

  const handleLoaderExitComplete = useCallback(() => {
    setLoaderDone(true);
    setLoaderVisible(false);
    setLoaderFadeOut(false);
  }, []);

  useEffect(() => {
    let frame = 0;

    const syncLoading = (state) => {
      // Ignore later progress updates once the intro loader is done.
      if (loaderDone) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLoading((current) =>
          current.active === state.active && current.progress === state.progress
            ? current
            : { active: state.active, progress: state.progress }
        );
      });
    };

    syncLoading(useProgress.getState());
    const unsubscribe = useProgress.subscribe(syncLoading);

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [loaderDone]);

  useEffect(() => {
    if (loaderDone || loaderFadeOut) return;

    if (!loading.active && loading.progress >= 100) {
      const elapsed = Date.now() - loaderShownAtRef.current;
      const wait = Math.max(0, MIN_LOADER_MS - elapsed);
      const timer = setTimeout(() => {
        setLoaderFadeOut(true);
      }, wait);
      return () => clearTimeout(timer);
    }
  }, [loading.active, loading.progress, loaderDone, loaderFadeOut]);

  useEffect(() => {
    // Only auto-switch after the intro loader is gone, and while the user hasn't rotated.
    if (!loaderDone || isTransitioning || !autoSwitchEnabled) return undefined;

    const timer = setInterval(() => {
      goTo(activeIndex + 1);
    }, AUTO_SWITCH_MS);

    return () => clearInterval(timer);
  }, [loaderDone, isTransitioning, autoSwitchEnabled, activeIndex, goTo]);

  useEffect(() => {
    if (skipFirstTween.current) {
      skipFirstTween.current = false;
      if (accentRef.current) {
        accentRef.current.style.backgroundColor = activeCar.color;
      }
      return;
    }

    const ctx = gsap.context(() => {
      if (accentRef.current) {
        gsap.to(accentRef.current, {
          backgroundColor: activeCar.color,
          duration: 0.55,
          ease: "power2.out",
        });
      }

      if (copyRef.current) {
        gsap.fromTo(
          copyRef.current,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }
        );
      }
    });

    return () => ctx.revert();
  }, [activeIndex, activeCar.color]);

  return (
    <div
      className={`${showcaseFont.className} relative h-[100dvh] w-full overflow-hidden bg-black text-white`}
    >
      {!loaderDone && loaderVisible && (
        <MobileLoadingOverlay
          progress={loading.progress}
          fadeOut={loaderFadeOut}
          onExitComplete={handleLoaderExitComplete}
        />
      )}

      <div
        ref={accentRef}
        className="pointer-events-none absolute left-1/2 top-[50%] h-[34%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-90 blur-2xl"
        style={{ backgroundColor: activeCar.color }}
        aria-hidden
      />

      <div
        ref={canvasWrapRef}
        className="absolute inset-x-0 top-[30%] flex h-[42%] items-end justify-center"
      >
        <Canvas
          shadows="percentage"
          dpr={[1, 1.75]}
          camera={{ position: CAMERA_START, fov: 34, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent", width: "100%", height: "100%" }}
        >
          <AdaptiveDpr pixelated />
          <CarScene
            activeSrc={activeCar.src}
            incomingSrc={incomingCar?.src ?? null}
            isTransitioning={isTransitioning}
            transitionId={transitionId}
            onTransitionComplete={handleTransitionComplete}
            onUserRotate={handleUserRotate}
          />
        </Canvas>
      </div>

      <div className="absolute inset-x-0 top-25 z-10 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <h1 className="text-[clamp(2.4rem,11vw,3.5rem)] font-semibold leading-none tracking-[-0.03em] text-white">
          OTO CAR
        </h1>
        <p className="mt-3 text-[0.78rem] font-medium uppercase tracking-[0.22em] text-white/70">
          Luxury Convenience Reliability
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div ref={copyRef} className="text-center">
          <h2 className="text-[1.85rem] font-semibold leading-tight tracking-tight">
            {activeCar.name}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-[0.95rem] font-light leading-relaxed text-white/75">
            {activeCar.phrase}
          </p>
          <button
            type="button"
            onClick={(event) => event.preventDefault()}
            className="mt-5 inline-flex items-center justify-center rounded-full px-7 py-2.5 text-sm font-medium tracking-wide transition active:scale-[0.98]"
            style={{
              backgroundColor: activeCar.color,
              color: "#0a0a0a",
            }}
          >
            Explore more
          </button>
        </div>

        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max justify-center gap-2.5 px-1">
            {otherCars.map((car) => {
              const realIndex = CARS.findIndex((item) => item.id === car.id);
              return (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => goTo(realIndex)}
                  className="flex w-[7.25rem] shrink-0 flex-col items-start gap-1 rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-left transition active:scale-[0.98]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: car.color }}
                    aria-hidden
                  />
                  <span className="text-[0.72rem] font-medium leading-snug text-white/90">
                    {car.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

CARS.forEach((car) => {
  useGLTF.preload(car.src);
});

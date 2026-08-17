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
import { AdaptiveDpr, OrbitControls, useAnimations, useGLTF, useProgress } from "@react-three/drei";
import { Poppins } from "next/font/google";
import gsap from "gsap";
import * as THREE from "three";

let wheelShadowAlphaMap = null;
const WHEEL_SHADOW_MAP_VERSION = 8;

function getWheelShadowAlphaMap() {
  if (
    wheelShadowAlphaMap &&
    wheelShadowAlphaMap.userData.version === WHEEL_SHADOW_MAP_VERSION
  ) {
    return wheelShadowAlphaMap;
  }
  if (wheelShadowAlphaMap) {
    wheelShadowAlphaMap.dispose();
    wheelShadowAlphaMap = null;
  }

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  // Visible core + soft dissolve at the rim (middle ground: readable, not crisp).
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgb(255, 255, 255)");
  gradient.addColorStop(0.35, "rgb(230, 230, 230)");
  gradient.addColorStop(0.55, "rgb(150, 150, 150)");
  gradient.addColorStop(0.75, "rgb(70, 70, 70)");
  gradient.addColorStop(0.9, "rgb(22, 22, 22)");
  gradient.addColorStop(1, "rgb(0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  wheelShadowAlphaMap = new THREE.CanvasTexture(canvas);
  wheelShadowAlphaMap.colorSpace = THREE.NoColorSpace;
  wheelShadowAlphaMap.userData.version = WHEEL_SHADOW_MAP_VERSION;
  wheelShadowAlphaMap.needsUpdate = true;
  return wheelShadowAlphaMap;
}

function WheelContactShadow({ sizeX = 2.1, sizeZ = 0.95, opacity = 0.78 }) {
  const alphaMap = useMemo(() => getWheelShadowAlphaMap(), []);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      // Centered on the car group origin (bbox-centered ground contact).
      position={[0, 0.002, 0]}
      scale={[sizeX, sizeZ, 1]}
      renderOrder={-2}
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#000000"
        alphaMap={alphaMap}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest
        toneMapped={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

const showcaseFont = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Brand stops from the OTO gradient — used as a family, not one flat color.
const THEME = {
  coral: "#ea2f4a",
  indigo: "#463daa",
  blue: "#2e7fd1",
};

const BRAND_GRADIENT =
  "linear-gradient(128deg, #ea2f4a 0%, #ba2694 10%, #463daa 60%, #2e7fd1 100%)";
const CTA_GRADIENT_BLUE =
  "linear-gradient(128deg, #463daa 0%, #2e7fd1 100%)";
const CTA_GRADIENT_MAGENTA =
  "linear-gradient(128deg, #ba2694 0%, #463daa 100%)";

const CARS = [
  {
    id: "white-sedan",
    name: "White Sedan",
    src: "/models/optimized-models/White Sedan-optimized.glb",
    phrase: "Quiet luxury for every city mile.",
    // Keep a soft neutral glow for the white car.
    color: "#E8E0F4",
    buttonBg: CTA_GRADIENT_BLUE,
    buttonText: "#ffffff",
    chip: THEME.blue,
  },
  {
    id: "red-taxi",
    name: "Dubai Taxi",
    src: "/models/optimized-models/Red Taxi-optimized.glb",
    phrase: "Iconic Dubai rides, ready when you are.",
    color: THEME.coral,
    buttonBg: THEME.coral,
    buttonText: "#ffffff",
    chip: THEME.coral,
  },
  {
    id: "big-suv",
    name: "Big SUV Black",
    // Highlight "SUV" instead of the trailing "Black".
    gradientWord: "SUV",
    src: "/models/optimized-models/BIg SUV Black-optimized.glb",
    phrase: "Command the road in bold black presence.",
    color: THEME.indigo,
    buttonBg: CTA_GRADIENT_MAGENTA,
    buttonText: "#ffffff",
    chip: THEME.indigo,
  },
  {
    id: "dubai-bus",
    name: "Dubai Bus",
    src: "/models/optimized-models/Dubai Bus-optimized.glb",
    phrase: "Move the city together, in style.",
    // Keep a warm note so it doesn't blend into the cool brand set.
    color: "#C4A35A",
    buttonBg: "#C4A35A",
    buttonText: "#1a1433",
    chip: "#C4A35A",
  },
  {
    id: "self-driving",
    name: "Self Driving Taxi",
    src: "/models/optimized-models/Self Driving Taxi-optimized.glb",
    phrase: "The future of rides, already here.",
    color: THEME.blue,
    buttonBg: CTA_GRADIENT_BLUE,
    buttonText: "#ffffff",
    chip: THEME.blue,
  },
  {
    id: "white-van",
    name: "White Van",
    src: "/models/optimized-models/White Van-optimized.glb",
    phrase: "Space for the trip, polish for the ride.",
    // Cool steel blue — cleaner fit for a white van than magenta.
    color: "#6E9CC8",
    buttonBg: "linear-gradient(128deg, #5B8AB5 0%, #2e7fd1 100%)",
    buttonText: "#ffffff",
    chip: "#6E9CC8",
  },
  {
    id: "flying-taxi",
    name: "Flying Taxi",
    src: "/models/optimized-models/Flying Taxi1-optimized.glb",
    phrase: "Rise above the city, arrive in style.",
    color: "#9B4DCA",
    buttonBg: CTA_GRADIENT_MAGENTA,
    buttonText: "#ffffff",
    chip: "#9B4DCA",
  },
];

const NAME_GRADIENT = BRAND_GRADIENT;

function GradientCarName({ name, gradientWord }) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 0) return null;

  const target =
    gradientWord ||
    (parts.length === 1 ? parts[0] : parts[parts.length - 1]);

  // Prefer the last matching word when duplicates exist.
  let highlightIndex = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].toLowerCase() === String(target).toLowerCase()) {
      highlightIndex = i;
      break;
    }
  }
  if (highlightIndex < 0) highlightIndex = parts.length - 1;

  return (
    <span>
      {parts.map((word, index) => {
        const isHighlight = index === highlightIndex;
        return (
          <span key={`${word}-${index}`}>
            {index > 0 ? " " : null}
            {isHighlight ? (
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: NAME_GRADIENT }}
              >
                {word}
              </span>
            ) : (
              word
            )}
          </span>
        );
      })}
    </span>
  );
}

const AUTO_ROTATE_SPEED = 0.28;
const FAN_SPIN_SPEED = 12;
const FLYING_HOVER_AMOUNT = 0.045;
const FLYING_HOVER_SPEED = 1.6;
const MODEL_TARGET_SIZE = 2.35;
const MODEL_TARGET_SIZE_BY_ID = {
  "dubai-bus": 2.35,
  "flying-taxi": 2.75,
};
const MODEL_Y_OFFSET_BY_ID = {
  "flying-taxi": 0.1,
};
const AUTO_SWITCH_MS = 7000;
const EXIT_X = 6;
const DARK_VISIBILITY_IDS = new Set(["big-suv", "self-driving", "white-van"]);
const DARK_LIGHT_LAYER = 1;

function bindDarkLightLayer(light) {
  if (light) light.layers.set(DARK_LIGHT_LAYER);
}

function applyDarkLightLayer(root, enabled) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (enabled) child.layers.enable(DARK_LIGHT_LAYER);
    else child.layers.disable(DARK_LIGHT_LAYER);
  });
}

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

function yawFromCamera(cameraPos) {
  return Math.atan2(cameraPos[0] - ORBIT_TARGET[0], cameraPos[2] - ORBIT_TARGET[2]);
}

// Keep the shared camera (same slide for every car). Rotate the flying taxi so
// the default framing matches the orbit pose [0.71, 2.058, 4.181].
const MODEL_START_YAW_BY_ID = {
  "flying-taxi": yawFromCamera(CAMERA_START) - yawFromCamera([0.71, 2.058, 4.181]),
};

function getModelStartYaw(carId) {
  return MODEL_START_YAW_BY_ID[carId] ?? 0;
}

function centerModel(root, targetSize = MODEL_TARGET_SIZE, yOffset = 0) {
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.1);
  root.scale.setScalar(targetSize / maxDim);

  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const fittedCenter = new THREE.Vector3();
  fitted.getCenter(fittedCenter);
  // Center on XZ, plant bottom on the shadow plane (y = 0).
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fitted.min.y;
  root.position.y += yOffset;
}

function prepareModelMaterials(root, boostDarkVisibility) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];

    child.material = materials.map((mat) => {
      const next = mat.clone();
      if (!boostDarkVisibility || !next.color) return next;

      const luminance =
        next.color.r * 0.2126 + next.color.g * 0.7152 + next.color.b * 0.0722;

      // Only dark-visibility cars: lift dark paint for silhouette.
      if (luminance < 0.22) {
        next.color.offsetHSL(0, 0, 0.08);
        if ("metalness" in next) {
          next.metalness = Math.min(1, Math.max(next.metalness ?? 0.4, 0.55));
        }
        if ("roughness" in next) {
          next.roughness = Math.min(0.55, Math.max(0.18, (next.roughness ?? 0.45) * 0.8));
        }
        if ("emissive" in next) {
          next.emissive = new THREE.Color("#2a3038");
          next.emissiveIntensity = 0.12;
        }
      }

      return next;
    });

    if (child.material.length === 1) {
      child.material = child.material[0];
    }
  });
}

function ShowcaseCar({
  src,
  carId,
  groupRef,
  autoSpin,
  paused,
}) {
  const { scene, animations } = useGLTF(src);
  const targetSize = MODEL_TARGET_SIZE_BY_ID[carId] ?? MODEL_TARGET_SIZE;
  const yOffset = MODEL_Y_OFFSET_BY_ID[carId] ?? 0;
  const boostDarkVisibility = DARK_VISIBILITY_IDS.has(carId);
  const hasClips = (animations?.length ?? 0) > 0;
  const isFlyingTaxi = carId === "flying-taxi";

  const { model, shadowSize, fans, hoverBaseY } = useMemo(() => {
    const clone = scene.clone(true);
    prepareModelMaterials(clone, boostDarkVisibility);
    applyDarkLightLayer(clone, boostDarkVisibility);
    centerModel(clone, targetSize, yOffset);
    clone.rotation.y = getModelStartYaw(carId);
    clone.updateMatrixWorld(true);
    const yawBox = new THREE.Box3().setFromObject(clone);
    const yawCenter = new THREE.Vector3();
    yawBox.getCenter(yawCenter);
    clone.position.x -= yawCenter.x;
    clone.position.z -= yawCenter.z;
    clone.position.y -= yawBox.min.y;
    clone.position.y += yOffset;

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    const fanMeshes = [];
    if (isFlyingTaxi) {
      clone.traverse((child) => {
        if (child.name?.startsWith("Fan_")) fanMeshes.push(child);
      });
    }

    // Cover the full ground footprint evenly so all four wheels stay in the
    // dense core as the car spins (avoid a skinny oval that favors one corner).
    return {
      model: clone,
      fans: fanMeshes,
      hoverBaseY: clone.position.y,
      shadowSize: {
        x: Math.max(size.x * 1.05, 1.5),
        z: Math.max(size.z * 1.05, 1.5),
      },
    };
  }, [scene, boostDarkVisibility, targetSize, yOffset, isFlyingTaxi, carId]);

  const { actions, names } = useAnimations(animations, model);

  useEffect(() => {
    if (!hasClips || !names.length) return undefined;

    names.forEach((name) => {
      const action = actions[name];
      if (!action) return;
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.play();
    });

    return () => {
      names.forEach((name) => actions[name]?.stop());
    };
  }, [actions, hasClips, names]);

  useFrame((state, delta) => {
    if (groupRef.current && autoSpin && !paused) {
      groupRef.current.rotation.y += delta * AUTO_ROTATE_SPEED;
    }

    // Optimized export dropped clips; keep the original fan spin + hover alive.
    if (isFlyingTaxi && !hasClips) {
      for (let i = 0; i < fans.length; i += 1) {
        fans[i].rotation.y += delta * FAN_SPIN_SPEED;
      }
      model.position.y =
        hoverBaseY + Math.sin(state.clock.elapsedTime * FLYING_HOVER_SPEED) * FLYING_HOVER_AMOUNT;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
      <WheelContactShadow sizeX={shadowSize.x} sizeZ={shadowSize.z} opacity={0.78} />
    </group>
  );
}

function ShowcaseLights({ boostDarkVisibility = false }) {
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

      {boostDarkVisibility ? (
        <>
          {/* Layer 1 only — dark cars receive this before they slide into view. */}
          <directionalLight
            ref={bindDarkLightLayer}
            position={[-2.2, 3.0, -4.0]}
            intensity={1.05}
            color="#ffffff"
          />
          <directionalLight
            ref={bindDarkLightLayer}
            position={[3.4, 1.8, -3.2]}
            intensity={0.75}
            color="#c9d7ff"
          />
          <pointLight
            ref={bindDarkLightLayer}
            position={[0, 2.2, -3.2]}
            intensity={0.55}
            distance={10}
            color="#ffffff"
          />
        </>
      ) : null}
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
  activeId,
  incomingSrc,
  incomingId,
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
  const activeBoost = DARK_VISIBILITY_IDS.has(activeId);
  const incomingBoost = isTransitioning && DARK_VISIBILITY_IDS.has(incomingId);
  // Lights are layer-masked to dark cars, so they can turn on as the incoming
  // model mounts (still off-screen) instead of popping after the slide.
  const rimLightsOn = activeBoost || incomingBoost;

  return (
    <>
      <CameraAim />
      <ShowcaseLights boostDarkVisibility={rimLightsOn} />
      <Suspense fallback={null}>
        <ShowcaseCar
          key={`out-${activeSrc}`}
          src={activeSrc}
          carId={activeId}
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
            carId={incomingId}
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
  const chipStripRef = useRef(null);
  const chipButtonRefs = useRef({});
  const skipFirstTween = useRef(true);
  const loaderShownAtRef = useRef(Date.now());
  const nextIndexRef = useRef(null);

  const activeCar = CARS[activeIndex];
  const incomingCar = nextIndex != null ? CARS[nextIndex] : null;
  // Swap copy/accent as soon as a transition starts — don't wait for the slide to finish.
  const displayCar = incomingCar ?? activeCar;

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
        accentRef.current.style.backgroundColor = displayCar.color;
      }
      return;
    }

    const ctx = gsap.context(() => {
      if (accentRef.current) {
        gsap.to(accentRef.current, {
          backgroundColor: displayCar.color,
          duration: 0.2,
          ease: "power2.out",
        });
      }

      if (copyRef.current) {
        gsap.fromTo(
          copyRef.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }
        );
      }
    });

    return () => ctx.revert();
  }, [displayCar.id, displayCar.color]);

  useEffect(() => {
    const button = chipButtonRefs.current[displayCar.id];
    const strip = chipStripRef.current;
    if (!button || !strip) return;

    // Keep the active car chip visible in the horizontal strip.
    const buttonLeft = button.offsetLeft;
    const buttonWidth = button.offsetWidth;
    const stripWidth = strip.clientWidth;
    const targetScroll = buttonLeft - (stripWidth - buttonWidth) / 2;
    strip.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [displayCar.id, loaderDone]);

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
        style={{ backgroundColor: displayCar.color }}
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
            activeId={activeCar.id}
            incomingSrc={incomingCar?.src ?? null}
            incomingId={incomingCar?.id ?? null}
            isTransitioning={isTransitioning}
            transitionId={transitionId}
            onTransitionComplete={handleTransitionComplete}
            onUserRotate={handleUserRotate}
          />
        </Canvas>
      </div>

      <div className="absolute inset-x-0 top-25 z-10 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <h1 className="text-[clamp(2.4rem,11vw,3.5rem)] font-semibold leading-none tracking-[-0.03em] text-white">
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: NAME_GRADIENT }}
          >
            OTO
          </span>{" "}
          CAR
        </h1>
        <p className="mt-3 text-[0.78rem] font-medium uppercase tracking-[0.22em] text-white/70">
          Luxury <span className="text-2xl"> . </span> Convenience <span className="text-2xl"> . </span> Reliability
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div ref={copyRef} className="text-center">
          <h2 className="text-[1.85rem] font-semibold leading-tight tracking-tight">
            <GradientCarName
              name={displayCar.name}
              gradientWord={displayCar.gradientWord}
            />
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-[0.95rem] font-light leading-relaxed text-white/75">
            {displayCar.phrase}
          </p>
          <button
            type="button"
            onClick={(event) => event.preventDefault()}
            className="mt-5 inline-flex items-center justify-center rounded-full px-7 py-2.5 text-sm font-medium tracking-wide shadow-[0_8px_24px_rgba(70,61,170,0.35)] transition active:scale-[0.98]"
            style={{
              backgroundImage: displayCar.buttonBg.includes("gradient")
                ? displayCar.buttonBg
                : undefined,
              backgroundColor: displayCar.buttonBg.includes("gradient")
                ? undefined
                : displayCar.buttonBg,
              color: displayCar.buttonText,
            }}
          >
            Explore more
          </button>
        </div>

        <div
          ref={chipStripRef}
          className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max gap-2.5 px-1">
            {CARS.map((car, index) => {
              const isSelected = displayCar.id === car.id;
              return (
                <button
                  key={car.id}
                  ref={(node) => {
                    if (node) chipButtonRefs.current[car.id] = node;
                    else delete chipButtonRefs.current[car.id];
                  }}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={isSelected ? "true" : undefined}
                  className={`flex h-[3.25rem] w-[7.25rem] shrink-0 items-start gap-2 rounded-2xl border px-3 py-2.5 text-left backdrop-blur-sm ${
                    isSelected
                      ? "border-white/55 bg-white/16"
                      : "border-white/20 bg-white/[0.08]"
                  }`}
                  style={
                    isSelected
                      ? {
                          boxShadow: `inset 0 0 0 1px ${car.chip}66, 0 0 18px ${car.chip}33`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="mt-[0.3em] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: car.chip }}
                    aria-hidden
                  />
                  <span className="line-clamp-2 h-[2.1em] text-[0.78rem] font-semibold leading-[1.05] text-white">
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

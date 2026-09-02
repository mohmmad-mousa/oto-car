  'use client';

  import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
  import { Canvas, useFrame, useThree } from "@react-three/fiber";
  import {
  AdaptiveDpr,
  Environment,
  OrbitControls,
  useAnimations,
  useCursor,
  useGLTF,
  useProgress,
} from "@react-three/drei";
  import { Poppins } from "next/font/google";
  import gsap from "gsap";
  import * as THREE from "three";
  const focusFont = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
  });

    // Set to [x, y, z] for a fixed starting camera position, or null for auto-fit.
    const START_CAMERA_POSITION = [317.9, 42.4, -7.6];
    const START_CAMERA_TARGET = [173, -177.6, -9.6];
    const CAMERA_PEEK = {
      maxYaw: THREE.MathUtils.degToRad(10),
      maxPitch: THREE.MathUtils.degToRad(8),
      smooth: 2,
    };
    const WORLD_UP = new THREE.Vector3(0, 1, 0);
    const CAR_FOCUS_THEMES = {
      green: {
        backgroundColor: "#7FA875",
        backgroundHex: 0x7fa875,
        accentText: "#c9e4c4",
        uiText: "#e8f0ff",
      },
      red: {
        backgroundColor: "#B84A4A",
        backgroundHex: 0xb84a4a,
        accentText: "#f5d0d0",
        uiText: "#fff0f0",
      },
    };

    const MODEL_CACHE_VERSION = "20260902";

    function modelUrl(path) {
      return `${path}?v=${MODEL_CACHE_VERSION}`;
    }

    const CAR_NAME_PATTERN = /^Car\d+/;
    const CARS_COLLECTION_PATTERN = /^Cars$/i;

    // Blender "Cars" collection + common GLB export variants (spaces vs underscores).
    const VEHICLE_SPOTS = [
      {
        locator: "White Sedan",
        src: modelUrl("/models/optimized-models/White Sedan-optimized.glb"),
        targetLength: 2.5,
        yawOffset: 180,
      },
      {
        locator: "Dubai Taxi",
        src: modelUrl("/models/optimized-models/Red Taxi-optimized.glb"),
        targetLength: 2.5,
        yawOffset: 180,
      },
      {
        locator: "Black SUV",
        src: modelUrl("/models/optimized-models/BIg SUV Black-optimized.glb"),
        targetLength: 2.5,
      },
      {
        locator: "Dubai Bus",
        src: modelUrl("/models/optimized-models/Dubai Bus-optimized.glb"),
        targetLength: 5,
      },
      {
        locator: "Selfdriving Taxi",
        src: modelUrl("/models/optimized-models/Self Driving Taxi-optimized.glb"),
        targetLength: 2.5,
        yawOffset: -90,
        positionOffset: [30, 0, -2.6],
      },
      {
        locator: "Van",
        src: modelUrl("/models/optimized-models/White Van-optimized.glb"),
        targetLength: 2.5,
        yawOffset: 180,
      },
      {
        locator: "Flying Taxi",
        src: modelUrl("/models/optimized-models/Flying Taxi1-optimized.glb"),
        targetLength: 3,
        yawOffset: 50,
      },
      {
        locator: "Dubai Metro",
        src: modelUrl("/models/optimized-models/Dubai Metro-optimized.glb"),
        targetLength: 25,
        yawOffset: 90,
        positionOffset: [-15, 0, 0.2],
      },
      {
        locator: "Etihad Rail",
        src: modelUrl("/models/optimized-models/Etihad Rail-optimized.glb"),
        targetLength: 25,
        positionOffset: [10, 0, 0],
      },
    ];

    const FOCUSABLE_NAME_KEYS = new Set([
      "whitesedan",
      "redtaxi",
      "dubaitaxi",
      "bigblacksuv",
      "blacksuv",
      "dubaibus",
      "selfdrivingtaxi",
      "sefdrivingtaxi",
      "van",
      "flyingtaxi",
      "etihadrail",
      "etihadrail1",
      "etihadrail2",
      "dubaimetro",
      "dubaimetro1",
      "dubaimetro2",
    ]);

    function normalizeFocusName(name = "") {
      return name.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function isFocusableObject(name = "") {
      if (!name) return false;
      if (CAR_NAME_PATTERN.test(name)) return true;

      const normalized = normalizeFocusName(name);
      if (FOCUSABLE_NAME_KEYS.has(normalized)) return true;
      if (normalized.includes("flyingtaxi")) return true;
      if (normalized.includes("selfdrivingtaxi") || normalized.includes("sefdrivingtaxi")) {
        return true;
      }
      if (normalized.includes("dubaimetro") || normalized.includes("etihadrail")) return true;
      if (normalized.includes("dubaibus") || normalized.includes("dubaitaxi")) return true;

      return false;
    }

    function isSelfDrivingTaxi(name = "") {
      const normalized = normalizeFocusName(name);
      return (
        normalized.includes("selfdrivingtaxi") ||
        normalized.includes("sefdrivingtaxi")
      );
    }

    function getCarFocusTheme(carName = "") {
      const normalized = normalizeFocusName(carName);

      if (
        /Car2/i.test(carName) ||
        normalized.includes("whitesedan") ||
        normalized.includes("dubaimetro") ||
        normalized.includes("etihadrail") ||
        normalized.includes("flyingtaxi") ||
        normalized.includes("van")
      ) {
        return CAR_FOCUS_THEMES.green;
      }

      return CAR_FOCUS_THEMES.red;
    }

    const CAR_AUTO_ROTATE_SPEED = 0.12;
const CITY_SHADOW_MAP_SIZE = 2048;
const FOCUS_SHADOW_MAP_SIZE = 2048;
const MAX_TEXTURE_ANISOTROPY = 4;

const PERF_LOG_ENABLED = true;
const ANIMATIONS_ENABLED = true;
const CITY_ANIMATION_TIME_SCALE = 0.5;

    function analyzeScenePerformance(root, animations = [], label = "Model") {
      if (!PERF_LOG_ENABLED || typeof console === "undefined") return null;

      let meshes = 0;
      let skinnedMeshes = 0;
      let points = 0;
      let lines = 0;
      let triangles = 0;
      let vertices = 0;
      let materials = 0;
      let textures = 0;
      let shadowCasters = 0;
      let shadowReceivers = 0;
      let morphTargets = 0;
      const materialTypes = {};
      const textureSizes = [];
      const heaviestMeshes = [];
      const uniqueMaterials = new Set();
      const uniqueTextures = new Set();

      root.updateMatrixWorld(true);
      root.traverse((child) => {
        if (child.isSkinnedMesh) skinnedMeshes += 1;
        if (child.isPoints) points += 1;
        if (child.isLine || child.isLineSegments) lines += 1;
        if (!child.isMesh) return;

        meshes += 1;
        if (child.castShadow) shadowCasters += 1;
        if (child.receiveShadow) shadowReceivers += 1;

        const geom = child.geometry;
        let meshTriangles = 0;
        let meshVertices = 0;
        if (geom) {
          const indexed = geom.index?.count ?? 0;
          const positionCount = geom.attributes.position?.count ?? 0;
          meshVertices = positionCount;
          meshTriangles = indexed > 0 ? indexed / 3 : positionCount / 3;
          triangles += meshTriangles;
          vertices += meshVertices;

          if (geom.morphAttributes?.position?.length) {
            morphTargets += geom.morphAttributes.position.length;
          }
        }

        heaviestMeshes.push({
          name: child.name || "(unnamed)",
          triangles: Math.round(meshTriangles),
          vertices: meshVertices,
          skinned: !!child.isSkinnedMesh,
          castShadow: !!child.castShadow,
        });

        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (!mat) return;
          if (!uniqueMaterials.has(mat.uuid)) {
            uniqueMaterials.add(mat.uuid);
            materials += 1;
            const type = mat.type || "Material";
            materialTypes[type] = (materialTypes[type] || 0) + 1;
          }

          [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "aoMap",
            "emissiveMap",
            "alphaMap",
            "envMap",
            "lightMap",
            "bumpMap",
            "displacementMap",
          ].forEach((key) => {
            const tex = mat[key];
            if (!tex || uniqueTextures.has(tex.uuid)) return;
            uniqueTextures.add(tex.uuid);
            textures += 1;
            const w = tex.image?.width || tex.source?.data?.width || 0;
            const h = tex.image?.height || tex.source?.data?.height || 0;
            if (w && h) {
              textureSizes.push({
                name: tex.name || key,
                size: `${w}x${h}`,
                mp: +((w * h) / 1e6).toFixed(2),
              });
            }
          });
        });
      });

      heaviestMeshes.sort((a, b) => b.triangles - a.triangles);
      textureSizes.sort((a, b) => b.mp - a.mp);

      const animClips = (animations || []).map((clip) => ({
        name: clip.name,
        duration: +clip.duration.toFixed(2),
        tracks: clip.tracks.length,
        // Rough cost signal: each track updates a property every mixer tick.
      }));

      const report = {
        label,
        meshes,
        skinnedMeshes,
        points,
        lines,
        triangles: Math.round(triangles),
        vertices,
        materials,
        textures,
        shadowCasters,
        shadowReceivers,
        morphTargets,
        materialTypes,
        animations: {
          clipCount: animClips.length,
          clips: animClips,
          totalTracks: animClips.reduce((sum, clip) => sum + clip.tracks, 0),
        },
        topMeshesByTriangles: heaviestMeshes.slice(0, 15),
        largestTextures: textureSizes.slice(0, 10),
      };

      // Readability helpers for what usually hurts FPS.
      const hints = [];
      if (report.triangles > 500_000) {
        hints.push(`High triangle count (${report.triangles.toLocaleString()}) — mesh density is a likely bottleneck.`);
      } else if (report.triangles > 150_000) {
        hints.push(`Moderate triangle count (${report.triangles.toLocaleString()}) — can still hurt on integrated GPUs.`);
      }
      if (report.meshes > 500) {
        hints.push(`Many meshes (${report.meshes}) — draw-call overhead can dominate more than polycount.`);
      } else if (report.meshes > 150) {
        hints.push(`Elevated mesh count (${report.meshes}) — consider merging static meshes.`);
      }
      if (report.shadowCasters > 100) {
        hints.push(
          `Lots of shadow casters (${report.shadowCasters}) with ${CITY_SHADOW_MAP_SIZE}px shadow maps — shadows are expensive.`
        );
      }
      if (report.animations.clipCount > 0 && report.animations.totalTracks > 50) {
        hints.push(
          `Heavy animation (${report.animations.clipCount} clips / ${report.animations.totalTracks} tracks) — skinning + mixer updates cost CPU every frame.`
        );
      } else if (report.animations.clipCount > 0) {
        hints.push(
          `Animations present (${report.animations.clipCount} clips / ${report.animations.totalTracks} tracks) — contributes, but likely not the only cost.`
        );
      }
      if (report.skinnedMeshes > 0) {
        hints.push(`Skinned meshes: ${report.skinnedMeshes} — GPU skinning + bones add cost on top of static meshes.`);
      }
      if (report.textures > 40 || textureSizes.some((t) => t.mp >= 4)) {
        hints.push(
          `Texture load: ${report.textures} unique textures` +
            (textureSizes[0] ? `, largest ~${textureSizes[0].size}` : "") +
            " — VRAM/bandwidth pressure."
        );
      }
      if (!hints.length) {
        hints.push("Counts look moderate — also check DPR, Environment HDR, and shadow map size at runtime.");
      }

      console.groupCollapsed(`%c[Perf] ${label} scene breakdown`, "color:#7dd3fc;font-weight:bold");
      console.table({
        meshes: report.meshes,
        skinnedMeshes: report.skinnedMeshes,
        triangles: report.triangles,
        vertices: report.vertices,
        materials: report.materials,
        textures: report.textures,
        shadowCasters: report.shadowCasters,
        shadowReceivers: report.shadowReceivers,
        morphTargets: report.morphTargets,
        animClips: report.animations.clipCount,
        animTracks: report.animations.totalTracks,
      });
      console.log("Material types:", report.materialTypes);
      console.log("Animation clips:", report.animations.clips);
      console.log("Top meshes by triangles:", report.topMeshesByTriangles);
      console.log("Largest textures:", report.largestTextures);
      console.log("%cLikely bottleneck hints:", "color:#fbbf24;font-weight:bold");
      hints.forEach((hint, i) => console.log(`${i + 1}. ${hint}`));
      console.groupEnd();
      return report;
    }

    function RuntimePerfProbe({ enabled = PERF_LOG_ENABLED }) {
      const { gl } = useThree();
      const stats = useRef({
        frames: 0,
        elapsed: 0,
        lastLog: 0,
        fps: 0,
        ms: 0,
      }); 

      useFrame((_, delta) => {
        if (!enabled) return;

        const s = stats.current;
        s.frames += 1;
        s.elapsed += delta;

        // Log about once per second.
        if (s.elapsed < 1) return;

        s.fps = +(s.frames / s.elapsed).toFixed(1);
        s.ms = +((s.elapsed / s.frames) * 1000).toFixed(2);
        s.frames = 0;
        s.elapsed = 0;
        s.lastLog += 1;

        const info = gl.info;
        const drawCalls = info.render.calls;
        const tris = info.render.triangles;
        const geoms = info.memory.geometries;
        const texs = info.memory.textures;

        let bottleneck = "balanced / unclear";
        if (s.fps < 30 && drawCalls > 200) bottleneck = "likely draw-calls / mesh count";
        else if (s.fps < 30 && tris > 500_000) bottleneck = "likely geometry (triangles)";
        else if (s.fps < 30 && texs > 40) bottleneck = "likely textures / GPU memory pressure";
        else if (s.fps < 45) bottleneck = "moderate load (shadows + anim + scene)";

        console.log(
          `%c[Perf] runtime  fps=${s.fps}  frame=${s.ms}ms  drawCalls=${drawCalls}  tris=${tris.toLocaleString()}  geoms=${geoms}  textures=${texs}  → ${bottleneck}`,
          s.fps < 30 ? "color:#f87171" : s.fps < 50 ? "color:#fbbf24" : "color:#4ade80"
        );
      });

      return null;
    }

    function CameraCredentialsLog({ controlsRef }) {
      const { camera } = useThree();
      const worldPos = useRef(new THREE.Vector3());
      const lastPos = useRef(new THREE.Vector3(Number.NaN, 0, 0));
      const lastTarget = useRef(new THREE.Vector3(Number.NaN, 0, 0));
      const stillFrames = useRef(0);
      const lastLogged = useRef("");

      useFrame(() => {
        camera.updateMatrixWorld(true);
        camera.getWorldPosition(worldPos.current);

        const orbitTarget = controlsRef.current?.target;
        const targetX = orbitTarget?.x ?? 0;
        const targetY = orbitTarget?.y ?? 0;
        const targetZ = orbitTarget?.z ?? 0;

        const moved =
          !Number.isFinite(lastPos.current.x) ||
          worldPos.current.distanceToSquared(lastPos.current) > 1e-12 ||
          (orbitTarget && lastTarget.current.distanceToSquared(orbitTarget) > 1e-12);

        lastPos.current.copy(worldPos.current);
        if (orbitTarget) lastTarget.current.copy(orbitTarget);

        if (moved) {
          stillFrames.current = 0;
          return;
        }

        stillFrames.current += 1;
        if (stillFrames.current < 10) return;

        const key = `${worldPos.current.x},${worldPos.current.y},${worldPos.current.z},${targetX},${targetY},${targetZ}`;
        if (key === lastLogged.current) return;
        lastLogged.current = key;

        const position = [worldPos.current.x, worldPos.current.y, worldPos.current.z];
        const lookAt = [targetX, targetY, targetZ];

        console.log("[Camera] position", position);
        console.log("[Camera] target  ", lookAt);
        console.log(
          `[Camera] copy → position: [${position.join(", ")}]  target: [${lookAt.join(", ")}]`
        );
      });

      return null;
    }

    function findCarAncestor(object) {
      let current = object;
      let spawned = null;
      let focusable = null;

      while (current) {
        const normalized = normalizeFocusName(current.name);
        if (normalized !== "cockpit") {
          if (current.userData?.isSpawnedVehicle) {
            spawned = current;
          } else if (!focusable && isFocusableObject(current.name)) {
            focusable = current;
          }
        }

        const parent = current.parent;
        if (parent && CARS_COLLECTION_PATTERN.test(parent.name)) {
          return spawned || current;
        }

        current = parent;
      }

      return spawned || focusable;
    }

    function removeHoverIndicators(root) {
      if (!root) return;

      const toRemove = [];
      root.traverse((child) => {
        if (child.userData?.isHoverIndicator) {
          toRemove.push(child);
        }
      });

      toRemove.forEach((child) => child.parent?.remove(child));
    }

    function createIsolatedCarClone(car) {
      removeHoverIndicators(car);
      car.updateWorldMatrix(true, true);

      const clone = car.clone(true);
      removeHoverIndicators(clone);
      clone.name = car.name;
      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      car.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

      clone.position.copy(worldPosition);
      clone.quaternion.copy(worldQuaternion);
      clone.scale.copy(worldScale);

      const box = new THREE.Box3().setFromObject(clone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      clone.position.sub(center);
      clone.updateMatrixWorld(true);

      return clone;
    }

    function isLargeTransitFocus(name = "") {
      const normalized = normalizeFocusName(name);
      return normalized.includes("etihadrail") || normalized.includes("dubaimetro");
    }

    function getCarFrame(car) {
      const box = new THREE.Box3().setFromObject(car);
      const size = new THREE.Vector3();
      box.getSize(size);
      const carSize = Math.max(size.x, size.y, size.z, 0.1);
      const zoomIn = isLargeTransitFocus(car.name);

      const cameraDistance = zoomIn ? 0.5 : 1;
      const cameraPosition = new THREE.Vector3(
        carSize * 1.55 * cameraDistance,
        carSize * 0.95 * cameraDistance,
        carSize * 1.95 * cameraDistance
      );
      const lockedDistance = cameraPosition.length();

      return {
        carSize,
        minDistance: lockedDistance,
        maxDistance: lockedDistance,
        cameraPosition,
        target: new THREE.Vector3(0, 0, 0),
      };
    }

    function getLoaderStage(progress) {
      if (progress < 25) return "Initializing scene";
      if (progress < 65) return "Loading city model";
      if (progress < 90) return "Preparing environment";
      return "Almost ready";
    }

    function CityLoadingOverlay({ active, progress, fadeOut, onExitComplete }) {
      const overlayRef = useRef(null);
      const titleRef = useRef(null);
      const subtitleRef = useRef(null);
      const stageRef = useRef(null);
      const percentRef = useRef(null);
      const barRef = useRef(null);
      const glowPrimaryRef = useRef(null);
      const glowSecondaryRef = useRef(null);
      const dotsRef = useRef([]);
      const displayProgressRef = useRef(0);
      const exitTweenRef = useRef(null);

      const roundedProgress = Math.min(100, Math.round(progress));

      useEffect(() => {
        const ctx = gsap.context(() => {
          gsap.set(overlayRef.current, { opacity: 0 });
          gsap.set([titleRef.current, subtitleRef.current, stageRef.current, percentRef.current], {
            opacity: 0,
            y: 24,
          });
          gsap.set(barRef.current, { width: "0%" });
          gsap.set(glowPrimaryRef.current, { opacity: 0.35, scale: 1 });
          gsap.set(glowSecondaryRef.current, { opacity: 0.2, scale: 1 });
          gsap.set(dotsRef.current.filter(Boolean), { opacity: 0.25, y: 0 });

          const entrance = gsap.timeline();
          entrance
            .to(overlayRef.current, { opacity: 1, duration: 0.65, ease: "power2.out" })
            .to(titleRef.current, { opacity: 1, y: 0, duration: 0.75, ease: "power3.out" }, "-=0.25")
            .to(subtitleRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.5")
            .to(
              [stageRef.current, percentRef.current],
              { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
              "-=0.35"
            );

          gsap.to(glowPrimaryRef.current, {
            opacity: 0.7,
            scale: 1.08,
            duration: 2,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });

          gsap.to(glowSecondaryRef.current, {
            opacity: 0.5,
            scale: 1.06,
            duration: 2.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: 0.8,
          });

          dotsRef.current.filter(Boolean).forEach((dot, index) => {
            gsap.to(dot, {
              opacity: 1,
              y: -4,
              duration: 0.55,
              ease: "power1.inOut",
              yoyo: true,
              repeat: -1,
              delay: index * 0.2,
            });
          });
        }, overlayRef);

        return () => ctx.revert();
      }, []);

      useEffect(() => {
        if (!barRef.current) return;

        gsap.to(barRef.current, {
          width: `${roundedProgress}%`,
          duration: 0.45,
          ease: "power2.out",
          overwrite: true,
        });

        const counter = { value: displayProgressRef.current };
        gsap.to(counter, {
          value: roundedProgress,
          duration: 0.45,
          ease: "power2.out",
          overwrite: true,
          onUpdate: () => {
            displayProgressRef.current = counter.value;
            if (percentRef.current) {
              percentRef.current.textContent = `${Math.round(counter.value)}%`;
            }
          },
        });
      }, [roundedProgress]);

      useEffect(() => {
        if (!fadeOut || !overlayRef.current) return;

        exitTweenRef.current?.kill();
        exitTweenRef.current = gsap.to(overlayRef.current, {
          opacity: 0,
          duration: 0.75,
          ease: "power2.inOut",
          onComplete: () => onExitComplete?.(),
        });

        return () => exitTweenRef.current?.kill();
      }, [fadeOut, onExitComplete]);

      return (
        <div
          ref={overlayRef}
          aria-live="polite"
          aria-busy={active}
          className={`${focusFont.className} pointer-events-none absolute inset-0 z-50 flex items-center justify-center opacity-0`}
          style={{
            background:
              "radial-gradient(circle at center, #6a6a6a 0%, #3d3d3d 45%, #141414 75%, #000000 100%)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div
              ref={glowPrimaryRef}
              className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
            />
            <div
              ref={glowSecondaryRef}
              className="absolute bottom-0 left-1/4 h-56 w-56 rounded-full bg-white/5 blur-3xl"
            />
          </div>

          <div className="relative flex w-full max-w-md flex-col items-center px-8">
            <p
              ref={titleRef}
              className="text-[clamp(2.5rem,8vw,4rem)] font-medium leading-none tracking-[-0.04em] text-white/95"
            >
              OTO CAR
            </p>
            <p
              ref={subtitleRef}
              className="mt-2 text-sm font-medium uppercase tracking-[0.35em] text-white/45"
            >
              City Experience
            </p>

            <div className="mt-12 w-full">
              <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-[0.2em] text-white/50">
                <span ref={stageRef}>{getLoaderStage(roundedProgress)}</span>
                <span ref={percentRef}>{roundedProgress}%</span>
              </div>

              <div className="h-px w-full overflow-hidden rounded-full bg-white/10">
                <div
                  ref={barRef}
                  className="h-full rounded-full bg-gradient-to-r from-white/25 via-white/80 to-white/25"
                  style={{ width: "0%" }}
                />
              </div>
            </div>

            <div className="mt-10 flex items-center gap-2">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  ref={(element) => {
                    dotsRef.current[index] = element;
                  }}
                  className="h-1.5 w-1.5 rounded-full bg-white/70"
                  style={{ opacity: index === 0 ? 0.7 : index === 1 ? 0.5 : 0.35 }}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    function RenderQuality({ focusTheme }) {
      const { gl, scene } = useThree();

      useEffect(() => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }, [gl]);

      useEffect(() => {
        if (focusTheme) {
          gl.setClearColor(focusTheme.backgroundHex, 1);
          scene.background = new THREE.Color(focusTheme.backgroundHex);
          return;
        }

        gl.setClearColor(0x000000, 0);
      }, [focusTheme, gl, scene]);

      return null;
    }

    function CameraFocus({ focusedCar, controlsRef, defaultCameraPosition, defaultTarget }) {
      const { camera, gl } = useThree();
      const animatingRef = useRef(false);
      const goalRef = useRef(null);
      const hasInitializedRef = useRef(false);
      const pointerRef = useRef({ x: 0, y: 0 });
      const peekRef = useRef({ x: 0, y: 0 });
      const lookOffset = useRef(new THREE.Vector3());
      const lookPoint = useRef(new THREE.Vector3());
      const rightAxis = useRef(new THREE.Vector3());

      useEffect(() => {
        const onMove = (event) => {
          const rect = gl.domElement.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          pointerRef.current.x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1) * 2 - 1;
          pointerRef.current.y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height, 0, 1) * 2 - 1;
        };

        const onLeave = () => {
          pointerRef.current.x = 0;
          pointerRef.current.y = 0;
        };

        window.addEventListener("pointermove", onMove);
        gl.domElement.addEventListener("pointerleave", onLeave);
        window.addEventListener("blur", onLeave);
        return () => {
          window.removeEventListener("pointermove", onMove);
          gl.domElement.removeEventListener("pointerleave", onLeave);
          window.removeEventListener("blur", onLeave);
        };
      }, [gl]);

      useEffect(() => {
        if (!focusedCar && !hasInitializedRef.current) {
          hasInitializedRef.current = true;
          return;
        }

        if (!focusedCar) {
          goalRef.current = {
            position: new THREE.Vector3(...defaultCameraPosition),
            target: new THREE.Vector3(...defaultTarget),
          };
          animatingRef.current = true;
          return;
        }

        const frame = getCarFrame(focusedCar);
        goalRef.current = {
          position: frame.cameraPosition,
          target: frame.target,
        };
        animatingRef.current = true;
      }, [defaultCameraPosition, defaultTarget, focusedCar]);

      useFrame((_, delta) => {
        if (animatingRef.current && goalRef.current) {
          const lerpFactor = 1 - Math.pow(0.00001, delta);
          camera.position.lerp(goalRef.current.position, lerpFactor);

          if (controlsRef.current) {
            controlsRef.current.target.lerp(goalRef.current.target, lerpFactor);
            controlsRef.current.update();
          }

          const positionDone = camera.position.distanceTo(goalRef.current.position) < 0.35;
          const targetDone =
            controlsRef.current?.target.distanceTo(goalRef.current.target) < 0.35;

          if (positionDone && targetDone) {
            animatingRef.current = false;
          }
          return;
        }

        if (focusedCar) return;

        const nx = pointerRef.current.x;
        const ny = pointerRef.current.y;
        const curve = Math.sign(nx) * Math.pow(Math.abs(nx), 0.72);
        const yawAmount = Math.sin(curve * (Math.PI / 2));
        const sideLift = Math.pow(1 - Math.cos(curve * (Math.PI / 2)), 1.35);
        const top = Math.max(-ny, 0);
        const topLift = Math.pow(top, 0.75);

        const follow = 1 - Math.exp(-CAMERA_PEEK.smooth * delta);
        peekRef.current.x += (yawAmount - peekRef.current.x) * follow;
        peekRef.current.y += (sideLift * 0.95 + topLift * 0.9 - peekRef.current.y) * follow;

        lookOffset.current.set(
          START_CAMERA_TARGET[0] - START_CAMERA_POSITION[0],
          START_CAMERA_TARGET[1] - START_CAMERA_POSITION[1],
          START_CAMERA_TARGET[2] - START_CAMERA_POSITION[2]
        );
        lookOffset.current.applyAxisAngle(WORLD_UP, -peekRef.current.x * CAMERA_PEEK.maxYaw);
        rightAxis.current.copy(WORLD_UP).cross(lookOffset.current);
        if (rightAxis.current.lengthSq() > 0.0001) {
          rightAxis.current.normalize();
          lookOffset.current.applyAxisAngle(
            rightAxis.current,
            -peekRef.current.y * CAMERA_PEEK.maxPitch
          );
        }

        camera.position.set(...START_CAMERA_POSITION);
        camera.up.copy(WORLD_UP);
        lookPoint.current.copy(camera.position).add(lookOffset.current);
        camera.lookAt(lookPoint.current);
      });

      return null;
    }

    function getFocusedCarLayout(car) {
      const box = new THREE.Box3().setFromObject(car);
      const size = new THREE.Vector3();
      box.getSize(size);

      const carSize = Math.max(size.x, size.y, size.z, 0.1);
      const groundWidth = size.x * 1.35;
      const groundDepth = size.z * 1.35;
      const shadowExtent = Math.max(groundWidth, groundDepth) * 0.55;

      return {
        carSize,
        groundY: box.min.y - 0.08,
        groundWidth,
        groundDepth,
        shadowExtent,
      };
    }

    function CarFocusLights({ layout }) {
      const lightRef = useRef(null);
      const { carSize, shadowExtent } = layout;

      useEffect(() => {
        const light = lightRef.current;
        if (!light) return;

        light.castShadow = true;
        light.shadow.intensity = 0.52;
        light.shadow.radius = 3.5;
        light.shadow.mapSize.set(FOCUS_SHADOW_MAP_SIZE, FOCUS_SHADOW_MAP_SIZE);
        light.shadow.bias = -0.00035;
        light.shadow.normalBias = 0.008;
        light.shadow.radius = 2.5;

        const shadowCamera = light.shadow.camera;
        shadowCamera.left = -shadowExtent;
        shadowCamera.right = shadowExtent;
        shadowCamera.top = shadowExtent;
        shadowCamera.bottom = -shadowExtent;
        shadowCamera.near = Math.max(0.5, carSize * 0.15);
        shadowCamera.far = carSize * 5;
        shadowCamera.updateProjectionMatrix();
      }, [carSize, shadowExtent]);

      return (
        <>
          <ambientLight intensity={0.32} color="#c8c4dc" />
          <hemisphereLight intensity={0.4} color="#d4ccec" groundColor="#9a96a8" />
          <directionalLight
            ref={lightRef}
            position={[shadowExtent * 1.1, carSize * 2.8, shadowExtent * 0.85]}
            intensity={1.85}
            color="#fff8f0"
          >
            <object3D attach="target" position={[0, 0, 0]} />
          </directionalLight>
          <directionalLight
            position={[-shadowExtent, carSize * 1.2, -shadowExtent]}
            intensity={0.48}
            color="#d0c8ea"
          />
        </>
      );
    }

    function FocusedCarView({ car }) {
      const rotateRef = useRef(null);
      const layout = useMemo(() => getFocusedCarLayout(car), [car]);

      useEffect(() => {
        car.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = false;
        });
      }, [car]);

      useFrame((_, delta) => {
        if (rotateRef.current) {
          rotateRef.current.rotation.y += delta * CAR_AUTO_ROTATE_SPEED;
        }
      });

      return (
        <>
          <CarFocusLights layout={layout} />
          <group ref={rotateRef}>
            <primitive object={car} />
          </group>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, layout.groundY, 0]}
            receiveShadow
          >
            <planeGeometry args={[layout.groundWidth, layout.groundDepth]} />
            <shadowMaterial transparent opacity={0.16} color="#000000" />
          </mesh>
        </>
      );
    }

    function DirectionalShadowLight({ target, radius }) {
      const lightRef = useRef(null);

      useEffect(() => {
        const light = lightRef.current;
        if (!light) return;

        // https://threejs.org/manual/en/shadows.html
        // https://threejs.org/docs/#api/en/lights/shadows/LightShadow
        light.castShadow = true;
        light.shadow.intensity = 0.36;
        light.shadow.radius = 3.2;
        light.shadow.mapSize.set(CITY_SHADOW_MAP_SIZE, CITY_SHADOW_MAP_SIZE);
        light.shadow.bias = -0.0001;
        light.shadow.normalBias = 0.04;

        const shadowCamera = light.shadow.camera;
        const extent = radius * 1.6;
        shadowCamera.left = -extent;
        shadowCamera.right = extent;
        shadowCamera.top = extent;
        shadowCamera.bottom = -extent;
        shadowCamera.near = 0.5;
        shadowCamera.far = radius * 12;
        shadowCamera.updateProjectionMatrix();

        light.target.position.set(target[0], target[1], target[2]);
        light.target.updateMatrixWorld();
      }, [radius, target]);

      return (
        <directionalLight
          ref={lightRef}
          position={[
            target[0] - radius * 0.85,
            target[1] + radius * 2.4,
            target[2] - radius * 1.15,
          ]}
          intensity={1.85}
          color="#fff8f0"
        />
      );
    }

    function shouldShowHoverIndicator(name = "") {
      const normalized = normalizeFocusName(name);
      return !normalized.includes("dubaimetro") && !normalized.includes("etihadrail");
    }

    function getLocalTargetBounds(target) {
      target.updateWorldMatrix(true, true);
      const inverse = new THREE.Matrix4().copy(target.matrixWorld).invert();
      const box = new THREE.Box3();
      const meshBox = new THREE.Box3();
      let initialized = false;

      target.traverse((child) => {
        if (!child.isMesh || child.userData?.isHoverIndicator) return;
        if (child.parent?.userData?.isHoverIndicator) return;
        if (!child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        if (!child.geometry.boundingBox) return;

        meshBox.copy(child.geometry.boundingBox);
        meshBox.applyMatrix4(child.matrixWorld);
        meshBox.applyMatrix4(inverse);

        const meshSize = new THREE.Vector3();
        meshBox.getSize(meshSize);
        const footprint = Math.max(meshSize.x, meshSize.z, 0.001);
        if (meshSize.y < footprint * 0.08 && footprint > 4) return;

        if (initialized) {
          box.union(meshBox);
        } else {
          box.copy(meshBox);
          initialized = true;
        }
      });

      if (!initialized) {
        box.setFromObject(target);
        box.applyMatrix4(inverse);
      }

      return box;
    }

    function getWorldBottomCenter(target, out = new THREE.Vector3()) {
      target.updateWorldMatrix(true, true);
      const worldBox = new THREE.Box3();
      let initialized = false;

      target.traverse((child) => {
        if (!child.isMesh || child.userData?.isHoverIndicator) return;
        if (child.parent?.userData?.isHoverIndicator) return;

        const meshBox = new THREE.Box3().setFromObject(child);
        const meshSize = new THREE.Vector3();
        meshBox.getSize(meshSize);
        const footprint = Math.max(meshSize.x, meshSize.z, 0.001);
        if (meshSize.y < footprint * 0.08 && footprint > 4) return;

        if (initialized) {
          worldBox.union(meshBox);
        } else {
          worldBox.copy(meshBox);
          initialized = true;
        }
      });

      if (!initialized) {
        worldBox.setFromObject(target);
      }

      return out.set(
        (worldBox.min.x + worldBox.max.x) * 0.5,
        worldBox.min.y,
        (worldBox.min.z + worldBox.max.z) * 0.5
      );
    }

    function getTargetHoverLayout(target) {
      const box = getLocalTargetBounds(target);
      const size = new THREE.Vector3();
      box.getSize(size);

      const isFlying = normalizeFocusName(target.name).includes("flyingtaxi");
      const footprint = Math.max(size.x, size.z, 0.001);
      const radius = Math.min(footprint * (isFlying ? 0.48 : 0.58), isFlying ? 1.35 : 2.4);

      return {
        ringInner: radius * 0.82,
        ringOuter: radius,
        lift: isFlying ? 0.04 : 0.035,
      };
    }

    function runHoverPulse(ringRef, tweensRef) {
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];

      const ring = ringRef.current;
      if (!ring) return;

      ring.scale.set(0.55, 0.55, 0.55);
      ring.material.opacity = 0.3;

      tweensRef.current.push(
        gsap.to(ring.scale, {
          x: 1.35,
          y: 1.35,
          z: 1.35,
          duration: 0.7,
          ease: "power2.out",
        })
      );
      tweensRef.current.push(
        gsap.to(ring.material, {
          opacity: 0,
          duration: 0.7,
          ease: "power2.out",
        })
      );
    }

    function ClickableHoverIndicator({ target }) {
      const groupRef = useRef(null);
      const ringRef = useRef(null);
      const tweensRef = useRef([]);
      const worldBottom = useRef(new THREE.Vector3());
      const layout = useMemo(() => getTargetHoverLayout(target), [target]);

      useLayoutEffect(() => {
        const group = groupRef.current;
        if (!group) return;

        group.userData.isHoverIndicator = true;
        group.traverse((child) => {
          child.userData.isHoverIndicator = true;
          if (child.isMesh) child.raycast = () => {};
        });

        runHoverPulse(ringRef, tweensRef);

        return () => {
          tweensRef.current.forEach((tween) => tween.kill());
          tweensRef.current = [];
        };
      }, [layout, target]);

      useFrame(() => {
        const group = groupRef.current;
        if (!group?.parent || !target) return;

        getWorldBottomCenter(target, worldBottom.current);
        group.parent.worldToLocal(worldBottom.current);
        group.position.set(
          worldBottom.current.x,
          worldBottom.current.y + layout.lift,
          worldBottom.current.z
        );
        group.quaternion.identity();
      });

      return (
        <group ref={groupRef}>
          <mesh
            ref={ringRef}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={2}
          >
            <ringGeometry args={[layout.ringInner, layout.ringOuter, 64]} />
            <meshBasicMaterial
              color="#2e7fd1"
              transparent
              opacity={0}
              toneMapped={false}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      );
    }

    function DeferredEnvironment() {
      return (
        <Environment
          preset="sunset"
          background
          backgroundBlurriness={0.5}
          environmentIntensity={0.42}
        />
      );
    }
    function findLocatorByName(root, locatorName) {
      const wanted = normalizeFocusName(locatorName);
      let found = null;
      root.traverse((child) => {
        if (found || !child.name) return;
        const normalized = normalizeFocusName(child.name);
        if (normalized === wanted || normalized.startsWith(wanted)) found = child;
      });
      return found;
    }

    function getLocalFootprint(object) {
      object.updateMatrixWorld(true);
      const inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
      const box = new THREE.Box3();
      const meshBox = new THREE.Box3();
      let initialized = false;

      object.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        if (!child.geometry.boundingBox) return;
        meshBox.copy(child.geometry.boundingBox);
        meshBox.applyMatrix4(child.matrixWorld);
        meshBox.applyMatrix4(inverse);
        if (initialized) {
          box.union(meshBox);
        } else {
          box.copy(meshBox);
          initialized = true;
        }
      });

      if (!initialized) {
        box.setFromObject(object);
        box.applyMatrix4(inverse);
      }

      const size = new THREE.Vector3();
      box.getSize(size);
      return Math.max(size.x, size.z, 1e-6);
    }

    function hideVehicleLocator(locator) {
      locator.userData.isVehicleLocator = true;
      locator.traverse((child) => {
        child.visible = false;
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        child.raycast = () => {};
      });
    }

    function SpawnedVehicle({
      cityScene,
      locator,
      src,
      targetLength,
      yawOffset = 0,
      positionOffset = [0, 0, 0],
      paused,
    }) {
      const { scene, animations } = useGLTF(src);
      const groupRef = useRef(null);
      const model = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = false;
        });
        return clone;
      }, [scene]);
      const { actions, names, mixer } = useAnimations(animations, model);

      useLayoutEffect(() => {
        const group = groupRef.current;
        if (!group) return;

        const marker = findLocatorByName(cityScene, locator);
        if (marker && group.parent) {
          hideVehicleLocator(marker);
          marker.updateWorldMatrix(true, false);
          group.parent.updateWorldMatrix(true, false);

          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          marker.getWorldPosition(worldPos);
          marker.getWorldQuaternion(worldQuat);
          group.parent.worldToLocal(worldPos);
          group.position.copy(worldPos);
          group.quaternion.copy(worldQuat);
          group.scale.set(1, 1, 1);
          group.translateX(positionOffset[0]);
          group.translateY(positionOffset[1]);
          group.translateZ(positionOffset[2]);
          if (yawOffset) {
            group.rotateY(THREE.MathUtils.degToRad(yawOffset));
          }
        }

        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        model.updateMatrixWorld(true);
        model.scale.setScalar(targetLength / getLocalFootprint(model));
        model.updateMatrixWorld(true);

        if (!marker) return;

        const worldScale = new THREE.Vector3();
        group.getWorldScale(worldScale);
        const fitted = new THREE.Box3().setFromObject(model);
        const groupWorld = new THREE.Vector3();
        group.getWorldPosition(groupWorld);
        const minLocalY = (fitted.min.y - groupWorld.y) / Math.max(Math.abs(worldScale.y), 1e-6);
        model.position.y += -Math.abs(marker.scale.y) * 0.5 - minLocalY;
      }, [cityScene, locator, model, targetLength, yawOffset, positionOffset]);

      useEffect(() => {
        if (!names.length) return undefined;

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
      }, [actions, names]);

      useEffect(() => {
        if (!mixer) return;
        mixer.timeScale = paused ? 0 : CITY_ANIMATION_TIME_SCALE;
      }, [mixer, paused]);

      return (
        <group ref={groupRef} name={locator} userData={{ isSpawnedVehicle: true }}>
          <primitive object={model} />
        </group>
      );
    }

    function SpawnedCityVehicles({ cityScene, focusedCar, hoveredTarget }) {
      const pauseSelfDriving = isSelfDrivingTaxi(hoveredTarget?.name);

      return VEHICLE_SPOTS.map((spot) => (
        <SpawnedVehicle
          key={spot.locator}
          cityScene={cityScene}
          locator={spot.locator}
          src={spot.src}
          targetLength={spot.targetLength}
          yawOffset={spot.yawOffset}
          positionOffset={spot.positionOffset}
          paused={
            !!focusedCar ||
            (spot.locator === "Selfdriving Taxi" && pauseSelfDriving)
          }
        />
      ));
    }

    function CityModel({ focusedCar, onCarFocus }) {
      const { scene, animations } = useGLTF(modelUrl("/models/city2.glb"));
      const controlsRef = useRef(null);
      const { camera, gl } = useThree();
      const [hoveredCar, setHoveredCar] = useState(false);
      const [hoveredTarget, setHoveredTarget] = useState(null);
      const hoverCountRef = useRef(0);

      useCursor(hoveredCar && !focusedCar, "pointer");

      const carFocusFrame = useMemo(
        () => (focusedCar ? getCarFrame(focusedCar) : null),
        [focusedCar]
      );

      const { actions, names, mixer } = useAnimations(animations, scene);

      const { fitPosition, fitScale, target, minDistance, maxDistance, cameraPosition, near, far, radius } =
        useMemo(() => {
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const largestDimension = Math.max(size.x, size.y, size.z) || 1;
          const normalizedSize = 1850;
          const scale = normalizedSize / largestDimension;

          const fittedRadius = (largestDimension * scale) / 2;

          return {
            fitPosition: [-center.x * scale, -center.y * scale, -center.z * scale],
            fitScale: scale,
            target: [0, 0, 0],
            minDistance: Math.max(0.2, fittedRadius * 0.06),
            maxDistance: Math.max(40, fittedRadius * 14),
            cameraPosition: [fittedRadius * 1.05, fittedRadius * 0.65, fittedRadius * 1.05],
            near: Math.max(0.01, fittedRadius * 0.01),
            far: Math.max(200, fittedRadius * 40),
            radius: fittedRadius,
          };
        }, [scene]);

      useEffect(() => {
        const startingPosition = START_CAMERA_POSITION ?? cameraPosition;

        camera.position.set(...startingPosition);
        camera.near = near;
        camera.far = far;
        camera.lookAt(...START_CAMERA_TARGET);
        camera.updateProjectionMatrix();

        if (controlsRef.current) {
          controlsRef.current.target.set(...START_CAMERA_TARGET);
          controlsRef.current.update();
        }
      }, [camera, cameraPosition, far, near, target]);

      useEffect(() => {
        VEHICLE_SPOTS.forEach((spot) => {
          const marker = findLocatorByName(scene, spot.locator);
          if (marker) hideVehicleLocator(marker);
        });
      }, [scene]);

      useEffect(() => {
        analyzeScenePerformance(scene, animations, "city2.glb");

        const meshNames = [];
        const objectNames = [];
        scene.traverse((child) => {
          if (child.name) objectNames.push({ type: child.type, name: child.name });
          if (child.isMesh) {
            meshNames.push(child.name || "(unnamed)");
          }
        });

        console.groupCollapsed(
          `%c[Meshes] city2.glb — ${meshNames.length} meshes`,
          "color:#34d399;font-weight:bold"
        );
        console.table(meshNames.map((name, i) => ({ index: i + 1, name })));
        console.log("All object names (including groups/empties):", objectNames);
        console.groupEnd();
      }, [scene, animations]);

      useEffect(() => {
        const maxAnisotropy = Math.min(
          gl.capabilities.getMaxAnisotropy(),
          MAX_TEXTURE_ANISOTROPY
        );
        const textureKeys = [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "aoMap",
          "emissiveMap",
        ];
        const meshBounds = new THREE.Box3();
        const meshSize = new THREE.Vector3();

        scene.traverse((child) => {
          if (!child.isMesh) return;
          if (child.userData.isVehicleLocator || child.parent?.userData?.isVehicleLocator) {
            return;
          }

          child.castShadow = true;
          child.receiveShadow = false;

          meshBounds.setFromObject(child);
          meshBounds.getSize(meshSize);
          const footprint = Math.max(meshSize.x, meshSize.z, 0.001);
          const isGroundLike = meshSize.y < footprint * 0.2;
          if (isGroundLike) {
            child.receiveShadow = true;
          }

          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => {
            if (!material) return;

            textureKeys.forEach((key) => {
              const texture = material[key];
              if (!texture) return;
              texture.anisotropy = maxAnisotropy;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
            });

            if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
              if (!material.map && material.roughness < 0.45) {
                material.roughness = 0.72;
              }
              if (!material.metalnessMap && material.metalness > 0.25) {
                const lightness = material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
                if (lightness > 0.35) {
                  material.metalness = 0.06;
                }
              }
              material.envMapIntensity = material.map ? 1 : 0.7;
            }
          });
        });
      }, [gl, scene]);

      useEffect(() => {
        if (!ANIMATIONS_ENABLED) {
          names.forEach((name) => actions[name]?.stop());
          if (mixer) mixer.timeScale = 0;
          if (PERF_LOG_ENABLED) {
            console.log("%c[Perf] Animations disabled for city2.glb", "color:#94a3b8");
          }
          return;
        }

        if (!names.length) {
          if (PERF_LOG_ENABLED) {
            console.log("%c[Perf] No animation clips on city2.glb", "color:#94a3b8");
          }
          return;
        }

        names.forEach((name) => {
          const action = actions[name];
          if (!action) return;
          action.reset();
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.enabled = true;
          action.play();
        });

        if (PERF_LOG_ENABLED) {
          console.log(
            `%c[Perf] Playing ${names.length} animation action(s):`,
            "color:#c4b5fd;font-weight:bold",
            names
          );
        }

        return () => {
          names.forEach((name) => actions[name]?.stop());
        };
      }, [actions, names, scene, mixer]);

      useEffect(() => {
        if (!mixer) return;

        if (!ANIMATIONS_ENABLED || focusedCar) {
          mixer.timeScale = 0;
          return;
        }

        mixer.timeScale = CITY_ANIMATION_TIME_SCALE;

        if (!focusedCar) {
          names.forEach((name) => {
            const action = actions[name];
            if (action && !action.isRunning()) {
              action.play();
            }
          });
        }
      }, [actions, focusedCar, mixer, names]);

      const handleCarPointerOver = useCallback(
        (event) => {
          if (focusedCar) return;
          event.stopPropagation();
          const car = findCarAncestor(event.object);
          if (!car) return;

          hoverCountRef.current += 1;
          setHoveredCar(true);
          setHoveredTarget(car);
        },
        [focusedCar]
      );

      const handleCarPointerOut = useCallback(
        (event) => {
          event.stopPropagation();
          if (!findCarAncestor(event.object)) return;

          hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
          if (hoverCountRef.current === 0) {
            setHoveredCar(false);
            setHoveredTarget(null);
          }
        },
        []
      );

      const handleCarClick = useCallback(
        (event) => {
          event.stopPropagation();
          const car = findCarAncestor(event.object);
          if (!car) return;

          hoverCountRef.current = 0;
          setHoveredCar(false);
          setHoveredTarget(null);
          removeHoverIndicators(car);
          onCarFocus(createIsolatedCarClone(car));
        },
        [onCarFocus]
      );

      const defaultCameraPosition = START_CAMERA_POSITION ?? cameraPosition;
      const controlsMinDistance = focusedCar ? carFocusFrame.minDistance : minDistance;
      const controlsMaxDistance = focusedCar ? carFocusFrame.maxDistance : maxDistance;

      return (
        <>
          {!focusedCar && (
            <>
              <ambientLight intensity={0.32} color="#c8c4dc" />
              <hemisphereLight intensity={0.42} color="#d4ccec" groundColor="#9a96a8" />
              <DirectionalShadowLight target={target} radius={radius} />
              <directionalLight
                position={[target[0] + radius * 0.9, target[1] + radius * 1.1, target[2] + radius * 1.05]}
                intensity={0.48}
                color="#d0c8ea"
              />
              <DeferredEnvironment />
            </>
          )}
          <group
            visible={!focusedCar}
            position={fitPosition}
            scale={fitScale}
            onPointerOver={handleCarPointerOver}
            onPointerOut={handleCarPointerOut}
            onClick={handleCarClick}
          >
            <primitive object={scene} />
            <Suspense fallback={null}>
              <SpawnedCityVehicles
                cityScene={scene}
                focusedCar={focusedCar}
                hoveredTarget={hoveredTarget}
              />
            </Suspense>
            {!focusedCar && hoveredTarget && shouldShowHoverIndicator(hoveredTarget.name) && (
              <ClickableHoverIndicator target={hoveredTarget} />
            )}
          </group>
          {focusedCar && <FocusedCarView car={focusedCar} />}
          <CameraFocus
            focusedCar={focusedCar}
            controlsRef={controlsRef}
            defaultCameraPosition={defaultCameraPosition}
            defaultTarget={START_CAMERA_TARGET}
          />
          <RuntimePerfProbe />
          <CameraCredentialsLog controlsRef={controlsRef} />
          <OrbitControls
            ref={controlsRef}
            enabled={!!focusedCar}
            enableRotate={!!focusedCar}
            enableZoom={false}
            enablePan={false}
            enableDamping={!!focusedCar}
            dampingFactor={0.08}
            minDistance={controlsMinDistance}
            maxDistance={controlsMaxDistance}
          />
        </>
      );
    }

    export default function CityScene() {
      const [focusedCar, setFocusedCar] = useState(null);
      const [loading, setLoading] = useState({ active: true, progress: 0 });
      const [loaderVisible, setLoaderVisible] = useState(true);
      const [loaderFadeOut, setLoaderFadeOut] = useState(false);
      const handleLoaderExitComplete = useCallback(() => {
        setLoaderVisible(false);
      }, []);
      const focusTheme = focusedCar ? getCarFocusTheme(focusedCar.name) : null;

      useEffect(() => {
        let frame = 0;

        const syncLoading = (state) => {
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
      }, []);

      useEffect(() => {
        if (!loading.active && loading.progress >= 100) {
          setLoaderFadeOut(true);
          return;
        }

        if (loading.active) {
          setLoaderVisible(true);
          setLoaderFadeOut(false);
        }
      }, [loading.active, loading.progress]);

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === "Escape") {
            setFocusedCar(null);
          }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
      }, []);

      return (
        <div
          className="relative h-screen w-screen transition-colors duration-700"
          style={{
            background: focusTheme
              ? focusTheme.backgroundColor
              : "radial-gradient(ellipse at 18% 0%, #f2f2f2 0%, #8d8d8d 24%, #5c5c5c 52%, #3a3a3a 100%)",
          }}
        >
          {loaderVisible && (
            <CityLoadingOverlay
              active={loading.active}
              progress={loading.progress}
              fadeOut={loaderFadeOut}
              onExitComplete={handleLoaderExitComplete}
            />
          )}
          <Canvas
            className="!bg-transparent"
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1,
            }}
            dpr={[1, 1.5]}
            shadows="percentage"
            camera={{ position: START_CAMERA_POSITION, fov: 50, near: 0.1, far: 2000 }}
          >
            <AdaptiveDpr pixelated />
            <RenderQuality focusTheme={focusTheme} />
            <Suspense fallback={null}>
              <CityModel focusedCar={focusedCar} onCarFocus={setFocusedCar} />
            </Suspense>
          </Canvas>
          {focusTheme && (
            <CarFocusOverlay theme={focusTheme} onClose={() => setFocusedCar(null)} />
          )}
        </div>
      );
    }

  function CarFocusOverlay({ theme, onClose }) {
    return (
      <div className={`${focusFont.className} pointer-events-none absolute inset-0 z-10 overflow-hidden`}>
        <p
          className="absolute top-[6%] right-[5%] w-[min(42vw,28rem)] text-left font-light leading-relaxed sm:right-[8%] sm:top-[8%]"
          style={{
            color: `${theme.uiText}d9`,
            fontSize: "clamp(0.72rem, 2.05vw, 1.65rem)",
          }}
        >
          Premium rides in high-end cars. When you want a low-cost ride with an added
          touch of luxury, OTO CAR is the option for you.
        </p>

        <div className="absolute bottom-[22%] left-[5%] sm:bottom-[18%] sm:left-[6%]">
          <p
            className="font-medium leading-[0.92] tracking-[-0.03em]"
            style={{
              color: theme.accentText,
              fontSize: "clamp(1.6rem, 8.5vw, 7.5rem)",
            }}
          >
            OTO CAR
          </p>
          <p
            className="font-medium leading-[0.92] tracking-[-0.03em]"
            style={{
              color: theme.accentText,
              fontSize: "clamp(1.6rem, 8.5vw, 7.5rem)",
            }}
          >
            Select
          </p>
        </div>

        <button  
          type="button"
          onClick={onClose}
          aria-label="Close car view"
          className="pointer-events-auto absolute bottom-[4%] left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border transition sm:bottom-8 sm:h-9 sm:w-9"
          style={{
            borderColor: `${theme.uiText}59`,
            color: `${theme.uiText}cc`,
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  useGLTF.preload(modelUrl("/models/city2.glb"));
  VEHICLE_SPOTS.forEach((spot) => useGLTF.preload(spot.src));

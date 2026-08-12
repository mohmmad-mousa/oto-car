  'use client';

  import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  import { Montserrat } from "next/font/google";
  import gsap from "gsap";
  import * as THREE from "three";

  const focusFont = Montserrat({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
  });

    // Set to [x, y, z] for a fixed starting camera position, or null for auto-fit.
    const START_CAMERA_POSITION = [0.17, 92.13, -188.39];
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

    const CAR_NAME_PATTERN = /^Car\d+/;
    const CARS_COLLECTION_PATTERN = /^Cars$/i;

    // Blender "Cars" collection + common GLB export variants (spaces vs underscores).
    const FOCUSABLE_NAME_KEYS = new Set([
      "whitesedan",
      "redtaxi",
      "bigblacksuv",
      "dubaibus",
      "selfdrivingtaxi",
      "sefdrivingtaxi",
      "cockpit",
      "flyingtaxi",
      "etihadrail2",
      "dubaimetro1",
      "etihadrail1",
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

      return false;
    }

    function getCarFocusTheme(carName = "") {
      const normalized = normalizeFocusName(carName);

      if (
        /Car2/i.test(carName) ||
        normalized.includes("whitesedan") ||
        normalized.includes("dubaimetro") ||
        normalized.includes("etihadrail") ||
        normalized.includes("flyingtaxi")
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

    function findCarAncestor(object) {
      let current = object;

      while (current) {
        if (isFocusableObject(current.name)) return current;

        const parent = current.parent;
        if (parent && CARS_COLLECTION_PATTERN.test(parent.name)) {
          return current;
        }

        current = parent;
      }

      return null;
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
      const minDistanceScale = zoomIn ? 0.2 : 0.38;
      const maxDistanceScale = zoomIn ? 2.5 : 5;

      return {
        carSize,
        minDistance: Math.max(0.12, carSize * minDistanceScale),
        maxDistance: Math.max(4, carSize * maxDistanceScale),
        cameraPosition: new THREE.Vector3(
          carSize * 1.55 * cameraDistance,
          carSize * 0.95 * cameraDistance,
          carSize * 1.95 * cameraDistance
        ),
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
        gl.toneMappingExposure = 1.15;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }, [gl]);

      useEffect(() => {
        if (focusTheme) {
          gl.setClearColor(focusTheme.backgroundHex, 1);
          scene.background = new THREE.Color(focusTheme.backgroundHex);
          return;
        }

        gl.setClearColor(0x000000, 0);
        scene.background = null;
      }, [focusTheme, gl, scene]);

      return null;
    }

    function CameraFocus({ focusedCar, controlsRef, defaultCameraPosition, defaultTarget }) {
      const { camera } = useThree();
      const animatingRef = useRef(false);
      const goalRef = useRef(null);
      const hasInitializedRef = useRef(false);

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
        if (!animatingRef.current || !goalRef.current) return;

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
        light.shadow.intensity = 0.95;
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
          <ambientLight intensity={0.82} color="#f5f8ff" />
          <directionalLight
            ref={lightRef}
            position={[shadowExtent * 1.1, carSize * 2.8, shadowExtent * 0.85]}
            intensity={1.45}
            color="#ffffff"
          >
            <object3D attach="target" position={[0, 0, 0]} />
          </directionalLight>
          <directionalLight position={[-shadowExtent, carSize * 1.2, -shadowExtent]} intensity={0.45} color="#d8e4ff" />
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
            <shadowMaterial transparent opacity={0.32} color="#000000" />
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
        light.shadow.intensity = 1;
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
            target[0] + radius * 1.4,
            target[1] + radius * 2.2,
            target[2] + radius * 0.5,
          ]}
          intensity={1.8}
          color="#c8c8c8"
        />
      );
    }

    function shouldShowHoverIndicator(name = "") {
      const normalized = normalizeFocusName(name);

      if (normalized.includes("dubaimetro") || normalized.includes("etihadrail")) {
        return false;
      }
      if (normalized.includes("cockpit") || normalized.includes("flyingtaxi")) {
        return false;
      }

      return true;
    }

    function getBusMesh(target) {
      let exactMatch = null;
      let fuzzyMatch = null;

      const consider = (object) => {
        if (!object?.isMesh) return;
        const normalized = normalizeFocusName(object.name);
        if (normalized === "dubaibus") {
          exactMatch = object;
        } else if (normalized.includes("bus") && !fuzzyMatch) {
          fuzzyMatch = object;
        }
      };

      consider(target);
      target.traverse((child) => consider(child));

      return exactMatch ?? fuzzyMatch;
    }

    function runHoverCircleIntro(circleRefs, tweensRef) {
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];

      circleRefs.current.filter(Boolean).forEach((mesh, index) => {
        mesh.scale.set(0.01, 0.01, 0.01);
        mesh.material.opacity = 0;

        tweensRef.current.push(
          gsap.to(mesh.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.5,
            delay: index * 0.09,
            ease: "back.out(2)",
          })
        );

        tweensRef.current.push(
          gsap.to(mesh.material, {
            opacity: 0.42 - index * 0.08,
            duration: 0.4,
            delay: index * 0.09,
            ease: "power2.out",
          })
        );

        tweensRef.current.push(
          gsap.to(mesh.scale, {
            x: 1.06,
            y: 1.06,
            z: 1.06,
            duration: 1.15 + index * 0.12,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: 0.55 + index * 0.14,
          })
        );
      });
    }

    function BusHoverIndicator({ target, fitScale }) {
      const groupRef = useRef(null);
      const circleRefs = useRef([]);
      const tweensRef = useRef([]);
      const busMeshRef = useRef(null);
      const layout = useMemo(() => {
        const busMesh = getBusMesh(target);
        if (!busMesh) {
          return { radii: [1, 1.6, 2.2], groundOffset: 0.15 };
        }

        busMesh.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(busMesh);
        const size = new THREE.Vector3();
        box.getSize(size);

        const scale = Math.max(fitScale, 0.0001);
        const localFootprint = Math.max(size.x, size.z, 0.001) / scale;
        const radius = localFootprint * 0.7;

        return {
          radii: [radius * 0.45, radius * 0.72, radius * 1],
          groundOffset: Math.max(size.y * 0.055, 0.15),
        };
      }, [target, fitScale]);

      const sync = useMemo(
        () => ({
          box: new THREE.Box3(),
          center: new THREE.Vector3(),
          bottom: new THREE.Vector3(),
        }),
        []
      );

      useEffect(() => {
        busMeshRef.current = getBusMesh(target);
        runHoverCircleIntro(circleRefs, tweensRef);

        return () => {
          tweensRef.current.forEach((tween) => tween.kill());
          tweensRef.current = [];
        };
      }, [target, layout]);

      useFrame(() => {
        const busMesh = busMeshRef.current;
        const group = groupRef.current;
        const fitGroup = group?.parent;
        if (!busMesh || !group || !fitGroup) return;

        busMesh.updateWorldMatrix(true, true);
        sync.box.setFromObject(busMesh);
        sync.box.getCenter(sync.center);
        sync.bottom.set(
          sync.center.x,
          sync.box.min.y + layout.groundOffset,
          sync.center.z
        );
        group.position.copy(fitGroup.worldToLocal(sync.bottom));
      });

      return (
        <group ref={groupRef}>
          {layout.radii.map((radius, index) => (
            <mesh
              key={`bus-${target.uuid}-${index}`}
              ref={(element) => {
                circleRefs.current[index] = element;
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={10}
            >
              <circleGeometry args={[radius, 56]} />
              <meshBasicMaterial
                color="#000000"
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      );
    }

    function getTargetBounds(target) {
      const box = new THREE.Box3();
      let initialized = false;

      target.traverse((child) => {
        if (!child.isMesh) return;

        const meshBox = new THREE.Box3().setFromObject(child);
        const meshSize = new THREE.Vector3();
        meshBox.getSize(meshSize);
        const footprint = Math.max(meshSize.x, meshSize.z, 0.001);

        if (meshSize.y < footprint * 0.08 && footprint > 80) {
          return;
        }

        if (initialized) {
          box.union(meshBox);
        } else {
          box.copy(meshBox);
          initialized = true;
        }
      });

      if (!initialized) {
        box.setFromObject(target);
      }

      return box;
    }

    function getTargetHoverLayout(target) {
      target.updateWorldMatrix(true, true);

      const box = getTargetBounds(target);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const bottomCenter = new THREE.Vector3(center.x, box.min.y, center.z);
      const localBottom = target.worldToLocal(bottomCenter.clone());
      const footprint = Math.max(size.x, size.z);
      const radius = footprint * 0.14;

      return {
        position: localBottom,
        radii: [radius * 0.45, radius * 0.72, radius * 1],
        lift: Math.max(size.y * 0.01, 0.08),
      };
    }

    function ClickableHoverIndicator({ target }) {
      const groupRef = useRef(null);
      const circleRefs = useRef([]);
      const tweensRef = useRef([]);
      const layout = useMemo(() => getTargetHoverLayout(target), [target]);

      useEffect(() => {
        const group = groupRef.current;
        if (!group || !target) return;

        target.add(group);
        group.userData.isHoverIndicator = true;
        group.position.set(
          layout.position.x,
          layout.position.y + layout.lift,
          layout.position.z
        );


        
        runHoverCircleIntro(circleRefs, tweensRef);

        return () => {
          tweensRef.current.forEach((tween) => tween.kill());
          tweensRef.current = [];
          if (group.parent === target) {
            target.remove(group);
          }
        };
      }, [layout, target]);

      return (
        <group ref={groupRef}>
          {layout.radii.map((radius, index) => (
            <mesh
              key={`${target.uuid}-${index}`}
              ref={(element) => {
                circleRefs.current[index] = element;
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={10}
            >
              <circleGeometry args={[radius, 56]} />
              <meshBasicMaterial
                color="#000000"
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      );
    }

    function DeferredEnvironment() {
      const [ready, setReady] = useState(false);

      useEffect(() => {
        setReady(true);
      }, []);

      if (!ready) return null;

      return <Environment preset="city" environmentIntensity={0.35} frames={1} />;
    }

    function CityModel({ focusedCar, onCarFocus }) {
      const { scene, animations } = useGLTF("/models/city-2.glb");
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
        camera.lookAt(...target);
        camera.updateProjectionMatrix();

        if (controlsRef.current) {
          controlsRef.current.target.set(...target);
          controlsRef.current.update();
        }
      }, [camera, cameraPosition, far, near, target]);

      useEffect(() => {
        analyzeScenePerformance(scene, animations, "city-2.glb");

        const meshNames = [];
        const objectNames = [];
        scene.traverse((child) => {
          if (child.name) objectNames.push({ type: child.type, name: child.name });
          if (child.isMesh) {
            meshNames.push(child.name || "(unnamed)");
          }
        });

        console.groupCollapsed(
          `%c[Meshes] city-2.glb — ${meshNames.length} meshes`,
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
          });
        });
      }, [gl, scene]);

      useEffect(() => {
        if (!ANIMATIONS_ENABLED) {
          names.forEach((name) => actions[name]?.stop());
          if (mixer) mixer.timeScale = 0;
          if (PERF_LOG_ENABLED) {
            console.log("%c[Perf] Animations disabled for city-2.glb", "color:#94a3b8");
          }
          return;
        }

        if (!names.length) {
          if (PERF_LOG_ENABLED) {
            console.log("%c[Perf] No animation clips on city-2.glb", "color:#94a3b8");
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

        mixer.timeScale = hoveredCar ? 0 : CITY_ANIMATION_TIME_SCALE;

        if (!hoveredCar) {
          names.forEach((name) => {
            const action = actions[name];
            if (action && !action.isRunning()) {
              action.play();
            }
          });
        }
      }, [actions, focusedCar, hoveredCar, mixer, names]);

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
      const controlsTarget = focusedCar ? carFocusFrame.target.toArray() : target;
      const controlsMinDistance = focusedCar ? carFocusFrame.minDistance : minDistance;
      const controlsMaxDistance = focusedCar ? carFocusFrame.maxDistance : maxDistance;

      return (
        <>
          {!focusedCar && (
            <>
              <ambientLight intensity={0.45} color="#a8a8a8" />
              <hemisphereLight intensity={0.55} color="#b8b8b8" groundColor="#6b6b6b" />
              <DirectionalShadowLight target={target} radius={radius} />
              <directionalLight position={[-radius, radius * 1.2, -radius]} intensity={0.35} color="#9a9a9a" />
              <DeferredEnvironment />
            </>
          )}
          <group visible={!focusedCar} position={fitPosition} scale={fitScale}>
            <primitive
              object={scene}
              onPointerOver={handleCarPointerOver}
              onPointerOut={handleCarPointerOut}
              onClick={handleCarClick}
            />
            {!focusedCar && hoveredTarget && shouldShowHoverIndicator(hoveredTarget.name) && (
              normalizeFocusName(hoveredTarget.name).includes("dubaibus") ? (
                <BusHoverIndicator target={hoveredTarget} fitScale={fitScale} />
              ) : (
                <ClickableHoverIndicator target={hoveredTarget} />
              )
            )}
          </group>
          {focusedCar && <FocusedCarView car={focusedCar} />}
          <CameraFocus
            focusedCar={focusedCar}
            controlsRef={controlsRef}
            defaultCameraPosition={defaultCameraPosition}
            defaultTarget={target}
          />
          <RuntimePerfProbe />
          <OrbitControls
            ref={controlsRef}
            enableRotate
            enableZoom
            enablePan={!focusedCar}
            enableDamping
            dampingFactor={0.08}
            target={controlsTarget}
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
              : "radial-gradient(circle at center, #6a6a6a 0%, #3d3d3d 45%, #141414 75%, #000000 100%)",
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
            }}
            dpr={[1, 1.5]}
            shadows="percentage"
            camera={{ position: [10, 5, 14], fov: 50, near: 0.1, far: 2000 }}
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
      <div className={`${focusFont.className} pointer-events-none absolute inset-0 z-10`}>
        <p
          className="absolute top-0 right-10 mt-20 max-w-md text-left text-2xl font-light leading-relaxed md:right-24 md:max-w-xl md:text-3xl lg:max-w-xl lg:text-3xl"
          style={{ color: `${theme.uiText}d9` }}
        >
          Premium rides in high-end cars. When you want a low-cost ride with an added
          touch of luxury, OTO CAR is the option for you.
        </p>

        <div className="absolute bottom-12 left-10 mb-60 md:bottom-16 md:left-14">
          <p
            className="text-[clamp(3.75rem,12vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.03em]"
            style={{ color: theme.accentText }}
          >
            OTO CAR
          </p>
          <p
            className="text-[clamp(3.75rem,12vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.03em]"
            style={{ color: theme.accentText }}
          >
            Select
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close car view"
          className="pointer-events-auto absolute bottom-8 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border transition"
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

  useGLTF.preload("/models/city-2.glb");

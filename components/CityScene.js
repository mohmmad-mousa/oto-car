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

    function getCarFocusTheme(carName = "") {
      if (/Car2/i.test(carName)) {
        return CAR_FOCUS_THEMES.green;
      }

      return CAR_FOCUS_THEMES.red;
    }

    const CAR_AUTO_ROTATE_SPEED = 0.12;
const CITY_SHADOW_MAP_SIZE = 2048;
const FOCUS_SHADOW_MAP_SIZE = 1024;
const MAX_TEXTURE_ANISOTROPY = 4;

const PERF_LOG_ENABLED = true;

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

    const CAR_NAME_PATTERN = /^Car\d+/;

    function findCarAncestor(object) {
      let current = object;
      while (current) {
        if (CAR_NAME_PATTERN.test(current.name)) return current;
        current = current.parent;
      }
      return null;
    }

    function createIsolatedCarClone(car) {
      car.updateWorldMatrix(true, true);

      const clone = car.clone(true);
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

    function getCarFrame(car) {
      const box = new THREE.Box3().setFromObject(car);
      const size = new THREE.Vector3();
      box.getSize(size);
      const carSize = Math.max(size.x, size.y, size.z, 0.1);

      return {
        carSize,
        minDistance: Math.max(0.5, carSize * 0.75),
        maxDistance: Math.max(4, carSize * 5),
        cameraPosition: new THREE.Vector3(
          carSize * 1.55,
          carSize * 0.95,
          carSize * 1.95
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

    function CityLoadingOverlay({ active, progress, fadeOut }) {
      const roundedProgress = Math.min(100, Math.round(progress));

      return (
        <div
          aria-live="polite"
          aria-busy={active}
          className={`${focusFont.className} pointer-events-none absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-700 ${
            fadeOut ? "opacity-0" : "opacity-100"
          }`}
          style={{
            background:
              "radial-gradient(circle at center, #6a6a6a 0%, #3d3d3d 45%, #141414 75%, #000000 100%)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div className="city-loader-glow absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
            <div className="city-loader-glow city-loader-glow-delayed absolute bottom-0 left-1/4 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
          </div>

          <div className="relative flex w-full max-w-md flex-col items-center px-8">
            <p className="text-[clamp(2.5rem,8vw,4rem)] font-medium leading-none tracking-[-0.04em] text-white/95">
              OTO CAR
            </p>
            <p className="mt-2 text-sm font-medium uppercase tracking-[0.35em] text-white/45">
              City Experience
            </p>

            <div className="mt-12 w-full">
              <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-[0.2em] text-white/50">
                <span>{getLoaderStage(roundedProgress)}</span>
                <span>{roundedProgress}%</span>
              </div>

              <div className="h-px w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="city-loader-bar h-full rounded-full bg-gradient-to-r from-white/25 via-white/80 to-white/25 transition-[width] duration-300 ease-out"
                  style={{ width: `${roundedProgress}%` }}
                />
              </div>
            </div>

            <div className="mt-10 flex items-center gap-2">
              <span className="city-loader-dot h-1.5 w-1.5 rounded-full bg-white/70" />
              <span className="city-loader-dot city-loader-dot-delay-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="city-loader-dot city-loader-dot-delay-2 h-1.5 w-1.5 rounded-full bg-white/35" />
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

    function CarFocusLights({ carSize }) {
      const lightRef = useRef(null);

      useEffect(() => {
        const light = lightRef.current;
        if (!light) return;

        light.castShadow = true;
        light.shadow.intensity = 1;
        light.shadow.mapSize.set(FOCUS_SHADOW_MAP_SIZE, FOCUS_SHADOW_MAP_SIZE);
        light.shadow.bias = -0.00015;
        light.shadow.normalBias = 0.02;

        const extent = carSize * 1.8;
        const shadowCamera = light.shadow.camera;
        shadowCamera.left = -extent;
        shadowCamera.right = extent;
        shadowCamera.top = extent;
        shadowCamera.bottom = -extent;
        shadowCamera.near = 0.1;
        shadowCamera.far = carSize * 10;
        shadowCamera.updateProjectionMatrix();
      }, [carSize]);

      return (
        <>
          <ambientLight intensity={0.82} color="#f5f8ff" />
          <directionalLight
            ref={lightRef}
            position={[carSize * 1.8, carSize * 3.2, carSize * 1.4]}
            intensity={1.45}
            color="#ffffff"
          >
            <object3D attach="target" position={[0, 0, 0]} />
          </directionalLight>
          <directionalLight position={[-carSize * 1.5, carSize * 1.2, -carSize]} intensity={0.45} color="#d8e4ff" />
        </>
      );
    }

    function FocusedCarView({ car }) {
      const rotateRef = useRef(null);
      const frame = useMemo(() => {
        const box = new THREE.Box3().setFromObject(car);
        const size = new THREE.Vector3();
        box.getSize(size);
        const carSize = Math.max(size.x, size.y, size.z, 0.1);

        return {
          carSize,
          groundY: box.min.y - 0.03,
          shadowRadius: Math.max(size.x, size.z) * 0.72,
        };
      }, [car]);

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
          <CarFocusLights carSize={frame.carSize} />
          <group ref={rotateRef}>
            <primitive object={car} />
          </group>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, frame.groundY, 0]}
            receiveShadow
          >
            <circleGeometry args={[frame.shadowRadius, 72]} />
            <shadowMaterial opacity={0.38} transparent color="#000000" />
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

    function DeferredEnvironment() {
      const [ready, setReady] = useState(false);

      useEffect(() => {
        setReady(true);
      }, []);

      if (!ready) return null;

      return <Environment preset="city" environmentIntensity={0.35} frames={1} />;
    }

    function CityModel({ focusedCar, onCarFocus }) {
      const { scene, animations } = useGLTF("/models/city.glb");
      const controlsRef = useRef(null);
      const { camera, gl } = useThree();
      const [hoveredCar, setHoveredCar] = useState(false);

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
            minDistance: Math.max(0.8, fittedRadius * 0.22),
            maxDistance: Math.max(20, fittedRadius * 8),
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
        analyzeScenePerformance(scene, animations, "city.glb");
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
        if (!names.length) {
          if (PERF_LOG_ENABLED) {
            console.log("%c[Perf] No animation clips on city.glb", "color:#94a3b8");
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

        if (focusedCar) {
          mixer.timeScale = 0;
          return;
        }

        mixer.timeScale = 1;
        names.forEach((name) => {
          const action = actions[name];
          if (action && !action.isRunning()) {
            action.play();
          }
        });
      }, [actions, focusedCar, mixer, names]);

      const handleCarPointerOver = useCallback(
        (event) => {
          if (focusedCar) return;
          event.stopPropagation();
          if (findCarAncestor(event.object)) {
            setHoveredCar(true);
          }
        },
        [focusedCar]
      );

      const handleCarPointerOut = useCallback(
        (event) => {
          event.stopPropagation();
          setHoveredCar(false);
        },
        []
      );

      const handleCarClick = useCallback(
        (event) => {
          event.stopPropagation();
          const car = findCarAncestor(event.object);
          if (!car || !mixer) return;

          mixer.timeScale = 0;
          onCarFocus(createIsolatedCarClone(car));
        },
        [mixer, onCarFocus]
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
            enableZoom={!focusedCar}
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
          const timer = setTimeout(() => setLoaderVisible(false), 700);
          return () => clearTimeout(timer);
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

  useGLTF.preload("/models/city.glb");

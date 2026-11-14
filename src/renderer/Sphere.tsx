import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
export type SphereState =
  "idle" | "listening" | "processing" | "speaking" | "disconnected" | "error";
export default function Sphere({
  state,
  level,
  reduced,
  quality = "medium",
  fixture = false,
}: {
  state: SphereState;
  level: number;
  reduced: boolean;
  quality?: string;
  fixture?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    live = useRef({ state, level, reduced, quality });
  const [fallback, setFallback] = useState(false);
  live.current = { state, level, reduced, quality };
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 6.5;
    const group = new THREE.Group();
    scene.add(group);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.04, 4),
      new THREE.MeshBasicMaterial({
        color: 0x0875ad,
        transparent: true,
        opacity: 0.075,
        wireframe: true,
      }),
    );
    group.add(core);
    const pointsGeometry = new THREE.BufferGeometry();
    const points: number[] = [];
    // A deterministic Fibonacci sphere keeps particles evenly distributed.
    for (let i = 0; i < 1700; i++) {
      const y = 1 - (i / 1699) * 2,
        radius = Math.sqrt(1 - y * y),
        theta = i * Math.PI * (3 - Math.sqrt(5));
      points.push(
        Math.cos(theta) * radius * 1.13,
        y * 1.13,
        Math.sin(theta) * radius * 1.13,
      );
    }
    pointsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x66d8ff,
      size: 0.018,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Points(pointsGeometry, particleMaterial));
    const rings: THREE.Mesh[] = [];
    [1.32, 1.48, 1.64].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.006, 5, 150),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0x51dfff : 0x237da6,
          transparent: true,
          opacity: i === 1 ? 0.68 : 0.42,
        }),
      );
      ring.rotation.set(0.48 + i * 0.67, 0.25 + i * 0.24, i * 0.6);
      scene.add(ring);
      rings.push(ring);
    });
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 1.904, 160),
      new THREE.MeshBasicMaterial({
        color: 0x1c637f,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(halo);
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let frame = 0,
      last = 0,
      smoothed = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const l = live.current;
      if (document.hidden || time - last < (l.quality === "low" ? 85 : 33))
        return;
      last = time;
      smoothed += (l.level - smoothed) * 0.15;
      const isAudio = l.state === "speaking" || l.state === "listening";
      const intensity = isAudio ? smoothed : 0;
      const t = l.reduced ? 0 : time * 0.00015;
      group.rotation.set(t * 0.18, t * 0.45, 0);
      group.scale.setScalar(
        1 +
          intensity * 0.18 +
          (!l.reduced && l.state === "processing"
            ? Math.sin(t * 7) * 0.015
            : 0),
      );
      rings.forEach((r, i) => {
        r.rotation.z = t * (i % 2 ? -0.25 : 0.3) + i * 0.6;
      });
      const color =
        l.state === "error"
          ? 0xf08b7e
          : l.state === "disconnected"
            ? 0x65838f
            : l.state === "listening"
              ? 0x8bebe0
              : 0x66d8ff;
      particleMaterial.color.setHex(color);
      particleMaterial.opacity = 0.5 + intensity * 0.45;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((obj) => {
        if ("geometry" in obj) (obj as THREE.Mesh).geometry?.dispose();
        if ("material" in obj) {
          const m = (obj as THREE.Mesh).material;
          (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className={`sphere-container sphere-${state}`}
      role="img"
      aria-label={`JARVIS visualization: ${state}${fixture ? ", generated test signal" : ""}`}
    >
      <div className="sphere-grid" />
      <div ref={host} className="sphere-canvas" />
      {fallback && (
        <div className="sphere-fallback">
          <i />
          <i />
          <i />
          <span>J</span>
        </div>
      )}
      <span className="orbit-label orbit-label-left">J A R V I S</span>
      <span className="orbit-label orbit-label-right">PERSONAL WORKSPACE</span>
    </div>
  );
}

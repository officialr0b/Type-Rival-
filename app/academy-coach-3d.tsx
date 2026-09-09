'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { AcademyFinger } from '../lib/academy';

type CoachStatus = 'loading' | 'ready' | 'standby' | 'error';

const FINGER_BONES: Partial<Record<AcademyFinger, string>> = {
  'left-pinky': 'leftLittleProximal',
  'left-ring': 'leftRingProximal',
  'left-middle': 'leftMiddleProximal',
  'left-index': 'leftIndexProximal',
  'right-index': 'rightIndexProximal',
  'right-middle': 'rightMiddleProximal',
  'right-ring': 'rightRingProximal',
  'right-pinky': 'rightLittleProximal',
};

export default function AcademyCoach3D({
  modelUrl,
  activeFinger,
  celebrating,
  onStatus,
}: {
  modelUrl?: string;
  activeFinger: AcademyFinger;
  celebrating: boolean;
  onStatus?: (status: CoachStatus) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fingerRef = useRef(activeFinger);
  const celebratingRef = useRef(celebrating);
  const [status, setStatus] = useState<CoachStatus>(modelUrl ? 'loading' : 'standby');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fingerRef.current = activeFinger;
  }, [activeFinger]);

  useEffect(() => {
    celebratingRef.current = celebrating;
  }, [celebrating]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!modelUrl) return;
    let disposed = false;
    let vrm: VRM | null = null;
    let frame = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0, 1.3, 3.9);
    camera.lookAt(0, 1.22, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x07111f, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Miles, the TypeRival Academy coach');
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd9ffff, 0x0a1424, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-1.5, 2.8, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x27dacb, 1.8);
    rimLight.position.set(2.5, 1.8, -1);
    scene.add(rimLight);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.9, 0.04, 48),
      new THREE.MeshBasicMaterial({ color: 0x102332, transparent: true, opacity: 0.82 }),
    );
    platform.position.set(0, 0.02, 0);
    scene.add(platform);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const loaded = gltf.userData.vrm as VRM | undefined;
        if (!loaded) {
          setStatus('error');
          onStatus?.('error');
          return;
        }
        vrm = loaded;
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });
        scene.add(vrm.scene);
        setProgress(100);
        setStatus('ready');
        onStatus?.('ready');
      },
      (event) => {
        if (disposed || !event.total) return;
        setProgress(Math.min(99, Math.round(event.loaded / event.total * 100)));
      },
      () => {
        if (disposed) return;
        setStatus('error');
        onStatus?.('error');
      },
    );

    const timer = new THREE.Timer();
    timer.connect(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = (timestamp: number) => {
      frame = window.requestAnimationFrame(animate);
      timer.update(timestamp);
      const delta = timer.getDelta();
      const elapsed = timer.getElapsed();
      if (vrm) {
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        const chest = vrm.humanoid.getNormalizedBoneNode('chest');
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        const fingerName = FINGER_BONES[fingerRef.current];
        const finger = fingerName ? vrm.humanoid.getNormalizedBoneNode(fingerName as never) : null;
        const wave = reducedMotion ? 0 : Math.sin(elapsed * 1.35);
        const celebration = celebratingRef.current ? 1 : 0;
        const leftFingerActive = fingerRef.current.startsWith('left-');
        const rightFingerActive = fingerRef.current.startsWith('right-');

        if (head) {
          head.rotation.y = wave * 0.035;
          head.rotation.z = celebration ? -0.08 : wave * 0.01;
        }
        if (chest) chest.rotation.y = wave * 0.018;
        if (leftUpperArm) leftUpperArm.rotation.z = celebration ? -0.35 : leftFingerActive ? -0.62 + wave * 0.03 : -1.02;
        if (rightUpperArm) rightUpperArm.rotation.z = celebration ? 0.35 : rightFingerActive ? 0.62 - wave * 0.03 : 1.02;
        if (finger) finger.rotation.x = -0.34 - Math.max(0, wave) * 0.08;
        vrm.expressionManager?.setValue('happy', celebration ? 0.72 : 0.08);
        vrm.update(delta);
      }
      renderer.render(scene, camera);
    };
    frame = window.requestAnimationFrame(animate);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      timer.dispose();
      resizeObserver.disconnect();
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      platform.geometry.dispose();
      (platform.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, onStatus]);

  return (
    <div className="academy-coach-3d" ref={hostRef} data-status={status}>
      {status === 'loading' && <div className="academy-model-status"><span className="academy-model-spinner"/><b>BRINGING MILES ON STAGE</b><small>{progress > 0 ? `${progress}% · temporary high-detail model` : 'Preparing the 3D coach…'}</small></div>}
      {(status === 'standby' || status === 'error') && <div className="academy-model-status academy-model-preview"><span aria-hidden="true">M</span><b>{status === 'error' ? 'COACH PREVIEW ACTIVE' : 'MILES IS GETTING WEB-READY'}</b><small>The complete lesson engine is active now. The optimized 3D coach will step onto this same stage when ready.</small></div>}
    </div>
  );
}

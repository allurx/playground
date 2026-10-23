/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWorld } from "./world.ts";
import { createLandmarks } from "./landmarks.ts";

function element<T extends HTMLElement>(selector: string, type: new () => T): T {
    const target = document.querySelector(selector);
    if (!(target instanceof type)) throw new Error(`Missing scene element: ${selector}`);
    return target;
}

const canvas = element("#scene", HTMLCanvasElement);
const loading = element("#loading", HTMLDivElement);
const errorPanel = element("#error", HTMLElement);
const toolbar = element(".toolbar", HTMLDivElement);
const pauseButton = element("#pause", HTMLButtonElement);
const pauseLabel = element("#pauseLabel", HTMLSpanElement);
const orbitButton = element("#orbit", HTMLButtonElement);
const cloudsButton = element("#clouds", HTMLButtonElement);
const zoomInButton = element("#zoom-in", HTMLButtonElement);
const zoomOutButton = element("#zoom-out", HTMLButtonElement);
const announcement = element("#announcement", HTMLDivElement);
const settings = element("#settings", HTMLElement);
const settingsToggle = element("#settingsToggle", HTMLButtonElement);

if (window.location.protocol === "file:") {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="../"]')) {
        link.href = "https://play.allurx.io/";
    }
}

settings.addEventListener("toggle", () => {
    settingsToggle.setAttribute("aria-expanded", String(settings.matches(":popover-open")));
});

element("#retry", HTMLButtonElement).addEventListener("click", () => {
    window.location.reload();
});

function showError(message: string) {
    loading.hidden = true;
    errorPanel.hidden = false;
    canvas.inert = true;
    toolbar.hidden = true;
    toolbar.inert = true;
    settingsToggle.hidden = true;
    settingsToggle.disabled = true;
    if (settings.matches(":popover-open")) settings.hidePopover();
    settings.inert = true;
    element("#error-detail", HTMLParagraphElement).textContent = message;
    element("#retry", HTMLButtonElement).focus();
}

function start() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88b8eb);
    scene.fog = new THREE.Fog(0xadcdf1, 65, 140);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 180);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minPolarAngle = 0.38;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 20;
    controls.maxDistance = 78;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;
    controls.autoRotateSpeed = 0.3;

    scene.add(new THREE.HemisphereLight(0xd9eaff, 0x788652, 1.7));
    const sunlight = new THREE.DirectionalLight(0xffefca, 2.5);
    sunlight.position.set(-18, 32, 22);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 85 });
    sunlight.shadow.normalBias = 0.045;
    sunlight.shadow.bias = -0.0002;
    scene.add(sunlight);

    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.8);
    fill.position.set(18, 9, -15);
    scene.add(fill);

    const world = createWorld();
    const landmarks = createLandmarks();
    scene.add(world.group, landmarks.group);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let paused = reducedMotion.matches;
    let orbit = !reducedMotion.matches;
    let clouds = true;
    let elapsed = 9;
    let previousTime: number | undefined;
    let frame = 0;
    let disposed = false;
    let contextLost = false;
    let dirty = true;
    controls.addEventListener("change", () => {
        dirty = true;
    });

    function syncControls() {
        controls.autoRotate = orbit && !paused;
        pauseButton.setAttribute("aria-label", paused ? "继续" : "暂停");
        pauseLabel.textContent = paused ? "继续" : "暂停";
        pauseButton.title = paused ? "继续" : "暂停";
        pauseButton.setAttribute("aria-pressed", String(paused));
        orbitButton.setAttribute("aria-pressed", String(orbit));
        cloudsButton.setAttribute("aria-pressed", String(clouds));
    }

    function resetView() {
        // Consume drag inertia before resetting so the new view stays in place.
        controls.enableDamping = false;
        controls.update(0);
        controls.target.set(0, -0.4, 0);
        camera.position.set(9, 19, 42);
        camera.zoom = 1;
        controls.update(0);
        controls.enableDamping = true;
    }

    function resize() {
        const { width, height } = canvas.getBoundingClientRect();
        camera.aspect = width / height;
        // Keep the full island readable in portrait without stretching the scene.
        camera.fov = THREE.MathUtils.clamp(36 + (1.2 - camera.aspect) * 30, 36, 60);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        dirty = true;
    }

    function setPaused(value: boolean) {
        paused = value;
        syncControls();
        announcement.textContent = paused ? "已暂停" : "已继续";
    }

    function zoom(factor: number) {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset);
        controls.update(0);
    }

    function render(time: number) {
        if (disposed || contextLost || document.hidden) return;

        const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
        if (!paused) elapsed += delta;

        controls.update(delta);
        if (!paused || dirty) {
            world.update(elapsed);
            landmarks.update(elapsed);
            renderer.render(scene, camera);
            dirty = false;
        }

        const distance = camera.position.distanceTo(controls.target);
        zoomInButton.disabled = distance <= controls.minDistance + 0.1;
        zoomOutButton.disabled = distance >= controls.maxDistance - 0.1;
        frame = requestAnimationFrame(render);
    }

    pauseButton.addEventListener("click", () => {
        setPaused(!paused);
    });
    orbitButton.addEventListener("click", () => {
        orbit = !orbit;
        syncControls();
    });
    cloudsButton.addEventListener("click", () => {
        clouds = !clouds;
        world.setClouds(clouds);
        syncControls();
        dirty = true;
    });
    zoomInButton.addEventListener("click", () => {
        zoom(0.86);
    });
    zoomOutButton.addEventListener("click", () => {
        zoom(1.16);
    });
    element("#reset", HTMLButtonElement).addEventListener("click", () => {
        resetView();
        announcement.textContent = "视角已复位。";
    });

    canvas.addEventListener("keydown", (event) => {
        if (disposed || contextLost || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.code === "Space") {
            event.preventDefault();
            if (!event.repeat) setPaused(!paused);
        } else if (event.key.startsWith("Arrow")) {
            event.preventDefault();
            const offset = camera.position.clone().sub(controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            if (event.key === "ArrowLeft") spherical.theta -= 0.12;
            if (event.key === "ArrowRight") spherical.theta += 0.12;
            if (event.key === "ArrowUp") spherical.phi -= 0.12;
            if (event.key === "ArrowDown") spherical.phi += 0.12;
            spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
            camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
            controls.update(0);
        }
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    reducedMotion.addEventListener("change", (event) => {
        if (event.matches) {
            orbit = false;
            setPaused(true);
        }
    });

    // Do not accumulate time or GPU work while the document is in the background.
    document.addEventListener("visibilitychange", () => {
        cancelAnimationFrame(frame);
        previousTime = undefined;
        if (!document.hidden && !disposed && !contextLost) frame = requestAnimationFrame(render);
    });
    canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        contextLost = true;
        controls.enabled = false;
        cancelAnimationFrame(frame);
        showError("图形渲染已中断。请重新加载场景；若再次发生，可关闭其他占用显卡的页面后重试。");
    });

    window.addEventListener("pagehide", (event) => {
        cancelAnimationFrame(frame);
        if (event.persisted) return;

        disposed = true;
        observer.disconnect();
        controls.dispose();
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            if (object instanceof THREE.InstancedMesh) object.dispose();
            const mesh = object as THREE.Mesh;
            geometries.add(mesh.geometry);
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                materials.add(material);
            }
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
        sunlight.shadow.dispose();
        renderer.dispose();
    });
    window.addEventListener("pageshow", (event) => {
        if (event.persisted && !disposed && !contextLost) {
            previousTime = undefined;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(render);
        }
    });

    resize();
    resetView();
    syncControls();
    world.update(elapsed);
    landmarks.update(elapsed);
    renderer.render(scene, camera);
    loading.hidden = true;
    canvas.inert = false;
    toolbar.inert = false;
    settingsToggle.disabled = false;
    frame = requestAnimationFrame(render);
}

try {
    start();
} catch (error) {
    console.error("Sky island initialization failed", error);
    showError("场景初始化失败。请使用支持 WebGL 2 的浏览器，并确认已开启硬件加速。");
}

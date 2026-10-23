/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const COLORS = {
    stone: 0xf2ddae,
    pale: 0xffedc5,
    shade: 0xc1a375,
    roof: 0x173679,
    roofLight: 0x2752a0,
    purple: 0x7951a0,
    gold: 0xe9bf51,
    darkGold: 0xa77a35,
    timber: 0x725336,
    dark: 0x382e36,
    window: 0xffdc7c,
    canvas: 0xffeac0,
    red: 0xc76855,
    green: 0x7c9351,
};

type MaterialName = keyof typeof COLORS;
type Materials = Record<MaterialName, THREE.MeshStandardMaterial>;
type Builder = ReturnType<typeof createBuilder>;
type Point = readonly [number, number, number];

function createMaterials(): Materials {
    return Object.fromEntries(
        Object.entries(COLORS).map(([name, color]) => [
            name,
            new THREE.MeshStandardMaterial({
                color,
                roughness: name === "gold" ? 0.48 : 0.92,
                metalness: name === "gold" ? 0.22 : 0,
                flatShading: true,
                ...(name === "window" ? { emissive: color, emissiveIntensity: 0.65 } : {}),
            }),
        ])
    ) as Materials;
}

function roofGeometry(width: number, height: number, depth: number, ridge = 0) {
    const x = width / 2;
    const z = depth / 2;
    const r = ridge / 2;
    const points = [
        [-x, 0, z],
        [x, 0, z],
        [r, height, 0],
        [-x, 0, z],
        [r, height, 0],
        [-r, height, 0],
        [x, 0, z],
        [x, 0, -z],
        [r, height, 0],
        [x, 0, -z],
        [-x, 0, -z],
        [-r, height, 0],
        [x, 0, -z],
        [-r, height, 0],
        [r, height, 0],
        [-x, 0, -z],
        [-x, 0, z],
        [-r, height, 0],
        [-x, 0, -z],
        [x, 0, -z],
        [x, 0, z],
        [-x, 0, -z],
        [x, 0, z],
        [-x, 0, z],
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.computeVertexNormals();
    return geometry;
}

// Static details share a mesh per material, including windows and trim.
function createBuilder(target: THREE.Group, materials: Materials) {
    const buckets = new Map<MaterialName, THREE.BufferGeometry[]>();
    const transform = new THREE.Object3D();

    function add(
        geometry: THREE.BufferGeometry,
        color: MaterialName,
        x: number,
        y: number,
        z: number,
        rx = 0,
        ry = 0,
        rz = 0
    ) {
        transform.position.set(x, y, z);
        transform.rotation.set(rx, ry, rz);
        transform.updateMatrix();
        geometry.applyMatrix4(transform.matrix);
        geometry.deleteAttribute("uv");
        const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
        if (normalized !== geometry) geometry.dispose();
        let geometries = buckets.get(color);
        if (!geometries) {
            geometries = [];
            buckets.set(color, geometries);
        }
        geometries.push(normalized);
    }

    function box(
        color: MaterialName,
        x: number,
        y: number,
        z: number,
        width: number,
        height: number,
        depth: number,
        ry = 0,
        rz = 0
    ) {
        add(new THREE.BoxGeometry(width, height, depth), color, x, y, z, 0, ry, rz);
    }

    function cylinder(
        color: MaterialName,
        x: number,
        y: number,
        z: number,
        top: number,
        bottom: number,
        height: number,
        sides = 8,
        rx = 0,
        rz = 0
    ) {
        add(new THREE.CylinderGeometry(top, bottom, height, sides), color, x, y, z, rx, 0, rz);
    }

    function roof(
        color: MaterialName,
        x: number,
        y: number,
        z: number,
        width: number,
        height: number,
        depth: number,
        ridge = 0,
        ry = 0
    ) {
        add(roofGeometry(width, height, depth, ridge), color, x, y, z, 0, ry);
    }

    function rod(color: MaterialName, start: Point, end: Point, radius = 0.025) {
        const a = new THREE.Vector3(...start);
        const b = new THREE.Vector3(...end);
        const direction = b.clone().sub(a);
        const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5);
        geometry.applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
        );
        const middle = a.add(b).multiplyScalar(0.5);
        add(geometry, color, middle.x, middle.y, middle.z);
    }

    function finish() {
        const parts: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; color: MaterialName }[] = [];
        for (const [color, geometries] of buckets) {
            const merged = mergeGeometries(geometries);
            const mesh = new THREE.Mesh(merged, materials[color]);
            mesh.castShadow = color !== "window";
            mesh.receiveShadow = true;
            target.add(mesh);
            parts.push({ mesh, color });
            for (const geometry of geometries) geometry.dispose();
        }
        buckets.clear();
        return parts;
    }

    return { add, box, cylinder, roof, rod, finish, materials };
}

function addWindow(builder: Builder, x: number, y: number, z: number, width: number, height: number, side = false) {
    if (side) {
        builder.box("darkGold", x, y, z, 0.065, height + 0.16, width + 0.14);
        builder.box("window", x + 0.038, y, z, 0.04, height, width);
        builder.box("pale", x + 0.065, y, z, 0.045, height + 0.06, 0.04);
        builder.box("pale", x + 0.065, y - 0.08, z, 0.045, 0.04, width);
        return;
    }
    builder.box("darkGold", x, y, z, width + 0.15, height + 0.16, 0.07);
    builder.box("window", x, y, z + 0.044, width, height, 0.045);
    builder.box("pale", x, y, z + 0.075, 0.045, height + 0.06, 0.035);
    builder.box("pale", x, y - 0.08, z + 0.075, width, 0.045, 0.035);
    builder.box("gold", x, y + height / 2 + 0.12, z, width + 0.24, 0.07, 0.16);
}

function addFlag(builder: Builder, x: number, y: number, z: number, size = 0.35) {
    builder.cylinder("gold", x, y + size * 0.8, z, 0.018, 0.025, size * 1.6, 5);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(size, -size * 0.12);
    shape.lineTo(size * 0.72, -size * 0.28);
    shape.lineTo(0, -size * 0.36);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
    builder.add(geometry, "gold", x, y + size * 1.45, z);
}

function addTower(
    builder: Builder,
    x: number,
    z: number,
    base: number,
    height: number,
    width: number,
    roofHeight: number,
    flag = false
) {
    const top = base + height;
    builder.box("stone", x, base + height / 2, z, width, height, width);
    builder.box("shade", x, base + 0.09, z, width + 0.17, 0.18, width + 0.17);
    builder.box("pale", x, top - 0.06, z, width + 0.16, 0.18, width + 0.16);
    builder.box("gold", x, top + 0.08, z, width + 0.23, 0.08, width + 0.23);
    builder.box("darkGold", x, top + 0.15, z, width + 0.3, 0.065, width + 0.3);

    for (const direction of [-1, 1]) {
        builder.box(
            "pale",
            x + direction * (width / 2 - 0.055),
            base + height / 2,
            z + width / 2 + 0.025,
            0.12,
            height,
            0.12
        );
        builder.box(
            "gold",
            x + direction * (width / 2 - 0.055),
            base + height / 2,
            z + width / 2 + 0.091,
            0.035,
            height,
            0.025
        );
    }
    const windowColumns = width > 1.4 ? [-0.23, 0.23] : [0];
    const windowWidth = width * (windowColumns.length === 2 ? 0.23 : 0.34);
    for (let y = top - 0.6; y >= base + 0.5; y -= 1.05) {
        for (const offset of windowColumns) {
            addWindow(builder, x + offset * width, y, z + width / 2 + 0.025, windowWidth, 0.69);
            addWindow(builder, x + width / 2 + 0.025, y, z + offset * width, windowWidth, 0.69, true);
        }
        builder.box("gold", x, y - 0.47, z, width + 0.08, 0.065, width + 0.08);
    }
    if (windowColumns.length === 2) {
        builder.box("pale", x, base + height / 2, z + width / 2 + 0.08, 0.09, height, 0.15);
        builder.box("gold", x, base + height / 2, z + width / 2 + 0.165, 0.035, height, 0.035);
        builder.box("pale", x + width / 2 + 0.08, base + height / 2, z, 0.15, height, 0.09);
        builder.box("gold", x + width / 2 + 0.165, base + height / 2, z, 0.035, height, 0.035);
    }

    // Overlapping eaves make each of the spire's three sections readable at a distance.
    const roofBase = top + 0.18;
    builder.roof("roof", x, roofBase, z, width + 0.4, roofHeight * 0.32, width + 0.4);
    builder.roof("roof", x, roofBase + roofHeight * 0.27, z, width * 0.93, roofHeight * 0.43, width * 0.93);
    builder.roof("roof", x, roofBase + roofHeight * 0.59, z, width * 0.53, roofHeight * 0.41, width * 0.53);
    builder.box("roofLight", x, roofBase + roofHeight * 0.27, z, width * 0.95, 0.045, width * 0.95);
    builder.box("gold", x, roofBase + roofHeight * 0.59, z, width * 0.55, 0.035, width * 0.55);
    builder.box("roofLight", x, top + 0.2, z + width / 2 + 0.18, width + 0.4, 0.065, 0.07);
    builder.cylinder("gold", x, top + roofHeight + 0.23, z, 0.025, 0.07, 0.28, 5);
    if (flag) addFlag(builder, x, top + roofHeight + 0.37, z, width * 0.3);
}

function addCastle(builder: Builder) {
    // The raised forecourt remains behind the lake's northern bank.
    builder.box("shade", 0, 0.13, -3.8, 8.05, 0.26, 5.65);
    builder.box("pale", 0, 0.31, -3.8, 7.85, 0.16, 5.45);
    builder.box("stone", 0, 0.43, -3.8, 7.55, 0.1, 5.15);
    for (let i = 0; i < 4; i++) {
        builder.box("pale", 0, 0.08 + i * 0.08, -0.8 - i * 0.17, 1.9, 0.16, 0.3);
    }

    builder.box("stone", 0, 1.43, -3.33, 4.95, 1.9, 2.7);
    builder.box("gold", 0, 0.62, -3.33, 5.08, 0.12, 2.83);
    builder.box("pale", 0, 2.37, -3.33, 5.22, 0.18, 2.97);
    builder.roof("roof", 0, 2.48, -3.33, 5.5, 1.17, 3.16, 2.5);
    builder.box("roofLight", 0, 2.51, -1.75, 5.5, 0.07, 0.08);
    builder.box("gold", 0, 3.66, -3.33, 2.6, 0.055, 0.08);

    // Recessed doorway, balcony and a bright colonnade face the water.
    builder.box("dark", 0, 1.02, -1.94, 0.7, 1.12, 0.08);
    builder.box("timber", 0, 0.99, -1.88, 0.53, 1.02, 0.075);
    builder.box("gold", 0, 1.03, -1.83, 0.035, 1.06, 0.04);
    for (const x of [-1.8, -1.06, 1.06, 1.8]) addWindow(builder, x, 1.51, -1.96, 0.38, 1.04);
    builder.box("pale", 0, 2.15, -1.55, 4.62, 0.16, 0.9);
    builder.box("gold", 0, 2.25, -1.55, 4.76, 0.055, 0.98);
    for (const x of [-2.13, -1.45, -0.72, 0.72, 1.45, 2.13]) {
        builder.box("shade", x, 0.6, -1.24, 0.26, 0.2, 0.26);
        builder.cylinder("pale", x, 1.35, -1.24, 0.095, 0.105, 1.4, 8);
        builder.box("gold", x, 2.03, -1.24, 0.23, 0.12, 0.24);
    }
    for (let i = 0; i < 13; i++) builder.box("pale", -2.16 + i * 0.36, 2.49, -1.17, 0.065, 0.42, 0.065);
    builder.box("gold", 0, 2.71, -1.17, 4.5, 0.075, 0.09);

    addTower(builder, 0, -4.25, 0.48, 4.65, 1.65, 2.35, true);
    addTower(builder, -2.02, -4.85, 0.48, 3.55, 1.12, 1.6, true);
    addTower(builder, 2.02, -4.85, 0.48, 3.88, 1.12, 1.7, true);
    addTower(builder, -3.08, -3.7, 0.48, 2.7, 0.94, 1.22);
    addTower(builder, 3.08, -3.7, 0.48, 2.88, 0.94, 1.32);
    addTower(builder, -2.75, -1.72, 0.48, 2.18, 0.88, 1.1);
    addTower(builder, 2.75, -1.72, 0.48, 2.18, 0.88, 1.1);

    for (const x of [-3.39, 3.39]) {
        builder.box("stone", x, 1.05, -2.52, 0.75, 1.1, 2.4);
        builder.roof("roof", x, 1.66, -2.52, 2.68, 0.6, 1.03, 1.54, Math.PI / 2);
        for (const z of [-3.16, -2.45, -1.73]) addWindow(builder, x + 0.39, 1.14, z, 0.27, 0.63, true);
    }

    for (const x of [-3.65, 3.65]) {
        for (let i = 0; i < 5; i++) builder.box("stone", x, 0.78, -5.9 + i * 1.05, 0.17, 0.65, 0.17);
        builder.box("gold", x, 1.09, -3.8, 0.12, 0.08, 4.5);
    }
    for (let i = 0; i < 9; i++) builder.box("stone", -3.6 + i * 0.9, 0.77, -6.02, 0.16, 0.6, 0.16);
    builder.box("gold", 0, 1.08, -6.02, 7.4, 0.08, 0.12);
}

function addHouse(builder: Builder, x: number, z: number, size: number, roofColor: MaterialName, angle = 0) {
    const local = new THREE.Group();
    const house = createBuilder(local, builder.materials);
    const height = size * 0.8;
    house.box("shade", 0, 0.07, 0, size + 0.12, 0.14, size * 0.88 + 0.12);
    house.box("stone", 0, height / 2 + 0.14, 0, size, height, size * 0.88);
    house.box("pale", 0, height + 0.14, 0, size + 0.08, 0.09, size * 0.96);
    house.roof(roofColor, 0, height + 0.18, 0, size * 1.27, size * 0.57, size * 1.13, size * 0.47);
    house.box("gold", 0, height + size * 0.57 + 0.19, 0, size * 0.5, 0.035, 0.065);
    house.box("timber", -size * 0.17, 0.41, size * 0.447, size * 0.25, 0.55, 0.055);
    house.box("gold", -size * 0.1, 0.43, size * 0.481, 0.035, 0.035, 0.025);
    addWindow(house, size * 0.23, height * 0.62, size * 0.448, size * 0.25, size * 0.31);
    addWindow(house, size * 0.509, height * 0.62, 0, size * 0.28, size * 0.35, true);
    house.box("timber", -size * 0.48, height / 2 + 0.12, size * 0.45, 0.045, height, 0.055);
    house.box("timber", size * 0.48, height / 2 + 0.12, size * 0.45, 0.045, height, 0.055);
    house.box("shade", size * 0.28, height + size * 0.39, -size * 0.2, size * 0.15, size * 0.56, size * 0.15);
    house.box("pale", size * 0.28, height + size * 0.68, -size * 0.2, size * 0.2, 0.08, size * 0.2);
    const parts = house.finish();
    local.rotation.y = angle;
    local.position.set(x, 0, z);
    local.updateMatrixWorld(true);
    // Merge the transformed cottage back into the global static batches.
    for (const { mesh: child, color } of parts) {
        child.geometry.applyMatrix4(child.matrixWorld);
        builder.add(child.geometry, color, 0, 0, 0);
    }
}

function addMarket(builder: Builder, x: number, z: number, stripe: MaterialName) {
    const width = 1.1;
    for (const side of [-1, 1]) {
        builder.box("timber", x + side * 0.48, 0.6, z + 0.27, 0.055, 1.2, 0.055);
        builder.box("timber", x + side * 0.48, 0.65, z - 0.3, 0.055, 1.3, 0.055);
    }
    builder.box("timber", x, 0.39, z + 0.16, 1.02, 0.5, 0.47);
    builder.box("pale", x, 0.67, z + 0.16, 1.1, 0.07, 0.53);
    for (let i = 0; i < 6; i++) {
        const color = i % 2 === 0 ? "canvas" : stripe;
        builder.box(color, x - width / 2 + ((i + 0.5) * width) / 6, 1.25, z, width / 6, 0.09, 0.91);
        builder.box(color, x - width / 2 + ((i + 0.5) * width) / 6, 1.14, z + 0.43, width / 6, 0.22, 0.06);
    }
    for (let i = 0; i < 4; i++)
        builder.box(i % 2 ? "red" : "gold", x - 0.33 + i * 0.22, 0.75, z + 0.17, 0.15, 0.11, 0.14);
}

function createWindmill(materials: Materials, builder: Builder) {
    const x = 7;
    const z = -2;
    builder.cylinder("shade", x, 0.15, z, 0.69, 0.8, 0.3, 8);
    builder.cylinder("stone", x, 1.39, z, 0.39, 0.64, 2.5, 8);
    builder.roof("roof", x, 2.63, z, 1.12, 0.85, 1.12);
    addWindow(builder, x, 1.8, z + 0.5, 0.25, 0.46);
    builder.box("timber", x, 0.42, z + 0.6, 0.33, 0.66, 0.055);
    builder.cylinder("gold", x, 2.59, z + 0.58, 0.13, 0.13, 0.22, 8, Math.PI / 2);

    const rotor = new THREE.Group();
    const blades = createBuilder(rotor, materials);
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const dx = Math.sin(angle);
        const dy = Math.cos(angle);
        blades.box("timber", dx * 0.69, dy * 0.69, 0, 0.085, 1.45, 0.075, 0, -angle);
        blades.box("canvas", dx * 0.92 + dy * 0.115, dy * 0.92 - dx * 0.115, 0.025, 0.32, 0.93, 0.045, 0, -angle);
        for (let j = 0; j < 5; j++) {
            const distance = 0.48 + j * 0.21;
            blades.box(
                "darkGold",
                dx * distance + dy * 0.115,
                dy * distance - dx * 0.115,
                0.056,
                0.36,
                0.035,
                0.035,
                0,
                -angle
            );
        }
    }
    blades.cylinder("gold", 0, 0, 0.09, 0.14, 0.14, 0.18, 10, Math.PI / 2);
    blades.finish();
    rotor.position.set(x, 2.59, z + 0.76);
    return rotor;
}

function createAirship(materials: Materials, size: number) {
    const group = new THREE.Group();
    const builder = createBuilder(group, materials);
    const envelope = new THREE.SphereGeometry(1, 16, 10);
    envelope.scale(size * 0.52, size * 0.18, size * 0.19);
    builder.add(envelope, "canvas", 0, 0, 0);

    // The envelope's gold ribs, rails and suspended cabin are actual geometry.
    for (let i = -2; i <= 2; i++) {
        const offset = i * size * 0.145;
        const radius = Math.sqrt(1 - (offset / (size * 0.52)) ** 2);
        const ring = new THREE.TorusGeometry(size * 0.183 * radius, size * 0.008, 4, 16);
        ring.rotateY(Math.PI / 2);
        builder.add(ring, "gold", offset, 0, 0);
    }
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const points = [];
        for (let j = 0; j <= 16; j++) {
            const t = (j / 16) * Math.PI;
            points.push(
                new THREE.Vector3(
                    -Math.cos(t) * size * 0.513,
                    Math.sin(t) * Math.cos(angle) * size * 0.182,
                    Math.sin(t) * Math.sin(angle) * size * 0.193
                )
            );
        }
        builder.add(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, size * 0.006, 4, false),
            "gold",
            0,
            0,
            0
        );
    }
    builder.box("roof", 0, size * 0.01, size * 0.19, size * 0.72, size * 0.04, size * 0.027);
    builder.box("roof", 0, size * 0.01, -size * 0.19, size * 0.72, size * 0.04, size * 0.027);
    builder.box("gold", 0, -size * 0.31, 0, size * 0.43, size * 0.05, size * 0.16);
    builder.box("stone", 0, -size * 0.265, 0, size * 0.31, size * 0.11, size * 0.12);
    builder.box("roof", 0, -size * 0.195, 0, size * 0.37, size * 0.035, size * 0.15);
    for (const x of [-0.14, 0.14]) {
        for (const z of [-0.05, 0.05])
            builder.rod(
                "darkGold",
                [x * size, -size * 0.13, z * size * 2],
                [x * size, -size * 0.24, z * size],
                size * 0.009
            );
    }
    for (const x of [-0.09, 0, 0.09]) {
        builder.box("window", x * size, -size * 0.263, size * 0.065, size * 0.055, size * 0.055, size * 0.015);
    }
    builder.box("roof", -size * 0.47, size * 0.065, 0, size * 0.22, size * 0.25, size * 0.027);
    builder.box("roofLight", -size * 0.47, 0, 0, size * 0.25, size * 0.035, size * 0.36);
    builder.box("gold", -size * 0.51, size * 0.15, 0, size * 0.15, size * 0.035, size * 0.035);
    builder.finish();
    return group;
}

function createBoat(materials: Materials, scale: number, sailColor: MaterialName) {
    const group = new THREE.Group();
    const builder = createBuilder(group, materials);
    const hull = new THREE.Shape();
    hull.moveTo(-0.27, -0.45);
    hull.lineTo(-0.31, 0.17);
    hull.lineTo(0, 0.65);
    hull.lineTo(0.31, 0.17);
    hull.lineTo(0.27, -0.45);
    hull.closePath();
    const geometry = new THREE.ExtrudeGeometry(hull, {
        depth: 0.18,
        bevelEnabled: true,
        bevelSize: 0.035,
        bevelThickness: 0.035,
        bevelSegments: 1,
        steps: 1,
    });
    builder.add(geometry, "timber", 0, 0.21, 0, Math.PI / 2);
    builder.box("gold", 0, 0.2, -0.2, 0.48, 0.07, 0.1);
    builder.cylinder("darkGold", 0, 0.81, 0.04, 0.025, 0.035, 1.35, 5);
    builder.rod("darkGold", [0, 0.37, 0.04], [0.56, 0.37, 0.04], 0.025);
    const sail = new THREE.Shape();
    sail.moveTo(0.045, 0.43);
    sail.lineTo(0.045, 1.43);
    sail.quadraticCurveTo(0.24, 0.9, 0.56, 0.43);
    sail.closePath();
    builder.add(
        new THREE.ExtrudeGeometry(sail, { depth: 0.025, bevelEnabled: false, curveSegments: 3 }),
        sailColor,
        0,
        0,
        0.04
    );
    builder.rod("canvas", [0, 1.4, 0.04], [0, 0.22, 0.57], 0.009);
    builder.rod("canvas", [0, 1.4, 0.04], [0, 0.22, -0.42], 0.009);
    addFlag(builder, 0, 1.42, 0.04, 0.16);
    builder.finish();
    group.scale.setScalar(scale);
    return group;
}

/**
 * Create the castle, village and independently animated flying/sailing objects.
 */
export function createLandmarks() {
    const group = new THREE.Group();
    group.name = "Sky island landmarks";
    const materials = createMaterials();
    const builder = createBuilder(group, materials);
    addCastle(builder);

    const houses: [number, number, number, MaterialName, number][] = [
        [-6.9, -3.9, 0.86, "roof", 0.15],
        [-5.65, -1.9, 0.95, "purple", 0.28],
        [-7.5, -0.5, 1.04, "roof", 0.3],
        [-6.8, 2.0, 0.98, "roof", 0.15],
        [-5.4, 4.25, 1.02, "roof", 0.05],
        [-3.65, 5.6, 0.95, "purple", 0.05],
        [-1.98, 5.93, 0.8, "roof", -0.05],
        [2.12, 5.8, 0.9, "purple", -0.14],
        [3.95, 5.47, 0.97, "roof", -0.12],
        [5.7, 4.18, 1.04, "purple", -0.2],
        [6.48, 1.99, 1.08, "roof", -0.2],
        [7.8, 0.35, 0.89, "roof", -0.1],
        [5.34, -3.67, 0.93, "purple", -0.15],
    ];
    for (const [x, z, size, color, angle] of houses) addHouse(builder, x, z, size * 1.12, color, angle);
    addMarket(builder, -3.24, -0.25, "green");
    addMarket(builder, 3.24, -0.25, "green");
    addMarket(builder, -4.59, 0.58, "red");
    addMarket(builder, 4.59, 0.58, "purple");
    const rotor = createWindmill(materials, builder);

    // A small landing stage gives the sailboats a readable point of departure.
    for (let i = 0; i < 7; i++) builder.box("timber", -3.7, 0.28, 1.35 + i * 0.13, 0.73, 0.08, 0.11);
    for (const x of [-4.01, -3.39]) {
        for (const z of [1.38, 2.08]) builder.box("darkGold", x, 0.3, z, 0.07, 0.63, 0.07);
    }
    builder.finish();
    group.add(rotor);

    const airships = [
        { object: createAirship(materials, 3.5), x: -9, y: 8.6, z: -1.3, phase: 0.3, angle: -0.1 },
        { object: createAirship(materials, 2.45), x: 8.7, y: 10.7, z: -6, phase: 2.2, angle: -0.4 },
        { object: createAirship(materials, 3.05), x: -5.1, y: 9.5, z: -9, phase: 4.4, angle: 0.18 },
    ];
    for (const ship of airships) group.add(ship.object);
    const boats = [
        { object: createBoat(materials, 0.85, "canvas"), rx: 2.1, rz: 1.08, phase: 0.3, speed: 0.075 },
        { object: createBoat(materials, 0.54, "canvas"), rx: 3.2, rz: 1.5, phase: 2.9, speed: 0.055 },
        { object: createBoat(materials, 0.44, "red"), rx: 2.95, rz: 1.3, phase: 4.5, speed: 0.061 },
    ];
    for (const boat of boats) group.add(boat.object);

    function update(time: number) {
        rotor.rotation.z = -time * 0.38;
        for (const ship of airships) {
            ship.object.position.set(
                ship.x + Math.sin(time * 0.065 + ship.phase) * 0.8,
                ship.y + Math.sin(time * 0.38 + ship.phase) * 0.17,
                ship.z + Math.cos(time * 0.055 + ship.phase) * 0.35
            );
            ship.object.rotation.set(
                Math.sin(time * 0.32 + ship.phase) * 0.025,
                ship.angle + Math.sin(time * 0.08 + ship.phase) * 0.08,
                Math.cos(time * 0.25 + ship.phase) * 0.025
            );
        }
        for (const boat of boats) {
            const angle = time * boat.speed + boat.phase;
            boat.object.position.set(
                Math.cos(angle) * boat.rx,
                0.16 + Math.sin(time * 1.4 + boat.phase) * 0.025,
                2.2 + Math.sin(angle) * boat.rz
            );
            boat.object.rotation.set(
                Math.sin(time * 1.1 + boat.phase) * 0.035,
                Math.atan2(-Math.sin(angle) * boat.rx, Math.cos(angle) * boat.rz),
                Math.sin(time * 1.6 + boat.phase) * 0.04
            );
        }
    }

    update(0);
    return { group, update };
}

/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const TAU = Math.PI * 2;

type MaterialPalette = [THREE.MeshStandardMaterial, ...THREE.MeshStandardMaterial[]];
interface BlockTransform {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    rotation: number;
}
interface WaterfallRibbon {
    geometry: THREE.PlaneGeometry;
    base: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    phase: number;
    width: number;
}
interface FoamDrop {
    root: THREE.Group;
    x: number;
    z: number;
    phase: number;
    height: number;
    scale: number;
}

function randomSource(seed: number) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function ellipseGeometry(radiusX: number, radiusZ: number, colors: readonly [THREE.Color, THREE.Color], rings = 1) {
    const positions = [];
    const vertexColors = [];
    const segments = 80;
    const color = new THREE.Color();
    const point = (radius: number, angle: number) => [
        Math.cos(angle) * radiusX * radius,
        0,
        Math.sin(angle) * radiusZ * radius,
    ];

    for (let ring = 0; ring < rings; ring++) {
        const inner = ring / rings;
        const outer = (ring + 1) / rings;
        for (let segment = 0; segment < segments; segment++) {
            const a = (segment / segments) * TAU;
            const b = ((segment + 1) / segments) * TAU;
            const vertices: [number, number][] = [
                [inner, a],
                [outer, b],
                [outer, a],
                [inner, a],
                [inner, b],
                [outer, b],
            ];
            for (const [radius, angle] of vertices) {
                positions.push(...point(radius, angle));
                color.copy(colors[0]).lerp(colors[1], radius ** 2);
                vertexColors.push(color.r, color.g, color.b);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Build the landscape in island coordinates, leaving the castle plot clear.
 */
export function createWorld() {
    const group = new THREE.Group();
    group.name = "island-landscape";
    const random = randomSource(531840);
    const between = (minimum: number, maximum: number) => minimum + random() * (maximum - minimum);
    // The seeded generator stays in [0, 1), so a nonempty palette always has the selected entry.
    const choose = <T>(values: readonly [T, ...T[]]) => values[Math.floor(random() * values.length)] as T;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const batches = new Map<THREE.MeshStandardMaterial, BlockTransform[]>();
    const dummy = new THREE.Object3D();

    const materials = {
        grass: [0x6ca53c, 0x80b64c, 0x719e3e, 0x92bc53, 0x5c9138].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 })
        ) as MaterialPalette,
        soil: [0x80664a, 0x9b8158, 0xad956b, 0x6b654b].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 })
        ) as MaterialPalette,
        rock: [0x67735f, 0x536553, 0x7c8064, 0x929173, 0x465947].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 })
        ) as MaterialPalette,
        leaf: [0x458733, 0x579b35, 0x6dab3c, 0x7eb444, 0x91c44b].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
        ) as MaterialPalette,
        trunk: new THREE.MeshStandardMaterial({ color: 0x6b5035, roughness: 1 }),
        vine: new THREE.MeshStandardMaterial({ color: 0x426c31, roughness: 1 }),
        sand: new THREE.MeshStandardMaterial({ color: 0xd2b985, roughness: 1 }),
        stone: new THREE.MeshStandardMaterial({ color: 0xc4bda1, roughness: 1 }),
        lantern: new THREE.MeshStandardMaterial({ color: 0xffe394, emissive: 0xffb74a, emissiveIntensity: 1.6 }),
        flowers: [0xffeac2, 0xf4d04c, 0xd68bb3, 0xadc7e0].map(
            (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
        ) as MaterialPalette,
    };

    // Repeated terrain, foliage and hanging fragments share one draw per material.
    function block(
        material: THREE.MeshStandardMaterial,
        x: number,
        y: number,
        z: number,
        width: number,
        height: number,
        depth: number,
        rotation = 0
    ) {
        let transforms = batches.get(material);
        if (!transforms) {
            transforms = [];
            batches.set(material, transforms);
        }
        transforms.push({ x, y, z, width, height, depth, rotation });
    }

    function onIsland(x: number, z: number, inset = 0) {
        return (x / (11 - inset)) ** 2 + (z / (8.5 - inset)) ** 2 < 1;
    }

    function openGround(x: number, z: number, clearance = 0) {
        const castle = Math.abs(x) < 4.7 && z > -6.9 && z < -0.65;
        const lake = (x / (5.35 + clearance)) ** 2 + ((z - 2.2) / (3.25 + clearance)) ** 2 < 1;
        const stream = Math.abs(x) < 1.4 + clearance && z > 4;
        return onIsland(x, z, 0.7) && !castle && !lake && !stream;
    }

    const tile = 0.64;
    for (let x = -10.88; x <= 10.88; x += tile) {
        for (let z = -8.32; z <= 8.32; z += tile) {
            const radius = Math.hypot(x / 11, z / 8.5);
            const edge = 1 + Math.sin(x * 2.1 + z * 0.8) * 0.014;
            if (radius > edge) continue;

            block(choose(materials.grass), x, -0.14, z, tile + 0.02, 0.28, tile + 0.02);
            const depth = 1.4 + (1 - radius ** 1.6) * 4.3 + between(-0.25, 0.85);
            const soilDepth = between(0.48, 0.78);
            block(choose(materials.soil), x, -0.28 - soilDepth / 2, z, tile, soilDepth, tile);
            block(materials.sand, x, -0.38 - soilDepth, z, tile + 0.015, 0.16, tile + 0.015);

            const rockTop = -0.46 - soilDepth;
            const rockDepth = depth + rockTop;
            block(choose(materials.rock), x, rockTop - rockDepth / 2, z, tile * 0.96, rockDepth, tile * 0.96);
            if (random() < 0.43) {
                const tip = between(0.5, 2.25);
                block(choose(materials.rock), x, -depth - tip / 2, z, tile * 0.57, tip, tile * 0.57);
                if (random() < 0.24) block(materials.lantern, x, -depth - tip, z, 0.12, 0.15, 0.12);
                if (random() < 0.2) {
                    const end = between(0.3, 0.8);
                    block(choose(materials.rock), x, -depth - tip - end / 2, z, tile * 0.29, end, tile * 0.29);
                }
            }

            if (radius > 0.83 && random() < 0.4) {
                const length = between(0.6, 3.9);
                block(materials.vine, x, -length / 2 - 0.25, z, 0.045, length, 0.045);
                for (let y = -0.45; y > -length; y -= 0.27) {
                    block(choose(materials.leaf), x + between(-0.12, 0.12), y, z, 0.19, 0.11, 0.18);
                }
            }
        }
    }

    // Low green terraces make the perimeter read as a garden above the rock strata.
    for (let i = 0; i < 150; i++) {
        const angle = (i / 150) * TAU;
        const x = Math.cos(angle) * 10.35;
        const z = Math.sin(angle) * 7.94;
        if (Math.abs(x) < 1.15 && z > 0) continue;
        block(choose(materials.grass), x, 0.11, z, 0.54, between(0.1, 0.22), 0.54);
    }

    function tree(x: number, z: number, height: number, groundY = 0) {
        block(materials.trunk, x, groundY + height * 0.36, z, 0.16, height * 0.72, 0.16);
        const crown = height * 0.31;
        const voxel = height * 0.16;
        for (let ix = -2; ix <= 2; ix++) {
            for (let iy = -1; iy <= 2; iy++) {
                for (let iz = -2; iz <= 2; iz++) {
                    const radius = Math.hypot(ix * 0.48, (iy - 0.25) * 0.58, iz * 0.48);
                    if (radius > 1.12 || (radius > 0.85 && random() < 0.24)) continue;
                    block(
                        choose(materials.leaf),
                        x + ix * voxel * 0.79,
                        groundY + height * 0.69 + iy * voxel * 0.8,
                        z + iz * voxel * 0.79,
                        voxel,
                        voxel,
                        voxel
                    );
                }
            }
        }
        block(
            choose(materials.leaf),
            x - crown * 0.6,
            groundY + height * 0.45,
            z + crown * 0.4,
            crown,
            crown * 0.7,
            crown
        );
    }

    // Curated perimeter planting keeps the lake, village and front approach readable.
    const treeSites: [number, number, number][] = [
        [-9.2, -2.7, 1.9],
        [-9.3, -0.3, 1.75],
        [-9.1, 1.7, 1.6],
        [-8.0, 3.8, 1.4],
        [-6.5, 5.55, 1.15],
        [-4.6, 6.6, 1.05],
        [-2.5, 7.25, 0.85],
        [2.6, 7.2, 0.85],
        [4.7, 6.55, 1.05],
        [6.9, 5.1, 1.2],
        [8.2, 3.4, 1.4],
        [9.4, 1.5, 1.65],
        [9.3, -1.2, 1.9],
        [8.3, -3.5, 2.0],
        [6.9, -5.5, 2.1],
        [4.9, -6.7, 2.0],
        [-5.0, -6.7, 1.8],
        [-7.2, -5.4, 2.05],
        [-8.4, -4.2, 1.75],
        [-2.7, -7.35, 1.55],
        [0, -7.45, 1.5],
        [2.7, -7.3, 1.7],
    ];
    for (const [x, z, height] of treeSites) {
        if (openGround(x, z, 0.55)) tree(x, z, height);
    }

    // Small distant fragments reinforce the floating archipelago without crowding the main island.
    const fragments: [number, number, number, number][] = [
        [-14, 6, -13, 0.84],
        [16, -8, -4, 0.74],
        [-15, -10, 5, 0.98],
        [17, 5, -16, 0.68],
    ];
    for (const [x, y, z, radius] of fragments) {
        const step = radius * 0.61;
        for (let ix = -1; ix <= 1; ix++) {
            for (let iz = -1; iz <= 1; iz++) {
                if (Math.abs(ix) + Math.abs(iz) === 2 && random() < 0.5) continue;
                const depth = radius * (ix === 0 && iz === 0 ? 2.35 : between(0.7, 1.5));
                block(choose(materials.grass), x + ix * step, y - 0.12, z + iz * step, step, 0.24, step);
                block(choose(materials.soil), x + ix * step, y - 0.37, z + iz * step, step * 0.96, 0.26, step * 0.96);
                block(
                    choose(materials.rock),
                    x + ix * step,
                    y - 0.48 - depth / 2,
                    z + iz * step,
                    step * 0.72,
                    depth,
                    step * 0.72
                );
            }
        }
        tree(x, z, radius * 1.3, y);
    }

    for (let i = 0; i < 480; i++) {
        const x = between(-10.5, 10.5);
        const z = between(-8, 8);
        if (!openGround(x, z)) continue;
        const size = between(0.12, 0.36);
        block(choose(materials.leaf), x, size * 0.44, z, size, size * 0.9, size);
        if (random() < 0.4) {
            const flowerY = size + between(0.07, 0.2);
            block(materials.vine, x, flowerY * 0.5, z, 0.035, flowerY, 0.035);
            block(choose(materials.flowers), x, flowerY, z, 0.12, 0.09, 0.12);
        }
    }

    const sand = new THREE.Mesh(
        ellipseGeometry(5.05, 3.02, [new THREE.Color(0xe2c98f), new THREE.Color(0xc4b67f)]),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    );
    sand.position.set(0, 0.055, 2.2);
    sand.receiveShadow = true;
    group.add(sand);

    const water = new THREE.Mesh(
        ellipseGeometry(4.6, 2.6, [new THREE.Color(0x448fcb), new THREE.Color(0x61c2d1)], 8),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.27, metalness: 0.07 })
    );
    water.position.set(0, 0.12, 2.2);
    water.receiveShadow = true;
    group.add(water);

    const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x66bed4, roughness: 0.28, metalness: 0.05 });
    block(materials.sand, 0, 0.035, 6.45, 1.75, 0.07, 4.0);
    block(waterMaterial, 0, 0.105, 6.45, 1.3, 0.065, 4.0);

    for (let i = 0; i < 58; i++) {
        const angle = (i / 58) * TAU;
        const x = Math.cos(angle) * 4.91;
        const z = Math.sin(angle) * 2.86 + 2.2;
        if (Math.abs(x) < 1.1 && z > 4.2) continue;
        const size = between(0.15, 0.36);
        block(choose([materials.stone, materials.sand]), x, 0.13, z, size, size * 0.6, size * 0.8, angle);
    }

    // Glints move independently while the lake surface keeps a quiet silhouette.
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xc4f1ed, transparent: true, opacity: 0.53 });
    const glints = new THREE.InstancedMesh(box, glintMaterial, 58);
    glints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const glintData: { x: number; z: number; phase: number }[] = [];
    for (let i = 0; i < glints.count; i++) {
        const angle = random() * TAU;
        const radius = Math.sqrt(random()) * 0.93;
        glintData.push({
            x: Math.cos(angle) * 4.6 * radius,
            z: Math.sin(angle) * 2.6 * radius + 2.2,
            phase: random() * TAU,
        });
    }
    glints.frustumCulled = false;
    group.add(glints);

    const fallingWaterMaterial = new THREE.MeshBasicMaterial({
        color: 0x94def0,
        transparent: true,
        opacity: 0.74,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const ribbonMaterial = new THREE.MeshBasicMaterial({
        color: 0xe3fbff,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const waterfallRibbons: WaterfallRibbon[] = [];
    const foam: FoamDrop[] = [];
    const foamGeometry = new THREE.IcosahedronGeometry(1, 0);
    const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xe0f8fc, transparent: true, opacity: 0.75 });

    function waterfall(x: number, z: number, width: number, height: number, rotation: number) {
        const root = new THREE.Group();
        root.position.set(x, 0.12, z);
        root.rotation.y = rotation;
        group.add(root);

        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), fallingWaterMaterial);
        sheet.position.y = -height / 2;
        root.add(sheet);
        for (let i = 0; i < 9; i++) {
            const geometry = new THREE.PlaneGeometry(width * between(0.025, 0.1), height, 1, 24);
            const ribbon = new THREE.Mesh(geometry, ribbonMaterial);
            ribbon.position.set(((i + 0.5) / 9 - 0.5) * width, -height / 2, 0.035 + i * 0.001);
            root.add(ribbon);
            waterfallRibbons.push({
                geometry,
                base: geometry.getAttribute("position").clone(),
                phase: random() * TAU,
                width,
            });
        }

        for (let i = 0; i < 12; i++) {
            const bubble = new THREE.Mesh(foamGeometry, foamMaterial);
            bubble.position.set(between(-width * 0.55, width * 0.55), between(-0.08, 0.1), between(-0.1, 0.12));
            bubble.scale.setScalar(between(0.08, 0.17));
            root.add(bubble);
        }
        for (let i = 0; i < 28; i++) {
            foam.push({
                root,
                x: between(-width * 0.68, width * 0.68),
                z: between(-0.2, 0.5),
                phase: random(),
                height,
                scale: between(0.025, 0.07),
            });
        }
    }

    waterfall(0, 8.4, 1.3, 15, 0);
    waterfall(-9.15, 3.45, 0.72, 11.5, -0.9);
    block(waterMaterial, -8.9, 0.09, 3.25, 1.65, 0.12, 0.66, -0.9);
    const droplets = new THREE.InstancedMesh(foamGeometry, foamMaterial, foam.length);
    droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    droplets.frustumCulled = false;
    group.add(droplets);

    // Hanging lamps are small emissive accents rather than dozens of point lights.
    for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * TAU;
        const x = Math.cos(angle) * 10.5;
        const z = Math.sin(angle) * 8.1;
        const y = between(-1.2, -3.2);
        block(materials.trunk, x, y + 0.2, z, 0.055, 0.5, 0.055);
        block(materials.lantern, x, y - 0.05, z, 0.16, 0.21, 0.16);
        block(materials.trunk, x, y + 0.08, z, 0.22, 0.055, 0.22);
        block(materials.trunk, x, y - 0.18, z, 0.22, 0.055, 0.22);
    }

    for (const [material, transforms] of batches) {
        const mesh = new THREE.InstancedMesh(box, material, transforms.length);
        for (const [i, transform] of transforms.entries()) {
            dummy.position.set(transform.x, transform.y, transform.z);
            dummy.rotation.set(0, transform.rotation, 0);
            dummy.scale.set(transform.width, transform.height, transform.depth);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.castShadow = material !== waterMaterial && material !== materials.lantern;
        mesh.receiveShadow = true;
        group.add(mesh);
    }

    const clouds = new THREE.Group();
    clouds.name = "clouds";
    group.add(clouds);
    const cloudGeometry = new THREE.IcosahedronGeometry(1, 2);
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: false });
    const cloudClusters: [number, number, number, number][] = [
        [-17, -2.5, -6, 1.2],
        [17, -3.5, -5, 1.3],
        [-14, -9, 10, 1.2],
        [14, -10, 10, 1.35],
        [-7, -13, 12, 1.1],
        [7, -13, 12, 1.25],
        [0, -18, 7, 1.65],
        [0, -4.5, -19, 1.3],
        [-13, 3, -19, 1.15],
        [13, 4, -19, 1.4],
        [-23, -4, 5, 1.05],
        [22, -5, 4, 1.0],
        [-8, -16, -7, 1.4],
        [8, -15, -6, 1.2],
        [-20, 5, -10, 0.85],
        [21, 5, -11, 0.9],
    ];
    const cloudMotion: {
        cluster: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
        x: number;
        y: number;
        phase: number;
    }[] = [];
    for (const [x, y, z, scale] of cloudClusters) {
        const cluster = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 28);
        for (let i = 0; i < cluster.count; i++) {
            const edge = i >= 8;
            const angle = ((i - 8) / 20) * TAU;
            const size = edge ? between(0.3, 0.58) : between(0.65, 1.05);
            dummy.position.set(
                edge ? Math.cos(angle) * 1.8 : between(-1.2, 1.2),
                edge ? between(-0.12, 0.55) : between(0.1, 0.6),
                edge ? Math.sin(angle) * 0.88 : between(-0.4, 0.4)
            );
            dummy.rotation.set(0, random() * TAU, 0);
            dummy.scale.set(size * between(0.95, 1.25), size * between(0.8, 1.15), size);
            dummy.updateMatrix();
            cluster.setMatrixAt(i, dummy.matrix);
        }
        cluster.position.set(x, y, z);
        cluster.scale.setScalar(scale);
        clouds.add(cluster);
        cloudMotion.push({ cluster, x, y, phase: random() * TAU });
    }

    const dropletPosition = new THREE.Vector3();
    group.updateMatrixWorld(true);

    function update(time: number) {
        for (const [i, glint] of glintData.entries()) {
            const pulse = Math.sin(time * 1.5 + glint.phase);
            dummy.position.set(glint.x + Math.sin(time * 0.3 + glint.phase) * 0.06, 0.139, glint.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(0.12 + (pulse + 1) * 0.13, 0.006, 0.017);
            dummy.updateMatrix();
            glints.setMatrixAt(i, dummy.matrix);
        }
        glints.instanceMatrix.needsUpdate = true;

        for (const ribbon of waterfallRibbons) {
            const attribute = ribbon.geometry.getAttribute("position");
            for (let i = 0; i < attribute.count; i++) {
                const y = ribbon.base.getY(i);
                attribute.setX(i, ribbon.base.getX(i) + Math.sin(y * 2.4 + time * 4.1 + ribbon.phase) * 0.025);
                attribute.setZ(i, Math.sin(y * 1.5 + time * 3.4 + ribbon.phase) * 0.025);
            }
            attribute.needsUpdate = true;
        }

        for (const [i, drop] of foam.entries()) {
            const fraction = (time * 0.31 + drop.phase) % 1;
            dropletPosition.set(drop.x, -fraction * drop.height, drop.z + Math.sin(fraction * 9 + drop.phase) * 0.12);
            dropletPosition.applyEuler(drop.root.rotation).add(drop.root.position);
            dummy.position.copy(dropletPosition);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(drop.scale, drop.scale * 2.6, drop.scale);
            dummy.updateMatrix();
            droplets.setMatrixAt(i, dummy.matrix);
        }
        droplets.instanceMatrix.needsUpdate = true;

        for (const cloud of cloudMotion) {
            cloud.cluster.position.x = cloud.x + Math.sin(time * 0.035 + cloud.phase) * 0.5;
            cloud.cluster.position.y = cloud.y + Math.sin(time * 0.06 + cloud.phase) * 0.18;
        }
    }

    update(0);
    return { group, update, setClouds: (visible: boolean) => (clouds.visible = visible) };
}

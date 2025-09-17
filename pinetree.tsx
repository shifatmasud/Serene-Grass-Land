import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --- Color Palette based on Reference ---
const TRUNK_COLOR_DARK = new THREE.Color('#4a3b2a');
const TRUNK_COLOR_LIGHT = new THREE.Color('#6b5a4a');
const FOLIAGE_COLOR_DARK = new THREE.Color('#2a402a'); // Less uniform dark
const FOLIAGE_COLOR_LIGHT = new THREE.Color('#507858'); // Lighter, yellower light
const FOLIAGE_SHADOW = new THREE.Color('#1f3024'); // More color in shadow

// Helper to create a single sprig of pine needles
// This is the base unit for all foliage
function createPineNeedleSprig(): THREE.BufferGeometry {
    const needlesPerSprig = 8;
    const needleLength = 0.6;
    const needleWidth = 0.02;

    const sprigGeometries: THREE.BufferGeometry[] = [];
    const needleGeom = new THREE.PlaneGeometry(needleWidth, needleLength);

    const colors = [];
    colors.push(FOLIAGE_COLOR_DARK.r, FOLIAGE_COLOR_DARK.g, FOLIAGE_COLOR_DARK.b);
    colors.push(FOLIAGE_COLOR_DARK.r, FOLIAGE_COLOR_DARK.g, FOLIAGE_COLOR_DARK.b);
    colors.push(FOLIAGE_COLOR_LIGHT.r, FOLIAGE_COLOR_LIGHT.g, FOLIAGE_COLOR_LIGHT.b);
    colors.push(FOLIAGE_COLOR_LIGHT.r, FOLIAGE_COLOR_LIGHT.g, FOLIAGE_COLOR_LIGHT.b);
    needleGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    needleGeom.translate(0, needleLength / 2, 0);

    for (let i = 0; i < needlesPerSprig; i++) {
        const needleClone = needleGeom.clone();
        
        const angleX = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.2; // Angle outwards
        const yRotation = (i / needlesPerSprig) * Math.PI * 2 + Math.random() * 0.5; // Fan around
        
        const tempMesh = new THREE.Mesh(needleClone);
        tempMesh.rotation.set(angleX, yRotation, 0);
        tempMesh.updateMatrix();

        needleClone.applyMatrix4(tempMesh.matrix);
        sprigGeometries.push(needleClone);
    }

    needleGeom.dispose();
    if (sprigGeometries.length === 0) return new THREE.BufferGeometry();

    const sprigGeometry = mergeGeometries(sprigGeometries);
    if (!sprigGeometry) return new THREE.BufferGeometry();
    
    const nonIndexedSprig = sprigGeometry.toNonIndexed();
    sprigGeometry.dispose();

    return nonIndexedSprig;
}

// Helper to create a larger "pad" of foliage by clustering sprigs
function createFoliagePad(baseSprig: THREE.BufferGeometry): THREE.BufferGeometry {
    const sprigsPerPad = 15;
    const padGeometries: THREE.BufferGeometry[] = [];
    const padRadius = 0.5;

    for (let i = 0; i < sprigsPerPad; i++) {
        const sprigClone = baseSprig.clone();

        const phi = Math.acos(1 - 2 * Math.random()); // Distribute points on a sphere
        const theta = Math.PI * 2 * Math.random();

        const x = Math.sin(phi) * Math.cos(theta) * padRadius;
        const y = Math.sin(phi) * Math.sin(theta) * padRadius * 0.7; // Flatten the sphere slightly
        const z = Math.cos(phi) * padRadius;
        
        const tempMesh = new THREE.Mesh(sprigClone);
        tempMesh.position.set(x, y, z);
        tempMesh.lookAt(0,0,0);
        tempMesh.rotation.y += Math.PI /2; // Orient needles outward
        tempMesh.updateMatrix();
        
        sprigClone.applyMatrix4(tempMesh.matrix);

        // Add darker color to bottom half of the pad for self-shadowing illusion
        const colors = sprigClone.attributes.color;
        const tempVec = new THREE.Vector3();
        for (let j = 0; j < colors.count; j++) {
            tempVec.fromBufferAttribute(sprigClone.attributes.position, j);
            if (tempVec.y < 0) {
                 colors.setXYZ(j, FOLIAGE_SHADOW.r, FOLIAGE_SHADOW.g, FOLIAGE_SHADOW.b);
            }
        }
        colors.needsUpdate = true;

        padGeometries.push(sprigClone);
    }
    
    if (padGeometries.length === 0) return new THREE.BufferGeometry();
    const padGeometry = mergeGeometries(padGeometries);
    if (!padGeometry) return new THREE.BufferGeometry();

    // No need to de-index again as the base sprig is already non-indexed
    return padGeometry;
}


export function createPineTreeGeometry(): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    // --- Unified Trunk Skeleton ---
    const trunkHeight = 7.5;
    const trunkRadius = 0.3;
    // Use a Cone for a continuous, pointy skeleton
    let trunkGeometry: THREE.BufferGeometry = new THREE.ConeGeometry(trunkRadius, trunkHeight, 16, 5);
    trunkGeometry.translate(0, trunkHeight / 2, 0); // Base at y=0

    const trunkColors = [];
    const pos = trunkGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const ratio = pos.getY(i) / trunkHeight;
        const color = new THREE.Color().lerpColors(TRUNK_COLOR_DARK, TRUNK_COLOR_LIGHT, ratio + (Math.random() - 0.5) * 0.1);
        trunkColors.push(color.r, color.g, color.b);
    }
    trunkGeometry.setAttribute('color', new THREE.Float32BufferAttribute(trunkColors, 3));
    trunkGeometry = trunkGeometry.toNonIndexed();
    geometries.push(trunkGeometry);

    // --- Branches & Foliage (Unified Loop) ---
    const baseSprig = createPineNeedleSprig();
    const foliagePad = createFoliagePad(baseSprig);

    const branchLevels = 10;
    const branchesPerLevel = 5;

    // Loop goes from bottom to near the top
    for (let i = 0; i < branchLevels; i++) {
        const levelRatio = i / (branchLevels - 1); // 0 for bottom, 1 for top
        const levelY = trunkHeight * 0.1 + (trunkHeight * 0.85) * levelRatio;

        // Branches are longest in the middle, shorter at ends
        const branchLength = Math.sin(levelRatio * Math.PI) * 2.5 + 0.5;
        if (branchLength < 0.5) continue; // Skip tiny branches at the very bottom/top

        for (let j = 0; j < branchesPerLevel; j++) {
            // Add some spiral to the branch placement
            const angle = (j / branchesPerLevel) * Math.PI * 2 + (Math.random() - 0.5) * 0.8 + (i * 0.3);

            const branchMatrixContainer = new THREE.Object3D();
            branchMatrixContainer.position.set(0, levelY, 0);
            
            // Lower branches droop, upper branches point up
            const droopAngle = (Math.PI / 2.5) - (levelRatio * (Math.PI / 2.2));
            branchMatrixContainer.rotation.set(0, angle, droopAngle);
            branchMatrixContainer.updateMatrix();
            
            // --- Organic Tapered Branch ---
            const branchRadius = (1.0 - levelRatio) * 0.08 + 0.02; // Thicker at base
            let branchGeom: THREE.BufferGeometry = new THREE.ConeGeometry(branchRadius, branchLength, 8, 1);
            branchGeom.translate(0, branchLength / 2, 0); // Position cone base at origin

            const branchColors = [];
             for (let k = 0; k < branchGeom.attributes.position.count; k++) {
                const color = TRUNK_COLOR_DARK;
                branchColors.push(color.r, color.g, color.b);
            }
            branchGeom.setAttribute('color', new THREE.Float32BufferAttribute(branchColors, 3));
            branchGeom = branchGeom.toNonIndexed();
            branchGeom.applyMatrix4(branchMatrixContainer.matrix);
            geometries.push(branchGeom);
            // --- End of Branch ---

            // --- Foliage on the branch ---
            const padsOnBranch = 5;
            for (let k = 1; k <= padsOnBranch; k++) {
                const padPosRatio = k / padsOnBranch;
                // Don't place foliage inside trunk
                if (padPosRatio * branchLength < trunkRadius * 1.5) continue;

                // Foliage pads get smaller towards the tip and top of tree
                const foliageScale = (1.0 - levelRatio) * 0.6 + 0.2;
                
                const padClone = foliagePad.clone();
                
                const padMesh = new THREE.Object3D();
                padMesh.scale.setScalar(foliageScale * (0.8 + Math.random() * 0.4));
                
                const positionOnBranch = new THREE.Vector3(0, padPosRatio * branchLength, 0);
                
                // Add some gravity sag
                positionOnBranch.z -= padPosRatio * padPosRatio * 0.3;

                padMesh.position.copy(positionOnBranch);
                padMesh.rotation.y = Math.random() * Math.PI;
                padMesh.updateMatrix();

                // Apply the branch's transformation, then the pad's local transformation
                const finalMatrix = branchMatrixContainer.matrix.clone().multiply(padMesh.matrix);
                padClone.applyMatrix4(finalMatrix);
                geometries.push(padClone);
            }
        }
    }
    
    // The separate Tree Top (Leader) section has been removed.

    // --- Cleanup base geometries ---
    baseSprig.dispose();
    foliagePad.dispose();
    
    const finalGeometry = mergeGeometries(geometries);
    
    if (!finalGeometry) {
        console.error("Failed to merge geometries for the pine tree.");
        return new THREE.BoxGeometry(1, 5, 1);
    }
    
    // Dispose of all the cloned/intermediate geometries
    geometries.forEach(g => {
        if (g) g.dispose();
    });

    return finalGeometry;
}
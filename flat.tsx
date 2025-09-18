import React, { useRef, useEffect } from "react"
import * as THREE from "three"
import { Box3 } from "three"
import { GUI } from "lil-gui"
import { OrbitControls } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/controls/OrbitControls.js"
import { Sky } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/objects/Sky.js"
import { EffectComposer } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js"
import { Water } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/objects/Water.js"
import { mergeGeometries } from "https://aistudiocdn.com/three@0.180.0/examples/jsm/utils/BufferGeometryUtils.js"

// --- FROM Clouds.tsx ---
// --- New Soft & Blurry Cloud Texture Generator ---
function createSoftCloudTexture() {
    const size = 128 // Reduced texture resolution
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) {
        throw new Error("Could not get 2D context from canvas")
    }

    const centerX = size / 2
    const centerY = size / 2

    // Create a very soft radial gradient. This is the key to the blurry effect.
    const gradient = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        size / 2
    )
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.6)")
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)")
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
}

// --- Cloud Factory ---
function createClouds(params: {
    count: number
    color: string | number | THREE.Color
}) {
    const cloudTexture = createSoftCloudTexture()

    const baseCloudMaterial = new THREE.MeshLambertMaterial({
        map: cloudTexture,
        color: params.color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // Use AdditiveBlending for a soft, glowing effect
    })

    const cloudGeo = new THREE.PlaneGeometry(1, 1)
    const cloudsGroup = new THREE.Group()

    const maxClouds = 50
    const areaSize = 150
    const heightRange = { min: 25, max: 40 }
    const baseColor = new THREE.Color(params.color)
    const shadowColor = new THREE.Color(0x8899aa) // A cool, grayish shadow color

    for (let i = 0; i < maxClouds; i++) {
        const puffyCloud = new THREE.Group()
        const puffCount = 10 + Math.floor(Math.random() * 10)

        for (let j = 0; j < puffCount; j++) {
            // Clone material for each puff to give it a unique color for shading
            const puffMaterial = baseCloudMaterial.clone()
            const puff = new THREE.Mesh(cloudGeo, puffMaterial)

            const puffScale = 20 + Math.random() * 15
            puff.scale.set(puffScale, puffScale, 1)

            // Position puffs to create a more cloud-like shape (flatter bottom, puffier top)
            const xPos = (Math.random() - 0.5) * puffScale * 1.8
            const yPos = Math.random() * Math.random() * puffScale * 0.6 // Skew towards bottom
            const zPos = (Math.random() - 0.5) * puffScale * 1.2
            puff.position.set(xPos, yPos, zPos)

            puff.rotation.z = Math.random() * Math.PI * 2

            // Fake shading based on vertical position within the cloud
            const shadeFactor = Math.max(
                0,
                Math.min(1, yPos / (puffScale * 0.6))
            )
            puffMaterial.color.lerpColors(shadowColor, baseColor, shadeFactor)

            // Adjust opacity for AdditiveBlending. Lower values work better.
            // Higher puffs (closer to the sun) are slightly more opaque.
            puffMaterial.opacity = 0.1 + shadeFactor * 0.2

            puffyCloud.add(puff)
        }

        puffyCloud.position.set(
            (Math.random() - 0.5) * areaSize,
            heightRange.min +
                Math.random() * (heightRange.max - heightRange.min),
            (Math.random() - 0.5) * areaSize
        )

        puffyCloud.userData.speed = new THREE.Vector3(
            0.5 + Math.random() * 1.5,
            0,
            0
        )

        puffyCloud.visible = i < params.count
        cloudsGroup.add(puffyCloud)
    }

    // --- User Data Functions for GUI control ---

    cloudsGroup.userData.update = (delta: number, camera: THREE.Camera) => {
        cloudsGroup.children.forEach((cloud) => {
            if (cloud instanceof THREE.Group && cloud.visible) {
                cloud.position.x += cloud.userData.speed.x * delta

                const wrapBoundary = areaSize / 2 + 50
                if (cloud.position.x > wrapBoundary) {
                    cloud.position.x = -wrapBoundary
                    cloud.position.z = (Math.random() - 0.5) * areaSize
                    cloud.position.y =
                        heightRange.min +
                        Math.random() * (heightRange.max - heightRange.min)
                }

                // Billboard effect
                cloud.children.forEach((puff) => {
                    if (puff instanceof THREE.Mesh) {
                        puff.quaternion.copy(camera.quaternion)
                    }
                })
            }
        })
    }

    cloudsGroup.userData.setCloudCount = (count: number) => {
        cloudsGroup.children.forEach((cloud, i) => {
            cloud.visible = i < count
        })
    }

    cloudsGroup.userData.setCloudColor = (
        color: string | number | THREE.Color
    ) => {
        const newBaseColor = new THREE.Color(color)
        cloudsGroup.children.forEach((cloud) => {
            if (cloud instanceof THREE.Group) {
                cloud.children.forEach((puff) => {
                    if (puff instanceof THREE.Mesh) {
                        const material =
                            puff.material as THREE.MeshLambertMaterial
                        const puffScale = puff.scale.x
                        const yPos = puff.position.y
                        const shadeFactor = Math.max(
                            0,
                            Math.min(1, yPos / (puffScale * 0.6))
                        )
                        material.color.lerpColors(
                            shadowColor,
                            newBaseColor,
                            shadeFactor
                        )
                    }
                })
            }
        })
    }

    return cloudsGroup
}

// --- FROM Water.tsx ---
// This function creates a stylized, textureless water effect.
// Instead of using a normal map texture, it generates procedural ripples in the shader.
// The color is derived entirely from reflections and refractions of the environment.
function createWater(
    geometry: THREE.BufferGeometry,
    sunDirection: THREE.Vector3,
    params: {
        rippleScale: number
        rippleSpeed: number
        rippleIntensity: number
        interactiveRippleRadius: number
        interactiveRippleStrength: number
        waterDistortion: number
        sunColor: string | number | THREE.Color
    }
) {
    const water = new Water(geometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.Texture(), // Pass an empty texture, we won't use it
        sunDirection: sunDirection,
        sunColor: params.sunColor,
        waterColor: 0x001e0f, // This color is mostly overridden by fog and reflection
        distortionScale: params.waterDistortion,
        fog: true,
        alpha: 0.95,
    })

    water.rotation.x = -Math.PI / 2

    const waterMaterial = water.material as THREE.ShaderMaterial

    // Add new uniforms for procedural ripples
    waterMaterial.uniforms.rippleScale = { value: params.rippleScale }
    waterMaterial.uniforms.rippleSpeed = { value: params.rippleSpeed }
    waterMaterial.uniforms.rippleIntensity = { value: params.rippleIntensity }
    waterMaterial.uniforms.uMousePos = {
        value: new THREE.Vector3(9999, 9999, 9999),
    }
    waterMaterial.uniforms.uRippleRadius = {
        value: params.interactiveRippleRadius,
    }
    waterMaterial.uniforms.uRippleStrength = {
        value: params.interactiveRippleStrength,
    }

    // We will override the default shader to create our procedural effect
    waterMaterial.onBeforeCompile = (shader) => {
        // Add uniforms and noise function to the shader code
        shader.fragmentShader =
            `
            uniform float rippleScale;
            uniform float rippleSpeed;
            uniform float rippleIntensity;
            
            uniform vec3 uMousePos;
            uniform float uRippleRadius;
            uniform float uRippleStrength;

            // 2D Simplex Noise
            vec2 hash( vec2 p ) {
                p = vec2( dot(p,vec2(127.1,311.7)),
                          dot(p,vec2(269.5,183.3)) );
                return -1.0 + 2.0*fract(sin(p)*43758.5453123);
            }

            float noise( in vec2 p ) {
                const float K1 = 0.366025404; // (sqrt(3)-1)/2;
                const float K2 = 0.211324865; // (3-sqrt(3))/6;
            
                vec2 i = floor( p + (p.x+p.y)*K1 );
                
                vec2 a = p - i + (i.x+i.y)*K2;
                vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                vec2 b = a - o + K2;
                vec2 c = a - 1.0 + 2.0*K2;
            
                vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
                vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
            
                return dot( n, vec3(70.0) );
            }
        \n` + shader.fragmentShader

        const normalCalculation = `
            // --- Start of Procedural Normals ---

            // Function to get total displacement at a world position
            float getDisplacement(vec2 worldPos) {
                // Ambient waves
                vec2 pos = worldPos * rippleScale * 0.05;
                float n1 = noise(pos + time * rippleSpeed);
                float n2 = noise(pos * 2.1 + time * rippleSpeed * 1.3);
                float ambientDisplacement = n1 * 0.6 + n2 * 0.4;

                // Interactive ripples
                float interactiveDisplacement = 0.0;
                float dist = distance(worldPos, uMousePos.xz);
                if(dist < uRippleRadius) {
                    float falloff = smoothstep(uRippleRadius, 0.0, dist);
                    // Create a circular wave expanding from the center
                    interactiveDisplacement = -sin(dist * 4.0 - time * 10.0) * falloff * uRippleStrength;
                }

                return ambientDisplacement + interactiveDisplacement;
            }

            // Calculate the normal from the gradient of the displacement field
            vec2 delta = vec2(0.1, 0.0);

            float displacement = getDisplacement(worldPosition.xz);
            float displacement_dx = getDisplacement(worldPosition.xz + delta.xy);
            float displacement_dz = getDisplacement(worldPosition.xz + delta.yx);

            vec3 normal = normalize(vec3(
                (displacement - displacement_dx) * rippleIntensity * 100.0,
                1.0,
                (displacement - displacement_dz) * rippleIntensity * 100.0
            ));
            // --- End of Procedural Normals ---
        `

        // Replace the texture-based normal calculation with our procedural one
        shader.fragmentShader = shader.fragmentShader.replace(
            "vec4 normalColor = texture2D( tNormal, vUv * textureMatrix );",
            "vec4 normalColor = vec4(0.0); // Not used"
        )
        shader.fragmentShader = shader.fragmentShader.replace(
            "vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );",
            normalCalculation
        )
    }

    return water
}

// --- FROM pinetree.tsx ---
// --- Color Palette based on Reference ---
const TRUNK_COLOR_DARK = new THREE.Color("#4a3b2a")
const TRUNK_COLOR_LIGHT = new THREE.Color("#6b5a4a")
const FOLIAGE_COLOR_DARK = new THREE.Color("#2a402a") // Less uniform dark
const FOLIAGE_COLOR_LIGHT = new THREE.Color("#507858") // Lighter, yellower light
const FOLIAGE_SHADOW = new THREE.Color("#1f3024") // More color in shadow

// Helper to create a single sprig of pine needles
// This is the base unit for all foliage
function createPineNeedleSprig(): THREE.BufferGeometry {
    const needlesPerSprig = 8
    const needleLength = 0.6
    const needleWidth = 0.02

    const sprigGeometries: THREE.BufferGeometry[] = []
    const needleGeom = new THREE.PlaneGeometry(needleWidth, needleLength)

    const colors = []
    colors.push(
        FOLIAGE_COLOR_DARK.r,
        FOLIAGE_COLOR_DARK.g,
        FOLIAGE_COLOR_DARK.b
    )
    colors.push(
        FOLIAGE_COLOR_DARK.r,
        FOLIAGE_COLOR_DARK.g,
        FOLIAGE_COLOR_DARK.b
    )
    colors.push(
        FOLIAGE_COLOR_LIGHT.r,
        FOLIAGE_COLOR_LIGHT.g,
        FOLIAGE_COLOR_LIGHT.b
    )
    colors.push(
        FOLIAGE_COLOR_LIGHT.r,
        FOLIAGE_COLOR_LIGHT.g,
        FOLIAGE_COLOR_LIGHT.b
    )
    needleGeom.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3)
    )

    needleGeom.translate(0, needleLength / 2, 0)

    for (let i = 0; i < needlesPerSprig; i++) {
        const needleClone = needleGeom.clone()

        const angleX = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.2 // Angle outwards
        const yRotation =
            (i / needlesPerSprig) * Math.PI * 2 + Math.random() * 0.5 // Fan around

        const tempMesh = new THREE.Mesh(needleClone)
        tempMesh.rotation.set(angleX, yRotation, 0)
        tempMesh.updateMatrix()

        needleClone.applyMatrix4(tempMesh.matrix)
        sprigGeometries.push(needleClone)
    }

    needleGeom.dispose()
    if (sprigGeometries.length === 0) return new THREE.BufferGeometry()

    const sprigGeometry = mergeGeometries(sprigGeometries)
    if (!sprigGeometry) return new THREE.BufferGeometry()

    const nonIndexedSprig = sprigGeometry.toNonIndexed()
    sprigGeometry.dispose()

    return nonIndexedSprig
}

// Helper to create a larger "pad" of foliage by clustering sprigs
function createFoliagePad(
    baseSprig: THREE.BufferGeometry
): THREE.BufferGeometry {
    const sprigsPerPad = 15
    const padGeometries: THREE.BufferGeometry[] = []
    const padRadius = 0.5

    for (let i = 0; i < sprigsPerPad; i++) {
        const sprigClone = baseSprig.clone()

        const phi = Math.acos(1 - 2 * Math.random()) // Distribute points on a sphere
        const theta = Math.PI * 2 * Math.random()

        const x = Math.sin(phi) * Math.cos(theta) * padRadius
        const y = Math.sin(phi) * Math.sin(theta) * padRadius * 0.7 // Flatten the sphere slightly
        const z = Math.cos(phi) * padRadius

        const tempMesh = new THREE.Mesh(sprigClone)
        tempMesh.position.set(x, y, z)
        tempMesh.lookAt(0, 0, 0)
        tempMesh.rotation.y += Math.PI / 2 // Orient needles outward
        tempMesh.updateMatrix()

        sprigClone.applyMatrix4(tempMesh.matrix)

        // Add darker color to bottom half of the pad for self-shadowing illusion
        const colors = sprigClone.attributes.color
        const tempVec = new THREE.Vector3()
        for (let j = 0; j < colors.count; j++) {
            tempVec.fromBufferAttribute(sprigClone.attributes.position, j)
            if (tempVec.y < 0) {
                colors.setXYZ(
                    j,
                    FOLIAGE_SHADOW.r,
                    FOLIAGE_SHADOW.g,
                    FOLIAGE_SHADOW.b
                )
            }
        }
        colors.needsUpdate = true

        padGeometries.push(sprigClone)
    }

    if (padGeometries.length === 0) return new THREE.BufferGeometry()
    const padGeometry = mergeGeometries(padGeometries)
    if (!padGeometry) return new THREE.BufferGeometry()

    // No need to de-index again as the base sprig is already non-indexed
    return padGeometry
}

function createPineTreeGeometry(): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = []

    // --- Unified Trunk Skeleton ---
    const trunkHeight = 7.5
    const trunkRadius = 0.3
    // Use a Cone for a continuous, pointy skeleton
    let trunkGeometry: THREE.BufferGeometry = new THREE.ConeGeometry(
        trunkRadius,
        trunkHeight,
        16,
        5
    )
    trunkGeometry.translate(0, trunkHeight / 2, 0) // Base at y=0

    const trunkColors = []
    const pos = trunkGeometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
        const ratio = pos.getY(i) / trunkHeight
        const color = new THREE.Color().lerpColors(
            TRUNK_COLOR_DARK,
            TRUNK_COLOR_LIGHT,
            ratio + (Math.random() - 0.5) * 0.1
        )
        trunkColors.push(color.r, color.g, color.b)
    }
    trunkGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(trunkColors, 3)
    )
    trunkGeometry = trunkGeometry.toNonIndexed()
    geometries.push(trunkGeometry)

    // --- Branches & Foliage (Unified Loop) ---
    const baseSprig = createPineNeedleSprig()
    const foliagePad = createFoliagePad(baseSprig)

    const branchLevels = 10
    const branchesPerLevel = 5

    // Loop goes from bottom to near the top
    for (let i = 0; i < branchLevels; i++) {
        const levelRatio = i / (branchLevels - 1) // 0 for bottom, 1 for top
        const levelY = trunkHeight * 0.1 + trunkHeight * 0.85 * levelRatio

        // Branches are longest in the middle, shorter at ends
        const branchLength = Math.sin(levelRatio * Math.PI) * 2.5 + 0.5
        if (branchLength < 0.5) continue // Skip tiny branches at the very bottom/top

        for (let j = 0; j < branchesPerLevel; j++) {
            // Add some spiral to the branch placement
            const angle =
                (j / branchesPerLevel) * Math.PI * 2 +
                (Math.random() - 0.5) * 0.8 +
                i * 0.3

            const branchMatrixContainer = new THREE.Object3D()
            branchMatrixContainer.position.set(0, levelY, 0)

            // Lower branches droop, upper branches point up
            const droopAngle = Math.PI / 2.5 - levelRatio * (Math.PI / 2.2)
            branchMatrixContainer.rotation.set(0, angle, droopAngle)
            branchMatrixContainer.updateMatrix()

            // --- Organic Tapered Branch ---
            const branchRadius = (1.0 - levelRatio) * 0.08 + 0.02 // Thicker at base
            let branchGeom: THREE.BufferGeometry = new THREE.ConeGeometry(
                branchRadius,
                branchLength,
                8,
                1
            )
            branchGeom.translate(0, branchLength / 2, 0) // Position cone base at origin

            const branchColors = []
            for (let k = 0; k < branchGeom.attributes.position.count; k++) {
                const color = TRUNK_COLOR_DARK
                branchColors.push(color.r, color.g, color.b)
            }
            branchGeom.setAttribute(
                "color",
                new THREE.Float32BufferAttribute(branchColors, 3)
            )
            branchGeom = branchGeom.toNonIndexed()
            branchGeom.applyMatrix4(branchMatrixContainer.matrix)
            geometries.push(branchGeom)
            // --- End of Branch ---

            // --- Foliage on the branch ---
            const padsOnBranch = 5
            for (let k = 1; k <= padsOnBranch; k++) {
                const padPosRatio = k / padsOnBranch
                // Don't place foliage inside trunk
                if (padPosRatio * branchLength < trunkRadius * 1.5) continue

                // Foliage pads get smaller towards the tip and top of tree
                const foliageScale = (1.0 - levelRatio) * 0.6 + 0.2

                const padClone = foliagePad.clone()

                const padMesh = new THREE.Object3D()
                padMesh.scale.setScalar(
                    foliageScale * (0.8 + Math.random() * 0.4)
                )

                const positionOnBranch = new THREE.Vector3(
                    0,
                    padPosRatio * branchLength,
                    0
                )

                // Add some gravity sag
                positionOnBranch.z -= padPosRatio * padPosRatio * 0.3

                padMesh.position.copy(positionOnBranch)
                padMesh.rotation.y = Math.random() * Math.PI
                padMesh.updateMatrix()

                // Apply the branch's transformation, then the pad's local transformation
                const finalMatrix = branchMatrixContainer.matrix
                    .clone()
                    .multiply(padMesh.matrix)
                padClone.applyMatrix4(finalMatrix)
                geometries.push(padClone)
            }
        }
    }

    // The separate Tree Top (Leader) section has been removed.

    // --- Cleanup base geometries ---
    baseSprig.dispose()
    foliagePad.dispose()

    const finalGeometry = mergeGeometries(geometries)

    if (!finalGeometry) {
        console.error("Failed to merge geometries for the pine tree.")
        return new THREE.BoxGeometry(1, 5, 1)
    }

    // Dispose of all the cloned/intermediate geometries
    geometries.forEach((g) => {
        if (g) g.dispose()
    })

    return finalGeometry
}

// --- FROM grass.tsx ---
function createGrass(
    pondPosition: THREE.Vector3,
    pondRadius: number,
    params: {
        grassCount: number
        grassBaseColor: string | number | THREE.Color
        grassTipColor: string | number | THREE.Color
    },
    maxGrassCount: number
) {
    const grassBladeHeight = 1.0
    const grassGeometry = new THREE.PlaneGeometry(0.1, grassBladeHeight, 1, 2)
    grassGeometry.translate(0, grassBladeHeight / 2, 0)

    const randoms = new Float32Array(maxGrassCount)
    for (let i = 0; i < maxGrassCount; i++) {
        randoms[i] = Math.random()
    }
    grassGeometry.setAttribute(
        "aRandom",
        new THREE.InstancedBufferAttribute(randoms, 1)
    )

    const positions = grassGeometry.attributes.position
    positions.setX(0, 0)
    positions.setX(1, 0)
    positions.needsUpdate = true
    grassGeometry.computeVertexNormals()

    const grassMaterial = new THREE.MeshToonMaterial({
        side: THREE.DoubleSide,
        vertexColors: true,
        color: params.grassBaseColor,
    })

    grassMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 }
        shader.uniforms.uMousePos = {
            value: new THREE.Vector3(9999, 9999, 9999),
        }
        shader.uniforms.uGrassTipColor = {
            value: new THREE.Color(params.grassTipColor),
        }
        shader.uniforms.uSunDirection = { value: new THREE.Vector3(0, 1, 0) }

        shader.vertexShader =
            `
            uniform float time;
            uniform vec3 uMousePos;
            varying vec3 vWorldPosition;
            varying float vRelativeHeight;
            attribute float aRandom;
            varying float vRandom;
            varying vec3 vGrassNormal;
        \n` + shader.vertexShader

        shader.fragmentShader =
            `
            uniform vec3 uGrassTipColor;
            uniform vec3 uSunDirection;
            varying float vRelativeHeight;
            varying float vRandom;
            varying vec3 vGrassNormal;
            varying vec3 vWorldPosition;
        \n` + shader.fragmentShader

        shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
                #include <begin_vertex>
                vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
                vRelativeHeight = position.y / ${grassBladeHeight.toFixed(1)};
                vRandom = aRandom;
                vGrassNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);

                // Wind Effect
                float windStrength = 0.15;
                float windSpeed = 1.5;
                float sway = pow(position.y, 2.0);
                transformed.x += sin(time * windSpeed + vWorldPosition.z * 0.5) * windStrength * sway;

                // Mouse Interactivity
                float dist = distance(vWorldPosition.xz, uMousePos.xz);
                float pushRadius = 2.5;
                float pushStrength = 0.8;

                if (dist < pushRadius) {
                    float falloff = 1.0 - dist / pushRadius;
                    falloff = pow(falloff, 3.0);
                    
                    vec3 pushDir = normalize(vWorldPosition.xyz - uMousePos);
                    pushDir.y = 0.0;
                    
                    float pushSway = pow(position.y, 1.5);
                    
                    transformed.xyz += pushDir * falloff * pushStrength * pushSway;
                }
            `
        )

        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            `
                #include <color_fragment>
                
                // 1. Color variation
                float gradientNoise = (vRandom - 0.5) * 0.4;
                float gradient = clamp(vRelativeHeight * (1.0 - gradientNoise) + gradientNoise, 0.0, 1.0);
                vec3 mixedColor = mix(diffuseColor.rgb, uGrassTipColor, gradient);

                // 2. Subsurface scattering
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                vec3 lightDir = normalize(-uSunDirection);

                // Translucency (light from behind passing through)
                float translucency = max(0.0, dot(vGrassNormal, lightDir));
                translucency = pow(translucency, 2.0) * 0.5;

                // Scattering (light wrapping around edges)
                float scatter = pow(max(0.0, dot(viewDir, -lightDir) + 0.1), 3.0) * 0.7;

                // Combine and add to color
                vec3 sssColor = (uGrassTipColor + diffuseColor.rgb) * 0.4; // Average base and tip color for glow
                vec3 finalSSS = sssColor * (translucency + scatter);

                diffuseColor.rgb = mixedColor + finalSSS;
            `
        )
        grassMaterial.userData.shader = shader
    }

    const grassMesh = new THREE.InstancedMesh(
        grassGeometry,
        grassMaterial,
        maxGrassCount
    )
    grassMesh.count = params.grassCount
    grassMesh.castShadow = true

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const areaSize = 50
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z)
    const pondRadiusSq = pondRadius * pondRadius

    for (let i = 0; i < maxGrassCount; i++) {
        let x, z
        do {
            x = (Math.random() - 0.5) * areaSize
            z = (Math.random() - 0.5) * areaSize
        } while (
            new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq
        )

        dummy.position.set(x, 0, z)
        dummy.rotation.y = Math.random() * Math.PI
        dummy.scale.setScalar(0.7 + Math.random() * 0.6)
        dummy.updateMatrix()
        grassMesh.setMatrixAt(i, dummy.matrix)

        color.set(params.grassBaseColor)
        color.multiplyScalar(0.8 + Math.random() * 0.4)
        grassMesh.setColorAt(i, color)
    }
    grassMesh.instanceMatrix.needsUpdate = true
    if (grassMesh.instanceColor) {
        grassMesh.instanceColor.needsUpdate = true
    }

    return grassMesh
}

// --- FROM land.tsx ---
function createGround(params: { groundColor: string | number | THREE.Color }) {
    const geometry = new THREE.PlaneGeometry(100, 100)
    const material = new THREE.MeshToonMaterial({ color: params.groundColor })
    const ground = new THREE.Mesh(geometry, material)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    return ground
}

function createMonolith(params: {
    monolithColor: string | number | THREE.Color
}) {
    const geometry = new THREE.BoxGeometry(0.8, 2.5, 0.5)
    const material = new THREE.MeshToonMaterial({ color: params.monolithColor })
    const monolith = new THREE.Mesh(geometry, material)
    monolith.position.set(0, 1.25, -15)
    monolith.castShadow = true
    monolith.receiveShadow = true
    return monolith
}

// --- FROM Game.tsx ---
const ORB_COUNT = 6 // 5 regular + 1 special
const WIN_SCORE = 10
const PLAYER_SIZE = 1.0

class Game {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private monolith: THREE.Mesh
    private pond: { position: THREE.Vector3; radius: number }
    private renderer: THREE.WebGLRenderer
    private composer: EffectComposer
    private isMobile: boolean

    public player: THREE.Mesh
    private playerState = {
        velocity: new THREE.Vector3(),
        yVelocity: 0,
        isJumping: false,
    }
    private keysPressed: { [key: string]: boolean } = {
        w: false,
        a: false,
        s: false,
        d: false,
    }
    private baseEmissiveIntensity: number
    private targetEmissiveIntensity: number
    private isActive = false
    private isCelebratingWin = false

    private orbs: THREE.Mesh[] = []
    private specialOrb: THREE.Mesh | null = null
    private orbGeometry: THREE.SphereGeometry
    private orbMaterial: THREE.MeshStandardMaterial
    private specialOrbMaterial: THREE.MeshStandardMaterial
    private score = 0

    private scoreElement: HTMLElement | null
    private winScreenElement: HTMLElement | null
    private winMessageElement: HTMLElement | null
    private confettiContainerElement: HTMLElement | null

    // --- Particle System ---
    private particlePool: THREE.Mesh[] = []
    private activeParticles: {
        mesh: THREE.Mesh
        velocity: THREE.Vector3
        lifetime: number
        initialLifetime: number
    }[] = []
    private particleGeometry: THREE.BoxGeometry
    private particleMaterial: THREE.MeshBasicMaterial
    private readonly MAX_PARTICLES = 150 // Max concurrent particles
    private readonly PARTICLES_PER_BURST = 15

    // --- Camera Control State ---
    private cameraOffset = new THREE.Vector3(0, 2.5, 6.0) // height, distance
    private cameraTargetOffset = new THREE.Vector3(0, 1.2, 0)
    private cameraLookAt = new THREE.Vector3()
    private cameraOrbit = new THREE.Quaternion()
    private cameraEuler = new THREE.Euler(0, 0, 0, "YXZ")
    private lastTouch = new THREE.Vector2()

    private clock = new THREE.Clock()
    private animationFrameId: number | null = null

    // Mobile UI elements
    private mobileControls: { [key: string]: HTMLElement | null } = {}

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        monolith: THREE.Mesh,
        pond: { position: THREE.Vector3; radius: number },
        renderer: THREE.WebGLRenderer,
        composer: EffectComposer,
        isMobile: boolean
    ) {
        this.scene = scene
        this.camera = camera
        this.monolith = monolith
        this.pond = pond
        this.renderer = renderer
        this.composer = composer
        this.isMobile = isMobile

        this.scoreElement = document.getElementById("score")
        this.winScreenElement = document.getElementById("win-screen")
        this.winMessageElement = document.getElementById("win-message")
        this.confettiContainerElement =
            document.getElementById("confetti-container")

        this.orbGeometry = new THREE.SphereGeometry(0.3, 16, 16)
        this.orbMaterial = new THREE.MeshStandardMaterial({
            color: "#ffd700",
            emissive: "#ffd700",
            emissiveIntensity: 2,
            toneMapped: false,
        })
        this.specialOrbMaterial = new THREE.MeshStandardMaterial({
            color: "#9400d3",
            emissive: "#da70d6",
            emissiveIntensity: 3,
            toneMapped: false,
        })

        // --- Initialize Particle System ---
        this.particleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05)
        this.particleMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
        })
        for (let i = 0; i < this.MAX_PARTICLES; i++) {
            const particle = new THREE.Mesh(
                this.particleGeometry,
                this.particleMaterial.clone()
            )
            particle.visible = false
            this.scene.add(particle)
            this.particlePool.push(particle)
        }

        this.setupPlayer()
        this.spawnOrbs()
    }

    private setupPlayer() {
        const playerGeometry = new THREE.BoxGeometry(
            PLAYER_SIZE,
            PLAYER_SIZE,
            PLAYER_SIZE
        )
        const playerMaterial = new THREE.MeshStandardMaterial({
            color: 0xadd8e6,
            transparent: true,
            opacity: 0.75,
            metalness: 0.1,
            roughness: 0.2,
            emissive: 0x87ceeb,
            emissiveIntensity: 0.4,
            side: THREE.DoubleSide,
        })
        this.player = new THREE.Mesh(playerGeometry, playerMaterial)
        // Start floating on the pond
        this.player.position.set(
            this.pond.position.x,
            1.5,
            this.pond.position.z
        )
        this.player.castShadow = true
        this.baseEmissiveIntensity = playerMaterial.emissiveIntensity
        this.targetEmissiveIntensity = this.baseEmissiveIntensity
        this.scene.add(this.player)
    }

    public setPlayerHover(isHovered: boolean) {
        if (this.isActive) return
        this.targetEmissiveIntensity = isHovered
            ? this.baseEmissiveIntensity * 3.0
            : this.baseEmissiveIntensity
    }
    
    public updateHover(delta: number) {
        const material = this.player.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = THREE.MathUtils.lerp(
            material.emissiveIntensity,
            this.targetEmissiveIntensity,
            delta * 10
        )
    }

    private animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate)
        const delta = this.clock.getDelta()
        const elapsedTime = this.clock.getElapsedTime()

        this.update(delta, elapsedTime)

        this.composer.render()
    }

    public startGame() {
        this.isActive = true

        const startOffset = new THREE.Vector3(0, 3, 7)
        this.camera.position.copy(this.player.position).add(startOffset)
        this.cameraLookAt
            .copy(this.player.position)
            .add(this.cameraTargetOffset)
        this.camera.lookAt(this.cameraLookAt)

        this.cameraEuler.setFromQuaternion(this.camera.quaternion, "YXZ")
        this.cameraOrbit.copy(this.camera.quaternion)

        this.setupEventListeners()

        this.clock.start()
        this.animate()
    }

    public stopGame() {
        this.isActive = false
        Object.keys(this.keysPressed).forEach(
            (k) => (this.keysPressed[k] = false)
        )
        this.playerState.velocity.set(0, 0, 0)
        this.disposeEventListeners()

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

    private spawnOrbs = () => {
        this.orbs.forEach((orb) => this.scene.remove(orb))
        this.orbs.length = 0
        if (this.specialOrb) this.scene.remove(this.specialOrb)
        this.specialOrb = null

        const monolithBBox = new Box3().setFromObject(this.monolith)
        const areaSize = 45
        const pondCenter = new THREE.Vector2(
            this.pond.position.x,
            this.pond.position.z
        )
        const pondRadiusSq = (this.pond.radius + 1) * (this.pond.radius + 1)

        const placeOrb = (orb: THREE.Mesh) => {
            let validPosition = false
            while (!validPosition) {
                const x = (Math.random() - 0.5) * areaSize
                const z = (Math.random() - 0.5) * areaSize
                const orbPos = new THREE.Vector3(x, 1.5, z)
                const inPond =
                    new THREE.Vector2(x, z).distanceToSquared(pondCenter) <
                    pondRadiusSq
                const inMonolith = monolithBBox.distanceToPoint(orbPos) < 2.0
                if (!inPond && !inMonolith) {
                    orb.position.copy(orbPos)
                    orb.userData.basePosition = orb.position.clone()
                    orb.userData.timeOffset = Math.random() * Math.PI * 2
                    validPosition = true
                }
            }
            this.scene.add(orb)
        }

        this.specialOrb = new THREE.Mesh(
            this.orbGeometry,
            this.specialOrbMaterial
        )
        placeOrb(this.specialOrb)

        for (let i = 0; i < ORB_COUNT - 1; i++) {
            const orb = new THREE.Mesh(this.orbGeometry, this.orbMaterial)
            placeOrb(orb)
            this.orbs.push(orb)
        }
        this.score = 0
        if (this.scoreElement) this.scoreElement.innerText = `Score: 0`
    }

    private triggerOrbBurst(position: THREE.Vector3, color: THREE.Color) {
        for (let i = 0; i < this.PARTICLES_PER_BURST; i++) {
            const particleMesh = this.particlePool.pop()
            if (!particleMesh) continue

            particleMesh.position.copy(position)
            ;(particleMesh.material as THREE.MeshBasicMaterial).color.copy(
                color
            )
            ;(particleMesh.material as THREE.MeshBasicMaterial).opacity = 1.0
            particleMesh.visible = true

            const velocity = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5 + 0.5, // Bias upwards
                Math.random() - 0.5
            )
                .normalize()
                .multiplyScalar(Math.random() * 2.5 + 1.5)

            const lifetime = Math.random() * 0.6 + 0.4 // Lifetime between 0.4 and 1.0 seconds

            this.activeParticles.push({
                mesh: particleMesh,
                velocity: velocity,
                lifetime: lifetime,
                initialLifetime: lifetime,
            })
        }
    }

    private triggerConfetti() {
        if (!this.confettiContainerElement) return
        const colors = [
            "#f44336",
            "#e91e63",
            "#9c27b0",
            "#673ab7",
            "#3f51b5",
            "#2196f3",
            "#03a9f4",
            "#00bcd4",
            "#009688",
            "#4caf50",
            "#8bc34a",
            "#cddc39",
            "#ffeb3b",
            "#ffc107",
            "#ff9800",
        ]
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement("div")
            confetti.classList.add("confetti")
            confetti.style.left = `${Math.random() * 100}vw`
            confetti.style.backgroundColor =
                colors[Math.floor(Math.random() * colors.length)]
            confetti.style.animationDelay = `${Math.random() * 2}s`
            confetti.style.animationDuration = `${3 + Math.random() * 2}s`
            this.confettiContainerElement.appendChild(confetti)
            setTimeout(() => {
                confetti.remove()
            }, 5000)
        }
    }

    private handleWin() {
        this.isCelebratingWin = true
        if (this.winScreenElement && this.winMessageElement) {
            this.winMessageElement.innerHTML =
                "Focus on Career, not girls. Girls are temporary, But Success is parmanent 😁"
            this.winScreenElement.style.display = "flex"
            this.triggerConfetti()
        }
        setTimeout(() => {
            if (this.winScreenElement)
                this.winScreenElement.style.display = "none"
            this.spawnOrbs()
            this.isCelebratingWin = false
        }, 5000)
    }

    private updateParticles(delta: number) {
        const gravity = 9.8
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const p = this.activeParticles[i]

            p.lifetime -= delta

            if (p.lifetime <= 0) {
                p.mesh.visible = false
                this.particlePool.push(p.mesh)
                this.activeParticles.splice(i, 1)
                continue
            }

            // Apply gravity
            p.velocity.y -= gravity * delta
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta))

            // Fade out
            ;(p.mesh.material as THREE.MeshBasicMaterial).opacity =
                p.lifetime / p.initialLifetime
        }
    }

    private jump = () => {
        if (!this.playerState.isJumping) {
            this.playerState.isJumping = true
            this.playerState.yVelocity = 7.0 // Jump strength
        }
    }

    private updatePlayer(delta: number) {
        const moveSpeed = 5.0
        const rotationSpeed = 10.0
        const hoverHeight = 1.5
        const gravity = 20.0

        if (this.playerState.isJumping) {
            this.playerState.yVelocity -= gravity * delta
            this.player.position.y += this.playerState.yVelocity * delta

            if (this.player.position.y <= hoverHeight) {
                this.player.position.y = hoverHeight
                this.playerState.isJumping = false
                this.playerState.yVelocity = 0
            }
        }

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            this.cameraOrbit
        )
        forward.y = 0
        forward.normalize()
        const right = new THREE.Vector3()
            .crossVectors(new THREE.Vector3(0, 1, 0), forward)
            .normalize()

        const moveDirection = new THREE.Vector3()
        if (this.keysPressed.w) moveDirection.add(forward)
        if (this.keysPressed.s) moveDirection.sub(forward) // Note: Swapped right and forward for joystick layout
        if (this.keysPressed.a) moveDirection.add(right)
        if (this.keysPressed.d) moveDirection.sub(right) // Note: Swapped a/d from desktop

        const targetVelocity = new THREE.Vector3()
        if (moveDirection.lengthSq() > 0) {
            targetVelocity.copy(
                moveDirection.normalize().multiplyScalar(moveSpeed)
            )
        }

        const lerpFactor = 1.0 - Math.exp(-20 * delta)
        this.playerState.velocity.lerp(targetVelocity, lerpFactor)
        const moveStep = this.playerState.velocity.clone().multiplyScalar(delta)

        const monolithBBox = new Box3().setFromObject(this.monolith)
        const playerBBox = new Box3().setFromObject(this.player)
        playerBBox.translate(moveStep)

        if (!playerBBox.intersectsBox(monolithBBox)) {
            this.player.position.add(moveStep)
        } else {
            this.playerState.velocity.set(0, 0, 0)
        }

        if (this.playerState.velocity.lengthSq() > 0.01) {
            const lookAtPosition = this.player.position
                .clone()
                .add(this.playerState.velocity)
            const targetMatrix = new THREE.Matrix4().lookAt(
                this.player.position,
                lookAtPosition,
                this.player.up
            )
            const targetQuaternion =
                new THREE.Quaternion().setFromRotationMatrix(targetMatrix)
            this.player.quaternion.slerp(
                targetQuaternion,
                delta * rotationSpeed
            )
        }
    }

    private updateCamera(delta: number) {
        const desiredPosition = this.player.position.clone()
        const offset = this.cameraOffset
            .clone()
            .applyQuaternion(this.cameraOrbit)
        desiredPosition.add(offset)

        const lerpFactor = 1.0 - Math.exp(-15 * delta)
        this.camera.position.lerp(desiredPosition, lerpFactor)

        const desiredLookAt = this.player.position
            .clone()
            .add(this.cameraTargetOffset)
        this.cameraLookAt.lerp(desiredLookAt, lerpFactor)
        this.camera.lookAt(this.cameraLookAt)
    }

    private updateOrbAnimation(
        orb: THREE.Mesh,
        delta: number,
        elapsedTime: number
    ) {
        const basePos = orb.userData.basePosition as THREE.Vector3
        const timeOffset = orb.userData.timeOffset as number
        orb.position.y =
            basePos.y + Math.sin(elapsedTime * 2 + timeOffset) * 0.2
        const circularRadius = 0.2
        const circularSpeed = 0.5
        orb.position.x =
            basePos.x +
            Math.cos(elapsedTime * circularSpeed + timeOffset) * circularRadius
        orb.position.z =
            basePos.z +
            Math.sin(elapsedTime * circularSpeed + timeOffset) * circularRadius
        orb.rotation.y += delta
    }

    private updateOrbs(delta: number, elapsedTime: number) {
        if (this.isCelebratingWin) return
        for (let i = this.orbs.length - 1; i >= 0; i--) {
            const orb = this.orbs[i]
            this.updateOrbAnimation(orb, delta, elapsedTime)
            if (
                this.player.position.distanceTo(orb.position) <
                PLAYER_SIZE / 2 + 0.3
            ) {
                this.triggerOrbBurst(
                    orb.position,
                    (orb.material as THREE.MeshStandardMaterial).color
                )
                this.scene.remove(orb)
                this.orbs.splice(i, 1)
                this.score++
            }
        }
        if (this.specialOrb) {
            this.updateOrbAnimation(this.specialOrb, delta, elapsedTime)
            if (
                this.player.position.distanceTo(this.specialOrb.position) <
                PLAYER_SIZE / 2 + 0.3
            ) {
                this.triggerOrbBurst(
                    this.specialOrb.position,
                    (this.specialOrb.material as THREE.MeshStandardMaterial)
                        .color
                )
                this.scene.remove(this.specialOrb)
                this.specialOrb = null
                this.score += 5
            }
        }
        if (this.scoreElement)
            this.scoreElement.innerText = `Score: ${this.score}`
        if (this.score >= WIN_SCORE && !this.isCelebratingWin) this.handleWin()
    }

    public update(delta: number, elapsedTime: number) {
        if (!this.isActive) return
        this.updatePlayer(delta)
        this.updateCamera(delta)
        this.updateOrbs(delta, elapsedTime)
        this.updateParticles(delta)
    }

    // --- Event Handlers ---
    private handleKeyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase()
        if (key in this.keysPressed) this.keysPressed[key] = true
        if (event.code === "Space") this.jump()
    }
    private handleKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase()
        if (key in this.keysPressed) this.keysPressed[key] = false
    }
    private handleDesktopMouseMove = (event: MouseEvent) => {
        if (!this.isActive || !document.pointerLockElement) return
        const movementX = event.movementX || 0
        const movementY = event.movementY || 0
        this.cameraEuler.y -= movementX * 0.002
        this.cameraEuler.x -= movementY * 0.002
        this.cameraEuler.x = Math.max(
            (-Math.PI / 2) * 0.8,
            Math.min((Math.PI / 2) * 0.8, this.cameraEuler.x)
        )
        this.cameraOrbit.setFromEuler(this.cameraEuler)
    }
    private handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length > 0) {
            this.lastTouch.set(
                event.touches[0].clientX,
                event.touches[0].clientY
            )
        }
    }
    private handleTouchMove = (event: TouchEvent) => {
        if (!this.isActive || event.touches.length === 0) return
        const touch = event.touches[0]
        const movementX = touch.clientX - this.lastTouch.x
        const movementY = touch.clientY - this.lastTouch.y
        this.cameraEuler.y -= movementX * 0.004 // Increased sensitivity for touch
        this.cameraEuler.x -= movementY * 0.004
        this.cameraEuler.x = Math.max(
            (-Math.PI / 2) * 0.8,
            Math.min((Math.PI / 2) * 0.8, this.cameraEuler.x)
        )
        this.cameraOrbit.setFromEuler(this.cameraEuler)
        this.lastTouch.set(touch.clientX, touch.clientY)
    }
    private mobileControlListener = (key: string, value: boolean) => () => {
        this.keysPressed[key] = value
    }

    private setupEventListeners() {
        if (this.isMobile) {
            this.renderer.domElement.addEventListener(
                "touchstart",
                this.handleTouchStart
            )
            this.renderer.domElement.addEventListener(
                "touchmove",
                this.handleTouchMove
            )

            this.mobileControls.w = document.getElementById("joy-w")
            this.mobileControls.a = document.getElementById("joy-a")
            this.mobileControls.s = document.getElementById("joy-s")
            this.mobileControls.d = document.getElementById("joy-d")
            this.mobileControls.jump = document.getElementById("jump-btn")

            this.mobileControls.w?.addEventListener(
                "touchstart",
                this.mobileControlListener("w", true)
            )
            this.mobileControls.w?.addEventListener(
                "touchend",
                this.mobileControlListener("w", false)
            )
            this.mobileControls.a?.addEventListener(
                "touchstart",
                this.mobileControlListener("a", true)
            )
            this.mobileControls.a?.addEventListener(
                "touchend",
                this.mobileControlListener("a", false)
            )
            this.mobileControls.s?.addEventListener(
                "touchstart",
                this.mobileControlListener("s", true)
            )
            this.mobileControls.s?.addEventListener(
                "touchend",
                this.mobileControlListener("s", false)
            )
            this.mobileControls.d?.addEventListener(
                "touchstart",
                this.mobileControlListener("d", true)
            )
            this.mobileControls.d?.addEventListener(
                "touchend",
                this.mobileControlListener("d", false)
            )
            this.mobileControls.jump?.addEventListener("touchstart", this.jump)
        } else {
            window.addEventListener("keydown", this.handleKeyDown)
            window.addEventListener("keyup", this.handleKeyUp)
            document.addEventListener("mousemove", this.handleDesktopMouseMove)
        }
    }

    private disposeEventListeners() {
        if (this.isMobile) {
            this.renderer.domElement.removeEventListener(
                "touchstart",
                this.handleTouchStart
            )
            this.renderer.domElement.removeEventListener(
                "touchmove",
                this.handleTouchMove
            )
            this.mobileControls.w?.removeEventListener(
                "touchstart",
                this.mobileControlListener("w", true)
            )
            this.mobileControls.w?.removeEventListener(
                "touchend",
                this.mobileControlListener("w", false)
            )
            this.mobileControls.a?.removeEventListener(
                "touchstart",
                this.mobileControlListener("a", true)
            )
            this.mobileControls.a?.removeEventListener(
                "touchend",
                this.mobileControlListener("a", false)
            )
            this.mobileControls.s?.removeEventListener(
                "touchstart",
                this.mobileControlListener("s", true)
            )
            this.mobileControls.s?.removeEventListener(
                "touchend",
                this.mobileControlListener("s", false)
            )
            this.mobileControls.d?.removeEventListener(
                "touchstart",
                this.mobileControlListener("d", true)
            )
            this.mobileControls.d?.removeEventListener(
                "touchend",
                this.mobileControlListener("d", false)
            )
            this.mobileControls.jump?.removeEventListener(
                "touchstart",
                this.jump
            )
        } else {
            window.removeEventListener("keydown", this.handleKeyDown)
            window.removeEventListener("keyup", this.handleKeyUp)
            document.removeEventListener(
                "mousemove",
                this.handleDesktopMouseMove
            )
        }
    }

    public dispose() {
        this.disposeEventListeners()
        this.orbs.forEach((orb) => this.scene.remove(orb))
        if (this.specialOrb)
            this.scene.remove(this.specialOrb)

            // Particle cleanup
        ;[
            ...this.activeParticles.map((p) => p.mesh),
            ...this.particlePool,
        ].forEach((mesh) => {
            this.scene.remove(mesh)
            ;(mesh.material as THREE.Material).dispose()
        })
        this.activeParticles = []
        this.particlePool = []
        this.particleGeometry.dispose()
        this.particleMaterial.dispose()

        this.scene.remove(this.player)
        this.player.geometry.dispose()
        ;(this.player.material as THREE.Material).dispose()
        this.orbGeometry.dispose()
        this.orbMaterial.dispose()
        this.specialOrbMaterial.dispose()
    }
}

// --- FROM App.tsx (Main Component) ---
// --- Configuration ---
const initialParams = {
    // World
    timeOfDay: 10.0, // 0-24 hours, 10 AM

    // Default Preset Values
    groundColor: "#2fa753",
    monolithColor: "#586F7C",
    grassBaseColor: "#a7c957",
    grassTipColor: "#55aa6f",

    // Lighting
    lightIntensity: 1.5,
    sunColor: "#ffcb8e",
    hemisphereSkyColor: "#bde0fe",
    hemisphereGroundColor: "#6a994e",
    hemisphereIntensity: 0.6,

    // Shadows
    shadowBias: -0.0005,
    shadowRadius: 8.2,

    // Sky & Sun
    turbidity: 10.3,
    rayleigh: 0.582,
    mieCoefficient: 0.015,
    mieDirectionalG: 0.361,
    elevation: 21.1,
    azimuth: 180,

    // Flora
    grassCount: 50000,
    treeCount: 5,

    // Post-processing
    bloomStrength: 0.4,
    bloomThreshold: 1,
    bloomRadius: 0.2,

    // Water Ripples
    waterFlowSpeed: 0.5,
    rippleIntensity: 0.1,
    rippleScale: 2.0,
    rippleSpeed: 0.03,
    interactiveRippleRadius: 5.0,
    interactiveRippleStrength: 0.15,
    waterDistortion: 0.0,

    // Clouds
    cloudColor: "#ffffff",
    cloudCount: 10,

    // Fog
    fogColor: "#c5d1d9",
    fogDensity: 0.015,

    // Stars
    starCount: 5000,
    starBaseSize: 1.5,
    starColor: "#ffffff",
}

const maxGrassCount = 50000
const maxCloudCount = 50
const maxTreeCount = 5
const maxStarCount = 20000

// --- Scene Element Creators ---
function createMoon() {
    const moonSize = 20
    const textureSize = 128
    const canvas = document.createElement("canvas")
    canvas.width = textureSize
    canvas.height = textureSize
    const context = canvas.getContext("2d")
    if (!context) {
        throw new Error("Could not get 2D context from canvas")
    }

    const centerX = textureSize / 2
    const centerY = textureSize / 2
    const radius = textureSize * 0.4

    // Soft glow
    const grad = context.createRadialGradient(
        centerX,
        centerY,
        radius * 0.5,
        centerX,
        centerY,
        radius
    )
    grad.addColorStop(0, "rgba(255, 255, 240, 1.0)")
    grad.addColorStop(0.8, "rgba(255, 255, 240, 0.5)")
    grad.addColorStop(1, "rgba(255, 255, 240, 0)")

    context.fillStyle = grad
    context.fillRect(0, 0, textureSize, textureSize)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    })
    const geometry = new THREE.PlaneGeometry(moonSize, moonSize)
    const moon = new THREE.Mesh(geometry, material)
    return moon
}

function createStarTexture(): THREE.CanvasTexture {
    const size = 64
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) {
        throw new Error("Could not get 2D context")
    }

    const centerX = size / 2
    const centerY = size / 2
    const radius = size / 2

    const gradient = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius
    )
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)")
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)")
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)

    return new THREE.CanvasTexture(canvas)
}

function updateStarGeometry(
    geometry: THREE.BufferGeometry,
    params: {
        count: number
        baseSize: number
        color: string | number | THREE.Color
    }
) {
    const vertices = []
    const colors = []
    const sizes = []

    const radius = 300
    const baseColor = new THREE.Color(params.color)

    for (let i = 0; i < params.count; i++) {
        const x = (Math.random() - 0.5) * 2 * radius
        const y = Math.random() * radius * 0.8 + 50
        const z = (Math.random() - 0.5) * 2 * radius
        const magSq = x * x + y * y + z * z
        if (magSq > radius * radius || magSq < radius * 0.8 * (radius * 0.8)) {
            i--
            continue
        }
        vertices.push(x, y, z)

        const brightness = 0.5 + Math.random() * 0.5
        colors.push(
            baseColor.r * brightness,
            baseColor.g * brightness,
            baseColor.b * brightness
        )

        sizes.push(params.baseSize + Math.random() * 1.5)
    }

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
    )
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute(
        "particleSize",
        new THREE.Float32BufferAttribute(sizes, 1)
    )
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.attributes.particleSize.needsUpdate = true
}

function createStars(params: {
    count: number
    baseSize: number
    color: string | number | THREE.Color
}) {
    const starGeometry = new THREE.BufferGeometry()
    updateStarGeometry(starGeometry, params)

    const starTexture = createStarTexture()

    const starMaterial = new THREE.PointsMaterial({
        map: starTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false,
    })

    starMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 }
        shader.vertexShader =
            `
            attribute float particleSize;
            varying float vRand;
        \n` +
            shader.vertexShader.replace(
                "#include <project_vertex>",
                `
            vRand = (position.x + position.z) * 10.0;
            #include <project_vertex>
            gl_PointSize = particleSize * ( 200.0 / -mvPosition.z );
            `
            )
        shader.fragmentShader =
            `
            uniform float time;
            varying float vRand;
        \n` +
            shader.fragmentShader.replace(
                "vec4 diffuseColor = vec4( diffuse, opacity );",
                `
            float twinkleFactor = 0.5 * (1.0 + sin(time * 2.0 + vRand));
            twinkleFactor = pow(twinkleFactor, 2.0);
            vec4 diffuseColor = vec4( diffuse, opacity * (0.5 + 0.5 * twinkleFactor) );
            `
            )
        starMaterial.userData.shader = shader
    }

    const stars = new THREE.Points(starGeometry, starMaterial)
    stars.userData.update = (newParams: {
        count: number
        baseSize: number
        color: string | number | THREE.Color
    }) => {
        updateStarGeometry(starGeometry, newParams)
    }

    return stars
}

function createSky() {
    const sky = new Sky()
    sky.scale.setScalar(450000)
    return sky
}

function updateSunPosition(
    sky: Sky,
    directionalLight: THREE.DirectionalLight,
    elevation: number,
    azimuth: number
) {
    const sun = new THREE.Vector3()
    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    sun.setFromSphericalCoords(1, phi, theta)
    sky.material.uniforms["sunPosition"].value.copy(sun)
    directionalLight.position.copy(sun).multiplyScalar(50)
}

function createHemisphereLight() {
    return new THREE.HemisphereLight(
        initialParams.hemisphereSkyColor,
        initialParams.hemisphereGroundColor,
        initialParams.hemisphereIntensity
    )
}

function createDirectionalLight() {
    const light = new THREE.DirectionalLight(
        initialParams.sunColor,
        initialParams.lightIntensity
    )
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.top = 30
    light.shadow.camera.bottom = -30
    light.shadow.camera.left = -30
    light.shadow.camera.right = 30
    light.shadow.camera.near = 0.1
    light.shadow.camera.far = 200
    light.shadow.bias = initialParams.shadowBias
    light.shadow.radius = initialParams.shadowRadius
    return light
}

function createNeedleTexture(): THREE.CanvasTexture {
    const size = 32
    const canvas = document.createElement("canvas")
    canvas.width = 4
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) {
        throw new Error("Could not get 2D context from canvas")
    }

    context.fillStyle = "#4a6b5a"
    context.fillRect(0, 0, 4, size)

    context.fillStyle = "rgba(255, 255, 255, 0.15)"
    context.fillRect(1, 0, 1, size)

    context.fillStyle = "rgba(0, 0, 0, 0.1)"
    context.fillRect(3, 0, 1, size)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
}

function createPineTrees(
    treeGeometry: THREE.BufferGeometry,
    needleTexture: THREE.Texture,
    pondPosition: THREE.Vector3,
    pondRadius: number
) {
    const treeMaterial = new THREE.MeshToonMaterial({
        vertexColors: true,
        map: needleTexture,
    })

    treeMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 }
        shader.uniforms.uMousePos = {
            value: new THREE.Vector3(9999, 9999, 9999),
        }

        shader.vertexShader =
            `
            uniform float time;
            uniform vec3 uMousePos;
        \n` + shader.vertexShader

        shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
                #include <begin_vertex>
                
                vec4 instanceWorldPosition = instanceMatrix * vec4(position, 1.0);
                float dist = distance(instanceWorldPosition.xz, uMousePos.xz);
                float pushRadius = 6.0;
                float pushStrength = 0.4;

                if (dist < pushRadius) {
                    float falloff = 1.0 - dist / pushRadius;
                    falloff = pow(falloff, 2.0);
                    
                    vec3 pushDir = normalize(instanceWorldPosition.xyz - uMousePos);
                    pushDir.y = 0.0;
                    
                    float heightFactor = position.y / 7.5;
                    
                    transformed.xyz += pushDir * falloff * pushStrength * heightFactor;
                }
            `
        )
        treeMaterial.userData.shader = shader
    }

    const treeMesh = new THREE.InstancedMesh(
        treeGeometry,
        treeMaterial,
        maxTreeCount
    )
    treeMesh.count = initialParams.treeCount
    treeMesh.castShadow = true
    treeMesh.receiveShadow = true

    const dummy = new THREE.Object3D()
    const areaSize = 50
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z)
    const pondRadiusSq = (pondRadius + 2) * (pondRadius + 2)

    for (let i = 0; i < maxTreeCount; i++) {
        let x, z
        do {
            x = (Math.random() - 0.5) * areaSize
            z = (Math.random() - 0.5) * areaSize
        } while (
            new THREE.Vector2(x, z).distanceToSquared(pondCenter) <
                pondRadiusSq ||
            (Math.abs(x) < 20 && Math.abs(z) < 20)
        )

        dummy.position.set(x, 0, z)
        dummy.rotation.y = Math.random() * Math.PI * 2
        const scale = 1.2 + Math.random() * 0.8
        dummy.scale.set(scale, scale, scale)
        dummy.updateMatrix()
        treeMesh.setMatrixAt(i, dummy.matrix)
    }
    treeMesh.instanceMatrix.needsUpdate = true

    return treeMesh
}

type SceneElements = {
    sky: Sky
    directionalLight: THREE.DirectionalLight
    hemisphereLight: THREE.HemisphereLight
    ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>
    grassMesh: THREE.InstancedMesh
    water: Water
    clouds: THREE.Group
    pineTrees: THREE.InstancedMesh
    stars: THREE.Points
    moon: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
    bloomPass: UnrealBloomPass
    axesHelper: THREE.AxesHelper
}

function setupGUI(
    params: typeof initialParams,
    sceneElements: SceneElements,
    scene: THREE.Scene,
    updateWorldState: (time: number) => void
) {
    const {
        ground,
        grassMesh,
        water,
        clouds,
        pineTrees,
        bloomPass,
        stars,
        axesHelper,
    } = sceneElements
    const gui = new GUI()
    gui.domElement.style.top = "10px"
    gui.domElement.style.right = "10px"

    const worldFolder = gui.addFolder("World")
    worldFolder
        .add(params, "timeOfDay", 0, 24, 0.1)
        .name("Time of Day")
        .onChange(updateWorldState)

    const objectsFolder = gui.addFolder("Objects & Flora")
    objectsFolder
        .addColor(params, "groundColor")
        .name("Ground Color")
        .onChange((value) => ground.material.color.set(value))

    const waterSubFolder = objectsFolder.addFolder("Pond")
    waterSubFolder
        .add(params, "waterDistortion", 0, 8, 0.1)
        .name("Distortion")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.distortionScale.value = v
        })
    waterSubFolder.add(params, "waterFlowSpeed", 0, 2, 0.01).name("Flow Speed")
    waterSubFolder
        .add(params, "rippleIntensity", 0, 1, 0.01)
        .name("Wave Intensity")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.rippleIntensity.value = v
        })
    waterSubFolder
        .add(params, "rippleScale", 0, 20, 0.1)
        .name("Wave Scale")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.rippleScale.value = v
        })
    waterSubFolder
        .add(params, "rippleSpeed", 0, 0.2, 0.001)
        .name("Wave Speed")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.rippleSpeed.value = v
        })

    const interactiveFolder = waterSubFolder.addFolder("Interactive Ripples")
    interactiveFolder
        .add(params, "interactiveRippleRadius", 1, 10, 0.1)
        .name("Radius")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.uRippleRadius.value = v
        })
    interactiveFolder
        .add(params, "interactiveRippleStrength", 0, 0.5, 0.01)
        .name("Strength")
        .onChange((v) => {
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.uRippleStrength.value = v
        })

    const color = new THREE.Color()
    objectsFolder
        .addColor(params, "grassBaseColor")
        .name("Grass Base Color")
        .onChange((value) => {
            ;(grassMesh.material as THREE.MeshToonMaterial).color.set(value)
            for (let i = 0; i < grassMesh.count; i++) {
                color.set(value)
                color.multiplyScalar(0.8 + Math.random() * 0.4)
                grassMesh.setColorAt(i, color)
            }
            if (grassMesh.instanceColor)
                grassMesh.instanceColor.needsUpdate = true
        })
    objectsFolder
        .addColor(params, "grassTipColor")
        .name("Grass Tip Color")
        .onChange((value) => {
            const material = grassMesh.material as THREE.MeshToonMaterial
            if (material.userData.shader) {
                ;(
                    material.userData.shader as any
                ).uniforms.uGrassTipColor.value.set(value)
            }
        })
    objectsFolder
        .add(params, "grassCount", 1000, maxGrassCount, 1000)
        .name("Grass Density")
        .onChange((value) => {
            grassMesh.count = Math.floor(value)
        })
    objectsFolder
        .add(params, "treeCount", 0, maxTreeCount, 1)
        .name("Tree Density")
        .onChange((value) => {
            pineTrees.count = Math.floor(value)
        })

    const cloudsFolder = gui.addFolder("Clouds")
    cloudsFolder
        .add(params, "cloudCount", 0, maxCloudCount, 1)
        .name("Cloud Count")
        .onChange((value) => {
            if (clouds.userData.setCloudCount) {
                clouds.userData.setCloudCount(value)
            }
        })
    cloudsFolder
        .addColor(params, "cloudColor")
        .name("Cloud Color")
        .onChange((value) => {
            if (clouds.userData.setCloudColor) {
                clouds.userData.setCloudColor(value)
            }
        })

    const lightingFolder = gui.addFolder("Lighting")
    lightingFolder
        .add(params, "lightIntensity", 0, 5)
        .name("Sun Intensity")
        .onChange((value) => (sceneElements.directionalLight.intensity = value))
    lightingFolder
        .addColor(params, "sunColor")
        .name("Sun Color")
        .onChange((value) => {
            sceneElements.directionalLight.color.set(value)
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.sunColor.value.set(value)
        })
    lightingFolder
        .addColor(params, "hemisphereSkyColor")
        .name("Hemisphere Sky")
        .onChange((value) => sceneElements.hemisphereLight.color.set(value))
    lightingFolder
        .addColor(params, "hemisphereGroundColor")
        .name("Hemisphere Ground")
        .onChange((value) =>
            sceneElements.hemisphereLight.groundColor.set(value)
        )
    lightingFolder
        .add(params, "hemisphereIntensity", 0, 5, 0.1)
        .name("Hemisphere Intensity")
        .onChange((value) => (sceneElements.hemisphereLight.intensity = value))

    const skyFolder = gui.addFolder("Sky Details")
    skyFolder
        .add(params, "turbidity", 0.0, 20.0, 0.1)
        .onChange(
            () =>
                (sceneElements.sky.material.uniforms["turbidity"].value =
                    params.turbidity)
        )
    skyFolder
        .add(params, "rayleigh", 0.0, 4, 0.001)
        .onChange(
            () =>
                (sceneElements.sky.material.uniforms["rayleigh"].value =
                    params.rayleigh)
        )

    const shadowFolder = gui.addFolder("Shadows")
    shadowFolder
        .add(params, "shadowBias", -0.001, 0.001, 0.0001)
        .name("Bias")
        .onChange(
            (value) => (sceneElements.directionalLight.shadow.bias = value)
        )
    shadowFolder
        .add(params, "shadowRadius", 0, 10, 0.1)
        .name("Softness")
        .onChange(
            (value) => (sceneElements.directionalLight.shadow.radius = value)
        )

    const effectsFolder = gui.addFolder("Effects")
    effectsFolder
        .add(params, "bloomThreshold", 0, 1, 0.01)
        .name("Bloom Threshold")
        .onChange((v) => (bloomPass.threshold = v))
    effectsFolder
        .add(params, "bloomStrength", 0, 3, 0.01)
        .name("Bloom Strength")
        .onChange((v) => (bloomPass.strength = v))
    effectsFolder
        .add(params, "bloomRadius", 0, 1, 0.01)
        .name("Bloom Radius")
        .onChange((v) => (bloomPass.radius = v))

    const fogFolder = gui.addFolder("Fog")
    fogFolder
        .addColor(params, "fogColor")
        .name("Color")
        .onChange((value) => {
            if (scene.fog) {
                ;(scene.fog as THREE.FogExp2).color.set(value)
            }
            scene.background = new THREE.Color(value)
        })
    fogFolder
        .add(params, "fogDensity", 0, 0.1, 0.001)
        .name("Density")
        .onChange((value) => {
            if (scene.fog instanceof THREE.FogExp2) {
                scene.fog.density = value
            }
        })

    const debugFolder = gui.addFolder("Debug & Stars")
    debugFolder.add(axesHelper, "visible").name("Show Axes Helper")
    const updateStarParams = () => {
        if (stars.userData.update) {
            stars.userData.update({
                count: params.starCount,
                baseSize: params.starBaseSize,
                color: params.starColor,
            })
        }
    }
    debugFolder
        .add(params, "starCount", 1000, maxStarCount, 500)
        .name("Star Count")
        .onFinishChange(updateStarParams)
    debugFolder
        .add(params, "starBaseSize", 0.5, 5.0, 0.1)
        .name("Star Base Size")
        .onChange(updateStarParams)
    debugFolder
        .addColor(params, "starColor")
        .name("Star Color")
        .onChange(updateStarParams)

    return gui
}

export function ModelViewer() {
    const mountRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!mountRef.current) return

        const currentMount = mountRef.current
        let animationFrameId: number

        const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            )
        if (isMobile) {
            document.body.classList.add("is-mobile")
        }

        const gameState = { current: "spectator" } // spectator | playing
        const hoveredObject = { current: null as THREE.Object3D | null }

        // --- Core Setup ---
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(
            75,
            currentMount.clientWidth / currentMount.clientHeight,
            0.1,
            1000
        )
        const renderer = new THREE.WebGLRenderer({ antialias: true })

        const params = { ...initialParams }

        scene.fog = new THREE.FogExp2(params.fogColor, params.fogDensity)
        scene.background = new THREE.Color(params.fogColor)

        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Performance optimization for high DPI displays
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.outputColorSpace = THREE.SRGBColorSpace
        currentMount.appendChild(renderer.domElement)

        let controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.04
        controls.maxPolarAngle = Math.PI / 2 - 0.05

        controls.enablePan = false
        controls.rotateSpeed = 0.4
        controls.zoomSpeed = 0.7

        const clock = new THREE.Clock()
        const raycaster = new THREE.Raycaster()
        const mouse = new THREE.Vector2()

        // --- Create and Add Scene Objects ---
        const sky = createSky()
        scene.add(sky)

        const hemisphereLight = createHemisphereLight()
        scene.add(hemisphereLight)

        const directionalLight = createDirectionalLight()
        scene.add(directionalLight)

        const ground = createGround({ groundColor: params.groundColor })
        scene.add(ground)

        const monolith = createMonolith({ monolithColor: params.monolithColor })
        scene.add(monolith)

        const pondPosition = new THREE.Vector3(10, 0.05, 5)
        const pondRadius = 15

        const waterGeometry = new THREE.CircleGeometry(pondRadius, 64)
        const water = createWater(
            waterGeometry,
            directionalLight.position.clone().normalize(),
            params
        )
        water.position.copy(pondPosition)
        scene.add(water)

        const grassMesh = createGrass(
            pondPosition,
            pondRadius,
            {
                grassCount: params.grassCount,
                grassBaseColor: params.grassBaseColor,
                grassTipColor: params.grassTipColor,
            },
            maxGrassCount
        )
        scene.add(grassMesh)

        const pineTreeGeometry = createPineTreeGeometry()
        const needleTexture = createNeedleTexture()
        const pineTrees = createPineTrees(
            pineTreeGeometry,
            needleTexture,
            pondPosition,
            pondRadius
        )
        scene.add(pineTrees)

        const clouds = createClouds({
            count: params.cloudCount,
            color: params.cloudColor,
        })
        scene.add(clouds)

        const stars = createStars({
            count: params.starCount,
            baseSize: params.starBaseSize,
            color: params.starColor,
        })
        scene.add(stars)

        const moon = createMoon()
        scene.add(moon)

        const axesHelper = new THREE.AxesHelper(5)
        axesHelper.visible = false
        scene.add(axesHelper)

        // --- Post-processing ---
        const composer = new EffectComposer(renderer)
        const renderPass = new RenderPass(scene, camera)
        composer.addPass(renderPass)

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(
                currentMount.clientWidth,
                currentMount.clientHeight
            ),
            params.bloomStrength,
            params.bloomRadius,
            params.bloomThreshold
        )
        composer.addPass(bloomPass)

        // --- Game Mechanics Setup ---
        const game = new Game(
            scene,
            camera,
            monolith,
            { position: pondPosition, radius: pondRadius },
            renderer,
            composer,
            isMobile
        )

        // --- Camera ---
        camera.position.set(-15, 4, 15)
        controls.target.copy(new THREE.Vector3(0, 1.5, 0))
        controls.update()

        const sceneElements: SceneElements = {
            sky,
            directionalLight,
            hemisphereLight,
            ground,
            grassMesh,
            water,
            clouds,
            pineTrees,
            stars,
            moon,
            bloomPass,
            axesHelper,
        }

        // --- Day/Night Cycle Logic ---
        const dayNightPalettes = {
            day: {
                sunColor: new THREE.Color("#ffcb8e"),
                hemisphereSky: new THREE.Color("#bde0fe"),
                hemisphereGround: new THREE.Color("#6a994e"),
                fog: new THREE.Color("#c5d1d9"),
                cloud: new THREE.Color("#ffffff"),
            },
            sunset: {
                sunColor: new THREE.Color("#ff6b00"),
                hemisphereSky: new THREE.Color("#ff8c69"),
                hemisphereGround: new THREE.Color("#5e4534"),
                fog: new THREE.Color("#f2b279"),
                cloud: new THREE.Color("#ffdab9"),
            },
            night: {
                sunColor: new THREE.Color("#aaccff"), // Moonlight
                hemisphereSky: new THREE.Color("#0a2a4f"),
                hemisphereGround: new THREE.Color("#102820"),
                fog: new THREE.Color("#08141e"),
                cloud: new THREE.Color("#2c3e50"),
            },
        }

        const updateWorldState = (timeOfDay: number) => {
            params.timeOfDay = timeOfDay

            let elevation,
                turbidity,
                directIntensity,
                hemiIntensity,
                starOpacity

            if (timeOfDay >= 5 && timeOfDay < 7) {
                // Sunrise
                const t = (timeOfDay - 5) / 2
                elevation = THREE.MathUtils.lerp(-2, 10, t)
                turbidity = THREE.MathUtils.lerp(15, 10, t)
                directIntensity = THREE.MathUtils.lerp(0.25, 1.5, t)
                hemiIntensity = THREE.MathUtils.lerp(0.4, 0.6, t)
                starOpacity = THREE.MathUtils.lerp(1.0, 0, t)
                directionalLight.color.lerpColors(
                    dayNightPalettes.sunset.sunColor,
                    dayNightPalettes.day.sunColor,
                    t
                )
                hemisphereLight.color.lerpColors(
                    dayNightPalettes.night.hemisphereSky,
                    dayNightPalettes.day.hemisphereSky,
                    t
                )
                hemisphereLight.groundColor.lerpColors(
                    dayNightPalettes.night.hemisphereGround,
                    dayNightPalettes.day.hemisphereGround,
                    t
                )
                ;(scene.fog as THREE.FogExp2).color.lerpColors(
                    dayNightPalettes.night.fog,
                    dayNightPalettes.day.fog,
                    t
                )
                clouds.userData.setCloudColor(
                    new THREE.Color().lerpColors(
                        dayNightPalettes.night.cloud,
                        dayNightPalettes.day.cloud,
                        t
                    )
                )
            } else if (timeOfDay >= 7 && timeOfDay < 18) {
                // Day
                elevation = 10
                turbidity = 10
                directIntensity = 1.5
                hemiIntensity = 0.6
                starOpacity = 0
                directionalLight.color.copy(dayNightPalettes.day.sunColor)
                hemisphereLight.color.copy(dayNightPalettes.day.hemisphereSky)
                hemisphereLight.groundColor.copy(
                    dayNightPalettes.day.hemisphereGround
                )
                ;(scene.fog as THREE.FogExp2).color.copy(
                    dayNightPalettes.day.fog
                )
                clouds.userData.setCloudColor(dayNightPalettes.day.cloud)
            } else if (timeOfDay >= 18 && timeOfDay < 20) {
                // Sunset
                const t = (timeOfDay - 18) / 2
                elevation = THREE.MathUtils.lerp(10, -2, t)
                turbidity = THREE.MathUtils.lerp(10, 15, t)
                directIntensity = THREE.MathUtils.lerp(1.5, 0.25, t)
                hemiIntensity = THREE.MathUtils.lerp(0.6, 0.4, t)
                starOpacity = THREE.MathUtils.lerp(0, 1.0, t)
                directionalLight.color.lerpColors(
                    dayNightPalettes.day.sunColor,
                    dayNightPalettes.sunset.sunColor,
                    t
                )
                hemisphereLight.color.lerpColors(
                    dayNightPalettes.day.hemisphereSky,
                    dayNightPalettes.night.hemisphereSky,
                    t
                )
                hemisphereLight.groundColor.lerpColors(
                    dayNightPalettes.day.hemisphereGround,
                    dayNightPalettes.night.hemisphereGround,
                    t
                )
                ;(scene.fog as THREE.FogExp2).color.lerpColors(
                    dayNightPalettes.day.fog,
                    dayNightPalettes.night.fog,
                    t
                )
                clouds.userData.setCloudColor(
                    new THREE.Color().lerpColors(
                        dayNightPalettes.day.cloud,
                        dayNightPalettes.night.cloud,
                        t
                    )
                )
            } else {
                // Night
                elevation = -2
                turbidity = 15
                directIntensity = 0.25
                hemiIntensity = 0.4
                starOpacity = 1.0
                directionalLight.color.copy(dayNightPalettes.night.sunColor)
                hemisphereLight.color.copy(dayNightPalettes.night.hemisphereSky)
                hemisphereLight.groundColor.copy(
                    dayNightPalettes.night.hemisphereGround
                )
                ;(scene.fog as THREE.FogExp2).color.copy(
                    dayNightPalettes.night.fog
                )
                clouds.userData.setCloudColor(dayNightPalettes.night.cloud)
            }

            sky.material.uniforms["turbidity"].value = turbidity
            sky.material.uniforms["rayleigh"].value =
                elevation > 0 ? 0.582 : 0.1
            directionalLight.intensity = directIntensity
            hemisphereLight.intensity = hemiIntensity
            ;(stars.material as THREE.PointsMaterial).opacity = starOpacity
            scene.background = (scene.fog as THREE.FogExp2).color

            updateSunPosition(sky, directionalLight, elevation, params.azimuth)

            const sunVec = sky.material.uniforms.sunPosition.value.clone()
            const moonPosition = sunVec.clone().negate().multiplyScalar(200)
            moon.position.copy(moonPosition)
            ;(moon.material as THREE.MeshBasicMaterial).opacity = starOpacity

            const sunDirection = directionalLight.position.clone().normalize()
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.sunDirection.value.copy(sunDirection)
            ;(
                water.material as THREE.ShaderMaterial
            ).uniforms.sunColor.value.copy(directionalLight.color)
        }

        updateWorldState(params.timeOfDay)
        const gui = setupGUI(params, sceneElements, scene, updateWorldState)

        const animateSpectator = () => {
            animationFrameId = requestAnimationFrame(animateSpectator)
            const elapsedTime = clock.getElapsedTime()
            const delta = clock.getDelta()

            // --- Universal visual updates ---
            const grassMaterial = grassMesh.material as THREE.MeshToonMaterial
            const treeMaterial = pineTrees.material as THREE.MeshToonMaterial
            const starMaterial = stars.material as THREE.PointsMaterial

            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.time.value = elapsedTime
                grassMaterial.userData.shader.uniforms.uSunDirection.value
                    .copy(sceneElements.directionalLight.position)
                    .normalize()
            }
            if (treeMaterial.userData.shader) {
                treeMaterial.userData.shader.uniforms.time.value = elapsedTime
            }
            if (starMaterial.userData.shader) {
                starMaterial.userData.shader.uniforms.time.value = elapsedTime
            }
            if (water.material) {
                ;(water.material as THREE.ShaderMaterial).uniforms.time.value +=
                    delta * params.waterFlowSpeed
            }
            if (clouds.userData.update) clouds.userData.update(delta, camera)
            stars.rotation.y = elapsedTime * 0.01
            if ((moon.material as THREE.MeshBasicMaterial).opacity > 0)
                moon.lookAt(camera.position)

            // --- Spectator-only logic ---
            controls.update()
            
            game.updateHover(delta);

            raycaster.setFromCamera(mouse, camera)

            // Player hover logic
            const intersectsPlayer = raycaster.intersectObject(game.player)
            const isHovering = intersectsPlayer.length > 0
            if (isHovering && hoveredObject.current !== game.player) {
                hoveredObject.current = game.player
                game.setPlayerHover(true)
                currentMount.style.cursor = "pointer"
            } else if (!isHovering && hoveredObject.current) {
                hoveredObject.current = null
                game.setPlayerHover(false)
                currentMount.style.cursor = "default"
            }

            // Environmental interaction logic
            const intersectsEnv = raycaster.intersectObjects([ground, water])
            if (grassMaterial.userData.shader)
                grassMaterial.userData.shader.uniforms.uMousePos.value.set(
                    9999,
                    9999,
                    9999
                )
            if (treeMaterial.userData.shader)
                treeMaterial.userData.shader.uniforms.uMousePos.value.set(
                    9999,
                    9999,
                    9999
                )
            if (water.material)
                (
                    water.material as THREE.ShaderMaterial
                ).uniforms.uMousePos.value.set(9999, 9999, 9999)

            const groundIntersect = intersectsEnv.find(
                (i) => i.object === ground
            )
            if (groundIntersect) {
                const interactPoint = groundIntersect.point
                if (grassMaterial.userData.shader)
                    grassMaterial.userData.shader.uniforms.uMousePos.value.copy(
                        interactPoint
                    )
                if (treeMaterial.userData.shader)
                    treeMaterial.userData.shader.uniforms.uMousePos.value.copy(
                        interactPoint
                    )
            }
            const waterIntersect = intersectsEnv.find((i) => i.object === water)
            if (waterIntersect && water.material)
                (
                    water.material as THREE.ShaderMaterial
                ).uniforms.uMousePos.value.copy(waterIntersect.point)

            composer.render()
        }
        animateSpectator()

        const handleResize = () => {
            if (!currentMount) return
            const width = currentMount.clientWidth
            const height = currentMount.clientHeight
            camera.aspect = width / height
            camera.updateProjectionMatrix()
            renderer.setSize(width, height)
            composer.setSize(width, height)
            bloomPass.setSize(width, height)
        }
        const handleMouseMove = (event: MouseEvent) => {
            if (gameState.current !== "spectator") return
            mouse.x = (event.clientX / currentMount.clientWidth) * 2 - 1
            mouse.y = -(event.clientY / currentMount.clientHeight) * 2 + 1
        }

        const handleClick = () => {
            if (
                gameState.current === "spectator" &&
                hoveredObject.current === game.player
            ) {
                if (isMobile) {
                    // Bypass pointer lock for mobile, start game directly
                    controls.dispose()
                    gameState.current = "playing"

                    cancelAnimationFrame(animationFrameId)
                    game.startGame()

                    document.body.classList.add("playing")
                    if (hoveredObject.current) {
                        game.setPlayerHover(false)
                        hoveredObject.current = null
                        currentMount.style.cursor = "default"
                    }
                } else {
                    document.body.requestPointerLock()
                }
            }
        }

        const handlePointerLockChange = () => {
            if (document.pointerLockElement === document.body) {
                controls.dispose()
                gameState.current = "playing"

                cancelAnimationFrame(animationFrameId)
                game.startGame()

                document.body.classList.add("playing")
                if (hoveredObject.current) {
                    game.setPlayerHover(false)
                    hoveredObject.current = null
                    currentMount.style.cursor = "default"
                }
            } else {
                if (isMobile) return // Don't react to pointer lock changes on mobile

                gameState.current = "spectator"
                game.stopGame()

                // Reset camera to a good spectator position
                camera.position.set(-15, 4, 15)

                controls = new OrbitControls(camera, renderer.domElement)
                controls.enableDamping = true
                controls.dampingFactor = 0.04
                controls.maxPolarAngle = Math.PI / 2 - 0.05
                controls.enablePan = false
                controls.rotateSpeed = 0.4
                controls.zoomSpeed = 0.7
                controls.target.copy(new THREE.Vector3(0, 1.5, 0))
                controls.update()

                document.body.classList.remove("playing")
                animateSpectator()
            }
        }

        window.addEventListener("resize", handleResize)
        window.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("click", handleClick)
        document.addEventListener(
            "pointerlockchange",
            handlePointerLockChange,
            false
        )

        return () => {
            cancelAnimationFrame(animationFrameId)
            window.removeEventListener("resize", handleResize)
            window.removeEventListener("mousemove", handleMouseMove)
            document.removeEventListener("click", handleClick)
            document.removeEventListener(
                "pointerlockchange",
                handlePointerLockChange,
                false
            )

            game.dispose()

            if (currentMount && renderer.domElement)
                currentMount.removeChild(renderer.domElement)
            gui.destroy()
            controls.dispose()

            pineTreeGeometry.dispose()
            needleTexture.dispose()
            stars.geometry.dispose()
            ;(stars.material as THREE.PointsMaterial).map?.dispose()
            ;(stars.material as THREE.Material).dispose()
            moon.geometry.dispose()
            ;(moon.material as THREE.Material).dispose()

            scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose()
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach((material) =>
                                material.dispose()
                            )
                        } else {
                            ;(object.material as THREE.Material).dispose()
                        }
                    }
                }
            })
            renderer.dispose()
        }
    }, [])

    return (
        <>
            <style>{`
      .lil-gui {
        --widget-color: #4f8f4f;
        --hover-color: #63b363;
        --focus-color: #77d777;
        --font-size: 14px;
      }
      #ui-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        color: white;
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.7);
        font-weight: 500;
      }
      #score, #instructions {
        opacity: 0;
        transition: opacity 0.5s ease-in-out;
      }
      body.playing #score {
        opacity: 1;
      }
      body.playing:not(.is-mobile) #instructions {
          opacity: 1;
      }
      #score {
        position: absolute;
        top: 20px;
        left: 20px;
        font-size: 1.5em;
      }
      #instructions {
        position: absolute;
        bottom: 20px;
        width: 100%;
        text-align: center;
        font-size: 1.1em;
      }
      #win-screen {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: none; /* Toggled by JS */
        flex-direction: column;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 1000;
        overflow: hidden;
      }
      #win-message {
        font-size: 3em;
        color: #fff;
        text-shadow: 0 0 10px #ffc, 0 0 20px #ffc, 0 0 30px #ff0, 2px 2px 4px rgba(0,0,0,0.8);
        font-family: 'Georgia', serif;
        text-align: center;
        animation: fadeInOut 5s forwards;
        opacity: 0;
        padding: 20px;
      }
      @keyframes fadeInOut {
        0% { opacity: 0; transform: scale(0.8); }
        20% { opacity: 1; transform: scale(1.05); }
        80% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.9); }
      }

      #confetti-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          pointer-events: none;
      }
      .confetti {
          position: absolute;
          width: 10px;
          height: 20px;
          opacity: 0;
          animation: fall 5s ease-out forwards;
      }
      @keyframes fall {
          0% { transform: translateY(-10vh) rotateZ(0deg) rotateY(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotateZ(720deg) rotateY(360deg); opacity: 0; }
      }
      
      /* --- Mobile Controls --- */
      #mobile-controls {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: auto;
        pointer-events: none;
        display: none;
        justify-content: space-between;
        align-items: flex-end;
        padding: 20px;
        box-sizing: border-box;
        z-index: 100;
      }
      body.is-mobile.playing #mobile-controls {
        display: flex;
      }

      #joystick, #jump-control {
        pointer-events: auto;
      }
      
      #joystick {
        position: relative;
        width: 135px;
        height: 135px;
      }

      .joy-btn, .jump-btn {
        display: flex;
        justify-content: center;
        align-items: center;
        color: white;
        font-size: 2em;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        transition: background-color 0.1s ease-out;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      }
      .joy-btn:active, .jump-btn:active {
         background: rgba(255, 255, 255, 0.3);
      }
      
      .joy-btn {
        position: absolute;
        width: 45px;
        height: 45px;
        border-radius: 10px;
      }
      
      #joy-w { top: 0; left: 45px; }
      #joy-a { top: 45px; left: 0; }
      #joy-s { top: 45px; left: 90px; }
      #joy-d { top: 90px; left: 45px; }

      #jump-control {
          padding-right: 20px;
          padding-bottom: 10px;
      }

      .jump-btn {
        width: 80px;
        height: 80px;
        border-radius: 50%;
      }
    `}</style>
            <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
            <div id="ui-container">
                <div id="score">Score: 0</div>
                <div id="instructions">
                    WASD to Move &nbsp;&nbsp;|&nbsp;&nbsp; Space to Jump
                    &nbsp;&nbsp;|&nbsp;&nbsp; Mouse to Look
                </div>
            </div>
            <div id="win-screen">
                <div id="win-message"></div>
                <div id="confetti-container"></div>
            </div>
            <div id="mobile-controls">
                <div id="joystick">
                    <div className="joy-btn" id="joy-w">
                        ▲
                    </div>
                    <div className="joy-btn" id="joy-a">
                        ◄
                    </div>
                    <div className="joy-btn" id="joy-s">
                        ►
                    </div>
                    <div className="joy-btn" id="joy-d">
                        ▼
                    </div>
                </div>
                <div id="jump-control">
                    <div className="jump-btn" id="jump-btn">
                        ↑
                    </div>
                </div>
            </div>
        </>
    )
}

export default ModelViewer

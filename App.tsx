
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createClouds } from './Clouds';
import { createWater } from './Water';
import { Water } from 'three/addons/objects/Water.js';
import { createPineTreeGeometry } from './pinetree';
import { createGrass } from './grass';
import { createGround, createMonolith } from './land';
import { Box3 } from 'three';


// --- Configuration ---
const initialParams = {
    // World
    timeOfDay: 10.0, // 0-24 hours, 10 AM

    // Default Preset Values
    groundColor: '#2fa753',
    monolithColor: '#586F7C',
    grassBaseColor: '#a7c957',
    grassTipColor: '#55aa6f',

    // Lighting
    lightIntensity: 1.5,
    sunColor: '#ffcb8e',
    hemisphereSkyColor: '#bde0fe',
    hemisphereGroundColor: '#6a994e',
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
    bloomThreshold: 0.85,
    bloomRadius: 0.3,

    // Water Ripples
    waterFlowSpeed: 0.5,
    rippleIntensity: 0.1,
    rippleScale: 2.0,
    rippleSpeed: 0.03,
    interactiveRippleRadius: 5.0,
    interactiveRippleStrength: 0.15,
    waterDistortion: 0.0,

    // Clouds
    cloudColor: '#ffffff',
    cloudCount: 10,

    // Fog
    fogColor: '#c5d1d9',
    fogDensity: 0.015,
    
    // Stars
    starCount: 5000,
    starBaseSize: 1.5,
    starColor: '#ffffff',
};

const maxGrassCount = 50000;
const maxCloudCount = 50;
const maxTreeCount = 5;
const maxStarCount = 20000;


// --- Scene Element Creators ---
function createMoon() {
    const moonSize = 20;
    const textureSize = 128;
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get 2D context from canvas');
    }

    const centerX = textureSize / 2;
    const centerY = textureSize / 2;
    const radius = textureSize * 0.4;

    // Soft glow
    const grad = context.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
    grad.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
    grad.addColorStop(0.8, 'rgba(255, 255, 240, 0.5)');
    grad.addColorStop(1, 'rgba(255, 255, 240, 0)');

    context.fillStyle = grad;
    context.fillRect(0, 0, textureSize, textureSize);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(moonSize, moonSize);
    const moon = new THREE.Mesh(geometry, material);
    return moon;
}

function createStarTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get 2D context');
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
}

function updateStarGeometry(geometry: THREE.BufferGeometry, params: { count: number; baseSize: number; color: string | number | THREE.Color }) {
    const vertices = [];
    const colors = [];
    const sizes = [];

    const radius = 300;
    const baseColor = new THREE.Color(params.color);

    for (let i = 0; i < params.count; i++) {
        const x = (Math.random() - 0.5) * 2 * radius;
        const y = Math.random() * radius * 0.8 + 50;
        const z = (Math.random() - 0.5) * 2 * radius;
        const magSq = x * x + y * y + z * z;
        if (magSq > radius * radius || magSq < (radius * 0.8) * (radius * 0.8)) {
            i--;
            continue;
        }
        vertices.push(x, y, z);

        const brightness = 0.5 + Math.random() * 0.5;
        colors.push(baseColor.r * brightness, baseColor.g * brightness, baseColor.b * brightness);

        sizes.push(params.baseSize + Math.random() * 1.5);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('particleSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.particleSize.needsUpdate = true;
}

function createStars(params: { count: number; baseSize: number; color: string | number | THREE.Color }) {
    const starGeometry = new THREE.BufferGeometry();
    updateStarGeometry(starGeometry, params);
    
    const starTexture = createStarTexture();

    const starMaterial = new THREE.PointsMaterial({
        map: starTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false,
    });
    
    starMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 };
        shader.vertexShader = `
            attribute float particleSize;
            varying float vRand;
        \n` + shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            vRand = (position.x + position.z) * 10.0;
            #include <project_vertex>
            gl_PointSize = particleSize * ( 200.0 / -mvPosition.z );
            `
        );
        shader.fragmentShader = `
            uniform float time;
            varying float vRand;
        \n` + shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            `
            float twinkleFactor = 0.5 * (1.0 + sin(time * 2.0 + vRand));
            twinkleFactor = pow(twinkleFactor, 2.0);
            vec4 diffuseColor = vec4( diffuse, opacity * (0.5 + 0.5 * twinkleFactor) );
            `
        );
        starMaterial.userData.shader = shader;
    };


    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.userData.update = (newParams: { count: number; baseSize: number; color: string | number | THREE.Color }) => {
        updateStarGeometry(starGeometry, newParams);
    };

    return stars;
}

function createSky() {
    const sky = new Sky();
    sky.scale.setScalar(450000);
    return sky;
}

function updateSunPosition(sky: Sky, directionalLight: THREE.DirectionalLight, elevation: number, azimuth: number) {
    const sun = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    directionalLight.position.copy(sun).multiplyScalar(50);
}

function createHemisphereLight() {
    return new THREE.HemisphereLight(
        initialParams.hemisphereSkyColor,
        initialParams.hemisphereGroundColor,
        initialParams.hemisphereIntensity
    );
}

function createDirectionalLight() {
    const light = new THREE.DirectionalLight(initialParams.sunColor, initialParams.lightIntensity);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.top = 30;
    light.shadow.camera.bottom = -30;
    light.shadow.camera.left = -30;
    light.shadow.camera.right = 30;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 200;
    light.shadow.bias = initialParams.shadowBias;
    light.shadow.radius = initialParams.shadowRadius;
    return light;
}

function createNeedleTexture(): THREE.CanvasTexture {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get 2D context from canvas');
    }

    context.fillStyle = '#4a6b5a';
    context.fillRect(0, 0, 4, size);

    context.fillStyle = 'rgba(255, 255, 255, 0.15)';
    context.fillRect(1, 0, 1, size);
    
    context.fillStyle = 'rgba(0, 0, 0, 0.1)';
    context.fillRect(3, 0, 1, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}

function createPineTrees(treeGeometry: THREE.BufferGeometry, needleTexture: THREE.Texture, pondPosition: THREE.Vector3, pondRadius: number) {
    const treeMaterial = new THREE.MeshToonMaterial({
        vertexColors: true,
        map: needleTexture,
    });

    treeMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 };
        shader.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };

        shader.vertexShader = `
            uniform float time;
            uniform vec3 uMousePos;
        \n` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
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
        );
        treeMaterial.userData.shader = shader;
    };

    const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, maxTreeCount);
    treeMesh.count = initialParams.treeCount;
    treeMesh.castShadow = true;
    treeMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const areaSize = 50;
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z);
    const pondRadiusSq = (pondRadius + 2) * (pondRadius + 2);

    for (let i = 0; i < maxTreeCount; i++) {
        let x, z;
        do {
            x = (Math.random() - 0.5) * areaSize;
            z = (Math.random() - 0.5) * areaSize;
        } while (new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq || Math.abs(x) < 20 && Math.abs(z) < 20);

        dummy.position.set(x, 0, z);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        const scale = 1.2 + Math.random() * 0.8;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        treeMesh.setMatrixAt(i, dummy.matrix);
    }
    treeMesh.instanceMatrix.needsUpdate = true;
    
    return treeMesh;
}

type SceneElements = {
    sky: Sky;
    directionalLight: THREE.DirectionalLight;
    hemisphereLight: THREE.HemisphereLight;
    ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
    grassMesh: THREE.InstancedMesh;
    water: Water;
    clouds: THREE.Group;
    pineTrees: THREE.InstancedMesh;
    stars: THREE.Points;
    moon: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    bloomPass: UnrealBloomPass;
    axesHelper: THREE.AxesHelper;
};

function setupGUI(params: typeof initialParams, sceneElements: SceneElements, scene: THREE.Scene, updateWorldState: (time: number) => void) {
    const { ground, grassMesh, water, clouds, pineTrees, bloomPass, stars, axesHelper } = sceneElements;
    const gui = new GUI();
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';

    const worldFolder = gui.addFolder('World');
    worldFolder.add(params, 'timeOfDay', 0, 24, 0.1).name('Time of Day').onChange(updateWorldState);

    const objectsFolder = gui.addFolder('Objects & Flora');
    objectsFolder.addColor(params, 'groundColor').name('Ground Color').onChange((value) => ground.material.color.set(value));

    const waterSubFolder = objectsFolder.addFolder('Pond');
    waterSubFolder.add(params, 'waterDistortion', 0, 8, 0.1).name('Distortion').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.distortionScale.value = v;
    });
    waterSubFolder.add(params, 'waterFlowSpeed', 0, 2, 0.01).name('Flow Speed');
    waterSubFolder.add(params, 'rippleIntensity', 0, 1, 0.01).name('Wave Intensity').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.rippleIntensity.value = v;
    });
    waterSubFolder.add(params, 'rippleScale', 0, 20, 0.1).name('Wave Scale').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.rippleScale.value = v;
    });
    waterSubFolder.add(params, 'rippleSpeed', 0, 0.2, 0.001).name('Wave Speed').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.rippleSpeed.value = v;
    });

    const interactiveFolder = waterSubFolder.addFolder('Interactive Ripples');
    interactiveFolder.add(params, 'interactiveRippleRadius', 1, 10, 0.1).name('Radius').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.uRippleRadius.value = v;
    });
    interactiveFolder.add(params, 'interactiveRippleStrength', 0, 0.5, 0.01).name('Strength').onChange(v => {
        (water.material as THREE.ShaderMaterial).uniforms.uRippleStrength.value = v;
    });


    const color = new THREE.Color();
    objectsFolder.addColor(params, 'grassBaseColor').name('Grass Base Color').onChange((value) => {
        (grassMesh.material as THREE.MeshToonMaterial).color.set(value);
        for (let i = 0; i < grassMesh.count; i++) {
            color.set(value);
            color.multiplyScalar(0.8 + Math.random() * 0.4);
            grassMesh.setColorAt(i, color);
        }
        if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    });
     objectsFolder.addColor(params, 'grassTipColor').name('Grass Tip Color').onChange((value) => {
        const material = grassMesh.material as THREE.MeshToonMaterial;
        if (material.userData.shader) {
            (material.userData.shader as any).uniforms.uGrassTipColor.value.set(value);
        }
    });
    objectsFolder.add(params, 'grassCount', 1000, maxGrassCount, 1000).name('Grass Density').onChange((value) => {
        grassMesh.count = Math.floor(value);
    });
    objectsFolder.add(params, 'treeCount', 0, maxTreeCount, 1).name('Tree Density').onChange((value) => {
        pineTrees.count = Math.floor(value);
    });

    const cloudsFolder = gui.addFolder('Clouds');
    cloudsFolder.add(params, 'cloudCount', 0, maxCloudCount, 1).name('Cloud Count').onChange((value) => {
        if (clouds.userData.setCloudCount) {
            clouds.userData.setCloudCount(value);
        }
    });
    cloudsFolder.addColor(params, 'cloudColor').name('Cloud Color').onChange((value) => {
        if (clouds.userData.setCloudColor) {
            clouds.userData.setCloudColor(value);
        }
    });

    const lightingFolder = gui.addFolder('Lighting');
    lightingFolder.add(params, 'lightIntensity', 0, 5).name('Sun Intensity').onChange((value) => sceneElements.directionalLight.intensity = value);
    lightingFolder.addColor(params, 'sunColor').name('Sun Color').onChange(value => {
        sceneElements.directionalLight.color.set(value);
        (water.material as THREE.ShaderMaterial).uniforms.sunColor.value.set(value);
    });
    lightingFolder.addColor(params, 'hemisphereSkyColor').name('Hemisphere Sky').onChange(value => sceneElements.hemisphereLight.color.set(value));
    lightingFolder.addColor(params, 'hemisphereGroundColor').name('Hemisphere Ground').onChange(value => sceneElements.hemisphereLight.groundColor.set(value));
    lightingFolder.add(params, 'hemisphereIntensity', 0, 5, 0.1).name('Hemisphere Intensity').onChange(value => sceneElements.hemisphereLight.intensity = value);
   
    const skyFolder = gui.addFolder('Sky Details');
    skyFolder.add(params, 'turbidity', 0.0, 20.0, 0.1).onChange(() => sceneElements.sky.material.uniforms['turbidity'].value = params.turbidity);
    skyFolder.add(params, 'rayleigh', 0.0, 4, 0.001).onChange(() => sceneElements.sky.material.uniforms['rayleigh'].value = params.rayleigh);
    
    const shadowFolder = gui.addFolder('Shadows');
    shadowFolder.add(params, 'shadowBias', -0.001, 0.001, 0.0001).name('Bias').onChange(value => sceneElements.directionalLight.shadow.bias = value);
    shadowFolder.add(params, 'shadowRadius', 0, 10, 0.1).name('Softness').onChange(value => sceneElements.directionalLight.shadow.radius = value);
    
    const effectsFolder = gui.addFolder('Effects');
    effectsFolder.add(params, 'bloomThreshold', 0, 1, 0.01).name('Bloom Threshold').onChange(v => bloomPass.threshold = v);
    effectsFolder.add(params, 'bloomStrength', 0, 3, 0.01).name('Bloom Strength').onChange(v => bloomPass.strength = v);
    effectsFolder.add(params, 'bloomRadius', 0, 1, 0.01).name('Bloom Radius').onChange(v => bloomPass.radius = v);

    const fogFolder = gui.addFolder('Fog');
    fogFolder.addColor(params, 'fogColor').name('Color').onChange((value) => {
        if (scene.fog) {
            (scene.fog as THREE.FogExp2).color.set(value);
        }
        scene.background = new THREE.Color(value);
    });
    fogFolder.add(params, 'fogDensity', 0, 0.1, 0.001).name('Density').onChange((value) => {
        if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.density = value;
        }
    });

    const debugFolder = gui.addFolder('Debug & Stars');
    debugFolder.add(axesHelper, 'visible').name('Show Axes Helper');
    const updateStarParams = () => {
        if (stars.userData.update) {
            stars.userData.update({
                count: params.starCount,
                baseSize: params.starBaseSize,
                color: params.starColor,
            });
        }
    };
    debugFolder.add(params, 'starCount', 1000, maxStarCount, 500).name('Star Count').onFinishChange(updateStarParams);
    debugFolder.add(params, 'starBaseSize', 0.5, 5.0, 0.1).name('Star Base Size').onChange(updateStarParams);
    debugFolder.addColor(params, 'starColor').name('Star Color').onChange(updateStarParams);

    return gui;
}


const App: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;
        let animationFrameId: number;

        // --- Core Setup ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        
        const params = { ...initialParams };

        scene.fog = new THREE.FogExp2(params.fogColor, params.fogDensity);
        scene.background = new THREE.Color(params.fogColor);

        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        currentMount.appendChild(renderer.domElement);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.04;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        
        controls.enablePan = false;
        controls.minDistance = 5;
        controls.maxDistance = 60;
        controls.rotateSpeed = 0.4;
        controls.zoomSpeed = 0.7;

        const clock = new THREE.Clock();
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        // --- Create and Add Scene Objects ---
        const sky = createSky();
        scene.add(sky);
        
        const hemisphereLight = createHemisphereLight();
        scene.add(hemisphereLight);
        
        const directionalLight = createDirectionalLight();
        scene.add(directionalLight);
        
        const ground = createGround({ groundColor: params.groundColor });
        scene.add(ground);
        
        const monolith = createMonolith({ monolithColor: params.monolithColor });
        scene.add(monolith);

        const pondPosition = new THREE.Vector3(10, 0.05, 5);
        const pondRadius = 15;

        const waterGeometry = new THREE.CircleGeometry(pondRadius, 64);
        const water = createWater(
            waterGeometry,
            directionalLight.position.clone().normalize(),
            params
        );
        water.position.copy(pondPosition);
        scene.add(water);

        const grassMesh = createGrass(
            pondPosition,
            pondRadius,
            {
                grassCount: params.grassCount,
                grassBaseColor: params.grassBaseColor,
                grassTipColor: params.grassTipColor,
            },
            maxGrassCount
        );
        scene.add(grassMesh);

        const pineTreeGeometry = createPineTreeGeometry();
        const needleTexture = createNeedleTexture();
        const pineTrees = createPineTrees(pineTreeGeometry, needleTexture, pondPosition, pondRadius);
        scene.add(pineTrees);

        const clouds = createClouds({
            count: params.cloudCount,
            color: params.cloudColor,
        });
        scene.add(clouds);
        
        const stars = createStars({
            count: params.starCount,
            baseSize: params.starBaseSize,
            color: params.starColor,
        });
        scene.add(stars);

        const moon = createMoon();
        scene.add(moon);
        
        const axesHelper = new THREE.AxesHelper(5);
        axesHelper.visible = false;
        scene.add(axesHelper);

        // --- Game Mechanics Setup ---
        const playerSize = 1.0;
        const playerGeometry = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
        const playerMaterial = new THREE.MeshToonMaterial({ color: '#fca311' });
        const player = new THREE.Mesh(playerGeometry, playerMaterial);
        player.position.set(0, playerSize / 2, 5);
        player.castShadow = true;
        scene.add(player);

        const playerState = {
            velocity: new THREE.Vector3(),
            onGround: false,
        };

        const keysPressed = { w: false, a: false, s: false, d: false, ' ': false };
        
        const ORB_COUNT = 5;
        const orbs: THREE.Mesh[] = [];
        const orbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const orbMaterial = new THREE.MeshBasicMaterial({ color: '#ffff88', toneMapped: false });
        let score = 0;

        const scoreElement = document.getElementById('score');
        const instructionsElement = document.getElementById('instructions');

        const spawnOrbs = () => {
            orbs.forEach(orb => scene.remove(orb));
            orbs.length = 0;
            const monolithBBox = new Box3().setFromObject(monolith);
            const areaSize = 45;
            const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z);
            const pondRadiusSq = (pondRadius + 1) * (pondRadius + 1);

            for (let i = 0; i < ORB_COUNT; i++) {
                const orb = new THREE.Mesh(orbGeometry, orbMaterial);
                let validPosition = false;
                while (!validPosition) {
                    const x = (Math.random() - 0.5) * areaSize;
                    const z = (Math.random() - 0.5) * areaSize;
                    const orbPos = new THREE.Vector3(x, 1.5, z);
                    const inPond = new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq;
                    const inMonolith = monolithBBox.distanceToPoint(orbPos) < 2.0;
                    if (!inPond && !inMonolith) {
                        orb.position.copy(orbPos);
                        validPosition = true;
                    }
                }
                orbs.push(orb);
                scene.add(orb);
            }
            score = 0;
            if (scoreElement) scoreElement.innerText = `Orbs: 0 / ${ORB_COUNT}`;
        };
        spawnOrbs();

        // --- Post-processing ---
        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
            params.bloomStrength,
            params.bloomRadius,
            params.bloomThreshold
        );
        composer.addPass(bloomPass);


        // --- Camera ---
        camera.position.set(-15, 4, 15);
        controls.target.copy(player.position);
        controls.update();
        
        const sceneElements: SceneElements = { sky, directionalLight, hemisphereLight, ground, grassMesh, water, clouds, pineTrees, stars, moon, bloomPass, axesHelper };

        // --- Day/Night Cycle Logic ---
        const dayNightPalettes = {
            day: {
                sunColor: new THREE.Color('#ffcb8e'),
                hemisphereSky: new THREE.Color('#bde0fe'),
                hemisphereGround: new THREE.Color('#6a994e'),
                fog: new THREE.Color('#c5d1d9'),
                cloud: new THREE.Color('#ffffff'),
            },
            sunset: {
                sunColor: new THREE.Color('#ff6b00'),
                hemisphereSky: new THREE.Color('#ff8c69'),
                hemisphereGround: new THREE.Color('#5e4534'),
                fog: new THREE.Color('#f2b279'),
                cloud: new THREE.Color('#ffdab9'),
            },
            night: {
                sunColor: new THREE.Color('#aaccff'), // Moonlight
                hemisphereSky: new THREE.Color('#0a2a4f'),
                hemisphereGround: new THREE.Color('#102820'),
                fog: new THREE.Color('#08141e'),
                cloud: new THREE.Color('#2c3e50'),
            }
        };

        const updateWorldState = (timeOfDay: number) => {
            params.timeOfDay = timeOfDay;

            let elevation, turbidity, directIntensity, hemiIntensity, starOpacity;

            if (timeOfDay >= 5 && timeOfDay < 7) { // Sunrise
                const t = (timeOfDay - 5) / 2;
                elevation = THREE.MathUtils.lerp(-2, 10, t);
                turbidity = THREE.MathUtils.lerp(15, 10, t);
                directIntensity = THREE.MathUtils.lerp(0.25, 1.5, t);
                hemiIntensity = THREE.MathUtils.lerp(0.4, 0.6, t);
                starOpacity = THREE.MathUtils.lerp(1.0, 0, t);
                directionalLight.color.lerpColors(dayNightPalettes.sunset.sunColor, dayNightPalettes.day.sunColor, t);
                hemisphereLight.color.lerpColors(dayNightPalettes.night.hemisphereSky, dayNightPalettes.day.hemisphereSky, t);
                hemisphereLight.groundColor.lerpColors(dayNightPalettes.night.hemisphereGround, dayNightPalettes.day.hemisphereGround, t);
                (scene.fog as THREE.FogExp2).color.lerpColors(dayNightPalettes.night.fog, dayNightPalettes.day.fog, t);
                clouds.userData.setCloudColor(new THREE.Color().lerpColors(dayNightPalettes.night.cloud, dayNightPalettes.day.cloud, t));
            } else if (timeOfDay >= 7 && timeOfDay < 18) { // Day
                elevation = 10;
                turbidity = 10;
                directIntensity = 1.5;
                hemiIntensity = 0.6;
                starOpacity = 0;
                directionalLight.color.copy(dayNightPalettes.day.sunColor);
                hemisphereLight.color.copy(dayNightPalettes.day.hemisphereSky);
                hemisphereLight.groundColor.copy(dayNightPalettes.day.hemisphereGround);
                (scene.fog as THREE.FogExp2).color.copy(dayNightPalettes.day.fog);
                 clouds.userData.setCloudColor(dayNightPalettes.day.cloud);
            } else if (timeOfDay >= 18 && timeOfDay < 20) { // Sunset
                const t = (timeOfDay - 18) / 2;
                elevation = THREE.MathUtils.lerp(10, -2, t);
                turbidity = THREE.MathUtils.lerp(10, 15, t);
                directIntensity = THREE.MathUtils.lerp(1.5, 0.25, t);
                hemiIntensity = THREE.MathUtils.lerp(0.6, 0.4, t);
                starOpacity = THREE.MathUtils.lerp(0, 1.0, t);
                directionalLight.color.lerpColors(dayNightPalettes.day.sunColor, dayNightPalettes.sunset.sunColor, t);
                hemisphereLight.color.lerpColors(dayNightPalettes.day.hemisphereSky, dayNightPalettes.night.hemisphereSky, t);
                hemisphereLight.groundColor.lerpColors(dayNightPalettes.day.hemisphereGround, dayNightPalettes.night.hemisphereGround, t);
                (scene.fog as THREE.FogExp2).color.lerpColors(dayNightPalettes.day.fog, dayNightPalettes.night.fog, t);
                clouds.userData.setCloudColor(new THREE.Color().lerpColors(dayNightPalettes.day.cloud, dayNightPalettes.night.cloud, t));
            } else { // Night
                elevation = -2;
                turbidity = 15;
                directIntensity = 0.25;
                hemiIntensity = 0.4;
                starOpacity = 1.0;
                directionalLight.color.copy(dayNightPalettes.night.sunColor);
                hemisphereLight.color.copy(dayNightPalettes.night.hemisphereSky);
                hemisphereLight.groundColor.copy(dayNightPalettes.night.hemisphereGround);
                (scene.fog as THREE.FogExp2).color.copy(dayNightPalettes.night.fog);
                clouds.userData.setCloudColor(dayNightPalettes.night.cloud);
            }

            sky.material.uniforms['turbidity'].value = turbidity;
            sky.material.uniforms['rayleigh'].value = elevation > 0 ? 0.582 : 0.1;
            directionalLight.intensity = directIntensity;
            hemisphereLight.intensity = hemiIntensity;
            (stars.material as THREE.PointsMaterial).opacity = starOpacity;
            scene.background = (scene.fog as THREE.FogExp2).color;

            updateSunPosition(sky, directionalLight, elevation, params.azimuth);
            
            const sunVec = sky.material.uniforms.sunPosition.value.clone();
            const moonPosition = sunVec.clone().negate().multiplyScalar(200);
            moon.position.copy(moonPosition);
            (moon.material as THREE.MeshBasicMaterial).opacity = starOpacity;


            const sunDirection = directionalLight.position.clone().normalize();
            (water.material as THREE.ShaderMaterial).uniforms.sunDirection.value.copy(sunDirection);
            (water.material as THREE.ShaderMaterial).uniforms.sunColor.value.copy(directionalLight.color);
        };
        
        updateWorldState(params.timeOfDay);
        const gui = setupGUI(params, sceneElements, scene, updateWorldState);

        const updatePlayer = (delta: number) => {
            const moveForce = 30.0;
            const jumpHeight = 8.0;
            const gravity = -20.0;
            const damping = 0.92;

            playerState.velocity.y += gravity * delta;

            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3().crossVectors(camera.up, forward).negate();

            const moveDirection = new THREE.Vector3();
            if (keysPressed.w) moveDirection.add(forward);
            if (keysPressed.s) moveDirection.sub(forward);
            if (keysPressed.a) moveDirection.add(right);
            if (keysPressed.d) moveDirection.sub(right);
            if (moveDirection.lengthSq() > 0) {
                moveDirection.normalize();
                playerState.velocity.x += moveDirection.x * moveForce * delta;
                playerState.velocity.z += moveDirection.z * moveForce * delta;
            }

            const effectiveDamping = Math.pow(damping, delta * 60);
            playerState.velocity.x *= effectiveDamping;
            playerState.velocity.z *= effectiveDamping;

            const monolithBBox = new Box3().setFromObject(monolith);
            player.position.y += playerState.velocity.y * delta;
            
            player.position.x += playerState.velocity.x * delta;
            let playerBBox = new Box3().setFromObject(player);
            if (playerBBox.intersectsBox(monolithBBox)) {
                player.position.x -= playerState.velocity.x * delta;
                playerState.velocity.x = 0;
            }
            
            player.position.z += playerState.velocity.z * delta;
            playerBBox = new Box3().setFromObject(player);
            if (playerBBox.intersectsBox(monolithBBox)) {
                player.position.z -= playerState.velocity.z * delta;
                playerState.velocity.z = 0;
            }
            
            if (keysPressed[' '] && playerState.onGround) {
                playerState.velocity.y = jumpHeight;
                playerState.onGround = false;
            }

            if (player.position.y < playerSize / 2) {
                player.position.y = playerSize / 2;
                playerState.velocity.y = 0;
                playerState.onGround = true;
            }
            
            const playerPos2D = new THREE.Vector2(player.position.x, player.position.z);
            if (playerPos2D.distanceTo(new THREE.Vector2(pondPosition.x, pondPosition.z)) < pondRadius) {
                player.position.set(0, playerSize / 2, 5);
                playerState.velocity.set(0, 0, 0);
            }
        };

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            const delta = clock.getDelta();

            updatePlayer(delta);
            controls.target.lerp(player.position, 0.1);

            const grassMaterial = grassMesh.material as THREE.MeshToonMaterial;
            const treeMaterial = pineTrees.material as THREE.MeshToonMaterial;
            const starMaterial = stars.material as THREE.PointsMaterial;

            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.time.value = elapsedTime;
                grassMaterial.userData.shader.uniforms.uSunDirection.value.copy(sceneElements.directionalLight.position).normalize();
            }
            if (treeMaterial.userData.shader) {
                treeMaterial.userData.shader.uniforms.time.value = elapsedTime;
            }
            if (starMaterial.userData.shader) {
                starMaterial.userData.shader.uniforms.time.value = elapsedTime;
            }

            if (water.material) {
                (water.material as THREE.ShaderMaterial).uniforms.time.value += delta * params.waterFlowSpeed;
            }
            if (clouds.userData.update) clouds.userData.update(delta, camera);
            
            stars.rotation.y = elapsedTime * 0.01;
            if ((moon.material as THREE.MeshBasicMaterial).opacity > 0) moon.lookAt(camera.position);

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects([ground, water]);

            if (grassMaterial.userData.shader) grassMaterial.userData.shader.uniforms.uMousePos.value.set(9999, 9999, 9999);
            if (treeMaterial.userData.shader) treeMaterial.userData.shader.uniforms.uMousePos.value.set(9999, 9999, 9999);
            if (water.material) (water.material as THREE.ShaderMaterial).uniforms.uMousePos.value.set(9999, 9999, 9999);

            const groundIntersect = intersects.find(i => i.object === ground);
            if (groundIntersect) {
                const interactPoint = groundIntersect.point;
                if (grassMaterial.userData.shader) grassMaterial.userData.shader.uniforms.uMousePos.value.copy(interactPoint);
                if (treeMaterial.userData.shader) treeMaterial.userData.shader.uniforms.uMousePos.value.copy(interactPoint);
            }
            const waterIntersect = intersects.find(i => i.object === water);
            if (waterIntersect && water.material) (water.material as THREE.ShaderMaterial).uniforms.uMousePos.value.copy(waterIntersect.point);
            
            const baseOrbY = 1.5;
            for (let i = orbs.length - 1; i >= 0; i--) {
                const orb = orbs[i];
                orb.position.y = baseOrbY + Math.sin(elapsedTime * 2 + i) * 0.2;
                orb.rotation.y += delta;
                if (player.position.distanceTo(orb.position) < playerSize / 2 + 0.3) {
                    scene.remove(orb);
                    orbs.splice(i, 1);
                    score++;
                    if (scoreElement) scoreElement.innerText = `Orbs: ${score} / ${ORB_COUNT}`;
                    if (orbs.length === 0) setTimeout(spawnOrbs, 1000);
                }
            }

            controls.update();
            composer.render();
        };
        animate();

        const handleResize = () => {
            if (!currentMount) return;
            const width = currentMount.clientWidth;
            const height = currentMount.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
            composer.setSize(width, height);
            bloomPass.setSize(width, height);
        };
        const handleMouseMove = (event: MouseEvent) => {
            mouse.x = (event.clientX / currentMount.clientWidth) * 2 - 1;
            mouse.y = -(event.clientY / currentMount.clientHeight) * 2 + 1;
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (key in keysPressed) (keysPressed as any)[key] = true;
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (key in keysPressed) (keysPressed as any)[key] = false;
            if (instructionsElement && !instructionsElement.classList.contains('hidden')) {
                if (['w', 'a', 's', 'd', ' '].includes(key)) {
                    instructionsElement.classList.add('hidden');
                }
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            
            if (currentMount && renderer.domElement) currentMount.removeChild(renderer.domElement);
            gui.destroy();
            controls.dispose();
            
            pineTreeGeometry.dispose();
            needleTexture.dispose();
            stars.geometry.dispose();
            (stars.material as THREE.PointsMaterial).map?.dispose();
            (stars.material as THREE.Material).dispose();
            moon.geometry.dispose();
            (moon.material as THREE.Material).dispose();

            scene.traverse(object => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                         if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            (object.material as THREE.Material).dispose();
                        }
                    }
                }
            });
            renderer.dispose();
        };
    }, []);

    return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default App;



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


// --- Configuration ---
const initialParams = {
    // Default Preset Values
    groundColor: '#2fa753',
    waterColor: '#d4f1f9',
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
    grassCount: 50000, // Reduced for smaller area and performance
    treeCount: 5, // Reduced for performance as requested

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

    // Clouds
    cloudColor: '#ffffff',
    cloudCount: 10,

    // Fog
    fogColor: '#c5d1d9',
    fogDensity: 0.015,
};

const maxGrassCount = 50000; // Reduced
const maxCloudCount = 50;
const maxTreeCount = 5; // Reduced


// --- Scene Element Creators ---

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
    light.shadow.mapSize.set(1024, 1024); // Reduced shadow map resolution
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

function createGround() {
    const geometry = new THREE.PlaneGeometry(100, 100); // Reduced ground area
    const material = new THREE.MeshToonMaterial({ color: initialParams.groundColor });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
}

function createMonolith() {
    const geometry = new THREE.BoxGeometry(0.8, 2.5, 0.5);
    const material = new THREE.MeshToonMaterial({ color: initialParams.monolithColor });
    const monolith = new THREE.Mesh(geometry, material);
    monolith.position.set(0, 1.25, -15);
    monolith.castShadow = true;
    monolith.receiveShadow = true;
    return monolith;
}

function createGrass(pondPosition: THREE.Vector3, pondRadius: number) {
    const grassBladeHeight = 1.0;
    const grassGeometry = new THREE.PlaneGeometry(0.1, grassBladeHeight, 1, 2);
    grassGeometry.translate(0, grassBladeHeight / 2, 0);

    const positions = grassGeometry.attributes.position;
    positions.setX(0, 0);
    positions.setX(1, 0);
    positions.needsUpdate = true;
    grassGeometry.computeVertexNormals();

    const grassMaterial = new THREE.MeshToonMaterial({
        side: THREE.DoubleSide,
        vertexColors: true,
        color: initialParams.grassBaseColor,
    });

    grassMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 };
        shader.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };
        shader.uniforms.uGrassTipColor = { value: new THREE.Color(initialParams.grassTipColor) };

        shader.vertexShader = `
            uniform float time;
            uniform vec3 uMousePos;
            varying vec3 vWorldPosition;
            varying float vRelativeHeight;
        \n` + shader.vertexShader;
        
        shader.fragmentShader = `
            uniform vec3 uGrassTipColor;
            varying float vRelativeHeight;
        \n` + shader.fragmentShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
                #include <begin_vertex>
                vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
                vRelativeHeight = position.y / ${grassBladeHeight.toFixed(1)};

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
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
                #include <color_fragment>
                diffuseColor.rgb = mix(diffuseColor.rgb, uGrassTipColor, vRelativeHeight);
            `
        );
        grassMaterial.userData.shader = shader;
    };

    const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, maxGrassCount);
    grassMesh.count = initialParams.grassCount;
    grassMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const areaSize = 50; // Reduced spawn area
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z);
    const pondRadiusSq = pondRadius * pondRadius;

    for (let i = 0; i < maxGrassCount; i++) {
        let x, z;
        do {
            x = (Math.random() - 0.5) * areaSize;
            z = (Math.random() - 0.5) * areaSize;
        } while (new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq);

        dummy.position.set(x, 0, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.7 + Math.random() * 0.6);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(i, dummy.matrix);
        
        color.set(initialParams.grassBaseColor);
        color.multiplyScalar(0.8 + Math.random() * 0.4);
        grassMesh.setColorAt(i, color);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) {
       grassMesh.instanceColor.needsUpdate = true;
    }

    return grassMesh;
}

function createNeedleTexture(): THREE.CanvasTexture {
    const size = 32; // Reduced texture resolution
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get 2D context from canvas');
    }

    // A base color close to the foliage
    context.fillStyle = '#4a6b5a';
    context.fillRect(0, 0, 4, size);

    // Add subtle lighter and darker vertical streaks for texture
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
    // FIX: Property 'specular' does not exist on type 'MeshToonMaterial'. This property was removed in recent versions of three.js.
    // The line setting it has been removed to fix the error. MeshToonMaterial does not have traditional specular highlights.
    const treeMaterial = new THREE.MeshToonMaterial({
        vertexColors: true,
        map: needleTexture,
    });

    const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, maxTreeCount);
    treeMesh.count = initialParams.treeCount;
    treeMesh.castShadow = true;
    treeMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const areaSize = 50; // Reduced spawn area
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z);
    const pondRadiusSq = (pondRadius + 2) * (pondRadius + 2);

    for (let i = 0; i < maxTreeCount; i++) {
        let x, z;
        do {
            x = (Math.random() - 0.5) * areaSize;
            z = (Math.random() - 0.5) * areaSize;
        } while (new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq || Math.abs(x) < 20 && Math.abs(z) < 20); // Avoid central area

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
    bloomPass: UnrealBloomPass;
};

function setupGUI(params: typeof initialParams, sceneElements: SceneElements, scene: THREE.Scene) {
    const { sky, directionalLight, hemisphereLight, ground, grassMesh, water, clouds, pineTrees, bloomPass } = sceneElements;
    const gui = new GUI();
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';
    
    const updateSun = () => {
        updateSunPosition(sky, directionalLight, params.elevation, params.azimuth);
        const sunDirection = directionalLight.position.clone().normalize();
        (water.material as THREE.ShaderMaterial).uniforms.sunDirection.value.copy(sunDirection);
    };

    const skyFolder = gui.addFolder('Sky & Sun');
    skyFolder.add(params, 'turbidity', 0.0, 20.0, 0.1).onChange(() => sky.material.uniforms['turbidity'].value = params.turbidity);
    skyFolder.add(params, 'rayleigh', 0.0, 4, 0.001).onChange(() => sky.material.uniforms['rayleigh'].value = params.rayleigh);
    skyFolder.add(params, 'mieCoefficient', 0.0, 0.1, 0.001).onChange(() => sky.material.uniforms['mieCoefficient'].value = params.mieCoefficient);
    skyFolder.add(params, 'mieDirectionalG', 0.0, 1, 0.001).onChange(() => sky.material.uniforms['mieDirectionalG'].value = params.mieDirectionalG);
    skyFolder.add(params, 'elevation', 0, 90, 0.1).onChange(updateSun);
    skyFolder.add(params, 'azimuth', -180, 180, 0.1).onChange(updateSun);

    const objectsFolder = gui.addFolder('Objects & Flora');
    objectsFolder.addColor(params, 'groundColor').name('Ground Color').onChange((value) => ground.material.color.set(value));

    const waterSubFolder = objectsFolder.addFolder('Pond');
    waterSubFolder.addColor(params, 'waterColor').name('Tint').onChange((value) => {
        (water.material as THREE.ShaderMaterial).uniforms.waterColor.value.set(value);
    });
    waterSubFolder.add((water.material as THREE.ShaderMaterial).uniforms.distortionScale, 'value', 0, 8, 0.1).name('Distortion');
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
    lightingFolder.add(params, 'lightIntensity', 0, 5).name('Sun Intensity').onChange((value) => directionalLight.intensity = value);
    lightingFolder.addColor(params, 'sunColor').name('Sun Color').onChange(value => {
        directionalLight.color.set(value);
        (water.material as THREE.ShaderMaterial).uniforms.sunColor.value.set(value);
    });
    lightingFolder.addColor(params, 'hemisphereSkyColor').name('Hemisphere Sky').onChange(value => hemisphereLight.color.set(value));
    lightingFolder.addColor(params, 'hemisphereGroundColor').name('Hemisphere Ground').onChange(value => hemisphereLight.groundColor.set(value));
    lightingFolder.add(params, 'hemisphereIntensity', 0, 5, 0.1).name('Hemisphere Intensity').onChange(value => hemisphereLight.intensity = value);
   
    const shadowFolder = gui.addFolder('Shadows');
    shadowFolder.add(params, 'shadowBias', -0.001, 0.001, 0.0001).name('Bias').onChange(value => directionalLight.shadow.bias = value);
    shadowFolder.add(params, 'shadowRadius', 0, 10, 0.1).name('Softness').onChange(value => directionalLight.shadow.radius = value);
    
    const effectsFolder = gui.addFolder('Effects');
    effectsFolder.add(params, 'bloomThreshold', 0, 1, 0.01).name('Bloom Threshold').onChange(v => bloomPass.threshold = v);
    effectsFolder.add(params, 'bloomStrength', 0, 3, 0.01).name('Bloom Strength').onChange(v => bloomPass.strength = v);
    effectsFolder.add(params, 'bloomRadius', 0, 1, 0.01).name('Bloom Radius').onChange(v => bloomPass.radius = v);

    const fogFolder = gui.addFolder('Fog');
    fogFolder.addColor(params, 'fogColor').name('Color').onChange((value) => {
        if (scene.fog) {
            (scene.fog as THREE.FogExp2).color.set(value);
        }
        if (scene.background instanceof THREE.Color) {
            scene.background.set(value);
        }
    });
    fogFolder.add(params, 'fogDensity', 0, 0.1, 0.001).name('Density').onChange((value) => {
        if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.density = value;
        }
    });

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
        
        // --- Parameters (local copy for GUI) ---
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
        controls.maxPolarAngle = Math.PI / 2 - 0.05;

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
        
        updateSunPosition(sky, directionalLight, params.elevation, params.azimuth);

        const ground = createGround();
        scene.add(ground);
        
        const monolith = createMonolith();
        scene.add(monolith);

        const pondPosition = new THREE.Vector3(10, 0.05, 5);
        const pondRadius = 15;

        const waterGeometry = new THREE.CircleGeometry(pondRadius, 64);
        const water = createWater(
            waterGeometry,
            directionalLight.position.clone().normalize(),
            params.waterColor,
            params.sunColor,
            params
        );
        water.position.copy(pondPosition);
        scene.add(water);

        const grassMesh = createGrass(pondPosition, pondRadius);
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
        controls.target.set(0, 1, 0);
        controls.update();

        // --- GUI ---
        const gui = setupGUI(params, { sky, directionalLight, hemisphereLight, ground, grassMesh, water, clouds, pineTrees, bloomPass }, scene);

        // --- Animation Loop ---
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            const delta = clock.getDelta();
            const grassMaterial = grassMesh.material as THREE.MeshToonMaterial;

            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.time.value = elapsedTime;
            }

            if (water.material) {
                (water.material as THREE.ShaderMaterial).uniforms.time.value += delta * params.waterFlowSpeed;
            }

            if (clouds.userData.update) {
                clouds.userData.update(delta, camera);
            }

            // --- Interactivity Raycasting ---
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects([ground, water]);

            // Reset grass push effect
            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.uMousePos.value.set(9999, 9999, 9999);
            }

            // Reset water interaction
            if (water.material) {
                (water.material as THREE.ShaderMaterial).uniforms.uMousePos.value.set(9999, 9999, 9999);
            }

            const groundIntersect = intersects.find(i => i.object === ground);
            if (groundIntersect && grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.uMousePos.value.copy(groundIntersect.point);
            }

            const waterIntersect = intersects.find(i => i.object === water);
            if (waterIntersect && water.material) {
                (water.material as THREE.ShaderMaterial).uniforms.uMousePos.value.copy(waterIntersect.point);
            }


            controls.update();
            composer.render();
        };
        animate();

        // --- Event Listeners & Cleanup ---
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

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            
            if (currentMount && renderer.domElement) {
                 currentMount.removeChild(renderer.domElement);
            }
            gui.destroy();
            controls.dispose();
            
            // Dispose of the complex tree geometry and its custom texture
            pineTreeGeometry.dispose();
            needleTexture.dispose();

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
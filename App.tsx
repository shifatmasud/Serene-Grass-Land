
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// --- Configuration ---
const initialParams = {
    // Ghibli-inspired palette
    groundColor: '#6a994e', // Lush green ground
    monolithColor: '#586F7C', // Weathered stone
    grassBaseColor: '#a7c957', // Vibrant, sunlit grass
    grassTipColor: '#f2e8cf', // Lighter, sun-kissed tips for gradient

    // Lighting params for a bright, soft day
    lightIntensity: 1.5,
    sunColor: '#FFCB8E', // Warm, golden sun
    hemisphereSkyColor: '#BDE0FE', // Light blue ambient from sky
    hemisphereGroundColor: '#6a994e', // Green bounce light from ground
    hemisphereIntensity: 1.0,
    shadowBias: -0.001,
    shadowRadius: 5.0, // Softer shadows

    // Sky params for a clear, anime-style sky
    turbidity: 2.0,
    rayleigh: 3.0,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    elevation: 15, // Sun higher in the sky for a daytime feel
    azimuth: 180, // Sun in the south
    grassCount: 150000,

    // Post-processing
    bloomStrength: 0.4,
    bloomThreshold: 0.85,
    bloomRadius: 0.3,
};

const maxGrassCount = 200000;

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
    light.shadow.mapSize.set(2048, 2048);
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
    const geometry = new THREE.PlaneGeometry(200, 200);
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

function createGrass() {
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
    const areaSize = 100;
    for (let i = 0; i < maxGrassCount; i++) {
        dummy.position.set(
            (Math.random() - 0.5) * areaSize,
            0,
            (Math.random() - 0.5) * areaSize
        );
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

type SceneElements = {
    sky: Sky;
    directionalLight: THREE.DirectionalLight;
    hemisphereLight: THREE.HemisphereLight;
    ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
    grassMesh: THREE.InstancedMesh;
    bloomPass: UnrealBloomPass;
};

function setupGUI(params: typeof initialParams, sceneElements: SceneElements) {
    const { sky, directionalLight, hemisphereLight, ground, grassMesh, bloomPass } = sceneElements;
    const gui = new GUI();
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';
    
    const updateSun = () => updateSunPosition(sky, directionalLight, params.elevation, params.azimuth);

    const skyFolder = gui.addFolder('Sky & Sun');
    skyFolder.add(params, 'turbidity', 0.0, 20.0, 0.1).onChange(() => sky.material.uniforms['turbidity'].value = params.turbidity);
    skyFolder.add(params, 'rayleigh', 0.0, 4, 0.001).onChange(() => sky.material.uniforms['rayleigh'].value = params.rayleigh);
    skyFolder.add(params, 'mieCoefficient', 0.0, 0.1, 0.001).onChange(() => sky.material.uniforms['mieCoefficient'].value = params.mieCoefficient);
    skyFolder.add(params, 'mieDirectionalG', 0.0, 1, 0.001).onChange(() => sky.material.uniforms['mieDirectionalG'].value = params.mieDirectionalG);
    skyFolder.add(params, 'elevation', 0, 90, 0.1).onChange(updateSun);
    skyFolder.add(params, 'azimuth', -180, 180, 0.1).onChange(updateSun);

    const objectsFolder = gui.addFolder('Objects & Flora');
    objectsFolder.addColor(params, 'groundColor').name('Ground Color').onChange((value) => ground.material.color.set(value));
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
        // Fix: Cast `grassMesh.material` to a single material type to access `userData`.
        // The `material` property can be an array, which doesn't have `userData`.
        const material = grassMesh.material as THREE.MeshToonMaterial;
        if (material.userData.shader) {
            (material.userData.shader as any).uniforms.uGrassTipColor.value.set(value);
        }
    });
    objectsFolder.add(params, 'grassCount', 1000, maxGrassCount, 1000).name('Grass Density').onChange((value) => {
        grassMesh.count = Math.floor(value);
    });

    const lightingFolder = gui.addFolder('Lighting');
    lightingFolder.add(params, 'lightIntensity', 0, 5).name('Sun Intensity').onChange((value) => directionalLight.intensity = value);
    lightingFolder.addColor(params, 'sunColor').name('Sun Color').onChange(value => directionalLight.color.set(value));
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
        
        // --- Parameters (local copy for GUI) ---
        const params = { ...initialParams };
        
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

        const grassMesh = createGrass();
        scene.add(grassMesh);

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
        const gui = setupGUI(params, { sky, directionalLight, hemisphereLight, ground, grassMesh, bloomPass });

        // --- Animation Loop ---
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            const grassMaterial = grassMesh.material as THREE.MeshToonMaterial;

            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.time.value = elapsedTime;
            }

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(ground);

            if (intersects.length > 0 && grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.uMousePos.value.copy(intersects[0].point);
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

            scene.traverse(object => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                         if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
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

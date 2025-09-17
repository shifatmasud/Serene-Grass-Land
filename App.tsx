

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

const App: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;
        let animationFrameId: number;

        // --- Scene Setup ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        // For realism
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

        // --- Parameters ---
        const params = {
            groundColor: '#3c5d3c',
            monolithColor: '#282828',
            grassBaseColor: '#306900',
            // Lighting params
            lightIntensity: 1.0, // Reduced for softer shadows
            hemisphereSkyColor: '#87ceeb',
            hemisphereGroundColor: '#495232',
            hemisphereIntensity: 1.0, // Increased to fill shadows
            // Sky params
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            elevation: 8, // angle of the sun
            azimuth: 180, // direction of the sun
            grassCount: 60000,
        };
        
        // --- Sky and Sun ---
        const sky = new Sky();
        sky.scale.setScalar(450000);
        scene.add(sky);
        const sun = new THREE.Vector3();

        const updateSun = () => {
            const phi = THREE.MathUtils.degToRad(90 - params.elevation);
            const theta = THREE.MathUtils.degToRad(params.azimuth);
            sun.setFromSphericalCoords(1, phi, theta);
            sky.material.uniforms['sunPosition'].value.copy(sun);

            // Make light direction match sun position
            directionalLight.position.copy(sun).multiplyScalar(50);
        }

        // --- Lighting ---
        const hemisphereLight = new THREE.HemisphereLight(
            params.hemisphereSkyColor,
            params.hemisphereGroundColor,
            params.hemisphereIntensity
        );
        scene.add(hemisphereLight);

        const directionalLight = new THREE.DirectionalLight('#ffffff', params.lightIntensity);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.top = 30;
        directionalLight.shadow.camera.bottom = -30;
        directionalLight.shadow.camera.left = -30;
        directionalLight.shadow.camera.right = 30;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.bias = -0.0001;
        scene.add(directionalLight);
        updateSun();


        // --- Ground ---
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: params.groundColor });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        // --- Monolith (Mysterious Figure) ---
        const monolithGeometry = new THREE.BoxGeometry(0.8, 2.5, 0.5);
        const monolithMaterial = new THREE.MeshStandardMaterial({ color: params.monolithColor, roughness: 0.8 });
        const monolith = new THREE.Mesh(monolithGeometry, monolithMaterial);
        monolith.position.set(0, 1.25, -15);
        monolith.castShadow = true;
        monolith.receiveShadow = true;
        scene.add(monolith);

        // --- Grass Setup ---
        const maxGrassCount = 100000;

        const grassBladeHeight = 1.0;
        const grassGeometry = new THREE.PlaneGeometry(0.1, grassBladeHeight, 1, 2);
        grassGeometry.translate(0, grassBladeHeight / 2, 0); 
        
        const positions = grassGeometry.attributes.position;
        positions.setX(0, 0);
        positions.setX(1, 0);
        positions.needsUpdate = true;
        grassGeometry.computeVertexNormals();

        const grassMaterial = new THREE.MeshStandardMaterial({
            side: THREE.DoubleSide,
            vertexColors: true, 
        });

        grassMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.time = { value: 0 };
            shader.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };
            
            shader.vertexShader = `
                uniform float time;
                uniform vec3 uMousePos;
                varying vec3 vWorldPosition;
            \n` + shader.vertexShader;
            
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                    #include <begin_vertex>
                    vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;

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
            grassMaterial.userData.shader = shader;
        };

        const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, maxGrassCount);
        grassMesh.count = params.grassCount;
        grassMesh.castShadow = true;
        scene.add(grassMesh);

        // Distribute instances with color variation
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
            
            // Add color variation
            color.set(params.grassBaseColor);
            color.multiplyScalar(0.8 + Math.random() * 0.4); // Lightness variation
            grassMesh.setColorAt(i, color);
        }
        grassMesh.instanceMatrix.needsUpdate = true;
        if (grassMesh.instanceColor) {
           grassMesh.instanceColor.needsUpdate = true;
        }

        // --- Camera Position ---
        camera.position.set(0, 2.5, 8);
        controls.target.set(0, 1, -5);
        controls.update();

        // --- GUI ---
        const gui = new GUI();
        gui.domElement.style.top = '10px';
        gui.domElement.style.right = '10px';
        
        const skyFolder = gui.addFolder('Sky & Sun');
        skyFolder.add(params, 'turbidity', 0.0, 20.0, 0.1).onChange(() => sky.material.uniforms['turbidity'].value = params.turbidity);
        skyFolder.add(params, 'rayleigh', 0.0, 4, 0.001).onChange(() => sky.material.uniforms['rayleigh'].value = params.rayleigh);
        skyFolder.add(params, 'mieCoefficient', 0.0, 0.1, 0.001).onChange(() => sky.material.uniforms['mieCoefficient'].value = params.mieCoefficient);
        skyFolder.add(params, 'mieDirectionalG', 0.0, 1, 0.001).onChange(() => sky.material.uniforms['mieDirectionalG'].value = params.mieDirectionalG);
        skyFolder.add(params, 'elevation', 0, 90, 0.1).onChange(updateSun);
        skyFolder.add(params, 'azimuth', -180, 180, 0.1).onChange(updateSun);

        const objectsFolder = gui.addFolder('Objects & Flora');
        objectsFolder.addColor(params, 'groundColor').name('Ground Color').onChange((value) => groundMaterial.color.set(value));
        objectsFolder.addColor(params, 'grassBaseColor').name('Grass Color').onChange((value) => {
            // Re-calculate colors on change
            for (let i = 0; i < grassMesh.count; i++) {
                color.set(value);
                color.multiplyScalar(0.8 + Math.random() * 0.4);
                grassMesh.setColorAt(i, color);
            }
            if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
        });
        objectsFolder.add(params, 'grassCount', 1000, maxGrassCount, 1000).name('Grass Density').onChange((value) => {
            grassMesh.count = Math.floor(value);
        });

        const lightingFolder = gui.addFolder('Lighting');
        lightingFolder.add(params, 'lightIntensity', 0, 5).name('Sun Intensity').onChange((value) => directionalLight.intensity = value);
        lightingFolder.addColor(params, 'hemisphereSkyColor').name('Hemisphere Sky').onChange(value => hemisphereLight.color.set(value));
        lightingFolder.addColor(params, 'hemisphereGroundColor').name('Hemisphere Ground').onChange(value => hemisphereLight.groundColor.set(value));
        lightingFolder.add(params, 'hemisphereIntensity', 0, 2, 0.1).name('Hemisphere Intensity').onChange(value => hemisphereLight.intensity = value);
       
        // --- Animation Loop ---
        const animate = () => {
            const elapsedTime = clock.getElapsedTime();
            if (grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.time.value = elapsedTime;
            }

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(ground);
            if (intersects.length > 0 && grassMaterial.userData.shader) {
                grassMaterial.userData.shader.uniforms.uMousePos.value.copy(intersects[0].point);
            }

            controls.update();
            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        // --- Event Listeners & Cleanup ---
        const handleResize = () => {
            if (!currentMount) return;
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };

        const handleMouseMove = (event: MouseEvent) => {
            mouse.x = (event.clientX / currentMount.clientWidth) * 2 - 1;
            mouse.y = -(event.clientY / currentMount.clientHeight) * 2 + 1;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('resize', handleResize);
            // FIX: Corrected typo 'ahandleMouseMove' to 'handleMouseMove'.
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
            currentMount.removeChild(renderer.domElement);
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
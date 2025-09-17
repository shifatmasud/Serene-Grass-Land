import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Game } from './Game';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

const TestApp: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;
        let animationFrameId: number;
        
        // --- Core Setup ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Sky blue background
        
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 5, 10);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        currentMount.appendChild(renderer.domElement);
        
        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.set(1024, 1024);
        scene.add(directionalLight);

        // --- Basic World ---
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Create placeholder objects that Game.tsx expects
        const monolith = new THREE.Mesh(
            new THREE.BoxGeometry(2, 4, 2),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        monolith.position.set(0, 2, -15);
        monolith.castShadow = true;
        monolith.receiveShadow = true;
        scene.add(monolith);

        const pond = { position: new THREE.Vector3(100, 0, 100), radius: 5 }; // Place it far away

        // --- Game Setup ---
        // FIX: Pass renderer and composer to Game constructor to satisfy its 6-argument signature.
        const game = new Game(scene, camera, monolith, pond, renderer, composer);
        
        // Render loop for when the game is not active (spectator mode)
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            composer.render();
        };

        const handlePointerLockChange = () => {
            if (document.pointerLockElement === document.body) {
                cancelAnimationFrame(animationFrameId); // Stop spectator loop
                game.startGame(); // Game starts its own internal loop
                document.body.classList.add('playing');
            } else {
                game.stopGame(); // Game stops its internal loop
                document.body.classList.remove('playing');
                animate(); // Restart spectator loop
            }
        };

        document.addEventListener('pointerlockchange', handlePointerLockChange, false);
        
        const startGameOnClick = () => {
             document.body.requestPointerLock();
        }
        
        currentMount.addEventListener('click', startGameOnClick);
        
        // --- Start initial render loop ---
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
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('pointerlockchange', handlePointerLockChange, false);
             if (currentMount) {
                currentMount.removeEventListener('click', startGameOnClick);
            }
            
            game.dispose();
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }

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

    return <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'pointer' }} />;
};

export default TestApp;

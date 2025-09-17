import * as THREE from 'three';
import { Box3 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

const ORB_COUNT = 5;
const PLAYER_SIZE = 1.0;

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private monolith: THREE.Mesh;
    private pond: { position: THREE.Vector3; radius: number };
    private renderer: THREE.WebGLRenderer;
    private composer: EffectComposer;

    public player: THREE.Mesh;
    private playerState = {
        velocity: new THREE.Vector3(),
    };
    private keysPressed: { [key: string]: boolean } = { w: false, a: false, s: false, d: false };
    private initialPlayerScale = new THREE.Vector3();
    private isActive = false;

    private orbs: THREE.Mesh[] = [];
    private orbGeometry: THREE.SphereGeometry;
    private orbMaterial: THREE.MeshBasicMaterial;
    private score = 0;

    private scoreElement: HTMLElement | null;
    
    // --- New Camera Control State ---
    private cameraOffset = new THREE.Vector3(0, 2.5, 6.0); // height, distance
    private cameraTargetOffset = new THREE.Vector3(0, 1.2, 0);
    private cameraLookAt = new THREE.Vector3();
    private cameraOrbit = new THREE.Quaternion();
    private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    private clock = new THREE.Clock();
    private animationFrameId: number | null = null;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        monolith: THREE.Mesh,
        pond: { position: THREE.Vector3; radius: number },
        renderer: THREE.WebGLRenderer,
        composer: EffectComposer
    ) {
        this.scene = scene;
        this.camera = camera;
        this.monolith = monolith;
        this.pond = pond;
        this.renderer = renderer;
        this.composer = composer;

        this.scoreElement = document.getElementById('score');
        
        this.orbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        this.orbMaterial = new THREE.MeshBasicMaterial({ color: '#ffff88', toneMapped: false });

        this.setupPlayer();
        this.spawnOrbs();
    }

    private setupPlayer() {
        const playerGeometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
        const playerMaterial = new THREE.MeshToonMaterial({ color: '#fca311' });
        this.player = new THREE.Mesh(playerGeometry, playerMaterial);
        this.player.position.set(0, 1.5, 22);
        this.player.castShadow = true;
        this.initialPlayerScale.copy(this.player.scale);
        this.scene.add(this.player);
    }

    public setPlayerHover(isHovered: boolean) {
        if (this.isActive) return;
        const targetScale = isHovered ? 1.2 : 1.0;
        this.player.scale.set(
            this.initialPlayerScale.x * targetScale,
            this.initialPlayerScale.y * targetScale,
            this.initialPlayerScale.z * targetScale
        );
    }

    private animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);
        const delta = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        this.update(delta, elapsedTime);
        
        this.composer.render();
    }

    public startGame() {
        this.isActive = true;
        
        // Position camera behind the player to start
        const startOffset = new THREE.Vector3(0, 3, 7);
        this.camera.position.copy(this.player.position).add(startOffset);
        this.cameraLookAt.copy(this.player.position).add(this.cameraTargetOffset);
        this.camera.lookAt(this.cameraLookAt);

        // Initialize orbit controls from starting camera position
        this.cameraEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.cameraOrbit.copy(this.camera.quaternion);
        
        this.setupEventListeners();

        this.clock.start();
        this.animate();
    }
    
    public stopGame() {
        this.isActive = false;
        Object.keys(this.keysPressed).forEach(k => (this.keysPressed[k] = false));
        this.playerState.velocity.set(0,0,0);
        this.disposeEventListeners();

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private spawnOrbs = () => {
        this.orbs.forEach(orb => this.scene.remove(orb));
        this.orbs.length = 0;
        const monolithBBox = new Box3().setFromObject(this.monolith);
        const areaSize = 45;
        const pondCenter = new THREE.Vector2(this.pond.position.x, this.pond.position.z);
        const pondRadiusSq = (this.pond.radius + 1) * (this.pond.radius + 1);

        for (let i = 0; i < ORB_COUNT; i++) {
            const orb = new THREE.Mesh(this.orbGeometry, this.orbMaterial);
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
            this.orbs.push(orb);
            this.scene.add(orb);
        }
        this.score = 0;
        if (this.scoreElement) this.scoreElement.innerText = `Orbs: 0 / ${ORB_COUNT}`;
    };

    private updatePlayer(delta: number) {
        const moveSpeed = 5.0;
        const rotationSpeed = 10.0;
        const hoverHeight = 1.5;

        // --- Camera-relative movement calculation ---
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cameraOrbit);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

        const moveDirection = new THREE.Vector3();
        if (this.keysPressed.w) moveDirection.add(forward);
        if (this.keysPressed.s) moveDirection.sub(forward);
        if (this.keysPressed.a) moveDirection.sub(right);
        if (this.keysPressed.d) moveDirection.add(right);
        
        const targetVelocity = new THREE.Vector3();
        if (moveDirection.lengthSq() > 0) {
             targetVelocity.copy(moveDirection.normalize().multiplyScalar(moveSpeed));
        }
        
        // Smoothly interpolate velocity for acceleration/deceleration
        const lerpFactor = 1.0 - Math.exp(-20 * delta); // frame-rate independent lerp
        this.playerState.velocity.lerp(targetVelocity, lerpFactor);
        
        const moveStep = this.playerState.velocity.clone().multiplyScalar(delta);

        // --- Collision Detection ---
        const monolithBBox = new Box3().setFromObject(this.monolith);
        const playerBBox = new Box3().setFromObject(this.player);
        playerBBox.translate(moveStep);

        if (!playerBBox.intersectsBox(monolithBBox)) {
            this.player.position.add(moveStep);
        } else {
            this.playerState.velocity.set(0,0,0);
        }

        this.player.position.y = hoverHeight;

        // --- Player Rotation ---
        if (this.playerState.velocity.lengthSq() > 0.01) {
            const lookAtPosition = this.player.position.clone().add(this.playerState.velocity);
            const targetMatrix = new THREE.Matrix4().lookAt(this.player.position, lookAtPosition, this.player.up);
            const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
            this.player.quaternion.slerp(targetQuaternion, delta * rotationSpeed);
        }
    }

    private updateCamera(delta: number) {
        // Calculate desired camera position by taking an offset and rotating it by the current orbit quaternion
        const desiredPosition = this.player.position.clone();
        const offset = this.cameraOffset.clone().applyQuaternion(this.cameraOrbit);
        desiredPosition.add(offset);
        
        // Smoothly move the camera to its desired position
        const lerpFactor = 1.0 - Math.exp(-15 * delta); // frame-rate independent lerp
        this.camera.position.lerp(desiredPosition, lerpFactor);
        
        // Smoothly update the point the camera is looking at
        const desiredLookAt = this.player.position.clone().add(this.cameraTargetOffset);
        this.cameraLookAt.lerp(desiredLookAt, lerpFactor);
        this.camera.lookAt(this.cameraLookAt);
    }

    private updateOrbs(delta: number, elapsedTime: number) {
        const baseOrbY = 1.5;
        for (let i = this.orbs.length - 1; i >= 0; i--) {
            const orb = this.orbs[i];
            orb.position.y = baseOrbY + Math.sin(elapsedTime * 2 + i) * 0.2;
            orb.rotation.y += delta;
            if (this.player.position.distanceTo(orb.position) < PLAYER_SIZE / 2 + 0.3) {
                this.scene.remove(orb);
                this.orbs.splice(i, 1);
                this.score++;
                if (this.scoreElement) this.scoreElement.innerText = `Orbs: ${this.score} / ${ORB_COUNT}`;
                if (this.orbs.length === 0) setTimeout(this.spawnOrbs, 1000);
            }
        }
    }

    public update(delta: number, elapsedTime: number) {
        if (!this.isActive) return;
        this.updatePlayer(delta);
        this.updateCamera(delta);
        this.updateOrbs(delta, elapsedTime);
    }
    
    private handleKeyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key in this.keysPressed) this.keysPressed[key] = true;
    };

    private handleKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key in this.keysPressed) this.keysPressed[key] = false;
    };

    private handleMouseMove = (event: MouseEvent) => {
        if (!this.isActive || !document.pointerLockElement) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        
        this.cameraEuler.y -= movementX * 0.002;
        this.cameraEuler.x -= movementY * 0.002;
        
        const PI_2 = Math.PI / 2;
        // Clamp the vertical rotation (pitch)
        this.cameraEuler.x = Math.max(-PI_2 * 0.8, Math.min(PI_2 * 0.8, this.cameraEuler.x));

        this.cameraOrbit.setFromEuler(this.cameraEuler);
    };
    
    private setupEventListeners() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('mousemove', this.handleMouseMove);
    }

    private disposeEventListeners() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('mousemove', this.handleMouseMove);
    }
    
    public dispose() {
        this.disposeEventListeners();
        
        this.orbs.forEach(orb => this.scene.remove(orb));
        this.scene.remove(this.player);
        
        this.player.geometry.dispose();
        (this.player.material as THREE.Material).dispose();
        this.orbGeometry.dispose();
        this.orbMaterial.dispose();
    }
}
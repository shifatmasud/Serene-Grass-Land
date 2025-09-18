import * as THREE from 'three';
import { Box3 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

const ORB_COUNT = 6; // 5 regular + 1 special
const WIN_SCORE = 10;
const PLAYER_SIZE = 1.0;

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private monolith: THREE.Mesh;
    private pond: { position: THREE.Vector3; radius: number };
    private renderer: THREE.WebGLRenderer;
    private composer: EffectComposer;
    private isMobile: boolean;

    public player: THREE.Mesh;
    private playerState = {
        velocity: new THREE.Vector3(),
        yVelocity: 0,
        isJumping: false,
    };
    private keysPressed: { [key: string]: boolean } = { w: false, a: false, s: false, d: false };
    private baseEmissiveIntensity: number;
    private isActive = false;
    private isCelebratingWin = false;

    private orbs: THREE.Mesh[] = [];
    private specialOrb: THREE.Mesh | null = null;
    private orbGeometry: THREE.SphereGeometry;
    private orbMaterial: THREE.MeshStandardMaterial;
    private specialOrbMaterial: THREE.MeshStandardMaterial;
    private score = 0;

    private scoreElement: HTMLElement | null;
    private winScreenElement: HTMLElement | null;
    private winMessageElement: HTMLElement | null;
    private confettiContainerElement: HTMLElement | null;
    
    // --- Particle System ---
    private particlePool: THREE.Mesh[] = [];
    private activeParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; lifetime: number; initialLifetime: number }[] = [];
    private particleGeometry: THREE.BoxGeometry;
    private particleMaterial: THREE.MeshBasicMaterial;
    private readonly MAX_PARTICLES = 150; // Max concurrent particles
    private readonly PARTICLES_PER_BURST = 15;

    // --- Camera Control State ---
    private cameraOffset = new THREE.Vector3(0, 2.5, 6.0); // height, distance
    private cameraTargetOffset = new THREE.Vector3(0, 1.2, 0);
    private cameraLookAt = new THREE.Vector3();
    private cameraOrbit = new THREE.Quaternion();
    private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    private lastTouch = new THREE.Vector2();

    private clock = new THREE.Clock();
    private animationFrameId: number | null = null;

    // Mobile UI elements
    private mobileControls: { [key: string]: HTMLElement | null } = {};

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        monolith: THREE.Mesh,
        pond: { position: THREE.Vector3; radius: number },
        renderer: THREE.WebGLRenderer,
        composer: EffectComposer,
        isMobile: boolean
    ) {
        this.scene = scene;
        this.camera = camera;
        this.monolith = monolith;
        this.pond = pond;
        this.renderer = renderer;
        this.composer = composer;
        this.isMobile = isMobile;

        this.scoreElement = document.getElementById('score');
        this.winScreenElement = document.getElementById('win-screen');
        this.winMessageElement = document.getElementById('win-message');
        this.confettiContainerElement = document.getElementById('confetti-container');

        this.orbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        this.orbMaterial = new THREE.MeshStandardMaterial({
            color: '#ffd700',
            emissive: '#ffd700',
            emissiveIntensity: 2,
            toneMapped: false,
        });
        this.specialOrbMaterial = new THREE.MeshStandardMaterial({
            color: '#9400d3',
            emissive: '#da70d6',
            emissiveIntensity: 3,
            toneMapped: false,
        });

        // --- Initialize Particle System ---
        this.particleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        this.particleMaterial = new THREE.MeshBasicMaterial({ transparent: true });
        for (let i = 0; i < this.MAX_PARTICLES; i++) {
            const particle = new THREE.Mesh(this.particleGeometry, this.particleMaterial.clone());
            particle.visible = false;
            this.scene.add(particle);
            this.particlePool.push(particle);
        }

        this.setupPlayer();
        this.spawnOrbs();
    }

    private setupPlayer() {
        const playerGeometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
        const playerMaterial = new THREE.MeshStandardMaterial({
            color: 0xADD8E6,
            transparent: true,
            opacity: 0.75,
            metalness: 0.1,
            roughness: 0.2,
            emissive: 0x87CEEB,
            emissiveIntensity: 0.4,
            side: THREE.DoubleSide
        });
        this.player = new THREE.Mesh(playerGeometry, playerMaterial);
        // Start floating on the pond
        this.player.position.set(this.pond.position.x, 1.5, this.pond.position.z);
        this.player.castShadow = true;
        this.baseEmissiveIntensity = playerMaterial.emissiveIntensity;
        this.scene.add(this.player);
    }

    public setPlayerHover(isHovered: boolean) {
        if (this.isActive) return;
        const material = this.player.material as THREE.MeshStandardMaterial;
        // Increase emissive intensity on hover for a glow effect
        material.emissiveIntensity = isHovered ? this.baseEmissiveIntensity * 3.0 : this.baseEmissiveIntensity;
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
        
        const startOffset = new THREE.Vector3(0, 3, 7);
        this.camera.position.copy(this.player.position).add(startOffset);
        this.cameraLookAt.copy(this.player.position).add(this.cameraTargetOffset);
        this.camera.lookAt(this.cameraLookAt);

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
        if(this.specialOrb) this.scene.remove(this.specialOrb);
        this.specialOrb = null;

        const monolithBBox = new Box3().setFromObject(this.monolith);
        const areaSize = 45;
        const pondCenter = new THREE.Vector2(this.pond.position.x, this.pond.position.z);
        const pondRadiusSq = (this.pond.radius + 1) * (this.pond.radius + 1);

        const placeOrb = (orb: THREE.Mesh) => {
             let validPosition = false;
            while (!validPosition) {
                const x = (Math.random() - 0.5) * areaSize;
                const z = (Math.random() - 0.5) * areaSize;
                const orbPos = new THREE.Vector3(x, 1.5, z);
                const inPond = new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq;
                const inMonolith = monolithBBox.distanceToPoint(orbPos) < 2.0;
                if (!inPond && !inMonolith) {
                    orb.position.copy(orbPos);
                    orb.userData.basePosition = orb.position.clone();
                    orb.userData.timeOffset = Math.random() * Math.PI * 2;
                    validPosition = true;
                }
            }
            this.scene.add(orb);
        }

        this.specialOrb = new THREE.Mesh(this.orbGeometry, this.specialOrbMaterial);
        placeOrb(this.specialOrb);

        for (let i = 0; i < ORB_COUNT - 1; i++) {
            const orb = new THREE.Mesh(this.orbGeometry, this.orbMaterial);
            placeOrb(orb);
            this.orbs.push(orb);
        }
        this.score = 0;
        if (this.scoreElement) this.scoreElement.innerText = `Score: 0`;
    };

    private triggerOrbBurst(position: THREE.Vector3, color: THREE.Color) {
        for (let i = 0; i < this.PARTICLES_PER_BURST; i++) {
            const particleMesh = this.particlePool.pop();
            if (!particleMesh) continue;

            particleMesh.position.copy(position);
            (particleMesh.material as THREE.MeshBasicMaterial).color.copy(color);
            (particleMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
            particleMesh.visible = true;
            
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5),
                (Math.random() - 0.5) + 0.5, // Bias upwards
                (Math.random() - 0.5)
            ).normalize().multiplyScalar(Math.random() * 2.5 + 1.5);

            const lifetime = Math.random() * 0.6 + 0.4; // Lifetime between 0.4 and 1.0 seconds

            this.activeParticles.push({
                mesh: particleMesh,
                velocity: velocity,
                lifetime: lifetime,
                initialLifetime: lifetime,
            });
        }
    }

    private triggerConfetti() {
        if (!this.confettiContainerElement) return;
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = `${Math.random() * 2}s`;
            confetti.style.animationDuration = `${3 + Math.random() * 2}s`;
            this.confettiContainerElement.appendChild(confetti);
            setTimeout(() => { confetti.remove(); }, 5000);
        }
    }

    private handleWin() {
        this.isCelebratingWin = true;
        if(this.winScreenElement && this.winMessageElement) {
            this.winMessageElement.innerHTML = "Focus on Career, not girls. Girls are temporary, But Success is parmanent 😁";
            this.winScreenElement.style.display = 'flex';
            this.triggerConfetti();
        }
        setTimeout(() => {
            if(this.winScreenElement) this.winScreenElement.style.display = 'none';
            this.spawnOrbs();
            this.isCelebratingWin = false;
        }, 5000);
    }
    
    private updateParticles(delta: number) {
        const gravity = 9.8;
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const p = this.activeParticles[i];

            p.lifetime -= delta;

            if (p.lifetime <= 0) {
                p.mesh.visible = false;
                this.particlePool.push(p.mesh);
                this.activeParticles.splice(i, 1);
                continue;
            }

            // Apply gravity
            p.velocity.y -= gravity * delta;
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));

            // Fade out
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.lifetime / p.initialLifetime;
        }
    }

    private jump = () => {
        if (!this.playerState.isJumping) {
            this.playerState.isJumping = true;
            this.playerState.yVelocity = 7.0; // Jump strength
        }
    }

    private updatePlayer(delta: number) {
        const moveSpeed = 5.0;
        const rotationSpeed = 10.0;
        const hoverHeight = 1.5;
        const gravity = 20.0;

        if (this.playerState.isJumping) {
            this.playerState.yVelocity -= gravity * delta;
            this.player.position.y += this.playerState.yVelocity * delta;

            if (this.player.position.y <= hoverHeight) {
                this.player.position.y = hoverHeight;
                this.playerState.isJumping = false;
                this.playerState.yVelocity = 0;
            }
        }

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cameraOrbit);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

        const moveDirection = new THREE.Vector3();
        if (this.keysPressed.w) moveDirection.add(forward);
        if (this.keysPressed.s) moveDirection.sub(forward); // Note: Swapped right and forward for joystick layout
        if (this.keysPressed.a) moveDirection.add(right);
        if (this.keysPressed.d) moveDirection.sub(right); // Note: Swapped a/d from desktop
        
        const targetVelocity = new THREE.Vector3();
        if (moveDirection.lengthSq() > 0) {
             targetVelocity.copy(moveDirection.normalize().multiplyScalar(moveSpeed));
        }
        
        const lerpFactor = 1.0 - Math.exp(-20 * delta);
        this.playerState.velocity.lerp(targetVelocity, lerpFactor);
        const moveStep = this.playerState.velocity.clone().multiplyScalar(delta);

        const monolithBBox = new Box3().setFromObject(this.monolith);
        const playerBBox = new Box3().setFromObject(this.player);
        playerBBox.translate(moveStep);

        if (!playerBBox.intersectsBox(monolithBBox)) {
            this.player.position.add(moveStep);
        } else {
            this.playerState.velocity.set(0,0,0);
        }

        if (this.playerState.velocity.lengthSq() > 0.01) {
            const lookAtPosition = this.player.position.clone().add(this.playerState.velocity);
            const targetMatrix = new THREE.Matrix4().lookAt(this.player.position, lookAtPosition, this.player.up);
            const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
            this.player.quaternion.slerp(targetQuaternion, delta * rotationSpeed);
        }
    }

    private updateCamera(delta: number) {
        const desiredPosition = this.player.position.clone();
        const offset = this.cameraOffset.clone().applyQuaternion(this.cameraOrbit);
        desiredPosition.add(offset);
        
        const lerpFactor = 1.0 - Math.exp(-15 * delta);
        this.camera.position.lerp(desiredPosition, lerpFactor);
        
        const desiredLookAt = this.player.position.clone().add(this.cameraTargetOffset);
        this.cameraLookAt.lerp(desiredLookAt, lerpFactor);
        this.camera.lookAt(this.cameraLookAt);
    }

    private updateOrbAnimation(orb: THREE.Mesh, delta: number, elapsedTime: number) {
        const basePos = orb.userData.basePosition as THREE.Vector3;
        const timeOffset = orb.userData.timeOffset as number;
        orb.position.y = basePos.y + Math.sin(elapsedTime * 2 + timeOffset) * 0.2;
        const circularRadius = 0.2;
        const circularSpeed = 0.5;
        orb.position.x = basePos.x + Math.cos(elapsedTime * circularSpeed + timeOffset) * circularRadius;
        orb.position.z = basePos.z + Math.sin(elapsedTime * circularSpeed + timeOffset) * circularRadius;
        orb.rotation.y += delta;
    }

    private updateOrbs(delta: number, elapsedTime: number) {
        if(this.isCelebratingWin) return;
        for (let i = this.orbs.length - 1; i >= 0; i--) {
            const orb = this.orbs[i];
            this.updateOrbAnimation(orb, delta, elapsedTime);
            if (this.player.position.distanceTo(orb.position) < PLAYER_SIZE / 2 + 0.3) {
                this.triggerOrbBurst(orb.position, (orb.material as THREE.MeshStandardMaterial).color);
                this.scene.remove(orb);
                this.orbs.splice(i, 1);
                this.score++;
            }
        }
        if(this.specialOrb) {
            this.updateOrbAnimation(this.specialOrb, delta, elapsedTime);
             if (this.player.position.distanceTo(this.specialOrb.position) < PLAYER_SIZE / 2 + 0.3) {
                this.triggerOrbBurst(this.specialOrb.position, (this.specialOrb.material as THREE.MeshStandardMaterial).color);
                this.scene.remove(this.specialOrb);
                this.specialOrb = null;
                this.score += 5;
            }
        }
        if (this.scoreElement) this.scoreElement.innerText = `Score: ${this.score}`;
        if (this.score >= WIN_SCORE && !this.isCelebratingWin) this.handleWin();
    }

    public update(delta: number, elapsedTime: number) {
        if (!this.isActive) return;
        this.updatePlayer(delta);
        this.updateCamera(delta);
        this.updateOrbs(delta, elapsedTime);
        this.updateParticles(delta);
    }
    
    // --- Event Handlers ---
    private handleKeyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key in this.keysPressed) this.keysPressed[key] = true;
        if (event.code === 'Space') this.jump();
    };
    private handleKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key in this.keysPressed) this.keysPressed[key] = false;
    };
    private handleDesktopMouseMove = (event: MouseEvent) => {
        if (!this.isActive || !document.pointerLockElement) return;
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this.cameraEuler.y -= movementX * 0.002;
        this.cameraEuler.x -= movementY * 0.002;
        this.cameraEuler.x = Math.max(-Math.PI / 2 * 0.8, Math.min(Math.PI / 2 * 0.8, this.cameraEuler.x));
        this.cameraOrbit.setFromEuler(this.cameraEuler);
    };
    private handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length > 0) {
            this.lastTouch.set(event.touches[0].clientX, event.touches[0].clientY);
        }
    };
    private handleTouchMove = (event: TouchEvent) => {
        if (!this.isActive || event.touches.length === 0) return;
        const touch = event.touches[0];
        const movementX = touch.clientX - this.lastTouch.x;
        const movementY = touch.clientY - this.lastTouch.y;
        this.cameraEuler.y -= movementX * 0.004; // Increased sensitivity for touch
        this.cameraEuler.x -= movementY * 0.004;
        this.cameraEuler.x = Math.max(-Math.PI / 2 * 0.8, Math.min(Math.PI / 2 * 0.8, this.cameraEuler.x));
        this.cameraOrbit.setFromEuler(this.cameraEuler);
        this.lastTouch.set(touch.clientX, touch.clientY);
    };
    private mobileControlListener = (key: string, value: boolean) => () => { this.keysPressed[key] = value; };

    private setupEventListeners() {
        if (this.isMobile) {
            this.renderer.domElement.addEventListener('touchstart', this.handleTouchStart);
            this.renderer.domElement.addEventListener('touchmove', this.handleTouchMove);

            this.mobileControls.w = document.getElementById('joy-w');
            this.mobileControls.a = document.getElementById('joy-a');
            this.mobileControls.s = document.getElementById('joy-s');
            this.mobileControls.d = document.getElementById('joy-d');
            this.mobileControls.jump = document.getElementById('jump-btn');

            this.mobileControls.w?.addEventListener('touchstart', this.mobileControlListener('w', true));
            this.mobileControls.w?.addEventListener('touchend', this.mobileControlListener('w', false));
            this.mobileControls.a?.addEventListener('touchstart', this.mobileControlListener('a', true));
            this.mobileControls.a?.addEventListener('touchend', this.mobileControlListener('a', false));
            this.mobileControls.s?.addEventListener('touchstart', this.mobileControlListener('s', true));
            this.mobileControls.s?.addEventListener('touchend', this.mobileControlListener('s', false));
            this.mobileControls.d?.addEventListener('touchstart', this.mobileControlListener('d', true));
            this.mobileControls.d?.addEventListener('touchend', this.mobileControlListener('d', false));
            this.mobileControls.jump?.addEventListener('touchstart', this.jump);
        } else {
            window.addEventListener('keydown', this.handleKeyDown);
            window.addEventListener('keyup', this.handleKeyUp);
            document.addEventListener('mousemove', this.handleDesktopMouseMove);
        }
    }

    private disposeEventListeners() {
         if (this.isMobile) {
            this.renderer.domElement.removeEventListener('touchstart', this.handleTouchStart);
            this.renderer.domElement.removeEventListener('touchmove', this.handleTouchMove);
            this.mobileControls.w?.removeEventListener('touchstart', this.mobileControlListener('w', true));
            this.mobileControls.w?.removeEventListener('touchend', this.mobileControlListener('w', false));
            this.mobileControls.a?.removeEventListener('touchstart', this.mobileControlListener('a', true));
            this.mobileControls.a?.removeEventListener('touchend', this.mobileControlListener('a', false));
            this.mobileControls.s?.removeEventListener('touchstart', this.mobileControlListener('s', true));
            this.mobileControls.s?.removeEventListener('touchend', this.mobileControlListener('s', false));
            this.mobileControls.d?.removeEventListener('touchstart', this.mobileControlListener('d', true));
            this.mobileControls.d?.removeEventListener('touchend', this.mobileControlListener('d', false));
            this.mobileControls.jump?.removeEventListener('touchstart', this.jump);
        } else {
            window.removeEventListener('keydown', this.handleKeyDown);
            window.removeEventListener('keyup', this.handleKeyUp);
            document.removeEventListener('mousemove', this.handleDesktopMouseMove);
        }
    }
    
    public dispose() {
        this.disposeEventListeners();
        this.orbs.forEach(orb => this.scene.remove(orb));
        if (this.specialOrb) this.scene.remove(this.specialOrb);

        // Particle cleanup
        [...this.activeParticles.map(p => p.mesh), ...this.particlePool].forEach(mesh => {
            this.scene.remove(mesh);
            (mesh.material as THREE.Material).dispose();
        });
        this.activeParticles = [];
        this.particlePool = [];
        this.particleGeometry.dispose();
        this.particleMaterial.dispose();

        this.scene.remove(this.player);
        this.player.geometry.dispose();
        (this.player.material as THREE.Material).dispose();
        this.orbGeometry.dispose();
        this.orbMaterial.dispose();
        this.specialOrbMaterial.dispose();
    }
}
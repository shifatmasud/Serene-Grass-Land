import * as THREE from 'three';
import { Box3 } from 'three';

const ORB_COUNT = 5;
const PLAYER_SIZE = 1.0;

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private monolith: THREE.Mesh;
    private pond: { position: THREE.Vector3; radius: number };

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

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        monolith: THREE.Mesh,
        pond: { position: THREE.Vector3; radius: number }
    ) {
        this.scene = scene;
        this.camera = camera;
        this.monolith = monolith;
        this.pond = pond;

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

    public startGame() {
        this.isActive = true;
        this.camera.position.set(0, 5, 15); // Reset camera for gameplay
        this.setupEventListeners();
    }
    
    public stopGame() {
        this.isActive = false;
        Object.keys(this.keysPressed).forEach(k => (this.keysPressed[k] = false));
        this.disposeEventListeners();
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
        const moveSpeed = 5.0; // units per second
        const damping = 0.92;
        const hoverHeight = 1.5;

        // --- Camera-relative movement calculation ---
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();

        const moveDirection = new THREE.Vector3();
        if (this.keysPressed.w) moveDirection.add(forward);
        if (this.keysPressed.s) moveDirection.sub(forward);
        if (this.keysPressed.a) moveDirection.add(right);
        if (this.keysPressed.d) moveDirection.sub(right);
        
        if (moveDirection.lengthSq() > 0) {
             this.playerState.velocity.add(moveDirection.normalize().multiplyScalar(moveSpeed));
        }
        
        const effectiveDamping = Math.pow(damping, delta * 60);
        this.playerState.velocity.multiplyScalar(effectiveDamping);
        
        const moveStep = this.playerState.velocity.clone().multiplyScalar(delta);

        const monolithBBox = new Box3().setFromObject(this.monolith);
        const playerBBox = new Box3().setFromObject(this.player);

        playerBBox.translate(moveStep);

        if (!playerBBox.intersectsBox(monolithBBox)) {
            this.player.position.add(moveStep);
        } else {
            this.playerState.velocity.set(0,0,0);
        }

        this.player.position.y = hoverHeight;
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
        if (!this.isActive) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.camera.quaternion);

        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        
        const PI_2 = Math.PI / 2;
        euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));

        this.camera.quaternion.setFromEuler(euler);
        
        const offset = new THREE.Vector3(0, 2, 5);
        offset.applyQuaternion(this.camera.quaternion);
        this.camera.position.copy(this.player.position).add(offset);
        this.camera.lookAt(this.player.position.clone().add(new THREE.Vector3(0,1,0)));
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
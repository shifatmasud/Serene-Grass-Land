
import * as THREE from 'three';

export function createGround(params: { groundColor: string | number | THREE.Color }) {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshToonMaterial({ color: params.groundColor });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
}

export function createMonolith(params: { monolithColor: string | number | THREE.Color }) {
    const geometry = new THREE.BoxGeometry(0.8, 2.5, 0.5);
    const material = new THREE.MeshToonMaterial({ color: params.monolithColor });
    const monolith = new THREE.Mesh(geometry, material);
    monolith.position.set(0, 1.25, -15);
    monolith.castShadow = true;
    monolith.receiveShadow = true;
    return monolith;
}

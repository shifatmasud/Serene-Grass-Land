
import * as THREE from 'three';

// --- New Soft & Blurry Cloud Texture Generator ---
function createSoftCloudTexture() {
    const size = 128; // Reduced texture resolution
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get 2D context from canvas');
    }

    const centerX = size / 2;
    const centerY = size / 2;

    // Create a very soft radial gradient. This is the key to the blurry effect.
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// --- Cloud Factory ---
export function createClouds(params: { count: number; color: string | number | THREE.Color }) {
    const cloudTexture = createSoftCloudTexture();

    const baseCloudMaterial = new THREE.MeshLambertMaterial({
        map: cloudTexture,
        color: params.color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // Use AdditiveBlending for a soft, glowing effect
    });

    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    const cloudsGroup = new THREE.Group();
    
    const maxClouds = 50;
    const areaSize = 150;
    const heightRange = { min: 25, max: 40 };
    const baseColor = new THREE.Color(params.color);
    const shadowColor = new THREE.Color(0x8899aa); // A cool, grayish shadow color

    for (let i = 0; i < maxClouds; i++) {
        const puffyCloud = new THREE.Group();
        const puffCount = 10 + Math.floor(Math.random() * 10);

        for (let j = 0; j < puffCount; j++) {
            // Clone material for each puff to give it a unique color for shading
            const puffMaterial = baseCloudMaterial.clone();
            const puff = new THREE.Mesh(cloudGeo, puffMaterial);
            
            const puffScale = 20 + Math.random() * 15;
            puff.scale.set(puffScale, puffScale, 1);
            
            // Position puffs to create a more cloud-like shape (flatter bottom, puffier top)
            const xPos = (Math.random() - 0.5) * puffScale * 1.8;
            const yPos = (Math.random() * Math.random()) * puffScale * 0.6; // Skew towards bottom
            const zPos = (Math.random() - 0.5) * puffScale * 1.2;
            puff.position.set(xPos, yPos, zPos);
            
            puff.rotation.z = Math.random() * Math.PI * 2;

            // Fake shading based on vertical position within the cloud
            const shadeFactor = Math.max(0, Math.min(1, yPos / (puffScale * 0.6)));
            puffMaterial.color.lerpColors(shadowColor, baseColor, shadeFactor);

            // Adjust opacity for AdditiveBlending. Lower values work better.
            // Higher puffs (closer to the sun) are slightly more opaque.
            puffMaterial.opacity = 0.1 + shadeFactor * 0.2; 

            puffyCloud.add(puff);
        }
        
        puffyCloud.position.set(
            (Math.random() - 0.5) * areaSize,
            heightRange.min + Math.random() * (heightRange.max - heightRange.min),
            (Math.random() - 0.5) * areaSize
        );
        
        puffyCloud.userData.speed = new THREE.Vector3(
            0.5 + Math.random() * 1.5,
            0,
            0
        );
        
        puffyCloud.visible = i < params.count;
        cloudsGroup.add(puffyCloud);
    }
    
    // --- User Data Functions for GUI control ---

    cloudsGroup.userData.update = (delta: number, camera: THREE.Camera) => {
        cloudsGroup.children.forEach(cloud => {
            if (cloud instanceof THREE.Group && cloud.visible) {
                cloud.position.x += cloud.userData.speed.x * delta;
                
                const wrapBoundary = areaSize / 2 + 50;
                if (cloud.position.x > wrapBoundary) {
                    cloud.position.x = -wrapBoundary;
                    cloud.position.z = (Math.random() - 0.5) * areaSize;
                    cloud.position.y = heightRange.min + Math.random() * (heightRange.max - heightRange.min);
                }

                // Billboard effect
                cloud.children.forEach(puff => {
                    if (puff instanceof THREE.Mesh) {
                        puff.quaternion.copy(camera.quaternion);
                    }
                });
            }
        });
    };
    
    cloudsGroup.userData.setCloudCount = (count: number) => {
        cloudsGroup.children.forEach((cloud, i) => {
            cloud.visible = i < count;
        });
    };
    
    cloudsGroup.userData.setCloudColor = (color: string | number | THREE.Color) => {
        const newBaseColor = new THREE.Color(color);
        cloudsGroup.children.forEach(cloud => {
            if (cloud instanceof THREE.Group) {
                cloud.children.forEach(puff => {
                    if (puff instanceof THREE.Mesh) {
                        const material = puff.material as THREE.MeshLambertMaterial;
                        const puffScale = puff.scale.x;
                        const yPos = puff.position.y;
                        const shadeFactor = Math.max(0, Math.min(1, yPos / (puffScale * 0.6)));
                        material.color.lerpColors(shadowColor, newBaseColor, shadeFactor);
                    }
                });
            }
        });
    };

    return cloudsGroup;
}
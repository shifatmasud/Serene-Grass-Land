import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export function createWater(
    geometry: THREE.BufferGeometry, 
    sunDirection: THREE.Vector3,
    initialColor: string | number | THREE.Color,
    sunColor: string | number | THREE.Color
) {
    const textureLoader = new THREE.TextureLoader();
    const waterNormals = textureLoader.load(
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg', 
        (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
    );

    const noiseTexture = textureLoader.load(
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/lava/cloud.png',
        (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
    );

    const water = new Water(geometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: sunDirection,
        sunColor: sunColor,
        waterColor: initialColor,
        distortionScale: 1.5,
        fog: true,
        alpha: 0.9,
    });
    
    water.rotation.x = -Math.PI / 2;

    const waterMaterial = water.material as THREE.ShaderMaterial;

    // Add new uniforms for the ripple effect
    waterMaterial.uniforms.noiseTexture = { value: noiseTexture };
    waterMaterial.uniforms.rippleScale = { value: 2.0 };
    waterMaterial.uniforms.rippleSpeed = { value: 0.03 };
    waterMaterial.uniforms.rippleIntensity = { value: 0.2 };

    // Modify the fragment shader to add the ripple effect
    const originalFragmentShader = waterMaterial.fragmentShader;
    const injectionPoint = 'vec4 normalColor = texture2D( waterNormals, distorted.xy * flowDirection );';
    
    waterMaterial.fragmentShader = originalFragmentShader.replace(
        'varying vec4 vCoord;',
        `
        varying vec4 vCoord;
        uniform sampler2D noiseTexture;
        uniform float rippleScale;
        uniform float rippleSpeed;
        uniform float rippleIntensity;
        `
    ).replace(
        injectionPoint,
        injectionPoint + `
        // Add subtle ripple effect using noise
        vec2 rippleUv = distorted.xy * flowDirection * rippleScale + (time * rippleSpeed);
        vec3 noise = texture2D( noiseTexture, rippleUv ).rgb;
        normalColor.rgb = mix(normalColor.rgb, noise, rippleIntensity);
        `
    );


    return water;
}
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export function createWater(
    geometry: THREE.BufferGeometry, 
    sunDirection: THREE.Vector3,
    initialColor: string | number | THREE.Color,
    sunColor: string | number | THREE.Color,
    params: {
        rippleScale: number;
        rippleSpeed: number;
        rippleIntensity: number;
        interactiveRippleRadius: number;
        interactiveRippleStrength: number;
    }
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
        textureWidth: 256, // Reduced texture resolution
        textureHeight: 256, // Reduced texture resolution
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
    waterMaterial.uniforms.rippleScale = { value: params.rippleScale };
    waterMaterial.uniforms.rippleSpeed = { value: params.rippleSpeed };
    waterMaterial.uniforms.rippleIntensity = { value: params.rippleIntensity };
    waterMaterial.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };
    waterMaterial.uniforms.uRippleRadius = { value: params.interactiveRippleRadius };
    waterMaterial.uniforms.uRippleStrength = { value: params.interactiveRippleStrength };


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
        
        uniform vec3 uMousePos;
        uniform float uRippleRadius;
        uniform float uRippleStrength;
        `
    ).replace(
        injectionPoint,
        `
        // --- Ambient Waves ---
        vec2 rippleUv = distorted.xy * flowDirection * rippleScale + (time * rippleSpeed);
        vec3 noise = texture2D( noiseTexture, rippleUv ).rgb;
        // Convert noise from [0,1] to [-1,1] to create an offset in any direction
        vec2 noiseOffset = (noise.xy * 2.0 - 1.0) * rippleIntensity;

        // --- Interactive Ripples ---
        vec3 worldPosition = vCoord.xyz / vCoord.w;
        float dist = distance(worldPosition.xz, uMousePos.xz);
        vec2 interactiveOffset = vec2(0.0);
        if (dist < uRippleRadius) {
            // Create a wave that expands outwards and fades
            float falloff = smoothstep(uRippleRadius, 0.0, dist);
            float wave = sin(dist * 15.0 - time * 8.0);
            float rippleEffect = wave * falloff * uRippleStrength;
            
            // Calculate direction from ripple center to fragment to displace along that vector
            vec2 direction = normalize(worldPosition.xz - uMousePos.xz);
            interactiveOffset = direction * rippleEffect;
        }

        // --- Combine Effects & Sample Normal Map ---
        vec2 finalUv = distorted.xy * flowDirection + noiseOffset + interactiveOffset;
        vec4 normalColor = texture2D( waterNormals, finalUv );
        `
    );


    return water;
}
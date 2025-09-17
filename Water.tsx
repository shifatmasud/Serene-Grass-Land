import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// This function creates a stylized, textureless water effect.
// Instead of using a normal map texture, it generates procedural ripples in the shader.
// The color is derived entirely from reflections and refractions of the environment.
export function createWater(
    geometry: THREE.BufferGeometry, 
    sunDirection: THREE.Vector3,
    params: {
        rippleScale: number;
        rippleSpeed: number;
        rippleIntensity: number;
        interactiveRippleRadius: number;
        interactiveRippleStrength: number;
        waterDistortion: number;
        sunColor: string | number | THREE.Color,
    }
) {
    const water = new Water(geometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.Texture(), // Pass an empty texture, we won't use it
        sunDirection: sunDirection,
        sunColor: params.sunColor,
        waterColor: 0x001e0f, // This color is mostly overridden by fog and reflection
        distortionScale: params.waterDistortion,
        fog: true,
        alpha: 0.95,
    });
    
    water.rotation.x = -Math.PI / 2;

    const waterMaterial = water.material as THREE.ShaderMaterial;
    
    // Add new uniforms for procedural ripples
    waterMaterial.uniforms.rippleScale = { value: params.rippleScale };
    waterMaterial.uniforms.rippleSpeed = { value: params.rippleSpeed };
    waterMaterial.uniforms.rippleIntensity = { value: params.rippleIntensity };
    waterMaterial.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };
    waterMaterial.uniforms.uRippleRadius = { value: params.interactiveRippleRadius };
    waterMaterial.uniforms.uRippleStrength = { value: params.interactiveRippleStrength };
    
    // We will override the default shader to create our procedural effect
    waterMaterial.onBeforeCompile = (shader) => {
        // Add uniforms and noise function to the shader code
        shader.fragmentShader = `
            uniform float rippleScale;
            uniform float rippleSpeed;
            uniform float rippleIntensity;
            
            uniform vec3 uMousePos;
            uniform float uRippleRadius;
            uniform float uRippleStrength;

            // 2D Simplex Noise
            vec2 hash( vec2 p ) {
                p = vec2( dot(p,vec2(127.1,311.7)),
                          dot(p,vec2(269.5,183.3)) );
                return -1.0 + 2.0*fract(sin(p)*43758.5453123);
            }

            float noise( in vec2 p ) {
                const float K1 = 0.366025404; // (sqrt(3)-1)/2;
                const float K2 = 0.211324865; // (3-sqrt(3))/6;
            
                vec2 i = floor( p + (p.x+p.y)*K1 );
                
                vec2 a = p - i + (i.x+i.y)*K2;
                vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                vec2 b = a - o + K2;
                vec2 c = a - 1.0 + 2.0*K2;
            
                vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
                vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
            
                return dot( n, vec3(70.0) );
            }
        \n` + shader.fragmentShader;

        const normalCalculation = `
            // --- Start of Procedural Normals ---

            // Function to get total displacement at a world position
            float getDisplacement(vec2 worldPos) {
                // Ambient waves
                vec2 pos = worldPos * rippleScale * 0.05;
                float n1 = noise(pos + time * rippleSpeed);
                float n2 = noise(pos * 2.1 + time * rippleSpeed * 1.3);
                float ambientDisplacement = n1 * 0.6 + n2 * 0.4;

                // Interactive ripples
                float interactiveDisplacement = 0.0;
                float dist = distance(worldPos, uMousePos.xz);
                if(dist < uRippleRadius) {
                    float falloff = smoothstep(uRippleRadius, 0.0, dist);
                    // Create a circular wave expanding from the center
                    interactiveDisplacement = -sin(dist * 4.0 - time * 10.0) * falloff * uRippleStrength;
                }

                return ambientDisplacement + interactiveDisplacement;
            }

            // Calculate the normal from the gradient of the displacement field
            vec2 delta = vec2(0.1, 0.0);

            float displacement = getDisplacement(worldPosition.xz);
            float displacement_dx = getDisplacement(worldPosition.xz + delta.xy);
            float displacement_dz = getDisplacement(worldPosition.xz + delta.yx);

            vec3 normal = normalize(vec3(
                (displacement - displacement_dx) * rippleIntensity * 100.0,
                1.0,
                (displacement - displacement_dz) * rippleIntensity * 100.0
            ));
            // --- End of Procedural Normals ---
        `;

        // Replace the texture-based normal calculation with our procedural one
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 normalColor = texture2D( tNormal, vUv * textureMatrix );',
            'vec4 normalColor = vec4(0.0); // Not used'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );',
            normalCalculation
        );
    };

    return water;
}
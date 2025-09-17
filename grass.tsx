
import * as THREE from 'three';

export function createGrass(
    pondPosition: THREE.Vector3,
    pondRadius: number,
    params: {
        grassCount: number;
        grassBaseColor: string | number | THREE.Color;
        grassTipColor: string | number | THREE.Color;
    },
    maxGrassCount: number
) {
    const grassBladeHeight = 1.0;
    const grassGeometry = new THREE.PlaneGeometry(0.1, grassBladeHeight, 1, 2);
    grassGeometry.translate(0, grassBladeHeight / 2, 0);

    const randoms = new Float32Array(maxGrassCount);
    for (let i = 0; i < maxGrassCount; i++) {
        randoms[i] = Math.random();
    }
    grassGeometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(randoms, 1));


    const positions = grassGeometry.attributes.position;
    positions.setX(0, 0);
    positions.setX(1, 0);
    positions.needsUpdate = true;
    grassGeometry.computeVertexNormals();

    const grassMaterial = new THREE.MeshToonMaterial({
        side: THREE.DoubleSide,
        vertexColors: true,
        color: params.grassBaseColor,
    });

    grassMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = { value: 0 };
        shader.uniforms.uMousePos = { value: new THREE.Vector3(9999, 9999, 9999) };
        shader.uniforms.uGrassTipColor = { value: new THREE.Color(params.grassTipColor) };
        shader.uniforms.uSunDirection = { value: new THREE.Vector3(0, 1, 0) };

        shader.vertexShader = `
            uniform float time;
            uniform vec3 uMousePos;
            varying vec3 vWorldPosition;
            varying float vRelativeHeight;
            attribute float aRandom;
            varying float vRandom;
            varying vec3 vGrassNormal;
        \n` + shader.vertexShader;
        
        shader.fragmentShader = `
            uniform vec3 uGrassTipColor;
            uniform vec3 uSunDirection;
            varying float vRelativeHeight;
            varying float vRandom;
            varying vec3 vGrassNormal;
            varying vec3 vWorldPosition;
        \n` + shader.fragmentShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
                #include <begin_vertex>
                vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
                vRelativeHeight = position.y / ${grassBladeHeight.toFixed(1)};
                vRandom = aRandom;
                vGrassNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);

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

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
                #include <color_fragment>
                
                // 1. Color variation
                float gradientNoise = (vRandom - 0.5) * 0.4;
                float gradient = clamp(vRelativeHeight * (1.0 - gradientNoise) + gradientNoise, 0.0, 1.0);
                vec3 mixedColor = mix(diffuseColor.rgb, uGrassTipColor, gradient);

                // 2. Subsurface scattering
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                vec3 lightDir = normalize(-uSunDirection);

                // Translucency (light from behind passing through)
                float translucency = max(0.0, dot(vGrassNormal, lightDir));
                translucency = pow(translucency, 2.0) * 0.5;

                // Scattering (light wrapping around edges)
                float scatter = pow(max(0.0, dot(viewDir, -lightDir) + 0.1), 3.0) * 0.7;

                // Combine and add to color
                vec3 sssColor = (uGrassTipColor + diffuseColor.rgb) * 0.4; // Average base and tip color for glow
                vec3 finalSSS = sssColor * (translucency + scatter);

                diffuseColor.rgb = mixedColor + finalSSS;
            `
        );
        grassMaterial.userData.shader = shader;
    };

    const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, maxGrassCount);
    grassMesh.count = params.grassCount;
    grassMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const areaSize = 50;
    const pondCenter = new THREE.Vector2(pondPosition.x, pondPosition.z);
    const pondRadiusSq = pondRadius * pondRadius;

    for (let i = 0; i < maxGrassCount; i++) {
        let x, z;
        do {
            x = (Math.random() - 0.5) * areaSize;
            z = (Math.random() - 0.5) * areaSize;
        } while (new THREE.Vector2(x, z).distanceToSquared(pondCenter) < pondRadiusSq);

        dummy.position.set(x, 0, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.7 + Math.random() * 0.6);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(i, dummy.matrix);
        
        color.set(params.grassBaseColor);
        color.multiplyScalar(0.8 + Math.random() * 0.4);
        grassMesh.setColorAt(i, color);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) {
       grassMesh.instanceColor.needsUpdate = true;
    }

    return grassMesh;
}

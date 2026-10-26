/**
 * WETNESS & PUDDLE SHADER (WGSL)
 * Modyfikuje chropowatość i odbicia na podstawie wilgoci i wysokości.
 */

fn calculateWetness(worldPos: vec3<f32>, worldNormal: vec3<f32>, wetness: f32) -> f32 {
    // Prosta symulacja kałuży: worldNormal.y musi być bliskie 1.0 (powierzchnia pozioma)
    let isHorizontal = smoothstep(0.7, 0.9, worldNormal.y);
    
    // Prosta funkcja szumu dla kałuż
    let noise = sin(worldPos.x * 0.5) * cos(worldPos.z * 0.5);
    
    // Faktor kałuży
    let puddleFactor = smoothstep(0.4, 0.6, noise + 0.5);
    
    return puddleFactor * isHorizontal * wetness;
}

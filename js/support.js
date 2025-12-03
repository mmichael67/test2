// ============================================
// SUPPORT VISUALIZATION
// ============================================

// Find minimum Z level and add fixed supports there
function addSupportsAtBase() {
    if (!buildingBounds || !structure) return;
    
    // Calculate minimum Z in centered coordinates
    const minZ = buildingBounds.min.z - buildingCenter.z;
    
    console.log('Adding fixed supports at Z =', minZ);
    
    // Find all vertices at or near minimum level
    const tolerance = 0.1; // Small tolerance for floating point comparison
    const supportPositions = [];
    
    // Check all vertices in geometry
    const positions = geometryData;
    const offsetX = -buildingCenter.x;
    const offsetY = -buildingCenter.y;
    const offsetZ = -buildingCenter.z;
    
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] + offsetX;
        const y = positions[i + 1] + offsetY;
        const z = positions[i + 2] + offsetZ;
        
        // If vertex is at minimum level
        if (Math.abs(z - minZ) < tolerance) {
            // Check if we already have a support at this XY location
            const exists = supportPositions.some(pos => 
                Math.abs(pos.x - x) < 0.5 && Math.abs(pos.y - y) < 0.5
            );
            
            if (!exists) {
                supportPositions.push({ x, y, z: minZ });
            }
        }
    }
    
    console.log(`Found ${supportPositions.length} support locations at base`);
    
    // Create fixed support symbols at each location
    supportPositions.forEach(pos => {
        createFixedSupport(pos.x, pos.y, pos.z);
    });
}

// Create a fixed support symbol (triangle with hatching)
function createFixedSupport(x, y, z) {
    const supportGroup = new THREE.Group();
    
    // Create triangle base
    const size = buildingMaxSize * 0.02; // Scale with building
    const triangleGeometry = new THREE.BufferGeometry();
    
    const vertices = new Float32Array([
        0, 0, 0,
        -size, -size * 0.5, 0,
        size, -size * 0.5, 0
    ]);
    
    triangleGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    const triangleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        side: THREE.DoubleSide 
    });
    
    const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
    supportGroup.add(triangle);
    
    // Add hatching lines below triangle
    const lineGeometry = new THREE.BufferGeometry();
    const lineVertices = [];
    
    for (let i = 0; i < 5; i++) {
        const offset = -size * 0.5 - (i * size * 0.15);
        lineVertices.push(-size, offset, 0);
        lineVertices.push(size, offset, 0);
    }
    
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineVertices), 3));
    
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    supportGroup.add(lines);
    
    // Position the support
    supportGroup.position.set(x, y, z);
    
    // Rotate to align with XY plane (Z-up)
    supportGroup.rotation.x = Math.PI / 2;
    
    structure.add(supportGroup);
}

// ============================================
// DATA LOADER - Parse ER-mem.html for geometry
// ============================================

let geometryData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;
let gridHelper = null;
let initialCameraPosition = null;
let initialCameraTarget = null;

// Parse the ER-mem.html file to extract vertex data
async function loadStructureData() {
    try {
        const response = await fetch('ER-mem.html');
        const htmlText = await response.text();
        
        // Extract vertex data from the Float32Array in the HTML
        const vertexMatch = htmlText.match(/var vertices = new Float32Array\(\[([\s\S]*?)\]\);/);
        
        if (!vertexMatch) {
            console.error('Could not find vertex data in ER-mem.html');
            return null;
        }
        
        // Parse the vertex array
        const vertexString = vertexMatch[1];
        const vertices = vertexString
            .split(',')
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n));
        
        console.log(`Loaded ${vertices.length} vertex values (${vertices.length / 3} coordinates)`);
        
        geometryData = new Float32Array(vertices);
        
        // Calculate bounds
        calculateBounds();
        
        return geometryData;
    } catch (error) {
        console.error('Error loading ER-mem.html:', error);
        return null;
    }
}

function calculateBounds() {
    if (!geometryData) return;
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < geometryData.length; i += 3) {
        const x = geometryData[i];
        const y = geometryData[i + 1];
        const z = geometryData[i + 2];
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
    }
    
    buildingCenter = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
    };
    
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    
    buildingMaxSize = Math.max(sizeX, sizeY, sizeZ);
    
    buildingBounds = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        center: buildingCenter,
        maxSize: buildingMaxSize
    };
    
    console.log('Building bounds:', buildingBounds);
}

function getColorForTriangle(v1, v2, v3) {
    // Get bounding box of triangle
    const minX = Math.min(v1.x, v2.x, v3.x);
    const maxX = Math.max(v1.x, v2.x, v3.x);
    const minY = Math.min(v1.y, v2.y, v3.y);
    const maxY = Math.max(v1.y, v2.y, v3.y);
    const minZ = Math.min(v1.z, v2.z, v3.z);
    const maxZ = Math.max(v1.z, v2.z, v3.z);
    
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    
    // Column: vertical element (Z dimension much larger)
    if (dz > 2.0 && dz > dx * 2 && dz > dy * 2) {
        return new THREE.Color(0xff4444); // Red
    }
    
    // Beam: horizontal elongated element
    if (dz > 0.3 && dz < 1.0 && (dx > 1.5 || dy > 1.5)) {
        return new THREE.Color(0x4444ff); // Blue
    }
    
    // Default: use original blue color for slabs, walls, etc.
    return new THREE.Color(0x2222ff); // Original blue
}

function createStructureFromData() {
    if (!geometryData) {
        console.error('No geometry data loaded');
        return;
    }
    
    structure = new THREE.Group();
    
    // Center the building at origin
    const offsetX = -buildingCenter.x;
    const offsetY = -buildingCenter.y;
    const offsetZ = -buildingCenter.z;
    
    // Create centered vertex array and color array
    const centeredVertices = new Float32Array(geometryData.length);
    const colors = new Float32Array(geometryData.length); // RGB for each vertex
    
    // Process each triangle and assign colors
    for (let i = 0; i < geometryData.length; i += 9) {
        // Get triangle vertices
        const v1 = {
            x: geometryData[i],
            y: geometryData[i + 1],
            z: geometryData[i + 2]
        };
        const v2 = {
            x: geometryData[i + 3],
            y: geometryData[i + 4],
            z: geometryData[i + 5]
        };
        const v3 = {
            x: geometryData[i + 6],
            y: geometryData[i + 7],
            z: geometryData[i + 8]
        };
        
        // Determine color for this triangle
        const color = getColorForTriangle(v1, v2, v3);
        
        // Apply centered positions
        centeredVertices[i] = v1.x + offsetX;
        centeredVertices[i + 1] = v1.y + offsetY;
        centeredVertices[i + 2] = v1.z + offsetZ;
        
        centeredVertices[i + 3] = v2.x + offsetX;
        centeredVertices[i + 4] = v2.y + offsetY;
        centeredVertices[i + 5] = v2.z + offsetZ;
        
        centeredVertices[i + 6] = v3.x + offsetX;
        centeredVertices[i + 7] = v3.y + offsetY;
        centeredVertices[i + 8] = v3.z + offsetZ;
        
        // Set same color for all 3 vertices of the triangle
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
        
        colors[i + 3] = color.r;
        colors[i + 4] = color.g;
        colors[i + 5] = color.b;
        
        colors[i + 6] = color.r;
        colors[i + 7] = color.g;
        colors[i + 8] = color.b;
    }
    
    // Create single geometry like the original
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    
    // Create material with vertex colors (like original but with our colors)
    const material = new THREE.MeshLambertMaterial({ 
        vertexColors: true,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    structure.add(mesh);
    
    scene.add(structure);
    
    // Create grid that will stick to the building
    const gridSize = buildingMaxSize * 1.5;
    const gridDivisions = 20;
    gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
    gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane (Z-up system)
    
    // Position grid at bottom of building (in centered coordinates)
    const gridZ = buildingBounds.min.z - buildingCenter.z;
    gridHelper.position.z = gridZ;
    
    // Add grid to structure group so it rotates with the building
    structure.add(gridHelper);
    
    console.log('Structure created with', geometryData.length / 9, 'triangles');
}

function resetView() {
    if (!initialCameraPosition || !initialCameraTarget) return;
    
    // Reset camera position
    camera.position.copy(initialCameraPosition);
    cameraTarget.copy(initialCameraTarget);
    cameraPan.copy(initialCameraTarget);
    camera.lookAt(cameraTarget);
    
    // Reset structure rotation
    if (structure) {
        structure.rotation.set(0, 0, 0);
        targetRotationX = 0;
        targetRotationY = 0;
    }
}

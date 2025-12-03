// ============================================
// DATA LOADER - Parse ER-mem.html for geometry
// ============================================

let geometryData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;
let gridHelper = null;

// Element type colors - using original style colors
const ELEMENT_COLORS = {
    COLUMN: 0xff4444,      // Red
    BEAM: 0x4444ff,        // Blue
    SLAB: 0x2222ff,        // Blue with transparency (original style)
    WALL: 0x2222ff,        // Blue with transparency (original style)
    OTHER: 0x888888        // Gray
};

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

function detectElementType(vertices) {
    // Calculate dimensions of the element
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
        minX = Math.min(minX, vertices[i]);
        minY = Math.min(minY, vertices[i + 1]);
        minZ = Math.min(minZ, vertices[i + 2]);
        maxX = Math.max(maxX, vertices[i]);
        maxY = Math.max(maxY, vertices[i + 1]);
        maxZ = Math.max(maxZ, vertices[i + 2]);
    }
    
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    
    // Column: vertical element (one dimension much larger in Z direction)
    if (dz > dx * 2 && dz > dy * 2 && dz > 2.0) {
        return { type: 'COLUMN', opacity: 0.85 };
    }
    
    // Slab: horizontal thin element (small Z dimension, large X and Y)
    if (dz < 0.5 && (dx > 2.0 || dy > 2.0)) {
        return { type: 'SLAB', opacity: 0.6 };
    }
    
    // Beam: horizontal elongated element (one horizontal dimension much larger)
    if (dz < dx && dz < dy && dz > 0.3 && (dx > dy * 2 || dy > dx * 2) && (dx > 2.0 || dy > 2.0)) {
        return { type: 'BEAM', opacity: 0.85 };
    }
    
    // Wall: vertical thin element
    if ((dx < 0.5 || dy < 0.5) && dz > 1.0) {
        return { type: 'WALL', opacity: 0.6 };
    }
    
    // Filter out very small elements (likely extras)
    if (dx < 1.0 && dy < 1.0 && dz < 1.0) {
        return null;
    }
    
    return null; // Don't show other elements
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
    
    // Process triangles and group by element type
    const triangleCount = geometryData.length / 9;
    console.log(`Processing ${triangleCount} triangles`);
    
    // Group triangles by element type
    const elementGroups = {};
    
    for (let i = 0; i < geometryData.length; i += 9) {
        // Get triangle vertices (3 vertices x 3 coordinates = 9 values)
        const triangleVerts = new Float32Array(9);
        for (let j = 0; j < 9; j++) {
            triangleVerts[j] = geometryData[i + j];
        }
        
        // Detect element type
        const elementInfo = detectElementType(triangleVerts);
        
        if (!elementInfo) continue; // Skip null elements
        
        const key = `${elementInfo.type}_${elementInfo.opacity}`;
        
        if (!elementGroups[key]) {
            elementGroups[key] = {
                type: elementInfo.type,
                opacity: elementInfo.opacity,
                vertices: []
            };
        }
        
        // Add centered vertices
        for (let j = 0; j < 9; j += 3) {
            elementGroups[key].vertices.push(
                triangleVerts[j] + offsetX,
                triangleVerts[j + 1] + offsetY,
                triangleVerts[j + 2] + offsetZ
            );
        }
    }
    
    // Create meshes for each element type
    for (const [key, group] of Object.entries(elementGroups)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(group.vertices), 3));
        geometry.computeVertexNormals();
        
        const color = ELEMENT_COLORS[group.type];
        
        const material = new THREE.MeshLambertMaterial({ 
            color: color,
            opacity: group.opacity,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        structure.add(mesh);
    }
    
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
    
    console.log('Structure created with color coding');
    console.log('Element groups:', Object.values(elementGroups).map(g => 
        `${g.type}: ${g.vertices.length / 9} triangles`
    ));
}

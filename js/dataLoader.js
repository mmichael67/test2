// ============================================
// DATA LOADER - Parse ER-mem.html for geometry
// ============================================

let geometryData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;

// Element type colors
const ELEMENT_COLORS = {
    COLUMN: 0xff4444,      // Red
    BEAM: 0x4444ff,        // Blue
    SLAB: 0x44ff44,        // Green
    WALL: 0xffaa44,        // Orange
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
    
    // Sort dimensions to get smallest, medium, largest
    const dims = [dx, dy, dz].sort((a, b) => a - b);
    const [smallest, medium, largest] = dims;
    
    // Column: vertical element (one dimension much larger in Z direction)
    if (dz > dx * 2 && dz > dy * 2 && dz > 1.0) {
        return ELEMENT_COLORS.COLUMN;
    }
    
    // Slab: horizontal thin element (small Z dimension, large X and Y)
    if (dz < 0.5 && (dx > 1.0 || dy > 1.0)) {
        return ELEMENT_COLORS.SLAB;
    }
    
    // Beam: horizontal elongated element (one horizontal dimension much larger)
    if (dz < dx && dz < dy && (dx > dy * 2 || dy > dx * 2)) {
        return ELEMENT_COLORS.BEAM;
    }
    
    // Wall: vertical thin element
    if (smallest < 0.5 && largest > 1.0) {
        return ELEMENT_COLORS.WALL;
    }
    
    return ELEMENT_COLORS.OTHER;
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
    
    // Group triangles by color
    const elementGroups = {};
    
    for (let i = 0; i < geometryData.length; i += 9) {
        // Get triangle vertices (3 vertices x 3 coordinates = 9 values)
        const triangleVerts = new Float32Array(9);
        for (let j = 0; j < 9; j++) {
            triangleVerts[j] = geometryData[i + j];
        }
        
        // Detect element type
        const color = detectElementType(triangleVerts);
        
        if (!elementGroups[color]) {
            elementGroups[color] = [];
        }
        
        // Add centered vertices
        for (let j = 0; j < 9; j += 3) {
            elementGroups[color].push(
                triangleVerts[j] + offsetX,
                triangleVerts[j + 1] + offsetY,
                triangleVerts[j + 2] + offsetZ
            );
        }
    }
    
    // Create meshes for each element type
    for (const [color, vertices] of Object.entries(elementGroups)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshLambertMaterial({ 
            color: parseInt(color),
            opacity: 0.7,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        structure.add(mesh);
        
        // Add wireframe
        const wireframeMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000,
            linewidth: 1
        });
        
        const wireframe = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            wireframeMaterial
        );
        structure.add(wireframe);
    }
    
    scene.add(structure);
    
    // Add grid helper at Z=0 (ground level in centered coordinates)
    const gridSize = buildingMaxSize * 1.5;
    const gridDivisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
    gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane (Z-up system)
    gridHelper.position.z = buildingBounds.min.z - buildingCenter.z; // Place at bottom of building
    scene.add(gridHelper);
    
    console.log('Structure created with color coding');
    console.log('Element groups:', Object.keys(elementGroups).map(c => {
        const colorName = Object.keys(ELEMENT_COLORS).find(k => ELEMENT_COLORS[k] === parseInt(c));
        return `${colorName}: ${elementGroups[c].length / 9} triangles`;
    }));
}

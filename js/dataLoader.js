// ============================================
// DATA LOADER - Parse model.html for geometry
// ============================================

// Define element colors - FIXED, DO NOT CHANGE
const ELEMENT_COLORS = {
    COLUMN: 0x4CAF50,      // Green
    BEAM: 0x2196F3,        // Blue
    BRACE: 0xFF9800,       // Orange
    WALL: 0xBDBDBD,        // Gray (transparent)
    SLAB: 0x9E9E9E,        // Dark Gray (transparent)
    SUPPORT: 0xFF0000      // Red
};

let geometryData = null;
let colorData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;
let gridHelper = null;
let initialCameraPosition = null;
let initialCameraTarget = null;
let slabMesh = null;  // Global reference to slab mesh
let wallMesh = null;  // Global reference to wall mesh

// Parse the model.html file to extract vertex and color data
async function loadStructureData() {
    try {
        const response = await fetch('model.html');
        const htmlText = await response.text();
        
        // Extract vertex data for mesh1 (main solid mesh)
        const vertexMatch = htmlText.match(/var vertices = new Float32Array\(\[([\s\S]*?)\]\);/);
        if (!vertexMatch) {
            console.error('Could not find vertex data in model.html');
            return null;
        }
        
        // Extract color data for mesh1
        const colorMatch = htmlText.match(/var clr1 = new Float32Array\(\[([\s\S]*?)\]\);/);
        if (!colorMatch) {
            console.error('Could not find color data in model.html');
            return null;
        }
        
        // Parse the vertex array
        const vertexString = vertexMatch[1];
        const vertices = vertexString
            .split(',')
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n));
        
        // Parse the color array
        const colorString = colorMatch[1];
        const colors = colorString
            .split(',')
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n));
        
        console.log(`Loaded ${vertices.length} vertex values (${vertices.length / 3} coordinates)`);
        console.log(`Loaded ${colors.length} color values (${colors.length / 3} RGB triplets)`);
        
        geometryData = new Float32Array(vertices);
        colorData = new Float32Array(colors);
        
        // Calculate bounds
        calculateBounds();
        
        return geometryData;
    } catch (error) {
        console.error('Error loading model.html:', error);
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

// Detect element type based on geometry
function detectElementType(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z) {
    // Calculate dimensions of the triangle's bounding box
    const minX = Math.min(v1x, v2x, v3x);
    const maxX = Math.max(v1x, v2x, v3x);
    const minY = Math.min(v1y, v2y, v3y);
    const maxY = Math.max(v1y, v2y, v3y);
    const minZ = Math.min(v1z, v2z, v3z);
    const maxZ = Math.max(v1z, v2z, v3z);
    
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    
    // Calculate Z variation
    const avgZ = (v1z + v2z + v3z) / 3;
    const maxZDiff = Math.max(Math.abs(v1z - avgZ), Math.abs(v2z - avgZ), Math.abs(v3z - avgZ));
    
    // SLAB: Nearly horizontal (small Z variation) and large horizontal area
    if (maxZDiff < 0.15 && (sizeX > 1.0 || sizeY > 1.0)) {
        return 'SLAB';
    }
    
    // COLUMN: Vertical element (large Z extent, small XY footprint)
    if (sizeZ > 2.0 && sizeX < 1.0 && sizeY < 1.0) {
        return 'COLUMN';
    }
    
    // WALL: Vertical with large horizontal extent
    if (sizeZ > 1.0 && (sizeX > 2.0 || sizeY > 2.0)) {
        return 'WALL';
    }
    
    // BEAM: Horizontal element (small Z, elongated in X or Y)
    if (sizeZ < 1.0 && (sizeX > 1.5 || sizeY > 1.5)) {
        return 'BEAM';
    }
    
    // Default: treat as SLAB
    return 'SLAB';
}

function createStructureFromData() {
    if (!geometryData || !colorData) {
        console.error('No geometry or color data loaded');
        return;
    }
    
    structure = new THREE.Group();
    
    // Center the building at origin
    const offsetX = -buildingCenter.x;
    const offsetY = -buildingCenter.y;
    const offsetZ = -buildingCenter.z;
    
    // Create centered vertex array
    const centeredVertices = new Float32Array(geometryData.length);
    for (let i = 0; i < geometryData.length; i += 3) {
        centeredVertices[i] = geometryData[i] + offsetX;
        centeredVertices[i + 1] = geometryData[i + 1] + offsetY;
        centeredVertices[i + 2] = geometryData[i + 2] + offsetZ;
    }
    
    // Detect element types and assign proper colors
    const elementTypes = []; // Store element type for each triangle
    const newColors = new Float32Array(colorData.length);
    const columnIndices = [];
    const beamIndices = [];
    const wallIndices = [];
    const slabIndices = [];
    
    for (let i = 0; i < centeredVertices.length; i += 9) {
        const v1x = centeredVertices[i], v1y = centeredVertices[i + 1], v1z = centeredVertices[i + 2];
        const v2x = centeredVertices[i + 3], v2y = centeredVertices[i + 4], v2z = centeredVertices[i + 5];
        const v3x = centeredVertices[i + 6], v3y = centeredVertices[i + 7], v3z = centeredVertices[i + 8];
        
        const elementType = detectElementType(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
        elementTypes.push(elementType);
        
        let color;
        if (elementType === 'COLUMN') {
            color = new THREE.Color(ELEMENT_COLORS.COLUMN);
        } else if (elementType === 'BEAM') {
            color = new THREE.Color(ELEMENT_COLORS.BEAM);
        } else if (elementType === 'WALL') {
            color = new THREE.Color(ELEMENT_COLORS.WALL);
        } else { // SLAB
            color = new THREE.Color(ELEMENT_COLORS.SLAB);
        }
        
        // Apply color to all 3 vertices
        for (let j = 0; j < 3; j++) {
            newColors[i + j * 3] = color.r;
            newColors[i + j * 3 + 1] = color.g;
            newColors[i + j * 3 + 2] = color.b;
        }
        
        // Separate by element type - Priority: Column > Beam > Wall > Slab
        const triIndex = i / 3;
        if (elementType === 'COLUMN') {
            columnIndices.push(triIndex, triIndex + 1, triIndex + 2);
        } else if (elementType === 'BEAM') {
            beamIndices.push(triIndex, triIndex + 1, triIndex + 2);
        } else if (elementType === 'WALL') {
            wallIndices.push(triIndex, triIndex + 1, triIndex + 2);
        } else { // SLAB
            slabIndices.push(triIndex, triIndex + 1, triIndex + 2);
        }
    }
    
    // Render in priority order: Slabs first (back), then Walls, Beams, Columns (front)
    // This ensures columns are always visible on top
    
    // 1. Slabs (lowest priority - render first, transparent)
    if (slabIndices.length > 0) {
        const slabGeometry = new THREE.BufferGeometry();
        slabGeometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
        slabGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
        slabGeometry.setIndex(slabIndices);
        slabGeometry.computeVertexNormals();
        
        const slabMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false // Don't write to depth buffer for transparency
        });
        
        slabMesh = new THREE.Mesh(slabGeometry, slabMaterial);
        slabMesh.renderOrder = 1;
        structure.add(slabMesh);
        console.log('Added slabs:', slabIndices.length / 3, 'triangles');
    }
    
    // 2. Walls (transparent)
    if (wallIndices.length > 0) {
        const wallGeometry = new THREE.BufferGeometry();
        wallGeometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
        wallGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
        wallGeometry.setIndex(wallIndices);
        wallGeometry.computeVertexNormals();
        
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.renderOrder = 2;
        structure.add(wallMesh);
        console.log('Added walls:', wallIndices.length / 3, 'triangles');
    }
    
    // 3. Beams (opaque, higher priority)
    if (beamIndices.length > 0) {
        const beamGeometry = new THREE.BufferGeometry();
        beamGeometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
        beamGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
        beamGeometry.setIndex(beamIndices);
        beamGeometry.computeVertexNormals();
        
        const beamMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        
        const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
        beamMesh.renderOrder = 3;
        structure.add(beamMesh);
        console.log('Added beams:', beamIndices.length / 3, 'triangles');
    }
    
    // 4. Columns (opaque, highest priority - render last)
    if (columnIndices.length > 0) {
        const columnGeometry = new THREE.BufferGeometry();
        columnGeometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
        columnGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
        columnGeometry.setIndex(columnIndices);
        columnGeometry.computeVertexNormals();
        
        const columnMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        
        const columnMesh = new THREE.Mesh(columnGeometry, columnMaterial);
        columnMesh.renderOrder = 4;
        structure.add(columnMesh);
        console.log('Added columns:', columnIndices.length / 3, 'triangles');
    }
    
    scene.add(structure);
    
    // Create grid at bottom
    const gridSize = buildingMaxSize * 1.5;
    const gridDivisions = 20;
    gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
    gridHelper.rotation.x = Math.PI / 2;
    
    const gridZ = buildingBounds.min.z - buildingCenter.z;
    gridHelper.position.z = gridZ;
    
    structure.add(gridHelper);
    
    console.log('Structure created with', geometryData.length / 9, 'triangles');
}

function resetView() {
    if (!initialCameraPosition || !initialCameraTarget) return;
    
    camera.position.copy(initialCameraPosition);
    cameraTarget.copy(initialCameraTarget);
    cameraPan.copy(initialCameraTarget);
    camera.lookAt(cameraTarget);
    
    if (structure) {
        structure.rotation.set(0, 0, 0);
        targetRotationX = 0;
        targetRotationY = 0;
    }
}

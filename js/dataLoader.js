// ============================================
// DATA LOADER - Parse ER-mem.html for geometry
// ============================================

let geometryData = null;
let colorData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;
let gridHelper = null;
let initialCameraPosition = null;
let initialCameraTarget = null;

// Parse the ER-mem.html file to extract vertex and color data
async function loadStructureData() {
    try {
        const response = await fetch('ER-mem.html');
        const htmlText = await response.text();
        
        // Extract vertex data from the Float32Array
        const vertexMatch = htmlText.match(/var vertices = new Float32Array\(\[([\s\S]*?)\]\);/);
        
        if (!vertexMatch) {
            console.error('Could not find vertex data in ER-mem.html');
            return null;
        }
        
        // Extract color data (clr1)
        const colorMatch = htmlText.match(/var clr1 = new Float32Array\(\[([\s\S]*?)\]\);/);
        
        if (!colorMatch) {
            console.error('Could not find color data in ER-mem.html');
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
    
    // Create centered vertex array using original colors
    const centeredVertices = new Float32Array(geometryData.length);
    
    for (let i = 0; i < geometryData.length; i += 3) {
        centeredVertices[i] = geometryData[i] + offsetX;
        centeredVertices[i + 1] = geometryData[i + 1] + offsetY;
        centeredVertices[i + 2] = geometryData[i + 2] + offsetZ;
    }
    
    // Create geometry with original vertex colors from ER-mem.html
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorData, 3));
    geometry.computeVertexNormals();
    
    // Create material exactly like mesh1 in ER-mem.html
    const material = new THREE.MeshLambertMaterial({ 
        vertexColors: true,
        opacity: 0.99,
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

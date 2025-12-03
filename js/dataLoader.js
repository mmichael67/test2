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
    
    // Create centered vertex array for main mesh
    const centeredVertices = new Float32Array(geometryData.length);
    for (let i = 0; i < geometryData.length; i += 3) {
        centeredVertices[i] = geometryData[i] + offsetX;
        centeredVertices[i + 1] = geometryData[i + 1] + offsetY;
        centeredVertices[i + 2] = geometryData[i + 2] + offsetZ;
    }
    
    // Fix colors for slabs and walls - prevent periodic color changes
    // For surfaces with two objects, prioritize slab/wall element color
    const fixedColors = new Float32Array(colorData.length);
    for (let i = 0; i < colorData.length; i += 9) { // Process each triangle
        // Get the colors of the 3 vertices
        const r1 = colorData[i], g1 = colorData[i + 1], b1 = colorData[i + 2];
        const r2 = colorData[i + 3], g2 = colorData[i + 4], b2 = colorData[i + 5];
        const r3 = colorData[i + 6], g3 = colorData[i + 7], b3 = colorData[i + 8];
        
        // Check if colors are not all the same (indicates overlapping elements)
        const sameColor = (r1 === r2 && r2 === r3 && g1 === g2 && g2 === g3 && b1 === b2 && b2 === b3);
        
        if (!sameColor) {
            // Get vertices to determine if this is a slab (horizontal) or wall (vertical)
            const v1x = centeredVertices[i], v1y = centeredVertices[i + 1], v1z = centeredVertices[i + 2];
            const v2x = centeredVertices[i + 3], v2y = centeredVertices[i + 4], v2z = centeredVertices[i + 5];
            const v3x = centeredVertices[i + 6], v3y = centeredVertices[i + 7], v3z = centeredVertices[i + 8];
            
            const avgZ = (v1z + v2z + v3z) / 3;
            const maxZDiff = Math.max(Math.abs(v1z - avgZ), Math.abs(v2z - avgZ), Math.abs(v3z - avgZ));
            
            // If nearly horizontal (small Z variation), it's a slab - prioritize non-column color
            if (maxZDiff < 0.1) {
                // Find the non-red color (slabs are typically blue or white, not red like columns)
                let targetR = r1, targetG = g1, targetB = b1;
                if (r1 > 0.9 && g1 < 0.1 && b1 < 0.1) { // If first is red (column)
                    if (r2 < 0.9 || g2 > 0.1 || b2 > 0.1) {
                        targetR = r2; targetG = g2; targetB = b2;
                    } else {
                        targetR = r3; targetG = g3; targetB = b3;
                    }
                }
                
                // Apply same color to all vertices
                for (let j = 0; j < 9; j += 3) {
                    fixedColors[i + j] = targetR;
                    fixedColors[i + j + 1] = targetG;
                    fixedColors[i + j + 2] = targetB;
                }
            } else {
                // Keep original colors for non-slabs
                for (let j = 0; j < 9; j++) {
                    fixedColors[i + j] = colorData[i + j];
                }
            }
        } else {
            // Keep original colors when all same
            for (let j = 0; j < 9; j++) {
                fixedColors[i + j] = colorData[i + j];
            }
        }
    }
    
    // Create main mesh geometry (mesh1 only - no wireframe)
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(centeredVertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(fixedColors, 3));
    geometry.computeVertexNormals();
    
    // Create material with transparency for slabs and walls (like original)
    const material = new THREE.MeshLambertMaterial({ 
        vertexColors: true,
        opacity: 0.6,  // More transparent like original
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

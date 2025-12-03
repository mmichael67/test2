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
    
    // Set rotation order to ZXY to fix gimbal lock
    // This ensures vertical drag (X rotation) works correctly after horizontal rotation (Z)
    structure.rotation.order = 'ZXY';
    
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
    
    // STANDARD ELEMENT COLORS - same for all models
    const ELEMENT_COLORS = {
        COLUMN: 0x4CAF50,      // Green
        BEAM: 0x2196F3,        // Blue
        BRACE: 0xFF9800,       // Orange
        WALL: 0xBDBDBD,        // Gray (transparent)
        SLAB: 0x9E9E9E,        // Dark Gray (transparent)
        SUPPORT: 0xFF0000      // Red
    };
    
    // Convert hex colors to RGB (0-1 range)
    function hexToRgb(hex) {
        return {
            r: ((hex >> 16) & 255) / 255,
            g: ((hex >> 8) & 255) / 255,
            b: (hex & 255) / 255
        };
    }
    
    const columnColor = hexToRgb(ELEMENT_COLORS.COLUMN);
    const beamColor = hexToRgb(ELEMENT_COLORS.BEAM);
    const wallColor = hexToRgb(ELEMENT_COLORS.WALL);
    const slabColor = hexToRgb(ELEMENT_COLORS.SLAB);
    
    // Apply standard colors with priority: Wall > Column > Beam > Slab
    const fixedColors = new Float32Array(colorData.length);
    const transparencyFlags = new Float32Array(colorData.length / 3); // One flag per vertex
    
    for (let i = 0; i < colorData.length; i += 9) { // Process each triangle
        // Get the colors of the 3 vertices
        const r1 = colorData[i], g1 = colorData[i + 1], b1 = colorData[i + 2];
        const r2 = colorData[i + 3], g2 = colorData[i + 4], b2 = colorData[i + 5];
        const r3 = colorData[i + 6], g3 = colorData[i + 7], b3 = colorData[i + 8];
        
        // Check if colors are not all the same (indicates overlapping elements)
        const sameColor = (r1 === r2 && r2 === r3 && g1 === g2 && g2 === g3 && b1 === b2 && b2 === b3);
        
        // Identify element type from original colors
        // Red (0.996, 0, 0) = Column
        // Blue (0, 0, 0.996) = Beam
        // White (0.996, 0.996, 0.996) = Slab
        // Yellow/Green/Other = Wall
        
        let selectedColor;
        let isTransparent = false;
        
        if (sameColor) {
            // Single element - identify type
            if (r1 > 0.9 && g1 < 0.1 && b1 < 0.1) {
                // Red = Column
                selectedColor = columnColor;
                isTransparent = false;
            } else if (b1 > 0.9 && r1 < 0.1 && g1 < 0.1) {
                // Blue = Beam
                selectedColor = beamColor;
                isTransparent = false;
            } else if (r1 > 0.9 && g1 > 0.9 && b1 > 0.9) {
                // White = Slab
                selectedColor = slabColor;
                isTransparent = true;
            } else {
                // Other = Wall
                selectedColor = wallColor;
                isTransparent = true;
            }
        } else {
            // Overlapping elements - apply priority: Wall > Column > Beam > Slab
            const colors = [
                { r: r1, g: g1, b: b1 },
                { r: r2, g: g2, b: b2 },
                { r: r3, g: g3, b: b3 }
            ];
            
            // Priority 1: Wall (has green or yellow component, not pure red/blue)
            const hasWall = colors.some(c => 
                !((c.r > 0.9 && c.g < 0.1 && c.b < 0.1) || // Not column
                  (c.b > 0.9 && c.r < 0.1 && c.g < 0.1) || // Not beam
                  (c.r > 0.9 && c.g > 0.9 && c.b > 0.9))   // Not slab
            );
            
            if (hasWall) {
                selectedColor = wallColor;
                isTransparent = true;
            } else {
                // Priority 2: Column (red)
                const hasColumn = colors.some(c => c.r > 0.9 && c.g < 0.1 && c.b < 0.1);
                
                if (hasColumn) {
                    selectedColor = columnColor;
                    isTransparent = false;
                } else {
                    // Priority 3: Beam (blue)
                    const hasBeam = colors.some(c => c.b > 0.9 && c.r < 0.1 && c.g < 0.1);
                    
                    if (hasBeam) {
                        selectedColor = beamColor;
                        isTransparent = false;
                    } else {
                        // Priority 4: Slab (white)
                        selectedColor = slabColor;
                        isTransparent = true;
                    }
                }
            }
        }
        
        // Apply selected color to all vertices of this triangle
        for (let j = 0; j < 9; j += 3) {
            fixedColors[i + j] = selectedColor.r;
            fixedColors[i + j + 1] = selectedColor.g;
            fixedColors[i + j + 2] = selectedColor.b;
            
            const vertexIndex = (i + j) / 3;
            transparencyFlags[vertexIndex] = isTransparent ? 1 : 0;
        }
    }
    
    // Create TWO meshes: one for opaque elements (columns/beams), one for transparent (walls/slabs)
    const opaqueVertices = [];
    const opaqueColors = [];
    const transparentVertices = [];
    const transparentColors = [];
    
    for (let i = 0; i < centeredVertices.length; i += 9) {
        const v1Index = i / 3;
        const v2Index = (i + 3) / 3;
        const v3Index = (i + 6) / 3;
        
        // Check if any vertex is transparent
        const isTriangleTransparent = transparencyFlags[v1Index] === 1 || 
                                      transparencyFlags[v2Index] === 1 || 
                                      transparencyFlags[v3Index] === 1;
        
        if (isTriangleTransparent) {
            // Add to transparent mesh
            for (let j = 0; j < 9; j++) {
                transparentVertices.push(centeredVertices[i + j]);
                transparentColors.push(fixedColors[i + j]);
            }
        } else {
            // Add to opaque mesh
            for (let j = 0; j < 9; j++) {
                opaqueVertices.push(centeredVertices[i + j]);
                opaqueColors.push(fixedColors[i + j]);
            }
        }
    }
    
    // Create opaque mesh (columns and beams)
    if (opaqueVertices.length > 0) {
        const opaqueGeometry = new THREE.BufferGeometry();
        opaqueGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(opaqueVertices), 3));
        opaqueGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(opaqueColors), 3));
        opaqueGeometry.computeVertexNormals();
        
        const opaqueMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        
        const opaqueMesh = new THREE.Mesh(opaqueGeometry, opaqueMaterial);
        structure.add(opaqueMesh);
    }
    
    // Create transparent mesh (walls and slabs)
    if (transparentVertices.length > 0) {
        const transparentGeometry = new THREE.BufferGeometry();
        transparentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(transparentVertices), 3));
        transparentGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(transparentColors), 3));
        transparentGeometry.computeVertexNormals();
        
        const transparentMaterial = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            opacity: 0.6,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const transparentMesh = new THREE.Mesh(transparentGeometry, transparentMaterial);
        structure.add(transparentMesh);
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
    
    console.log('Structure created with', geometryData.length / 9, 'triangles');
    console.log('Opaque triangles:', opaqueVertices.length / 9);
    console.log('Transparent triangles:', transparentVertices.length / 9);
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

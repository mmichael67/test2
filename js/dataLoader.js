// ============================================
// DATA LOADER - Parse ER-mem.html for geometry
// ============================================

let geometryData = null;
let buildingBounds = null;
let buildingCenter = null;
let buildingMaxSize = null;

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

function createStructureFromData() {
    if (!geometryData) {
        console.error('No geometry data loaded');
        return;
    }
    
    structure = new THREE.Group();
    
    // Create geometry from loaded vertices
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(geometryData, 3));
    
    // Compute normals for proper lighting
    geometry.computeVertexNormals();
    
    // Create material - semi-transparent blue like in original
    const material = new THREE.MeshLambertMaterial({ 
        color: 0x2222ff,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    structure.add(mesh);
    
    // Add wireframe overlay
    const wireframeGeometry = new THREE.BufferGeometry();
    wireframeGeometry.setAttribute('position', new THREE.BufferAttribute(geometryData, 3));
    
    const wireframeMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000,
        linewidth: 1
    });
    
    const wireframe = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        wireframeMaterial
    );
    structure.add(wireframe);
    
    scene.add(structure);
    
    console.log('Structure created with', geometryData.length / 9, 'triangles');
}

// ==========================================
// 1. DATABASE INITIALIZATION
// ==========================================
const db = new Dexie('MacroTrackerDB');

db.version(1).stores({
    foods: 'i, n', 
    diary: '++id, date' 
});

async function initializeApp() {
    try {
        const foodCount = await db.foods.count();
        console.log(`Current items in local database: ${foodCount}`);

        if (foodCount === 0) {
            console.log('Database empty. Fetching bls-data.json...');
            const response = await fetch('./bls-data.json');
            const data = await response.json();
            await db.foods.bulkPut(data);
            console.log('Database seeded successfully!');
        }
    } catch (error) {
        console.error('Error initializing the app:', error);
    }
}

initializeApp();

// ==========================================
// 2. SEARCH UI LOGIC
// ==========================================
const searchInput = document.getElementById('food-search-input'); 
const searchResults = document.getElementById('search-results-list');

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        const results = await db.foods
            .filter(food => food.n.toLowerCase().includes(query))
            .limit(15)
            .toArray();

        if (results.length === 0) {
            searchResults.innerHTML = '<li><span class="food-macros">No foods found locally.</span></li>';
            return;
        }

        searchResults.innerHTML = results.map(food => `
            <li onclick="selectFood('${food.i}')">
                <span class="food-name">
                    ${food.n} 
                    <img src="./static/light-blue_checkmark.png" class="verified-icon" alt="Verified">
                </span>
                <span class="food-macros">
                    ${food.k} kcal | P: ${food.p}g | C: ${food.c}g | F: ${food.f}g
                </span>
                <span class="source-label">BLS Database (Verified)</span>
            </li>
        `).join('');
    } catch (error) {
        console.error('Search failed:', error);
    }
});

// FIXED: This now properly triggers the UI from food-detail.js
function selectFood(id) {
    openFoodDetail(id); 
}

// ==========================================
// 3. BARCODE SCANNER LOGIC (Quagga2)
// ==========================================
let quaggaIsRunning = false;
let torchOn = false;
let lastScannedCode = "";
let consecutiveMatches = 0;

function startScanner() {
    if (quaggaIsRunning) return;

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'), 
            constraints: {
                facingMode: "environment",
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        },
        locator: { patchSize: "medium", halfSample: true },
        numOfWorkers: navigator.hardwareConcurrency || 2, 
        decoder: { readers: ["ean_reader", "ean_8_reader"] },
        locate: true
    }, function(err) {
        if (err) {
            alert("Camera error. Please check permissions.");
            return;
        }
        Quagga.start();
        quaggaIsRunning = true;

        setTimeout(() => {
            const track = Quagga.CameraAccess.getActiveTrack();
            if (track && typeof track.getCapabilities === 'function' && track.getCapabilities().torch) {
                document.getElementById('torch-btn').style.display = 'flex';
            }
        }, 500); 
    });
}

function stopScanner() {
    if (quaggaIsRunning) {
        Quagga.stop();
        quaggaIsRunning = false;
    }
    document.getElementById('torch-btn').style.display = 'none';
    torchOn = false;
    consecutiveMatches = 0; 
    lastScannedCode = "";
}

function toggleFlash() {
    const track = Quagga.CameraAccess.getActiveTrack();
    if (track && typeof track.getCapabilities === 'function') {
        torchOn = !torchOn;
        track.applyConstraints({ advanced: [{ torch: torchOn }] })
            .catch(e => console.log("Torch error:", e));
    }
}

Quagga.onDetected((result) => {
    const code = result.codeResult.code;

    if (code === lastScannedCode) {
        consecutiveMatches++;
    } else {
        lastScannedCode = code;
        consecutiveMatches = 1;
    }

    if (consecutiveMatches >= 3) {
        stopScanner();
        document.getElementById('scanner-view').style.display = 'none';
        document.getElementById('search-view').style.display = 'block';
        processBarcode(code);
    }
});

async function processBarcode(decodedText) {
    const localHit = await db.foods.get(decodedText);
    
    if (localHit) {
        openFoodDetail(decodedText); 
        return; 
    }

    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${decodedText}`);
        const data = await res.json();

        if (data.status === 1) {
            const p = data.product;
            const newFood = {
                i: decodedText, 
                n: p.product_name || "Unknown Product",
                k: Math.round(p.nutriments['energy-kcal_100g'] || 0),
                p: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
                c: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
                su: Math.round((p.nutriments.sugars_100g || 0) * 10) / 10,
                f: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
                sf: Math.round((p.nutriments['saturated-fat_100g'] || 0) * 10) / 10,
                fi: Math.round((p.nutriments.fiber_100g || 0) * 10) / 10,
                sa: Math.round((p.nutriments.salt_100g || 0) * 100) / 100
            };
            
            const confirmed = confirm(`Found on Open Food Facts:\n\n${newFood.n}\n🔥 ${newFood.k} kcal\n\nSave this permanently?`);
            if (confirmed) {
                await db.foods.put(newFood);
                openFoodDetail(decodedText); 
            }
        } else {
            alert("Product not found in Open Food Facts database.");
        }
    } catch (err) {
        alert("Network error fetching barcode. You might be offline.");
    }
}
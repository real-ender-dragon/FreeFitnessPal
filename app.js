// 1. Initialize the Database
const db = new Dexie('MacroTrackerDB');

// 2. Define the Schema (The structure of your tables)
db.version(1).stores({
    // 'foods' table: 
    // 'i' is the Primary Key (the BLS Code or Barcode). 
    // 'n' is indexed so we can search by food name insanely fast.
    foods: 'i, n', 
    
    // 'diary' table: 
    // '++id' means auto-incrementing number. 
    // 'date' is indexed so we can easily query "show me everything I ate today".
    diary: '++id, date' 
});

// 3. The Bootstrapper Function
async function initializeApp() {
    try {
        // Check how many foods are currently in the local database
        const foodCount = await db.foods.count();
        console.log(`Current items in local database: ${foodCount}`);

        // If the database is empty, it's the user's first time opening the app.
        // We need to import the BLS data.
        if (foodCount === 0) {
            console.log('Database empty. Fetching bls-data.json...');
            
            // Fetch the JSON file we created
            const response = await fetch('./bls-data.json');
            const data = await response.json();
            
            console.log(`Fetched ${data.length} items. Injecting into IndexedDB...`);
            
            // bulkPut is incredibly fast. It injects the whole array at once.
            await db.foods.bulkPut(data);
            
            console.log('Database seeded successfully! You are now fully offline-capable.');
        } else {
            console.log('Database is already populated. Ready to go.');
        }
        
        // --- Next steps will go here (e.g., rendering the UI) ---
        
    } catch (error) {
        console.error('Error initializing the app:', error);
    }
}

// Fire the bootstrapper when the script loads
initializeApp();
// ==========================================
// SEARCH UI LOGIC (Pure Local BLS)
// ==========================================
// FIXED: Targeting the new IDs from the updated index.html
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

function selectFood(id) {
    console.log('You selected food ID:', id);
    alert(`Selected ID: ${id}`);
}

// ==========================================
// BARCODE SCANNER LOGIC (Quagga2)
// ==========================================
let quaggaIsRunning = false;
let torchOn = false;

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
            console.error("Quagga initialization failed:", err);
            alert("Camera error. Please check permissions.");
            return;
        }
        Quagga.start();
        quaggaIsRunning = true;

        setTimeout(() => {
            const track = Quagga.CameraAccess.getActiveTrack();
            if (track && typeof track.getCapabilities === 'function') {
                if (track.getCapabilities().torch) {
                    document.getElementById('torch-btn').style.display = 'flex';
                }
            }
        }, 500);
    });
}

// NEW: A reliable function to completely shut down the scanner and reset states
function stopScanner() {
    if (quaggaIsRunning) {
        Quagga.stop();
        quaggaIsRunning = false;
    }
    
    // Reset flash state
    document.getElementById('torch-btn').style.display = 'none';
    torchOn = false;

    // Reset confidence counters
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

let lastScannedCode = "";
let consecutiveMatches = 0;

Quagga.onDetected((result) => {
    const code = result.codeResult.code;

    if (code === lastScannedCode) {
        consecutiveMatches++;
    } else {
        lastScannedCode = code;
        consecutiveMatches = 1;
    }

    if (consecutiveMatches >= 3) {
        // FIXED: Use our new stop function
        stopScanner();

        document.getElementById('scanner-view').style.display = 'none';
        document.getElementById('search-view').style.display = 'block';
        
        processBarcode(code);
    }
});

// ... (keep your existing processBarcode function below)
async function processBarcode(decodedText) {
    console.log(`Solid Lock on Barcode: ${decodedText}`);

    // 1. CHECK LOCAL DATABASE FIRST
    const localHit = await db.foods.get(decodedText);
    
    if (localHit) {
        alert(`Loaded instantly from local database!\n\n${localHit.n}\nCalories: ${localHit.k}`);
        return; 
    }

    // 2. API FALLBACK (Open Food Facts v2 API)
    console.log("Barcode not found locally. Fetching from Open Food Facts...");
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
            
            const confirmed = confirm(`Found on Open Food Facts:\n\n${newFood.n}\n🔥 ${newFood.k} kcal\nP: ${newFood.p}g | C: ${newFood.c}g | F: ${newFood.f}g\n\nSave this permanently?`);
            
            if (confirmed) {
                await db.foods.put(newFood);
                alert("Saved! Scan it again right now—it will load offline instantly.");
            }
        } else {
            alert("Product not found in Open Food Facts database.");
        }
    } catch (err) {
        console.error("Barcode fetch error:", err);
        alert("Network error fetching barcode. You might be offline.");
    }
}
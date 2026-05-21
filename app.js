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
// 2. SEARCH UI LOGIC (Mit OpenFoodFacts & Debouncing)
// ==========================================
const searchInput = document.getElementById('food-search-input'); 
const searchResults = document.getElementById('search-results-list');
let searchTimeout = null; // Timer-Variable für das Debouncing

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    // 1. Suche erst ab 3 Buchstaben starten (schont die API zusätzlich)
    if (query.length < 3) {
        searchResults.innerHTML = '';
        clearTimeout(searchTimeout);
        return;
    }

    // 2. DEBOUNCING: Alten Timer abbrechen, wenn der Nutzer weiter tippt
    clearTimeout(searchTimeout);

    // Lade-Indikator anzeigen
    searchResults.innerHTML = '<li><span class="food-macros">Suche läuft...</span></li>';

    // 3. Neuen Timer starten (Wartet 600ms nach dem letzten Tastendruck)
    searchTimeout = setTimeout(async () => {
        try {
            let htmlContent = '';

            // --- A) LOKALE SUCHE (Blitzschnell) ---
            const localResults = await db.foods
                .filter(food => food.n.toLowerCase().includes(query))
                .limit(10)
                .toArray();

            if (localResults.length > 0) {
                htmlContent += localResults.map(food => `
                    <li onclick="selectFood('${food.i}')">
                        <span class="food-name">
                            ${food.n} 
                            <img src="./static/light-blue_checkmark.png" class="verified-icon" alt="Verified">
                        </span>
                        <span class="food-macros">
                            ${food.k} kcal | P: ${food.p}g | C: ${food.c}g | F: ${food.f}g
                        </span>
                        <span class="source-label">Lokale Datenbank</span>
                    </li>
                `).join('');
            }

            // --- B) OPEN FOOD FACTS SUCHE (Online Fallback) ---
            // Wir suchen online und begrenzen auf 5 Ergebnisse (page_size=5)
            const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
            const offResponse = await fetch(offUrl);
            const offData = await offResponse.json();

            if (offData && offData.products && offData.products.length > 0) {
                // Filtern: Wir wollen nur Produkte, die auch Nährwerte eingetragen haben
                const validOffProducts = offData.products.filter(p => p.product_name && p.nutriments);

                if (validOffProducts.length > 0) {
                    // Trennlinie / Hinweis für den Nutzer
                    htmlContent += `<li style="background: #1C1C1E; text-align: center; font-size: 12px; color: #8E8E93; padding: 8px; border-radius: 8px; margin: 8px 0;">Ergebnisse aus dem Internet (Open Food Facts)</li>`;

                    htmlContent += validOffProducts.map(p => {
                        const id = p.id || p.code;
                        const name = p.product_name;
                        const kcal = Math.round(p.nutriments['energy-kcal_100g'] || 0);
                        const prot = Math.round((p.nutriments.proteins_100g || 0) * 10) / 10;
                        const carb = Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10;
                        const fat = Math.round((p.nutriments.fat_100g || 0) * 10) / 10;

                        // Klick triggert processBarcode! Das simuliert einen Barcode-Scan.
                        return `
                            <li onclick="processBarcode('${id}')">
                                <span class="food-name">${name}</span>
                                <span class="food-macros">${kcal} kcal | P: ${prot}g | C: ${carb}g | F: ${fat}g</span>
                                <span class="source-label" style="color: #FF9F0A;">🌐 Tippen, um dauerhaft herunterzuladen</span>
                            </li>
                        `;
                    }).join('');
                }
            }

            // --- C) KEINE ERGEBNISSE ---
            if (htmlContent === '') {
                searchResults.innerHTML = '<li><span class="food-macros">Keine Lebensmittel gefunden.</span></li>';
            } else {
                searchResults.innerHTML = htmlContent;
            }

        } catch (error) {
            console.error('Search failed:', error);
            // Falls der Nutzer offline ist, zeigen wir nur die lokalen Ergebnisse (falls vorhanden)
            if (searchResults.innerHTML === '<li><span class="food-macros">Suche läuft...</span></li>') {
                searchResults.innerHTML = '<li><span class="food-macros">Netzwerkfehler. Bist du offline?</span></li>';
            }
        }
    }, 600); // 600ms Warten = Absoluter Schutz vor API-Bans!
});

function selectFood(id) {
    openFoodDetail(id); 
}


// ==========================================
// 3. BARCODE SCANNER LOGIC (Ultra-Fast Interlaced - FINAL PRO)
// ==========================================
let quaggaIsRunning = false;
let torchOn = false;
let lastScannedCode = "";
let consecutiveMatches = 0;

const angles = [0, 90]; 
let currentAngleIndex = 0;

let memoryCanvas = null;
let memoryCtx = null;
let animationFrameId = null;
let isDecoding = false; 

let lastScanTime = 0;
const SCAN_INTERVAL = 80; // Drosselung auf entspannte ~12 FPS für den Akku

function startScanner() {
    if (quaggaIsRunning) return;

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'), 
            constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        },
        locate: false, 
        decoder: { 
            // Quagga braucht diese Info, sonst crasht der Kamera-Aufbau
            readers: ["ean_reader", "ean_8_reader"] 
        } 
    }, function(err) {
        if (err) {
            console.error("Scanner Error:", err);
            alert("Kamerafehler. Bitte Berechtigungen prüfen.");
            return;
        }
        
        // WICHTIG: Wir rufen Quagga.start() NICHT auf!
        // Der Standard-Scanner bleibt aus. Die Kamera läuft aber!
        quaggaIsRunning = true;
        
        // Wir starten unseren eigenen High-Speed Loop
        setupInterlacedInterception();

        setTimeout(() => {
            const track = Quagga.CameraAccess.getActiveTrack();
            if (track && typeof track.getCapabilities === 'function' && track.getCapabilities().torch) {
                document.getElementById('torch-btn').style.display = 'flex';
            }
        }, 500); 
    });
}

function setupInterlacedInterception() {
    const videoEl = document.querySelector('#interactive video');
    if (!videoEl) return;

    if (!memoryCanvas) {
        memoryCanvas = document.createElement('canvas');
        memoryCtx = memoryCanvas.getContext('2d', { willReadFrequently: true });
    }

    function processInterlacedLoop() {
        if (!quaggaIsRunning) return; 

        const now = Date.now();
        
        if (!isDecoding && (now - lastScanTime >= SCAN_INTERVAL)) {
            // Warten, bis das Video auch WIRKLICH Bilddaten sendet
            if (videoEl.readyState === videoEl.HAVE_CURRENT_DATA || videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
                
                const vW = videoEl.videoWidth;
                const vH = videoEl.videoHeight;
                
                // DER BUG-FIX: Scanne nur, wenn die Kamera echte Maße hat (> 0)
                if (vW > 0 && vH > 0) {
                    lastScanTime = now;
                    const angle = angles[currentAngleIndex];
                    extractAndDecodeScanline(videoEl, vW, vH, angle);
                    currentAngleIndex = (currentAngleIndex + 1) % angles.length;
                }
            }
        }
        animationFrameId = requestAnimationFrame(processInterlacedLoop);
    }

    animationFrameId = requestAnimationFrame(processInterlacedLoop);
}

function extractAndDecodeScanline(video, vW, vH, angle) {
    const centerX = vW / 2;
    const centerY = vH / 2;
    
    // Math.floor erzwingt ganze Zahlen, damit die Base64-URL nicht kaputtgeht
    const sampleLength = Math.floor(Math.min(vW, vH) * 0.7); 
    const sampleThickness = 10; 

    if (sampleLength <= 0) return;

    memoryCanvas.width = sampleLength;
    memoryCanvas.height = sampleThickness;

    memoryCtx.clearRect(0, 0, sampleLength, sampleThickness);
    memoryCtx.save();
    memoryCtx.translate(sampleLength / 2, sampleThickness / 2);
    memoryCtx.rotate((angle * Math.PI) / 180);
    
    memoryCtx.drawImage(
        video, 
        centerX - sampleLength / 2, centerY - sampleThickness / 2, sampleLength, sampleThickness,
        -sampleLength / 2, -sampleThickness / 2, sampleLength, sampleThickness
    );
    memoryCtx.restore();

    // Wir konvertieren den Streifen in ein sauberes JPEG
    const dataUrl = memoryCanvas.toDataURL('image/jpeg', 0.8);
    isDecoding = true; 
    
    Quagga.decodeSingle({
        decoder: { readers: ["ean_reader", "ean_8_reader"] },
        locate: false,
        numOfWorkers: 0, // EXTREM WICHTIG: Führt den Scan sofort (synchron) aus, ohne Worker-Overhead!
        src: dataUrl 
    }, function(result) {
        isDecoding = false; 
        
        if(result && result.codeResult && result.codeResult.code) {
            const code = result.codeResult.code;

            if (code === lastScannedCode) {
                consecutiveMatches++;
            } else {
                lastScannedCode = code;
                consecutiveMatches = 1;
            }

            if (consecutiveMatches >= 2) { 
                stopScanner();
                document.getElementById('scanner-view').style.display = 'none';
                document.getElementById('search-view').style.display = 'block';
                processBarcode(code);
            }
        }
    });
}

function stopScanner() {
    if (quaggaIsRunning) {
        // Obwohl wir Quagga.start() nie gerufen haben, 
        // schaltet stop() die Kameralinse sauber wieder ab.
        Quagga.stop();
        quaggaIsRunning = false;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
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
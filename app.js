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

//-----
// High-Performance Quagga Script
//-----

let quaggaIsRunning = false;
let lastScannedCode = "";
let consecutiveMatches = 0;

// Helper to strictly validate EAN barcodes (removes 99% of false positives)
function isValidEAN(code) {
    if (!code || (code.length !== 13 && code.length !== 8)) return false;
    let sum = 0;
    for (let i = 0; i < code.length - 1; i++) {
        const digit = parseInt(code[i], 10);
        let multiplier = 1;
        if (code.length === 13) {
            multiplier = (i % 2 === 0) ? 1 : 3;
        } else {
            multiplier = (i % 2 === 0) ? 3 : 1;
        }
        sum += digit * multiplier;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(code[code.length - 1], 10);
}

function startScanner() {
    if (quaggaIsRunning) return;

    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#interactive'),
            constraints: {
                facingMode: "environment",
                // Higher resolution for better precision
                width: { ideal: 1280 },
                height: { ideal: 720 },
                advanced: [{ focusMode: "continuous" }]
            }
        },
        frequency: 10, // Limit to 10 FPS to prevent CPU overload and lag
        locate: true,
        locator: {
            halfSample: true,
            patchSize: "large" // Larger patch size helps find barcodes faster in HD resolution
        },
        numOfWorkers: navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4,
        decoder: {
            readers: ["ean_reader", "ean_8_reader"],
            multiple: false
        }
    }, function(err) {
        if (err) {
            console.error("Scanner Error:", err);
            alert("Kamerafehler. Bitte Berechtigungen prüfen.");
            return;
        }

        Quagga.start();
        quaggaIsRunning = true;
        lastScannedCode = "";
        consecutiveMatches = 0;
        Quagga.onDetected(onBarcodeDetected);
        
        // Optional: Torch logic can remain here
    });
}

function onBarcodeDetected(result) {
    if (!result || !result.codeResult || !result.codeResult.code) return;
    
    const code = result.codeResult.code;

    // Strict validation to throw out false positives
    if (!isValidEAN(code)) return;

    // Require 3 consecutive matches for high precision
    if (code === lastScannedCode) {
        consecutiveMatches++;
    } else {
        lastScannedCode = code;
        consecutiveMatches = 1;
    }

    if (consecutiveMatches >= 3) { 
        stopScanner();
        
        // Trigger your UI changes and processing here
        document.getElementById('scanner-view').style.display = 'none';
        document.getElementById('search-view').style.display = 'block';
        processBarcode(code);
    }
}

function stopScanner() {
    if (quaggaIsRunning) {
        Quagga.stop();
        Quagga.offDetected(onBarcodeDetected); // Crucial to prevent ghost scans/memory leaks
        quaggaIsRunning = false;
    }
    
    consecutiveMatches = 0; 
    lastScannedCode = "";
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

// ==========================================
// 4. DIARY LOGIC
// ==========================================
const MEALS = ["Frühstück", "Mittagessen", "Abendessen", "Snack"];
let currentDate = new Date().toISOString().split('T')[0];

async function loadDiary() {
    try {
        const entries = await db.diary.where('date').equals(currentDate).toArray();

        let totals = { kcal: 0, p: 0, c: 0, f: 0, sf: 0, su: 0, fi: 0, sa: 0 };
        let mealTotals = { "Frühstück": 0, "Mittagessen": 0, "Abendessen": 0, "Snack": 0 };

        MEALS.forEach(m => {
            const listEl = document.getElementById(`list-${m}`);
            if(listEl) listEl.innerHTML = '';
        });

        entries.forEach(entry => {
            totals.kcal += entry.kcal || 0;
            totals.p += entry.p || 0;
            totals.c += entry.c || 0;
            totals.f += entry.f || 0;
            totals.sf += entry.sf || 0;
            totals.su += entry.su || 0;
            totals.fi += entry.fi || 0;
            totals.sa += entry.sa || 0;

            if (mealTotals[entry.meal] !== undefined) {
                mealTotals[entry.meal] += entry.kcal || 0;
                
                const li = document.createElement('li');
                li.innerHTML = `
                    <div>
                        <span class="diary-item-name">${entry.name}</span>
                        <span class="diary-item-amount">${entry.amount}g</span>
                    </div>
                    <div class="diary-item-kcal">${entry.kcal} kcal</div>
                `;
                document.getElementById(`list-${entry.meal}`).appendChild(li);
            }
        });

        // Update UI Summary
        document.getElementById('diary-total-kcal').innerText = Math.round(totals.kcal);
        document.getElementById('diary-total-c').innerText = (Math.round(totals.c * 10) / 10) + "g";
        document.getElementById('diary-total-p').innerText = (Math.round(totals.p * 10) / 10) + "g";
        document.getElementById('diary-total-f').innerText = (Math.round(totals.f * 10) / 10) + "g";

        // Update UI Full Table
        document.getElementById('diary-table-kcal').innerText = Math.round(totals.kcal) + " kcal";
        document.getElementById('diary-table-fat').innerText = (Math.round(totals.f * 10) / 10) + "g";
        document.getElementById('diary-table-satfat').innerText = (Math.round(totals.sf * 10) / 10) + "g";
        document.getElementById('diary-table-carbs').innerText = (Math.round(totals.c * 10) / 10) + "g";
        document.getElementById('diary-table-sugars').innerText = (Math.round(totals.su * 10) / 10) + "g";
        document.getElementById('diary-table-fiber').innerText = (Math.round(totals.fi * 10) / 10) + "g";
        document.getElementById('diary-table-protein').innerText = (Math.round(totals.p * 10) / 10) + "g";
        document.getElementById('diary-table-salt').innerText = (Math.round(totals.sa * 100) / 100) + "g";

        // Update Meal Kcals
        MEALS.forEach(m => {
            const el = document.getElementById(`kcal-${m}`);
            if(el) el.innerText = Math.round(mealTotals[m]) + " kcal";
        });

    } catch (e) {
        console.error("Error loading diary:", e);
    }
}
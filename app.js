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
// 2. SEARCH UI LOGIC (Favorites, Local First, Async OFF)
// ==========================================
const searchInput = document.getElementById('food-search-input'); 
const searchResults = document.getElementById('search-results-list');
let searchTimeout = null; 
let currentSearchQuery = '';

// Helper function to render a food item li
function renderLocalFood(food, label, iconHtml = '') {
    return `
        <li onclick="selectFood('${food.i}')">
            <span class="food-name">
                ${food.n} 
                ${iconHtml}
            </span>
            <span class="food-macros">
                ${food.k} kcal | P: ${food.p}g | C: ${food.c}g | F: ${food.f}g
            </span>
            <span class="source-label">${label}</span>
        </li>
    `;
}

// Function to load favorites when search is empty
async function renderFavorites() {
    searchResults.innerHTML = '';
    try {
        const favs = await db.foods.filter(f => f.fav === 1).toArray();
        if (favs.length > 0) {
            searchResults.innerHTML = favs.map(f => renderLocalFood(f, 'Favorit', '<svg width="16" height="16" style="margin-left: 6px" viewBox="0 0 24 24" fill="#FF453A" stroke="#FF453A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>')).join('');
        } else {
            searchResults.innerHTML = '<li><span class="food-macros">Keine Favoriten vorhanden. Suche nach einem Lebensmittel!</span></li>';
        }
    } catch (err) {
        console.error('Error loading favorites:', err);
    }
}

// Show favorites immediately if the search input is clicked and empty
searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() === '') {
        renderFavorites();
    }
});

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase().trim();
    currentSearchQuery = query;
    
    // 1. Show Favorites if search is empty
    if (query.length === 0) {
        clearTimeout(searchTimeout);
        renderFavorites();
        return;
    }

    // 2. Clear results if query is too short
    if (query.length < 3) {
        searchResults.innerHTML = '';
        clearTimeout(searchTimeout);
        return;
    }

    // 3. Render Local Results INSTANTLY
    let htmlContent = '';
    
    try {
        // Find Tracked/Approved items matching query
        const trackedResults = await db.foods
            .filter(food => food.n.toLowerCase().includes(query) && food.t === 1)
            .toArray();

        // Find standard BLS items matching query (limit to 4)
        const blsResults = await db.foods
            .filter(food => food.n.toLowerCase().includes(query) && !food.t)
            .limit(4)
            .toArray();

        if (trackedResults.length > 0) {
            htmlContent += `<li style="background: #1C1C1E; text-align: center; font-size: 12px; color: #8E8E93; padding: 4px; border-radius: 8px; margin: 8px 0;">Zuvor getrackt</li>`;
            htmlContent += trackedResults.map(f => renderLocalFood(f, 'Getrackt', '<img src="./static/light-blue_checkmark.png" class="verified-icon" alt="Verified">')).join('');
        }

        if (blsResults.length > 0) {
            htmlContent += `<li style="background: #1C1C1E; text-align: center; font-size: 12px; color: #8E8E93; padding: 4px; border-radius: 8px; margin: 8px 0;">Lokale Datenbank (BLS)</li>`;
            htmlContent += blsResults.map(f => renderLocalFood(f, 'BLS')).join('');
        }

        if (htmlContent === '') {
            htmlContent = `<li id="local-empty-msg"><span class="food-macros">Lokal nichts gefunden. Suche online...</span></li>`;
        }

        // Add a loading placeholder for Open Food Facts
        htmlContent += `<li id="off-loading-indicator"><span class="food-macros">Suche im Internet (Open Food Facts)...</span></li>`;
        searchResults.innerHTML = htmlContent;

    } catch (err) {
        console.error('Local search error:', err);
    }

    // 4. DEBOUNCING: Cancel old timer, set new one for OFF fetch
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        // Ensure we are still searching for the same query
        if (currentSearchQuery !== query) return;

        try {
            // Fetch from Open Food Facts (limit to 8)
            const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8`;
            const offResponse = await fetch(offUrl);
            const offData = await offResponse.json();

            // Remove the loading indicator
            const loadingIndicator = document.getElementById('off-loading-indicator');
            if (loadingIndicator) loadingIndicator.remove();
            const emptyMsg = document.getElementById('local-empty-msg');
            if (emptyMsg) emptyMsg.remove();

            let offHtmlContent = '';

            if (offData && offData.products && offData.products.length > 0) {
                const validOffProducts = offData.products.filter(p => p.product_name && p.nutriments);

                if (validOffProducts.length > 0) {
                    offHtmlContent += `<li style="background: #1C1C1E; text-align: center; font-size: 12px; color: #8E8E93; padding: 4px; border-radius: 8px; margin: 8px 0;">Open Food Facts</li>`;

                    offHtmlContent += validOffProducts.map(p => {
                        const id = p.id || p.code;
                        const name = p.product_name;
                        const kcal = Math.round(p.nutriments['energy-kcal_100g'] || 0);
                        const prot = Math.round((p.nutriments.proteins_100g || 0) * 10) / 10;
                        const carb = Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10;
                        const fat = Math.round((p.nutriments.fat_100g || 0) * 10) / 10;

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

            if (offHtmlContent === '' && searchResults.innerHTML.trim() === '') {
                searchResults.innerHTML = '<li><span class="food-macros">Keine Lebensmittel gefunden.</span></li>';
            } else {
                // Append the OFF results to the existing local results
                searchResults.insertAdjacentHTML('beforeend', offHtmlContent);
            }

        } catch (error) {
            console.error('OFF Search failed:', error);
            const loadingIndicator = document.getElementById('off-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.innerHTML = '<span class="food-macros">Netzwerkfehler bei der Online-Suche.</span>';
            }
        }
    }, 600); 
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
// 4. DIARY LOGIC & DATE NAVIGATION
// ==========================================
const MEALS = ["Frühstück", "Mittagessen", "Abendessen", "Snack"];
let currentDate = new Date();

function formatDateForDB(dateObj) {
    // Ensures format is strictly YYYY-MM-DD in local time
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
}

function updateDateDisplay() {
    const displayEl = document.getElementById('current-date-display');
    if (!displayEl) return;

    const todayStr = formatDateForDB(new Date());
    const currentStr = formatDateForDB(currentDate);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateForDB(yesterday);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateForDB(tomorrow);

    if (currentStr === todayStr) {
        displayEl.innerText = "Heute";
    } else if (currentStr === yesterdayStr) {
        displayEl.innerText = "Gestern";
    } else if (currentStr === tomorrowStr) {
        displayEl.innerText = "Morgen";
    } else {
        // Fallback for older dates: e.g., "15. Mai 2026"
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        displayEl.innerText = currentDate.toLocaleDateString('de-DE', options);
    }
}

function changeDate(daysToAdd) {
    currentDate.setDate(currentDate.getDate() + daysToAdd);
    updateDateDisplay();
    loadDiary();
}

async function loadDiary() {
    try {
        const dbDateStr = formatDateForDB(currentDate);
        const entries = await db.diary.where('date').equals(dbDateStr).toArray();

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

// Bind Date Navigation Buttons on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-day-btn');
    const nextBtn = document.getElementById('next-day-btn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => changeDate(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changeDate(1));
    }

    // Initialize display
    updateDateDisplay();
});
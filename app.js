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

// --- SEARCH UI LOGIC ---

const searchInput = document.getElementById('food-search');
const searchResults = document.getElementById('search-results');

let searchTimeout;
let currentLocalResults = [];

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query.length < 2) {
        searchResults.innerHTML = '';
        clearTimeout(searchTimeout);
        return;
    }

    try {
        // 1. Instant Offline Search (BLS Data)
        currentLocalResults = await db.foods
            .filter(food => food.n.toLowerCase().includes(query))
            .limit(10)
            .toArray();

        // Render local results instantly while we wait for the internet
        renderCombinedResults(currentLocalResults, []);

        // 2. Debounced Online Search (Open Food Facts API)
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            try {
                const offResults = await fetchOpenFoodFacts(query);
                // Re-render with both local and online results
                renderCombinedResults(currentLocalResults, offResults);
            } catch (err) {
                console.error("OFF API Error:", err);
            }
        }, 600); // Waits 600ms after you stop typing

    } catch (error) {
        console.error('Search failed:', error);
    }
});

// Helper function to fetch from Open Food Facts
async function fetchOpenFoodFacts(query) {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`);
    const data = await res.json();
    
    // Map the bloated OFF data to our clean Big 7 structure
    return data.products
        .filter(p => p.product_name) // Skip items with no name
        .map(p => ({
            i: p.code,
            n: p.product_name,
            k: Math.round(p.nutriments['energy-kcal_100g'] || 0),
            p: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
            c: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
            f: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
            isOff: true // Custom flag so we know it came from the internet
        }));
}

function renderCombinedResults(local, online) {
    const allResults = [...local, ...online];

    if (allResults.length === 0) {
        searchResults.innerHTML = '<li><span class="food-macros">No foods found.</span></li>';
        return;
    }

    searchResults.innerHTML = allResults.map(food => {
        // Use the blue checkmark for BLS, and a package icon for Open Food Facts
        const icon = food.isOff ? '📦' : '<span class="verified-icon">✔️</span>';
        const sourceText = food.isOff ? 'Open Food Facts' : 'BLS Database (Verified)';

        return `
            <li onclick="selectFood('${food.i}')">
                <span class="food-name">${food.n} ${icon}</span>
                <span class="food-macros">
                    🔥 ${food.k} kcal | P: ${food.p}g | C: ${food.c}g | F: ${food.f}g
                </span>
                <span class="source-label">${sourceText}</span>
            </li>
        `;
    }).join('');
}

function selectFood(id) {
    console.log('You selected food ID:', id);
    alert(`Selected ID: ${id}`);
}
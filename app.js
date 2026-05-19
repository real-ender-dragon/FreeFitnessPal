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

searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    // Don't search if the user only typed one letter
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        // Search the local Dexie database. 
        // We use .filter() for a wildcard search and .limit(15) so it renders instantly.
        const results = await db.foods
            .filter(food => food.n.toLowerCase().includes(query))
            .limit(15)
            .toArray();

        renderResults(results);
    } catch (error) {
        console.error('Search failed:', error);
    }
});

function renderResults(results) {
    if (results.length === 0) {
        searchResults.innerHTML = '<li><span class="food-macros">No foods found.</span></li>';
        return;
    }

    // Map the results into HTML list items
    searchResults.innerHTML = results.map(food => `
        <li onclick="selectFood('${food.i}')">
            <span class="food-name">${food.n}</span>
            <span class="food-macros">
                🔥 ${food.k} kcal | P: ${food.p}g | C: ${food.c}g | F: ${food.f}g
            </span>
        </li>
    `).join('');
}

// Placeholder for when you tap a food in the list
function selectFood(blsCode) {
    console.log('You selected food ID:', blsCode);
    alert(`Selected: ${blsCode} - We will build the logging feature next!`);
}
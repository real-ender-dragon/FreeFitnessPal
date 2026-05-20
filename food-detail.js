// ==========================================
// FOOD DETAIL MODULE (food-detail.js)
// ==========================================

let currentActiveFood = null;

// DOM Elements
const detailView = document.getElementById('food-detail-view');
const searchView = document.getElementById('search-view'); // Our current home

const detailName = document.getElementById('detail-name');
const detailCalories = document.getElementById('detail-calories');
const detailCarbs = document.getElementById('detail-carbs');
const detailProtein = document.getElementById('detail-protein');
const detailFat = document.getElementById('detail-fat');
const amountInput = document.getElementById('detail-amount');

// 1. Open the View and Load Data
async function openFoodDetail(foodId) {
    try {
        currentActiveFood = await db.foods.get(foodId);
        if (!currentActiveFood) return;

        // Reset input to 100g by default
        amountInput.value = 100;
        
        // Set Title
        detailName.innerText = currentActiveFood.n;
        
        // Calculate initial macros
        updateMacroDisplay(100);

        // Hide all other views and show this one
        document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
        detailView.style.display = 'block';

    } catch (error) {
        console.error("Error loading food details:", error);
    }
}

// 2. Dynamic Macro Calculation
function updateMacroDisplay(amountGrams) {
    if (!currentActiveFood) return;

    // The database stores macros per 100g. 
    // We calculate a multiplier based on user input.
    const multiplier = amountGrams / 100;

    // Update UI with rounded numbers
    detailCalories.innerText = Math.round(currentActiveFood.k * multiplier);
    detailCarbs.innerText = (currentActiveFood.c * multiplier).toFixed(1) + "g";
    detailProtein.innerText = (currentActiveFood.p * multiplier).toFixed(1) + "g";
    detailFat.innerText = (currentActiveFood.f * multiplier).toFixed(1) + "g";
}

// 3. Listen for User Typing in the Amount Box
amountInput.addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    updateMacroDisplay(amount);
});

// 4. Close Button Logic
document.getElementById('close-detail-btn').addEventListener('click', () => {
    detailView.style.display = 'none';
    searchView.style.display = 'block';
    currentActiveFood = null;
});

// 5. Save to Diary Logic
document.getElementById('save-to-diary-btn').addEventListener('click', async () => {
    if (!currentActiveFood) return;

    const amount = parseFloat(amountInput.value) || 0;
    if (amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const multiplier = amount / 100;

    // Create the diary entry object
    const diaryEntry = {
        date: new Date().toISOString().split('T')[0], // e.g., "2023-10-27"
        timestamp: Date.now(),
        foodId: currentActiveFood.i,
        name: currentActiveFood.n,
        amount: amount,
        kcal: Math.round(currentActiveFood.k * multiplier),
        p: Math.round((currentActiveFood.p * multiplier) * 10) / 10,
        c: Math.round((currentActiveFood.c * multiplier) * 10) / 10,
        f: Math.round((currentActiveFood.f * multiplier) * 10) / 10
    };

    try {
        await db.diary.put(diaryEntry);
        
        // UI Feedback: Vibrate on supported devices, alert on iOS, return home
        if (navigator.vibrate) navigator.vibrate(50);
        
        // Reset and go back
        detailView.style.display = 'none';
        searchView.style.display = 'block';
        amountInput.value = 100;
        
        // Clear the search bar so it's ready for the next food
        document.getElementById('food-search-input').value = '';
        document.getElementById('search-results-list').innerHTML = '';
        
    } catch (error) {
        console.error("Failed to save to diary:", error);
        alert("Error saving to diary.");
    }
});
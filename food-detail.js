// ==========================================
// FOOD DETAIL MODULE (food-detail.js)
// ==========================================
let currentActiveFood = null;

const fdDetailView = document.getElementById('food-detail-view');
const fdSearchView = document.getElementById('search-view'); 

const detailName = document.getElementById('detail-name');
const detailCalories = document.getElementById('detail-calories');
const detailCarbs = document.getElementById('detail-carbs');
const detailProtein = document.getElementById('detail-protein');
const detailFat = document.getElementById('detail-fat');
const amountInput = document.getElementById('detail-amount');

// New Table Elements
const tableHeaderAmount = document.getElementById('table-header-amount');
const tableKcal = document.getElementById('table-kcal');
const tableFat = document.getElementById('table-fat');
const tableSatFat = document.getElementById('table-satfat');
const tableCarbs = document.getElementById('table-carbs');
const tableSugars = document.getElementById('table-sugars');
const tableFiber = document.getElementById('table-fiber');
const tableProtein = document.getElementById('table-protein');
const tableSalt = document.getElementById('table-salt');

async function openFoodDetail(foodId) {
    try {
        currentActiveFood = await db.foods.get(foodId);
        if (!currentActiveFood) return;

        amountInput.value = 100;
        detailName.innerText = currentActiveFood.n;
        updateMacroDisplay(100);

        document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
        fdDetailView.style.display = 'block';

    } catch (error) {
        console.error("Error loading food details:", error);
    }
}

function updateMacroDisplay(amountGrams) {
    if (!currentActiveFood) return;
    const multiplier = amountGrams / 100;
    
    // 1. Update the Big UI blocks
    detailCalories.innerText = Math.round(currentActiveFood.k * multiplier);
    detailCarbs.innerText = (currentActiveFood.c * multiplier).toFixed(1) + "g";
    detailProtein.innerText = (currentActiveFood.p * multiplier).toFixed(1) + "g";
    detailFat.innerText = (currentActiveFood.f * multiplier).toFixed(1) + "g";

    // 2. Update the German Standard Table
    tableHeaderAmount.innerText = `per ${amountGrams}g`;
    tableKcal.innerText = Math.round(currentActiveFood.k * multiplier) + " kcal";
    tableFat.innerText = (currentActiveFood.f * multiplier).toFixed(1) + "g";
    // Fallback to 0 if sub-macros don't exist in the item
    tableSatFat.innerText = ((currentActiveFood.sf || 0) * multiplier).toFixed(1) + "g";
    tableCarbs.innerText = (currentActiveFood.c * multiplier).toFixed(1) + "g";
    tableSugars.innerText = ((currentActiveFood.su || 0) * multiplier).toFixed(1) + "g";
    tableFiber.innerText = ((currentActiveFood.fi || 0) * multiplier).toFixed(1) + "g";
    tableProtein.innerText = (currentActiveFood.p * multiplier).toFixed(1) + "g";
    // Salt is usually rounded to 2 decimal places
    tableSalt.innerText = ((currentActiveFood.sa || 0) * multiplier).toFixed(2) + "g"; 
}

// ... Keep the rest of your event listeners below this (amountInput, close button, save button)

document.getElementById('save-to-diary-btn').addEventListener('click', async () => {
    if (!currentActiveFood) return;

    const amount = parseFloat(amountInput.value) || 0;
    if (amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const multiplier = amount / 100;
    
    // NEU: Den ausgewählten Wert aus dem Dropdown auslesen
    const selectedMeal = selectedMealValue;

    const diaryEntry = {
        date: new Date().toISOString().split('T')[0], 
        timestamp: Date.now(),
        meal: selectedMeal, // Speichert: Frühstück, Mittagessen, etc.
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
        if (navigator.vibrate) navigator.vibrate(50);
        
        fdDetailView.style.display = 'none';
        fdSearchView.style.display = 'block';
        amountInput.value = 100;
        
        document.getElementById('food-search-input').value = '';
        document.getElementById('search-results-list').innerHTML = '';
        
    } catch (error) {
        console.error("Failed to save to diary:", error);
        alert("Error saving to diary.");
    }
});



// Dropdown Logik
const trigger = document.getElementById('meal-select-box');
const optionsList = document.getElementById('meal-dropdown-options');
const selectedText = document.getElementById('selected-meal-text');
let selectedMealValue = "Frühstück"; // Standardwert

// Menü öffnen/schließen
trigger.addEventListener('click', () => {
    optionsList.style.display = (optionsList.style.display === 'none') ? 'block' : 'none';
});

// Option wählen
document.querySelectorAll('.meal-option').forEach(option => {
    option.addEventListener('click', (e) => {
        selectedMealValue = e.target.getAttribute('data-value');
        selectedText.innerText = selectedMealValue;
        optionsList.style.display = 'none';
    });
});

// Beim Speichern den Wert verwenden
// Ändere in deinem save-to-diary-btn Event Listener:
// const selectedMeal = document.getElementById('detail-meal-type').value; 
// ZU:
// const selectedMeal = selectedMealValue;
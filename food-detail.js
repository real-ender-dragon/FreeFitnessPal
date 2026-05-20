// ==========================================
// FOOD DETAIL MODULE (food-detail.js)
// ==========================================
let currentActiveFood = null;

// Unique variable names to prevent global clashes
const fdDetailView = document.getElementById('food-detail-view');
const fdSearchView = document.getElementById('search-view'); 

const detailName = document.getElementById('detail-name');
const detailCalories = document.getElementById('detail-calories');
const detailCarbs = document.getElementById('detail-carbs');
const detailProtein = document.getElementById('detail-protein');
const detailFat = document.getElementById('detail-fat');
const amountInput = document.getElementById('detail-amount');

async function openFoodDetail(foodId) {
    try {
        currentActiveFood = await db.foods.get(foodId);
        if (!currentActiveFood) return;

        amountInput.value = 100;
        detailName.innerText = currentActiveFood.n;
        updateMacroDisplay(100);

        // Hide all views and show detail view
        document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
        fdDetailView.style.display = 'block';

    } catch (error) {
        console.error("Error loading food details:", error);
    }
}

function updateMacroDisplay(amountGrams) {
    if (!currentActiveFood) return;
    const multiplier = amountGrams / 100;
    detailCalories.innerText = Math.round(currentActiveFood.k * multiplier);
    detailCarbs.innerText = (currentActiveFood.c * multiplier).toFixed(1) + "g";
    detailProtein.innerText = (currentActiveFood.p * multiplier).toFixed(1) + "g";
    detailFat.innerText = (currentActiveFood.f * multiplier).toFixed(1) + "g";
}

amountInput.addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    updateMacroDisplay(amount);
});

document.getElementById('close-detail-btn').addEventListener('click', () => {
    fdDetailView.style.display = 'none';
    fdSearchView.style.display = 'block';
    currentActiveFood = null;
});

document.getElementById('save-to-diary-btn').addEventListener('click', async () => {
    if (!currentActiveFood) return;

    const amount = parseFloat(amountInput.value) || 0;
    if (amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const multiplier = amount / 100;
    const diaryEntry = {
        date: new Date().toISOString().split('T')[0], 
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
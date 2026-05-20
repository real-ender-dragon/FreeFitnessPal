

# Project Overview: Offline-First iOS Macro Tracker (Free MyFitnessPal Alternative)

## 1. Core Concept & Visual Identity

A zero-bloat, completely offline Progressive Web App (PWA) designed strictly for iOS/iPhone. It serves as a private, free alternative to MyFitnessPal, solving the problem of bloated, inaccurate public databases by using a "Verify & Lock" workflow and a local IndexedDB.

**Visual Direction (CRITICAL):** The UI/UX should strictly clone the **Lifesum** app. The goal is to copy Lifesum's clean, modern, and highly intuitive aesthetic to guarantee a premium feel without wasting time reinventing or overcomplicating the UI.

## 2. Current Tech Stack & Assets

* **Target Platform:** iOS Safari PWA (saves to iPhone home screen, standalone mode).
* **Hosting:** GitHub Pages (Deployed from `main` root, `/FreeFitnessPal/` scope).
* **Frontend:** Vanilla HTML/CSS/JS (styled to mimic Lifesum).
* **Barcode Scanner:** Quagga2 (loaded via CDN).
* **Local Database:** Dexie.js v3+ (loaded via CDN).
* **Data Sources:** Open Food Facts API v2 (barcodes) and BLS local JSON (`bls-data.json`).

## 3. Current Data Architecture & Schema

The app uses a completely local-first architecture managed by Dexie.js (`MacroTrackerDB` v1).

* **`foods` table (`'i, n'`):** Stores all verified foods. Primary key is `i` (Barcode or BLS code). `n` (Name) is indexed for lightning-fast search.
* **`diary` table (`'++id, date'`):** Stores the user's daily consumption. Auto-incrementing ID with an indexed `date` to query daily totals.

## 4. Implemented Workflows (What is working right now)

1. **Bootstrapper:** On first launch, the app detects an empty database and bulk-loads the BLS whole foods JSON into IndexedDB.
2. **Live Search:** Real-time search UI querying the Dexie `foods` table. Requires >2 characters. Items currently display a static `light-blue_checkmark.png` indicating BLS verification.
3. **Smart Scanning:** Uses device camera via Quagga2. Includes a **Confidence Check** (requires 3 consecutive matching barcode frames) to prevent scanning errors.
4. **Local Check & API Fallback:** * Scanned code queries Dexie first. Loads instantly if found.
* If not found, fetches from Open Food Facts.


5. **Verify & Lock:** User is prompted to confirm the fetched macros. Upon confirmation, the item is permanently written to the local database for offline use.

## 5. Minimum Viable File Structure

* `index.html`: Main UI, video container `#reader`, search inputs.
* `app.js`: Core logic, Dexie initialization, Quagga scanning, API calls.
* `style.css`: UI styling (where the Lifesum cloning will happen).
* `sw.js`: Service Worker for offline asset caching.
* `manifest.json`: iOS PWA config (`"start_url": "/FreeFitnessPal/"`).
* `bls-data.json`: Local whole-food database injected on first load.

## 6. Roadmap & Pending TODOs

These features are part of the core vision but are **not yet implemented** in the current code:

* [ ] **Lifesum UI Overhaul:** Refactor `style.css` and `index.html` structure to perfectly mimic Lifesum's daily diary view, search screens, and typography.
* [ ] **Dynamic SVG Icons:** Replace the static `./static/light-blue_checkmark.png` with an inline SVG. Configure CSS to color it dynamically: 🟢 Blue for User-Verified, ⚪ Grey for BLS-Verified.
* [ ] **Favorites System:** Add a ❤️ symbol to pin favorite foods permanently to the top of searches.
* [ ] **Cache-As-You-Go Sorting:** Update the search algorithm so any item that has been tracked/eaten at least once is prioritized over untracked items.
* [ ] **Fast-Track Manual Entry:** Build a friction-free UI to quickly add custom foods or un-barcoded items manually to the private database.
* [ ] **Database Export (CRITICAL):** Build a UI button to export/backup the entire Dexie.js database as a JSON/CSV file.
* [ ] **Diary UI:** Build out the interface to actually log foods into the `diary` table and calculate daily totals (using the Lifesum visual style).
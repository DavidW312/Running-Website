const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// Global variables to store data for filtering and sorting
let currentWeekData = [];
let originalWeekData = []; // Snapshot of the original A-Z order
let allPRs = []; 

// 1. Setup on Page Load
window.onload = function() {
    initDropdown(); // Handles Mileage weeks
    fetchPRs();     // Handles the PR table
};

// 2. Build the Week Selector Dropdown
async function initDropdown() {
    const selector = document.getElementById('week-selector');
    if (!selector) return;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const spreadsheet = await response.json();
        
        selector.innerHTML = "";

        spreadsheet.sheets.forEach(sheet => {
            const title = sheet.properties.title;
            if (title.includes("Week")) {
                const option = document.createElement('option');
                option.value = title;
                option.textContent = title;
                selector.appendChild(option);
            }
        });

        selector.addEventListener('change', function() {
            fetchWeeklyData(this.value);
        });

        if (selector.options.length > 0) {
            fetchWeeklyData(selector.options[0].value);
        }

    } catch (error) {
        console.error("Error building dropdown:", error);
    }
}

// 3. Fetch Mileage Data
async function fetchWeeklyData(tabName) {
    const container = document.getElementById('mileage-container');
    container.innerHTML = `<p>Loading ${tabName}...</p>`;

    // This tells the browser to convert spaces/slashes into safe "web-code"
    const encodedTabName = encodeURIComponent(`'${tabName}'`);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedTabName}!A1:H?key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.values && data.values.length > 0) {
            // Save alphabetical data (skipping headers)
            originalWeekData = data.values.slice(1); 
            // Create a copy for sorting so the original stays safe
            currentWeekData = [...originalWeekData]; 
            renderMileageTable(currentWeekData);
        } else {
            container.innerHTML = `<p>No data found for ${tabName}.</p>`;
        }
    } catch (error) {
        console.error("Mileage Error:", error);
    }
}

// 4. Render Mileage Table
function renderMileageTable(rows) {
    const container = document.getElementById('mileage-container');
    let htmlContent = `
        <table class="mileage-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>`;

    rows.forEach(row => {
        if (row[0]) {
            htmlContent += `
                <tr>
                    <td class="name-cell">${row[0]}</td>
                    <td>${row[1] || 0}</td>
                    <td>${row[2] || 0}</td>
                    <td>${row[3] || 0}</td>
                    <td>${row[4] || 0}</td>
                    <td>${row[5] || 0}</td>
                    <td>${row[6] || 0}</td>
                    <td class="total-cell">${row[7] || 0}</td>
                </tr>`;
        }
    });

    htmlContent += "</tbody></table>";
    container.innerHTML = htmlContent;
}

// 5. SORT MILEAGE FUNCTION
window.sortMileage = function() {
    if (currentWeekData.length === 0) return;

    // Sort the copy by Column H (Index 7) from highest to lowest
    currentWeekData.sort((a, b) => {
        const valA = parseFloat(a[7]) || 0;
        const valB = parseFloat(b[7]) || 0;
        return valB - valA;
    });

    renderMileageTable(currentWeekData);
};

// 6. RESET SORT FUNCTION
window.resetSort = function() {
    if (originalWeekData.length === 0) return;
    
    // Replace current data with the original alphabetical snapshot
    currentWeekData = [...originalWeekData];
    renderMileageTable(currentWeekData);
};

// 7. Fetch PR Data
async function fetchPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRs!A1:D?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.values && data.values.length > 0) {
            allPRs = data.values; 
            renderPRTable(allPRs);
        }
    } catch (error) {
        console.error("PR Error:", error);
    }
}

// 8. Render PR Table
function renderPRTable(rows) {
    const container = document.getElementById('pr-container');
    if (!container) return;

    let html = `<table>
                <thead>
                    <tr>
                        <th>Name</th><th>800m</th><th>1600m</th><th>3200m</th>
                    </tr>
                </thead>
                <tbody>`;

    // Detect if first row is headers and skip if necessary
    const dataRows = (rows[0] && rows[0][0] === "Name") ? rows.slice(1) : rows;

    dataRows.forEach(row => {
        if (row[0]) {
            html += `<tr>
                        <td class="name-cell">${row[0]}</td>
                        <td>${row[1] || '--'}</td>
                        <td>${row[2] || '--'}</td>
                        <td>${row[3] || '--'}</td>
                     </tr>`;
        }
    });
    html += "</tbody></table>";
    container.innerHTML = html;
}

// 9. SEARCH/FILTER PRs
window.filterPRs = function() {
    const searchInput = document.getElementById('pr-search');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    
    if (allPRs.length === 0) return;

    const dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;

    const filteredData = dataOnly.filter(row => {
        const name = row[0] ? row[0].toLowerCase() : "";
        return name.includes(searchTerm);
    });

    renderPRTable(filteredData);
};
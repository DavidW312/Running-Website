const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// This stores our PR data so we can search through it later
let allPRs = []; 

// 1. Setup on Page Load
window.onload = function() {
    initDropdown(); // Handles Mileage weeks
    fetchPRs();     // Handles the PR table
};

// 2. Build the Week Selector Dropdown
async function initDropdown() {
    const selector = document.getElementById('week-selector');
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
        } else {
            document.getElementById('mileage-container').innerHTML = "No tabs named 'Week' found.";
        }

    } catch (error) {
        console.error("Error building dropdown:", error);
    }
}

// 3. Fetch Mileage Data
async function fetchWeeklyData(tabName) {
    const container = document.getElementById('mileage-container');
    container.innerHTML = `<p>Loading ${tabName}...</p>`;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${tabName}!A1:H?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.values && data.values.length > 0) {
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

            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
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
            }
            htmlContent += "</tbody></table>";
            container.innerHTML = htmlContent;
        } else {
            container.innerHTML = `<p>No data found for ${tabName}.</p>`;
        }
    } catch (error) {
        console.error("Mileage Error:", error);
    }
}

// 4. Fetch PR Data
async function fetchPRs() {
    // Range A1:D (Name, 800, 1600, 3200)
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
        document.getElementById('pr-container').innerHTML = "Make sure your tab is named 'PRs'";
    }
}

// 5. Draw the PR Table
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

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0]) {
            html += `<tr>
                        <td class="name-cell">${row[0]}</td>
                        <td>${row[1] || '--'}</td>
                        <td>${row[2] || '--'}</td>
                        <td>${row[3] || '--'}</td>
                     </tr>`;
        }
    }
    html += "</tbody></table>";
    container.innerHTML = html;
}

// 6. Search/Filter PRs
function filterPRs() {
    const searchInput = document.getElementById('pr-search');
    const searchTerm = searchInput.value.toLowerCase();
    
    console.log("Searching for:", searchTerm); // This helps us debug!

    // If for some reason allPRs is empty, stop here
    if (allPRs.length === 0) return;

    // 1. Keep the header row (Name, 800m, etc.)
    const header = allPRs[0];

    // 2. Filter the data rows (everything after the header)
    const filteredData = allPRs.slice(1).filter(row => {
        const name = row[0] ? row[0].toLowerCase() : "";
        return name.includes(searchTerm);
    });

    // 3. Combine them back together and redraw the table
    const rowsToDisplay = [header, ...filteredData];
    renderPRTable(rowsToDisplay);
}
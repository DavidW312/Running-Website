const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// Global variables
let currentWeekData = [];
let originalWeekData = []; 
let allPRs = []; 

window.onload = function() {
    initDropdown();
    fetchPRs();
};

// 1. Dropdown Setup
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

// 2. Fetch Weekly Data
async function fetchWeeklyData(tabName) {
    const container = document.getElementById('mileage-container');
    container.innerHTML = `<p>Loading ${tabName}...</p>`;

    const encodedTabName = encodeURIComponent(`'${tabName}'`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedTabName}!A1:H?key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.values && data.values.length > 0) {
            originalWeekData = data.values.slice(1); 
            currentWeekData = [...originalWeekData]; 
            renderMileageTable(currentWeekData);
        } else {
            container.innerHTML = `<p>No data found for ${tabName}.</p>`;
        }
    } catch (error) {
        console.error("Mileage Error:", error);
    }
}

// 3. Helpers for Math and Colors
function getMileageValue(val) {
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function getStatusClass(val) {
    if (val === "A") return "status-absent";
    if (val === "XA") return "status-excused";
    if (val === "INJ") return "status-injured";
    return "";
}

// 4. Render Table
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
            let calculatedTotal = 
                getMileageValue(row[1]) + getMileageValue(row[2]) + 
                getMileageValue(row[3]) + getMileageValue(row[4]) + 
                getMileageValue(row[5]) + getMileageValue(row[6]);

            htmlContent += `
                <tr>
                    <td class="name-cell">${row[0]}</td>
                    <td class="${getStatusClass(row[1])}">${row[1] || 0}</td>
                    <td class="${getStatusClass(row[2])}">${row[2] || 0}</td>
                    <td class="${getStatusClass(row[3])}">${row[3] || 0}</td>
                    <td class="${getStatusClass(row[4])}">${row[4] || 0}</td>
                    <td class="${getStatusClass(row[5])}">${row[5] || 0}</td>
                    <td class="${getStatusClass(row[6])}">${row[6] || 0}</td>
                    <td class="total-cell">${calculatedTotal.toFixed(1)}</td>
                </tr>`;
        }
    });

    htmlContent += "</tbody></table>";
    container.innerHTML = htmlContent;
}

// 5. SORTING FUNCTIONS (Buttons)
window.sortMileage = function() {
    if (currentWeekData.length === 0) return;
    currentWeekData.sort((a, b) => {
        const totalA = getMileageValue(a[1]) + getMileageValue(a[2]) + getMileageValue(a[3]) + 
                       getMileageValue(a[4]) + getMileageValue(a[5]) + getMileageValue(a[6]);
        const totalB = getMileageValue(b[1]) + getMileageValue(b[2]) + getMileageValue(b[3]) + 
                       getMileageValue(b[4]) + getMileageValue(b[5]) + getMileageValue(b[6]);
        return totalB - totalA;
    });
    renderMileageTable(currentWeekData);
};

window.resetSort = function() {
    currentWeekData = [...originalWeekData];
    renderMileageTable(currentWeekData);
};

// 6. PR FUNCTIONS
async function fetchPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRs!A1:D?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.values) {
            allPRs = data.values; 
            renderPRTable(allPRs);
        }
    } catch (e) { console.error(e); }
}

function renderPRTable(rows) {
    const container = document.getElementById('pr-container');
    const dataRows = (rows[0] && rows[0][0] === "Name") ? rows.slice(1) : rows;
    let html = `<table><thead><tr><th>Name</th><th>800m</th><th>1600m</th><th>3200m</th></tr></thead><tbody>`;
    dataRows.forEach(row => {
        if (row[0]) {
            html += `<tr><td class="name-cell">${row[0]}</td><td>${row[1]||'--'}</td><td>${row[2]||'--'}</td><td>${row[3]||'--'}</td></tr>`;
        }
    });
    container.innerHTML = html + "</tbody></table>";
}

window.filterPRs = function() {
    const searchTerm = document.getElementById('pr-search').value.toLowerCase();
    const dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;
    const filtered = dataOnly.filter(row => row[0] && row[0].toLowerCase().includes(searchTerm));
    renderPRTable(filtered);
};
const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// Global variables
let currentWeekData = [];
let originalWeekData = [];
let allPRs = [];
let prSortState = { column: null, ascending: true };

// Update existing window.onload
window.onload = function() {
    initDashboard(); // Combined initialization
    fetchPRs();
};

async function initDashboard() {
    const selector = document.getElementById('week-selector');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const spreadsheet = await response.json();
        
        const weekSheets = spreadsheet.sheets
            .map(s => s.properties.title)
            .filter(title => title.includes("Week"));

        // 1. Build Dropdown
        selector.innerHTML = "";
        weekSheets.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            selector.appendChild(option);
        });

        selector.addEventListener('change', function() {
            fetchWeeklyData(this.value);
        });

        // 2. Load Initial Week
        if (weekSheets.length > 0) fetchWeeklyData(weekSheets[0]);

        // 3. TRIGGER SEASON ANALYTICS
        calculateSeasonAnalytics(weekSheets);

    } catch (error) { console.error("Init Error:", error); }
}

async function calculateSeasonAnalytics(weekNames) {
    let seasonTotals = {}; // Dictionary for athlete-season mileage numbers
    let totalTeamMiles = 0; // Total team mileage count
    let totalAbsences = 0; // Total absences count
    let totalActiveDaysCount = 0; // Only counts days where data exists

    const promises = weekNames.map(name => 
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(name)}!A2:H?key=${API_KEY}`)
        .then(res => res.json())
    );

    const allWeeksData = await Promise.all(promises);

    allWeeksData.forEach(week => {
        if (!week.values || week.values.length === 0) return;

        // --- NEW: Identify which days (columns) actually have data ---
        let activeColumns = []; // Will store indices 1-6 if the day is "active"
        for (let col = 1; col <= 6; col++) {
            let columnHasData = week.values.some(row => {
                const val = row[col];
                // A day is active if someone has miles > 0 OR a status like A/INJ/XA
                return (val && val !== "" && val !== "0" && val !== 0);
            });
            if (columnHasData) activeColumns.push(col);
        }

        week.values.forEach(row => {
            const name = row[0];
            if (!name) return;

            if (!seasonTotals[name]) {
                seasonTotals[name] = { miles: 0, absences: 0 };
            }

            // Only loop through columns that we verified have data
            activeColumns.forEach(col => {
                const val = row[col];
                
                // Track Absences
                if (val === "A" || val === "INJ") {
                    totalAbsences++;
                    seasonTotals[name].absences++;
                }

                // Track Miles
                const m = getMileageValue(val);
                seasonTotals[name].miles += m;
                totalTeamMiles += m;
                
                // Track "Possible Days" only for active days
                totalActiveDaysCount++;
            });
        });
    });

    renderSeasonUI(seasonTotals, totalTeamMiles, totalAbsences, totalActiveDaysCount);
}

function renderSeasonUI(totals, teamMiles, absences, possibleDays) {
    // Update Stats Cards
    document.getElementById('total-team-miles').textContent = Math.round(teamMiles);
    
    const health = ((1 - (absences / possibleDays)) * 100).toFixed(1);
    document.getElementById('attendance-stat').textContent = `${health}%`;

    // Sort leaderboard
    const sorted = Object.entries(totals).sort((a, b) => b[1].miles - a[1].miles);
    
    if (sorted.length > 0) {
        document.getElementById('season-leader').textContent = sorted[0][0];
    }

    // Render Mini Leaderboard
    let html = `<table><thead><tr><th>Rank</th><th>Name</th><th>Total Miles</th><th>Missed Days</th></tr></thead><tbody>`;
    sorted.forEach((entry, index) => {
        html += `<tr>
            <td>${index + 1}</td>
            <td class="name-cell">${entry[0]}</td>
            <td>${entry[1].miles.toFixed(1)}</td>
            <td>${entry[1].absences}</td>
        </tr>`;
    });
    document.getElementById('season-leaderboard-container').innerHTML = html + "</tbody></table>";
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
            updateTimestamp();
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

    // Determine which arrow to show based on sort state
    const getArrow = (col) => {
        if (prSortState.column !== col) return "⇅";
        return prSortState.ascending ? "▲" : "▼";
    };

    let html = `<table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>800m <button class="mini-sort" onclick="sortPRs(1)">${getArrow(1)}</button></th>
                        <th>1600m <button class="mini-sort" onclick="sortPRs(2)">${getArrow(2)}</button></th>
                        <th>3200m <button class="mini-sort" onclick="sortPRs(3)">${getArrow(3)}</button></th>
                    </tr>
                </thead>
                <tbody>`;

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
    container.innerHTML = html + "</tbody></table>";
}

// Helper to convert "4:30.5" into total seconds (270.5) for sorting
function timeToSeconds(timeStr) {
    // If empty, return a huge number so they stay at the bottom regardless of sort
    if (!timeStr || timeStr === '--' || timeStr === '0' || timeStr === '') return 999999;
    
    const parts = timeStr.toString().split(':');
    if (parts.length === 2) {
        return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
    }
    return parseFloat(timeStr);
}

// Update the sortPRs function to toggle
window.sortPRs = function(columnIndex) {
    let dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;

    // Toggle logic: If clicking the same column, flip the order. 
    // If clicking a new column, start with Fastest (ascending).
    if (prSortState.column === columnIndex) {
        prSortState.ascending = !prSortState.ascending;
    } else {
        prSortState.column = columnIndex;
        prSortState.ascending = true;
    }

    dataOnly.sort((a, b) => {
        const timeA = timeToSeconds(a[columnIndex]);
        const timeB = timeToSeconds(b[columnIndex]);
        
        return prSortState.ascending ? timeA - timeB : timeB - timeA;
    });

    renderPRTable(dataOnly);
};

window.filterPRs = function() {
    const searchTerm = document.getElementById('pr-search').value.toLowerCase();
    const dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;
    const filtered = dataOnly.filter(row => row[0] && row[0].toLowerCase().includes(searchTerm));
    renderPRTable(filtered);
};

// Reset function to return to alphabetical (original) order
window.resetPRs = function() {
    prSortState = { column: null, ascending: true };
    // Redraw using the full allPRs array (which is alphabetical from Sheets)
    renderPRTable(allPRs);
};

function updateTimestamp() {
    const now = new Date();
    const options = { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    const timeString = now.toLocaleTimeString('en-US', options);
    document.getElementById('last-updated').textContent = `Synced with Google Sheets: ${timeString}`;
}
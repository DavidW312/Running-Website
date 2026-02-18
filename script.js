const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// --- GLOBAL STATE ---
let currentWeekData = [];
let originalWeekData = [];
let allPRs = [];
let prSortState = { column: null, ascending: true };
let allRaceData = []; 

// --- 1. INITIALIZATION ---

/**
 * Runs when the page loads. 
 * Kicks off the three main data fetching branches.
 */
window.onload = async function() {
    await fetchPRs();
    initDashboard();
    fetchRaceResults();
};

/**
 * Connects to Google Sheets to find all tab names.
 * Filters for "Week" tabs and builds the selection dropdown.
 */
async function initDashboard() {
    const selector = document.getElementById('week-selector');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const spreadsheet = await response.json();
        
        // Find tabs that contain the word "Week"
        const weekSheets = spreadsheet.sheets
            .map(s => s.properties.title)
            .filter(title => title.includes("Week"));

        // Build the HTML Dropdown
        selector.innerHTML = "";
        weekSheets.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            selector.appendChild(option);
        });

        // Listen for user changing the week
        selector.addEventListener('change', function() {
            fetchWeeklyData(this.value);
        });

        // Load the most recent week by default
        if (weekSheets.length > 0) fetchWeeklyData(weekSheets[0]);

        // Process all weeks for Season-Long Insights
        calculateSeasonAnalytics(weekSheets);

    } catch (error) { 
        console.error("Critical Init Error:", error); 
    }
}

// --- 2. SEASON ANALYTICS & INSIGHTS (2x2 Logic) ---

/**
 * Downloads every weekly sheet to calculate total mileage and attendance.
 */
async function calculateSeasonAnalytics(weekNames) {
    let seasonTotals = {}; 
    let totalTeamMiles = 0; 
    let totalAbsences = 0; 
    let totalActiveDaysCount = 0; 

    // Fetch all tabs in parallel for speed
    const promises = weekNames.map(name => 
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(name)}!A2:I?key=${API_KEY}`)
        .then(res => res.json())
    );

    const allWeeksData = await Promise.all(promises);

    allWeeksData.forEach(week => {
        if (!week.values || week.values.length === 0) return;

        // Determine which columns have actually been filled (prevents future 0s from hurting health %)
        let activeColumns = []; 
        for (let col = 1; col <= 6; col++) {
            let columnHasData = week.values.some(row => {
                const val = row[col];
                return (val && val !== "" && val !== "0" && val !== 0);
            });
            if (columnHasData) activeColumns.push(col);
        }

        week.values.forEach(row => {
            const name = row[0];
            if (!name) return;

            // Initialize runner record if new
            if (!seasonTotals[name]) {
                seasonTotals[name] = { 
                    miles: 0, 
                    absences: 0, 
                    group: row[8] || "Unassigned" 
                };
            } else if (row[8]) {
                // Update group to the most recent assignment
                seasonTotals[name].group = row[8];
            }

            activeColumns.forEach(col => {
                const val = row[col];
                
                // Track Absences (A), Excused (XA), or Injured (INJ)
                if (val === "A" || val === "INJ" || val === "XA") {
                    totalAbsences++;
                    seasonTotals[name].absences++;
                }

                const m = getMileageValue(val);
                seasonTotals[name].miles += m;
                totalTeamMiles += m;
                totalActiveDaysCount++;
            });
        });
    });

    renderSeasonUI(seasonTotals, totalTeamMiles, totalAbsences, totalActiveDaysCount);
}

/**
 * Updates the UI cards and the season leaderboard.
 */
function renderSeasonUI(totals, teamMiles, absences, possibleDays) {
    // 1. Update Stats Cards (Miles and Health)
    const teamMilesEl = document.getElementById('total-team-miles');
    const healthEl = document.getElementById('attendance-stat');
    
    if (teamMilesEl) teamMilesEl.textContent = Math.round(teamMiles);
    if (healthEl) {
        const health = possibleDays > 0 
            ? ((1 - (absences / possibleDays)) * 100).toFixed(1) 
            : "100";
        healthEl.textContent = `${health}%`;
    }

    // 2. Logic for Group Leaders (Splitting by Gender)
    const girlsLeadersHtml = ["<h4>Girls</h4>"];
    const boysLeadersHtml = ["<h4>Boys</h4>"];
    
    const groupLeaders = {};
    Object.entries(totals).forEach(([name, data]) => {
        const gender = getGender(name);
        const groupLabel = data.group || "Unassigned";
        const uniqueKey = `${gender}: ${groupLabel}`;

        if (!groupLeaders[uniqueKey] || data.miles > groupLeaders[uniqueKey].miles) {
            groupLeaders[uniqueKey] = { name: name, miles: data.miles, gender: gender, group: groupLabel };
        }
    });

    // Sort the keys so they appear as Group 1, Group 2...
    Object.keys(groupLeaders).sort().forEach(key => {
        const leader = groupLeaders[key];
        const itemHtml = `
            <p style="margin: 3px 0; font-size: 0.85rem;">
                <span style="font-weight: bold;">${leader.group}:</span> 
                ${cleanName(leader.name)} (${leader.miles.toFixed(1)})
            </p>`;
        
        if (leader.gender === "Girls") {
            girlsLeadersHtml.push(itemHtml);
        } else {
            boysLeadersHtml.push(itemHtml);
        }
    });

    // Inject into the two columns
    const girlsCol = document.getElementById('girls-leaders-column');
    const boysCol = document.getElementById('boys-leaders-column');
    if (girlsCol) girlsCol.innerHTML = girlsLeadersHtml.join('');
    if (boysCol) boysCol.innerHTML = boysLeadersHtml.join('');

    // 3. Render the Main Table Leaderboard (Ensures this runs even if the above fails)
    const leaderboardContainer = document.getElementById('season-leaderboard-container');
    if (leaderboardContainer) {
        const sorted = Object.entries(totals).sort((a, b) => b[1].miles - a[1].miles);
        let html = `<table><thead><tr><th>Rank</th><th>Name</th><th>Group</th><th>Miles</th><th>Missed</th></tr></thead><tbody>`;
        
        sorted.forEach((entry, index) => {
            html += `<tr>
                <td>${index + 1}</td>
                <td class="name-cell">${cleanName(entry[0])}</td>
                <td style="font-size: 0.8rem; color: #667;">${getGender(entry[0])} ${entry[1].group || '-'}</td>
                <td style="font-weight: bold; color: chocolate;">${entry[1].miles.toFixed(1)}</td>
                <td>${entry[1].absences}</td>
            </tr>`;
        });
        leaderboardContainer.innerHTML = html + "</tbody></table>";
    }
}

// --- 3. WEEKLY MILEAGE TABLE LOGIC ---

/**
 * Fetches data for a specific tab/week.
 */
async function fetchWeeklyData(tabName) {
    const container = document.getElementById('mileage-container');
    container.innerHTML = `<p>Loading ${tabName}...</p>`;

    const encodedTabName = encodeURIComponent(`'${tabName}'`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedTabName}!A1:I?key=${API_KEY}`;
    
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
    } catch (error) { console.error("Weekly Fetch Error:", error); }
}

/**
 * Builds the mileage table with Gender and Group sorting.
 */
function renderMileageTable(rows) {
    const container = document.getElementById('mileage-container');
    
    // Primary Sort: Gender (F) vs Boys. Secondary Sort: Training Group.
    const sortedRows = [...rows].sort((a, b) => {
        const genA = getGender(a[0]);
        const genB = getGender(b[0]);
        if (genA !== genB) return genA.localeCompare(genB);

        const grpA = a[8] || "Unassigned";
        const grpB = b[8] || "Unassigned";
        return grpA.localeCompare(grpB);
    });

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

    let currentSection = "";

    sortedRows.forEach(row => {
        if (!row[0]) return;

        const gender = getGender(row[0]);
        const group = row[8] || "Unassigned";
        const sectionHeader = `Group ${group} ${gender}`;

        if (sectionHeader !== currentSection) {
            currentSection = sectionHeader;
            htmlContent += `
                <tr class="group-header-row">
                    <td colspan="8">${sectionHeader}</td>
                </tr>`;
        }

        const totalMiles = getMileageValue(row[7]);

        htmlContent += `
            <tr>
                <td class="name-cell">${cleanName(row[0])}</td>
                <td class="${getStatusClass(row[1])}">${row[1] || 0}</td>
                <td class="${getStatusClass(row[2])}">${row[2] || 0}</td>
                <td class="${getStatusClass(row[3])}">${row[3] || 0}</td>
                <td class="${getStatusClass(row[4])}">${row[4] || 0}</td>
                <td class="${getStatusClass(row[5])}">${row[5] || 0}</td>
                <td class="${getStatusClass(row[6])}">${row[6] || 0}</td>
                <td class="total-cell">${totalMiles.toFixed(1)}</td>
            </tr>`;
    });

    htmlContent += "</tbody></table>";
    container.innerHTML = htmlContent;
}

/**
 * User-triggered sort to see the weekly mileage leaders.
 */
window.sortMileage = function() {
    if (currentWeekData.length === 0) return;
    currentWeekData.sort((a, b) => getMileageValue(b[7]) - getMileageValue(a[7]));
    renderMileageTable(currentWeekData);
};

/**
 * Resets the table to the original Google Sheet order (Alphabetical/Grouped).
 */
window.resetSort = function() {
    currentWeekData = [...originalWeekData];
    renderMileageTable(currentWeekData);
};


// --- 4. PERSONAL RECORDS (PR) ENGINE ---

/**
 * STRICT PR LOGIC:
 * 1. Must have a valid race time (not '-', '0', or empty).
 * 2. If PR is empty/--: Highlight as a "Debut".
 * 3. If PR exists: Highlight only if race time is faster.
 */
function isNewPR(raceTimeStr, prTimeStr) {
    // RULE 1: If there is no race result, it can't be a PR.
    if (!raceTimeStr || raceTimeStr === '-' || raceTimeStr === '0' || raceTimeStr.trim() === '') {
        return false;
    }
    
    // RULE 2: If the athlete has NO recorded PR yet (Debut)
    const isFirstTime = (!prTimeStr || prTimeStr === '--' || prTimeStr.trim() === '');
    if (isFirstTime) {
        return true; 
    }

    // RULE 3: Comparison for existing PRs
    const raceSec = timeToSeconds(raceTimeStr);
    const prSec = timeToSeconds(prTimeStr);
    
    // Only return true if they actually improved (raceSec is smaller than prSec (or equal to, in case of updating the PR Table,
    // so it still displays that that person PR'd at that meet))
    return (raceSec > 0 && raceSec <= prSec);
}

/**
 * Fetches the PR tab.
 */
async function fetchPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRs!A1:D?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.values) {
            allPRs = data.values; 
            renderPRTable(allPRs);
            return true; // Send signal that data is loaded
        }
    } catch (e) { 
        console.error("PR Fetch Error:", e); 
        return false;
    }
}

/**
 * Renders the PR table with clean names and sort arrows.
 */
function renderPRTable(rows) {
    const container = document.getElementById('pr-container');
    const dataRows = (rows[0] && rows[0][0] === "Name") ? rows.slice(1) : rows;

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
                <td class="name-cell">${cleanName(row[0])}</td>
                <td>${row[1] || '--'}</td>
                <td>${row[2] || '--'}</td>
                <td>${row[3] || '--'}</td>
            </tr>`;
        }
    });
    container.innerHTML = html + "</tbody></table>";
}

/**
 * Handles toggling between ascending/descending for PR times.
 */
window.sortPRs = function(columnIndex) {
    let dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;
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

/**
 * Filters PR table based on name search.
 */
window.filterPRs = function() {
    const searchTerm = document.getElementById('pr-search').value.toLowerCase();
    const dataOnly = (allPRs[0] && allPRs[0][0] === "Name") ? allPRs.slice(1) : allPRs;
    const filtered = dataOnly.filter(row => row[0] && row[0].toLowerCase().includes(searchTerm));
    renderPRTable(filtered);
};

/**
 * Resets PRs to alphabetical.
 */
window.resetPRs = function() {
    prSortState = { column: null, ascending: true };
    renderPRTable(allPRs);
};

// --- 5. MEET RESULTS ENGINE ---

/**
 * Fetches the Race Results tab.
 */
async function fetchRaceResults() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Race_Results!A2:H?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            document.getElementById('meet-results-container').innerHTML = "<p>No race results found.</p>";
            return;
        }

        allRaceData = data.values;
        populateMeetSelector(allRaceData);
        
        const lastMeet = allRaceData[allRaceData.length - 1][1];
        document.getElementById('meet-selector').value = lastMeet;
        displaySelectedMeet();

    } catch (error) { console.error("Race Results Error:", error); }
}

function populateMeetSelector(rows) {
    const selector = document.getElementById('meet-selector');
    const meets = [...new Set(rows.map(row => row[1]))].filter(m => m);
    selector.innerHTML = meets.map(m => `<option value="${m}">${m}</option>`).join('');
}

/**
 * THE SMART DISPLAY FUNCTION
 * Checks for PRs and highlights them in green with a star.
 */
window.displaySelectedMeet = function() {
    if (allPRs.length === 0) {
        console.log("PR data not ready... retrying in 100ms");
        setTimeout(displaySelectedMeet, 100);
        return;
    }
    
    const selectedMeet = document.getElementById('meet-selector').value;
    const container = document.getElementById('meet-results-container');
    const meetRows = allRaceData.filter(row => row[1] === selectedMeet);
    
    let html = `<table><thead><tr>
                <th>Athlete</th>
                <th>800m</th>
                <th>1600m</th>
                <th>3200m</th>
                <th>Relay Split</th>
                <th>Relay Event</th>
                </tr></thead><tbody>`;

    meetRows.forEach(row => {
        const athleteName = row[0] || "";
        
        // Find the PR row
        const athletePR = allPRs.find(p => {
            return (p[0] || "").trim().toLowerCase() === athleteName.trim().toLowerCase();
        }) || [];

        const formatCell = (raceTime, prTime) => {
            // Check Rule 1 immediately: No time = No highlight
            if (!raceTime || raceTime === '-' || raceTime === '0' || raceTime.trim() === '') return '-';
            
            if (isNewPR(raceTime, prTime)) {
                return `<span class="pr-highlight">${raceTime} <span class="pr-star">⭐</span></span>`;
            }
            return raceTime;
        };

        html += `<tr>
                <td class="name-cell">${cleanName(athleteName)}</td>
                <td>${formatCell(row[3], athletePR[1])}</td>
                <td>${formatCell(row[4], athletePR[2])}</td>
                <td>${formatCell(row[5], athletePR[3])}</td>
                <td>${row[6] || '-'}</td>
                <td style="font-size: 0.85rem; color: #778;">${row[7] || '-'}</td>
            </tr>`;
    });
    container.innerHTML = html + "</tbody></table>";
};

// --- 6. UTILITY HELPERS ---

function getGender(name) {
    return name && name.includes("(F)") ? "Girls" : "Boys";
}

function cleanName(name) {
    return name ? name.replace("(F)", "").trim() : "";
}

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

function timeToSeconds(timeStr) {
    if (!timeStr || timeStr === '--' || timeStr === '-' || timeStr === '0' || timeStr === '') return 999999;
    const parts = timeStr.toString().split(':');
    if (parts.length === 2) {
        return (parseFloat(parts[0]) * 60) + parseFloat(parts[1]);
    }
    return parseFloat(timeStr);
}

function updateTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = `Synced with Google Sheets: ${timeString}`;
}

// --- 7. ADVANCED TOGGLE VIEW SYSTEM ---

document.addEventListener("DOMContentLoaded", () => {

    const buttons = document.querySelectorAll(".view-btn");
    const main = document.querySelector("main");

    const sectionMap = {
        mileage: document.getElementById("mileage-section"),
        season: document.getElementById("season-insights-section"),
        pr: document.getElementById("pr-section"),
        results: document.getElementById("results-section")
    };

    buttons.forEach(button => {
        button.addEventListener("click", () => {

            const section = button.dataset.section;

            // ALL BUTTON LOGIC
            if (section === "all") {
                const isActive = button.classList.contains("active");

                if (isActive) {
                    // Turn everything off
                    buttons.forEach(b => b.classList.remove("active"));
                    Object.values(sectionMap).forEach(sec => sec.classList.add("hidden-section"));
                } else {
                    // Turn everything on
                    buttons.forEach(b => b.classList.add("active"));
                    Object.values(sectionMap).forEach(sec => sec.classList.remove("hidden-section"));
                }

            } else {

                // Toggle individual section
                button.classList.toggle("active");
                sectionMap[section].classList.toggle("hidden-section");

                // Sync ALL button
                const allButton = document.querySelector('[data-section="all"]');
                const allIndividualActive = [...buttons]
                    .filter(b => b.dataset.section !== "all")
                    .every(b => b.classList.contains("active"));

                if (allIndividualActive) {
                    allButton.classList.add("active");
                } else {
                    allButton.classList.remove("active");
                }
            }

            updateGridLayout();
        });
    });

    function updateGridLayout() {
        const visibleSections = Object.values(sectionMap)
            .filter(sec => !sec.classList.contains("hidden-section"));

        if (visibleSections.length <= 1) {
            main.style.gridTemplateColumns = "1fr";
        } else {
            main.style.gridTemplateColumns = "1fr 1fr";
        }
    }

});


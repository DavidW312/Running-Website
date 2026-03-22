const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// --- GLOBAL STATE ---
let currentWeekData = [];
let originalWeekData = [];
let allPRs = [];
let prSortState = { column: null, ascending: true };
let allRaceData = [];
let currentMeetTab = "individual";
let meetSortState = { column: null, ascending: true };
let originalMeetRows = [];  // we'll store the filtered rows before sorting/search
let myChart = null; // Global variable to store the chart instance
let currentSport = "distance";

let throwsMeetData = [];
let currentThrowsMeet = null;
let throwsMeetSortState = { column: null, ascending: true };
let allThrowsPRs = []; // separate array for throws PRS
let throwsPRSheetRows = [];
let throwsPRSortState = { column: null, ascending: true };

let originalThrowsRows = [];
let originalSprintsRows = [];
let originalJumpsRows = [];

// --- DISTANCE STATE ---
let allDistancePRs = []; // Rename allPRs to this for clarity
let distanceMeetData = []; // Rename allRaceData to this
let distanceSortState = { column: null, ascending: true };
let distancePRSortState = { column: null, ascending: true };

// --- SPRINTS STATE ---
let allSprintsPRs = [];
let sprintsMeetData = [];
let sprintsIndividualPRSortState = { column: null, ascending: true };
let sprintsRelayPRSortState = { column: null, ascending: true };

let sprintsMeetSortState = { column: null, ascending: true };
let currentSprintsMeet = "";

let currentSprintsMeetTab = "individual"; // Default tab

// --- 1. INITIALIZATION ---

// ==============================
// UNIFIED LOAD HANDLER (FIXED)
// ==============================
window.addEventListener("DOMContentLoaded", async () => {
    // 1️⃣ Load Distance PRs
    await fetchPRs();

    // 2️⃣ Initialize dashboard & week selector
    await initDashboard();

    // 3️⃣ Load race results for the first meet (Added await here)
    await fetchRaceResults();

    // 4️⃣ Render runners results
    displaySelectedMeet();

    // 5️⃣ Setup sport tabs (Distance / Throws)
    const sportTabs = document.querySelectorAll(".sport-tab");

    const distanceWrapper = document.getElementById("distance-wrapper");
    const throwsWrapper = document.getElementById("throws-wrapper");
    const sprintsWrapper = document.getElementById("sprints-wrapper");
    const jumpsWrapper = document.getElementById("jumps-wrapper");

    sportTabs.forEach(tab => {
        tab.addEventListener("click", async () => {
            const selectedSport = tab.dataset.sport;
            currentSport = selectedSport;

            sportTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            if (selectedSport === "distance") {

                distanceWrapper.classList.remove("hidden-section");
                throwsWrapper.classList.add("hidden-section");
                sprintsWrapper.classList.add("hidden-section");
                jumpsWrapper.classList.add("hidden-section");

                displaySelectedMeet();

            } 
            else if (selectedSport === "throws") {

                distanceWrapper.classList.add("hidden-section");
                throwsWrapper.classList.remove("hidden-section");
                sprintsWrapper.classList.add("hidden-section");
                jumpsWrapper.classList.add("hidden-section");

                if (!window.throwsLoaded) {
                    await fetchThrowsPRs();
                    await fetchThrowsMeetResults();
                   window.throwsLoaded = true;
                }

                displaySelectedThrowsMeet();
            }
            else if (selectedSport === "sprints") {

                distanceWrapper.classList.add("hidden-section");
                throwsWrapper.classList.add("hidden-section");
                sprintsWrapper.classList.remove("hidden-section");
                jumpsWrapper.classList.add("hidden-section");

                if (!window.sprintsLoaded) {
                    await fetchSprintsPRs();
                    await fetchSprintsMeetResults();
                    window.sprintsLoaded = true;
                }

                displaySelectedSprintsMeet();
            }
            else if (selectedSport === "jumps") {

                distanceWrapper.classList.add("hidden-section");
                throwsWrapper.classList.add("hidden-section");
                sprintsWrapper.classList.add("hidden-section");
                jumpsWrapper.classList.remove("hidden-section");

                if (!window.jumpsLoaded) {
                    await fetchJumpsPRs();
                    await fetchJumpsMeetResults();
                    window.jumpsLoaded = true;
                }

                displaySelectedJumpsMeet();
            }
        });
    });

    initAdvancedToggleView();
});

// ==============================
// ADVANCED TOGGLE VIEW SYSTEM
// ==============================
function initAdvancedToggleView() {
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

            if (section === "all") {
                const isActive = button.classList.contains("active");
                buttons.forEach(b => b.classList.remove("active"));
                Object.values(sectionMap).forEach(sec => sec.classList.add("hidden-section"));

                if (!isActive) {
                    buttons.forEach(b => b.classList.add("active"));
                    Object.values(sectionMap).forEach(sec => sec.classList.remove("hidden-section"));
                }
            } else {
                button.classList.toggle("active");
                sectionMap[section].classList.toggle("hidden-section");

                // Sync "all" button
                const allButton = document.querySelector('[data-section="all"]');
                const allIndividualActive = [...buttons]
                    .filter(b => b.dataset.section !== "all")
                    .every(b => b.classList.contains("active"));
                allButton.classList.toggle("active", allIndividualActive);
            }

            updateGridLayout();
        });
    });

    function updateGridLayout() {
        const visibleSections = Object.values(sectionMap)
            .filter(sec => !sec.classList.contains("hidden-section"));
        main.style.gridTemplateColumns = visibleSections.length <= 1 ? "1fr" : "1fr 1fr";
    }
}

/**
 * Connects to Google Sheets to find all tab names.
 * Filters for "Week" tabs and builds the selection dropdown.
 */
async function initDashboard() {
    const selector = document.getElementById('week-selector');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}&t=${Date.now()}`;

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

    const weekDaysCols = [2,3,4,5,6,7]; // mon→sat

    // Fetch all tabs in parallel
    const promises = weekNames.map(name => 
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(name)}!A2:J?key=${API_KEY}`)
        .then(res => res.json())
    );

    const allWeeksData = await Promise.all(promises);

    allWeeksData.forEach(week => {
        if (!week.values || week.values.length === 0) return;

        week.values.forEach(row => {
            const name = buildName(row);
            if (!name) return;

            if (!seasonTotals[name]) {
                seasonTotals[name] = { 
                    miles: 0,
                    absences: 0,
                    A: 0,
                    XA: 0,
                    INJ: 0,
                    group: row[9] || "Unassigned" // column J
                };
            } else if (row[9]) {
                seasonTotals[name].group = row[9];
            }

            weekDaysCols.forEach(col => {
                let val = row[col];

                // Count absences only for A/XA/INJ
                if (val === "A" || val === "INJ" || val === "XA") {
                    totalAbsences++;
                    seasonTotals[name].absences++;
                    seasonTotals[name][val]++;
                }

                // Count mileage (0 if empty)
                const m = getMileageValue(val);
                seasonTotals[name].miles += m;
                totalTeamMiles += m;

                // Count any entered value as an active day
                // If val is empty string or undefined, treat as P only if other entries exist in that column
                if (val && val !== "") {
                    totalActiveDaysCount++;
                }
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
        let html = `<table><thead><tr><th>Rank</th><th>Name</th><th>Group</th><th>Miles</th><th>Missed(A/XA/INJ)</th></tr></thead><tbody>`;
        
        sorted.forEach((entry, index) => {
            html += `<tr>
                <td>${index + 1}</td>
                <td class="name-cell">${cleanName(entry[0])}</td>
                <td style="font-size: 0.8rem; color: #667;">${getGender(entry[0])} ${entry[1].group || '-'}</td>
                <td style="font-weight: bold; color: chocolate;">${entry[1].miles.toFixed(1)}</td>
                <td>
                    ${entry[1].absences}
                    <span class="miss-breakdown">
                        (
                        <span class="miss-a">${entry[1].A}</span> /
                        <span class="miss-xa">${entry[1].XA}</span> /
                        <span class="miss-inj">${entry[1].INJ}</span>
                        )
                    </span>
                </td>
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedTabName}!A1:J?key=${API_KEY}`;
    
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

    // Sort: Gender → Group
    const sortedRows = [...rows].sort((a, b) => {
        const genA = getGender(buildName(a));
        const genB = getGender(buildName(b));

        if (genA !== genB) return genA.localeCompare(genB);

        const grpA = a[9] || "Unassigned"; // column J
        const grpB = b[9] || "Unassigned";
        return grpA.localeCompare(grpB);
    });

    // Determine which weekday columns have any data
    const weekdayCols = [2,3,4,5,6,7]; // Mon→Sat
    const activeWeekdays = {};
    weekdayCols.forEach(colIdx => {
        activeWeekdays[colIdx] = rows.some(row => row[colIdx] && row[colIdx].toString().trim() !== '');
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
        if (!Array.isArray(row) || row.length < 2) return; // safety

        const name = buildName(row);
        if (!name) return;

        const gender = getGender(name);
        const group = row[9] || "Unassigned";
        const sectionHeader = `Group ${group} ${gender}`;

        if (sectionHeader !== currentSection) {
            currentSection = sectionHeader;
            htmlContent += `
                <tr class="group-header-row">
                    <td colspan="8">${sectionHeader}</td>
                </tr>`;
        }

        const totalMiles = getMileageValue(row[8]); // column I

        htmlContent += `<tr>
            <td class="name-cell">${cleanName(name)}</td>`;

        // Weekday columns – safe handling
        weekdayCols.forEach(colIdx => {
            let val = (row[colIdx] != null) ? String(row[colIdx]).trim() : '';

            if (val === "" && activeWeekdays[colIdx]) {
                val = "P";
            }

            const cellClass = getStatusClass(val);
            htmlContent += `<td class="${cellClass}">${val}</td>`;
        });

        htmlContent += `<td class="total-cell">${totalMiles.toFixed(1)}</td></tr>`;
    });

    htmlContent += "</tbody></table>";
    container.innerHTML = htmlContent;
}

/**
 * User-triggered sort to see the weekly mileage leaders.
 */
window.sortMileage = function() {
    if (currentWeekData.length === 0) return;
    currentWeekData.sort((a, b) => getMileageValue(b[8]) - getMileageValue(a[8]));
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
    if (!raceTimeStr || raceTimeStr === '-' || raceTimeStr === '0' || raceTimeStr.trim() === '') {
        return false;
    }
    const isFirstTime = (!prTimeStr || prTimeStr === '--' || prTimeStr.trim() === '');
    if (isFirstTime) return true; 

    const raceSec = timeToSeconds(raceTimeStr);
    const prSec = timeToSeconds(prTimeStr);
    
    return (raceSec > 0 && raceSec <= prSec);
}

/**
 * Fetches the PR tab.
 */
async function fetchPRs() {
    // Note: Ensure the Tab name in your Google Sheet is exactly "PRs"
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRs!A1:E?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.values) {
            allDistancePRs = data.values;
            renderPRTable(orderedDistancePRRows(allDistancePRs));
            return true;
        }
    } catch (e) { 
        console.error("PR Fetch Error:", e); 
        return false; 
    }
}

function orderedDistancePRRows(rows) {
    let data = rows.filter(row => row[0] && row[0].trim().toLowerCase() !== "name");
    if (distancePRSortState.column === null) return data;

    const columnIndex = distancePRSortState.column;
    const ascending = distancePRSortState.ascending;
    data = [...data];
    data.sort((a, b) => {
        if (columnIndex === 0) {
            const nameA = (a[0] || "").toLowerCase();
            const nameB = (b[0] || "").toLowerCase();
            return ascending ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        const emptyA = isMissingTrackTime(a[columnIndex]);
        const emptyB = isMissingTrackTime(b[columnIndex]);
        if (emptyA && emptyB) return 0;
        if (emptyA) return 1;
        if (emptyB) return -1;
        const timeA = timeToSeconds(a[columnIndex]);
        const timeB = timeToSeconds(b[columnIndex]);
        return ascending ? timeA - timeB : timeB - timeA;
    });
    return data;
}

/**
 * 2. RENDER PR TABLE
 * The only function that actually puts HTML into the pr-container.
 */
function renderPRTable(rowsToRender) {
    const container = document.getElementById('pr-container');
    if (!container) return;

    // Safety: If no rows passed, try to use global data
    const data = rowsToRender || allDistancePRs;

    // Filter out the header row "Name" and any empty rows
    const dataRows = data.filter(row => row[0] && row[0].trim().toLowerCase() !== "name");

    const getArrow = (col) => {
        if (distancePRSortState.column !== col) return "⇅";
        return distancePRSortState.ascending ? "▲" : "▼";
    };

    let html = `<table>
                <thead>
                    <tr>
                        <th onclick="sortPRs(0)" style="cursor:pointer">Name ${getArrow(0)}</th>
                        <th>800m <button class="mini-sort" onclick="sortPRs(1)">${getArrow(1)}</button></th>
                        <th>1600m <button class="mini-sort" onclick="sortPRs(2)">${getArrow(2)}</button></th>
                        <th>3200m <button class="mini-sort" onclick="sortPRs(3)">${getArrow(3)}</button></th>
                        <th>1 Mile <button class="mini-sort" onclick="sortPRs(4)">${getArrow(4)}</button></th>
                    </tr>
                </thead>
                <tbody>`;

    if (dataRows.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center; padding:20px;">No athlete data found. Check your 'PRs' tab in Google Sheets.</td></tr>`;
    } else {
        dataRows.forEach(row => {
            html += `<tr>
                <td class="name-cell" 
                    style="cursor:pointer; color:chocolate; text-decoration:underline;" 
                    onclick="showAthleteChart('${row[0].replace(/'/g, "\\'")}')">
                    ${cleanName(row[0])}
                </td>
                <td>${row[1] || '--'}</td>
                <td>${row[2] || '--'}</td>
                <td>${row[3] || '--'}</td>
                <td>${row[4] || '--'}</td>
            </tr>`;
        });
    }

    html += "</tbody></table>";
    container.innerHTML = html;
}

/**
 * 3. SORT PRS
 * Re-sorts the global allDistancePRs and triggers a re-render.
 */
window.sortPRs = function(columnIndex) {
    const dataOnly = allDistancePRs.filter(row => row[0] && row[0].trim().toLowerCase() !== "name");
    if (dataOnly.length === 0) return;

    if (distancePRSortState.column === columnIndex) {
        distancePRSortState.ascending = !distancePRSortState.ascending;
    } else {
        distancePRSortState.column = columnIndex;
        distancePRSortState.ascending = true;
    }

    renderPRTable(orderedDistancePRRows(allDistancePRs));
};

/**
 * 4. FILTER PRS
 * Searches the global allDistancePRs.
 */
window.filterPRs = function() {
    const searchInput = document.getElementById('pr-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    const dataOnly = allDistancePRs.filter(row => row[0] && row[0].trim().toLowerCase() !== "name");
    
    const filtered = dataOnly.filter(row =>
        row[0] && row[0].toLowerCase().includes(searchTerm)
    );

    renderPRTable(orderedDistancePRRows(filtered));
};

// allSprintsPRs = [{name, m100, m200, ...}, {...}, ...]
window.filterSprintsPRs = function() {
    const query = document.getElementById("sprints-pr-search").value.toLowerCase().trim();
    
    // 1. Determine which table is currently visible
    const isRelayTab = !document.getElementById("sprints-relays").classList.contains("hidden-section");
    const activeContainerId = isRelayTab ? "sprints-relays-container" : "sprints-pr-container";
    
    // 2. Target rows only in that active container
    const rows = document.querySelectorAll(`#${activeContainerId} tbody tr`);
    
    rows.forEach(row => {
        const nameCell = row.querySelector(".name-cell");
        if (nameCell) {
            const name = nameCell.textContent.toLowerCase();
            row.style.display = name.includes(query) ? "" : "none";
        }
    });
};

/**
 * 5. RESET PRS
 */
window.resetPRs = function() {
    const searchInput = document.getElementById('pr-search');
    if (searchInput) searchInput.value = "";
    distancePRSortState = { column: null, ascending: true };
    renderPRTable(orderedDistancePRRows(allDistancePRs));
};

// --- 5. MEET RESULTS ENGINE ---

/**
 * Fetches the Race Results tab.
 */
async function fetchRaceResults() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Race_Results!A2:K?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.values || data.values.length === 0) return;

        distanceMeetData = data.values;

        // Extract unique meets and find their newest date
        const meetMap = {};
        distanceMeetData.forEach(row => {
            const name = row[1];
            const dateStr = row[2] || "";
            if (name) {
                const parts = dateStr.split('/');
                let ts = 0;
                if (parts.length === 3) {
                    let [m, d, y] = parts.map(n => parseInt(n));
                    if (y < 100) y += 2000;
                    ts = new Date(y, m - 1, d).getTime();
                }
                if (!meetMap[name] || ts > meetMap[name].ts) {
                    meetMap[name] = { name, ts };
                }
            }
        });

        const sortedMeets = Object.values(meetMap).sort((a, b) => a.ts - b.ts).map(o => o.name);
        const selector = document.getElementById('distance-meet-selector');

        selector.innerHTML = sortedMeets.map(m => `<option value="${m}">${m}</option>`).join('');

        if (sortedMeets.length > 0) {
            selector.value = sortedMeets[sortedMeets.length - 1]; // Select newest
            document.getElementById('meet-tabs').style.display = 'block';
            document.getElementById('meet-results-controls').style.display = 'block';
            window.displaySelectedMeet(); 
        }
    } catch (error) {
        console.error("Distance Meet Fetch Error:", error);
    }
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
    // Ensure Distance PRs are loaded
    if (allDistancePRs.length === 0) {
        setTimeout(displaySelectedMeet, 100);
        return;
    }

    const selector = document.getElementById('distance-meet-selector');
    const selectedMeet = selector.value;
    const container = document.getElementById('meet-results-container');
    
    if (!selectedMeet) {
        container.innerHTML = "<p>Select a distance meet to view results.</p>";
        return;
    }

    const meetRows = distanceMeetData.filter(row => row[1] === selectedMeet);
    let filteredRows;
    let headers;

    if (currentMeetTab === "relay") {
        filteredRows = meetRows.filter(row => (row[7] && row[7] !== '-' && row[7] !== ''));
        headers = ["Athlete", "Team Time 1", "Event 1", "Team Time 2", "Event 2"];
    } else {
        filteredRows = meetRows.filter(row => (row[3] || row[4] || row[5] || row[6]));
        headers = ["Athlete", "800m", "1600m", "3200m", "1 Mile"];
    }

    let totalPerformances = 0;
    let totalPRs = 0;

    let html = `<table><thead><tr>`;
    headers.forEach((h, index) => {
        html += `<th class="sortable" onclick="sortDistanceMeet(${index})">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

    filteredRows.forEach(row => {
        const athleteName = row[0] || "";
        const athletePR = allDistancePRs.find(p => 
            (p[0] || "").trim().toLowerCase() === athleteName.trim().toLowerCase()
        ) || [];

        if (currentMeetTab === "relay") {
            html += `<tr>
                <td class="name-cell">${cleanName(athleteName)}</td>
                <td style="font-weight:bold; color:#c0392b;">${row[7] || '-'}</td>
                <td>${row[8] || '-'}</td>
                <td style="font-weight:bold; color:#c0392b;">${row[9] || '-'}</td>
                <td>${row[10] || '-'}</td>
            </tr>`;
        } else {
            const formatCell = (raceTime, prTime) => {
                if (!raceTime || raceTime === '-' || raceTime === '0') return '-';
                totalPerformances++;
                if (isNewPR(raceTime, prTime)) {
                    totalPRs++;
                    const delta = formatTimeDelta(prTime, raceTime);
                    return `<span class="pr-highlight">${raceTime} ⭐ <span class="pr-delta">${delta}</span></span>`;
                }
                return raceTime;
            };

            html += `<tr>
                <td class="name-cell">${cleanName(athleteName)}</td>
                <td>${formatCell(row[3], athletePR[1])}</td>
                <td>${formatCell(row[4], athletePR[2])}</td>
                <td>${formatCell(row[5], athletePR[3])}</td>
                <td>${formatCell(row[6], athletePR[4])}</td>
            </tr>`;
        }
    });

    const prRate = totalPerformances > 0 ? ((totalPRs / totalPerformances) * 100).toFixed(1) : 0;
    const summaryHTML = `
        <div class="meet-summary">
            <h3>${selectedMeet}</h3>
            <p><strong>PR Rate:</strong> ${prRate}% (${totalPRs} PRs out of ${totalPerformances} races)</p>
        </div>`;

    container.innerHTML = summaryHTML + html + "</tbody></table>";
};

window.sortDistanceMeet = function(columnIndex) {
    const container = document.getElementById('meet-results-container');
    const table = container.querySelector('table');
    if (!table) return;

    if (distanceSortState.column === columnIndex) {
        distanceSortState.ascending = !distanceSortState.ascending;
    } else {
        distanceSortState.column = columnIndex;
        distanceSortState.ascending = true;
    }

    const tbody = table.querySelector('tbody');
    const rowsArray = Array.from(tbody.querySelectorAll('tr'));

    rowsArray.sort((a, b) => {
        let valA = getSortValue(a, columnIndex);
        let valB = getSortValue(b, columnIndex);

        if (valA === valB) return 0;
        if (valA === '-' || valA === '') return 1;
        if (valB === '-' || valB === '') return -1;

        if (columnIndex === 0) { // Name
            return distanceSortState.ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else { // Times
            return distanceSortState.ascending ? valA - valB : valB - valA;
        }
    });

    rowsArray.forEach(row => tbody.appendChild(row));
    updateDistanceHeaderArrows(columnIndex); // Assumes you have your arrow helper
};

// Filter meet results table by athlete name search
window.filterMeetResults = function() {
    const searchTerm = document.getElementById('distance-meet-search').value.toLowerCase().trim();
    const container = document.getElementById('meet-results-container');
    const table = container.querySelector('table');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const nameCell = row.querySelector('.name-cell');
        if (!nameCell) return;
        const name = nameCell.textContent.toLowerCase();
        row.style.display = name.includes(searchTerm) ? '' : 'none';
    });
};

// Sort the displayed meet results (only sorts visible rows / current tab)
window.sortMeetResults = function(columnIndex) {
    const container = document.getElementById('meet-results-container');
    const table = container.querySelector('table');
    if (!table) return;

    // Toggle or set new column
    if (meetSortState.column === columnIndex) {
        meetSortState.ascending = !meetSortState.ascending;
    } else {
        meetSortState.column = columnIndex;
        meetSortState.ascending = (columnIndex === 0) ? true : true; // name: A→Z, times: fastest first
    }

    const tbody = table.querySelector('tbody');
    const rowsArray = Array.from(tbody.querySelectorAll('tr'));

    rowsArray.sort((a, b) => {
        let valA = getSortValue(a, columnIndex);
        let valB = getSortValue(b, columnIndex);

        if (valA === valB) return 0;
        if (valA === '-' || valA === '') return 1;
        if (valB === '-' || valB === '') return -1;

        if (columnIndex === 0) { // Name - alphabetical
            return meetSortState.ascending 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        } else { // Time columns - numeric, smaller = better
            return meetSortState.ascending 
                ? valA - valB 
                : valB - valA;
        }
    });

    // Re-attach sorted rows
    rowsArray.forEach(row => tbody.appendChild(row));

    // Update header arrows (visual feedback)
    updateHeaderArrows(columnIndex);
};

// Helper: extract sortable value from row
function getSortValue(row, colIndex) {
    const cells = row.querySelectorAll('td');
    if (cells.length <= colIndex) return '';

    let text = cells[colIndex].textContent.trim();

    // Strip PR highlights / stars / deltas
    text = text.replace(/⭐|\(-?\d+\.\d+s\)/g, '').trim();

    // For time columns → convert to seconds
    if (colIndex >= 1) {
        return timeToSeconds(text) || 999999;  // bad times at bottom
    }
    return text;
}

function updateHeaderArrows(activeColumn) {
    const headers = document.querySelectorAll('#meet-results-container th.sortable');
    headers.forEach((th, index) => {
        th.classList.remove('active-asc', 'active-desc');
        if (index === activeColumn) {
            if (meetSortState.ascending) {
                th.classList.add('active-asc');
            } else {
                th.classList.add('active-desc');
            }
        }
    });
}

// Reset sort + search
window.resetMeetSort = function() {
    // 1. Clear the search input
    const searchInput = document.getElementById("distance-meet-search") || document.getElementById("meet-search");
    if (searchInput) searchInput.value = "";

    // 2. Reset the sorting state to default
    distanceSortState = { column: null, ascending: true };

    // 3. Remove sorting arrows from headers
    const headers = document.querySelectorAll('#meet-results-container th.sortable');
    headers.forEach(th => th.classList.remove('active-asc', 'active-desc'));

    // 4. Re-render the table to show all athletes in original order
    displaySelectedMeet();
    
    console.log("Distance results reset successfully.");
};

window.resetSprintsMeetSort = function() {
    // 1. Clear the search input
    const searchInput = document.getElementById("sprints-meet-search");
    if (searchInput) searchInput.value = "";

    // 2. Reset the sorting state
    sprintsMeetSortState = { column: null, ascending: true };

    // 3. Remove sorting arrows
    const headers = document.querySelectorAll('#sprints-meet-results-container th.sortable');
    headers.forEach(th => th.classList.remove('active-asc', 'active-desc'));

    // 4. Re-render
    displaySelectedSprintsMeet();

    console.log("Sprints results reset successfully.");
};

window.switchMeetTab = function(tab) {
    currentMeetTab = tab;
    // Update button visuals
    document.querySelectorAll('#meet-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Re-render
    window.displaySelectedMeet();
};

// --- 6. UTILITY HELPERS ---

function buildName(row) {
    const last = row[0] || "";
    const first = row[1] || "";
    return `${first} ${last}`.trim();
}

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
    if (val === "P") return "status-present";
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

/** True if no usable time for sorting (empty / dash / unparsed). */
function isMissingTrackTime(val) {
    if (!val || val === '--' || val === '-' || String(val).trim() === '') return true;
    return timeToSeconds(val) >= 999999;
}

function formatTimeDelta(oldTimeStr, newTimeStr) {
    const oldSec = timeToSeconds(oldTimeStr);
    const newSec = timeToSeconds(newTimeStr);

    if (oldSec === 999999) {
        return "(Debut)";
    }

    const diff = oldSec - newSec;

    if (diff <= 0) return ""; // no improvement

    return `(-${diff.toFixed(1)}s)`;
}

function updateTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = `Synced with Google Sheets: ${timeString}`;
}

function updateTimestamp2() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated2').textContent = `Synced with Google Sheets: ${timeString}`;
}

// Add this helper to your script
function updateDistanceHeaderArrows(activeColumnIndex) {
    const headers = document.querySelectorAll('#meet-results-container th.sortable');
    headers.forEach((th, index) => {
        th.classList.remove('active-asc', 'active-desc');
        if (index === activeColumnIndex) {
            th.classList.add(distanceSortState.ascending ? 'active-asc' : 'active-desc');
        }
    });
}

const CHART_EVENT_CONFIGS = {
    distance: [
        { label: "800m", key: 'm800', index: 3, type: 'time' },
        { label: "1600m", key: 'm1600', index: 4, type: 'time' },
        { label: "3200m", key: 'm3200', index: 5, type: 'time' },
        { label: "1 Mile", key: 'm1mile', index: 6, type: 'time' }
    ],
    sprints: [
        { label: "100m", key: 'm100', index: 3, type: 'time' },
        { label: "200m", key: 'm200', index: 4, type: 'time' },
        { label: "400m", key: 'm400', index: 5, type: 'time' },
        { label: "800m", key: 'm800', index: 6, type: 'time' },
        { label: "100/110H", key: 'h110', index: 7, type: 'time' },
        { label: "300H", key: 'h300', index: 8, type: 'time' },
        { label: "4x100", key: 'r4x100', index: 9, type: 'time' },
        { label: "4x400", key: 'r4x400', index: 10, type: 'time' },
        { label: "4x200", key: 'r4x200', index: 11, type: 'time' }
    ],
    throws: [
        { label: "Shot Put", key: 'shot', type: 'distance', getVal: r => r.shot12 || r.shot4 || '' },
        { label: "Discus", key: 'disc', type: 'distance', getVal: r => r.disc16 || r.disc1 || '' }
    ],
    jumps: [
        { label: "Long Jump", key: 'long', type: 'distance', getVal: r => r.long },
        { label: "Triple Jump", key: 'triple', type: 'distance', getVal: r => r.triple },
        { label: "High Jump", key: 'high', type: 'distance', getVal: r => r.high },
        { label: "Pole Vault", key: 'pole', type: 'distance', getVal: r => r.pole }
    ]
};

/** Normalize name for matching: trim, lowercase, strip (F)/(M) and similar suffixes. */
function normalizeNameForMatch(name) {
    if (!name) return '';
    return name.trim().toLowerCase()
        .replace(/\s*\([FfMmGgBb]\)\s*$/, '')
        .replace(/\s*\([Ff]emale\)\s*$/i, '')
        .replace(/\s*\([Mm]ale\)\s*$/i, '')
        .trim();
}

function getAthleteMeetData(athleteName, sport) {
    const searchNorm = normalizeNameForMatch(athleteName);
    if (!searchNorm) return [];

    let source = [];
    if (sport === 'distance') {
        source = (typeof distanceMeetData !== 'undefined' && distanceMeetData.length > 0) ? distanceMeetData : (typeof allRaceData !== 'undefined' ? allRaceData : []);
    } else if (sport === 'sprints') {
        source = typeof sprintsMeetData !== 'undefined' ? sprintsMeetData : [];
    } else if (sport === 'throws') {
        source = typeof throwsMeetData !== 'undefined' ? throwsMeetData : [];
    } else if (sport === 'jumps') {
        source = typeof jumpsMeetData !== 'undefined' ? jumpsMeetData : [];
    }
    return source.filter(row => {
        const nameInRow = Array.isArray(row) ? row[0] : (row.name || '');
        return nameInRow && normalizeNameForMatch(nameInRow) === searchNorm;
    });
}

function formatInchesAsFeetInches(inches) {
    if (inches <= 0) return "--";
    const feet = Math.floor(inches / 12);
    const rem = (inches % 12).toFixed(1).replace(/\.0$/, '');
    return rem ? `${feet}' ${rem}"` : `${feet}'`;
}

function showAthleteChart(athleteName, sport) {
    if (!athleteName) return;
    sport = sport || 'distance';

    const athleteRaces = getAthleteMeetData(athleteName, sport);
    if (athleteRaces.length === 0) {
        alert(`No meet data found for this athlete. Make sure ${sport} meet results are loaded.`);
        return;
    }

    const configs = CHART_EVENT_CONFIGS[sport];
    if (!configs) return;

    document.getElementById('chart-modal').style.display = 'block';
    document.getElementById('chart-overlay').style.display = 'block';
    document.getElementById('chart-title').textContent = cleanName(athleteName);

    let selector = document.getElementById('event-selector');
    if (!selector) {
        selector = document.createElement('select');
        selector.id = 'event-selector';
        selector.style = "width: auto; min-width: 140px; padding: 8px 16px; border-radius: 20px; border: 2px solid #e6c2a6; background: #fffaf5; color: #8b4513; font-weight: bold; cursor: pointer; margin: 0 auto 15px auto; display: block;";
        document.getElementById('chart-content-wrapper').prepend(selector);
    }

    selector.innerHTML = "";
    let firstValidKey = null;

    configs.forEach(opt => {
        let hasData = false;
        if (opt.getVal) {
            hasData = athleteRaces.some(r => {
                const val = opt.getVal(r);
                return val && val !== '-' && val !== '0' && val !== '' && val !== '--';
            });
        } else {
            hasData = athleteRaces.some(r => {
                const val = Array.isArray(r) ? r[opt.index] : r[opt.key];
                return val && val !== '-' && val !== '0' && val !== '';
            });
        }
        if (hasData) {
            const el = document.createElement('option');
            el.value = opt.key;
            el.textContent = opt.label;
            el.dataset.type = opt.type;
            selector.appendChild(el);
            if (!firstValidKey) firstValidKey = opt.key;
        }
    });

    if (firstValidKey) {
        const opt = configs.find(o => o.key === firstValidKey);
        const chartType = opt ? opt.type : 'time';
        selector.onchange = () => {
            const sel = configs.find(o => o.key === selector.value);
            updateChartLogic(athleteRaces, selector.value, sport, sel ? sel.type : 'time', configs);
        };
        setTimeout(() => updateChartLogic(athleteRaces, firstValidKey, sport, chartType, configs), 100);
    } else {
        alert(`No event data found for this athlete in ${sport}.`);
        closeChart();
    }
}

function parseMeetDate(dateStr) {
    if (!dateStr) return new Date(0);
    const str = String(dateStr).trim();
    const parts = str.split('/');
    if (parts.length === 3) {
        let m = parseInt(parts[0], 10);
        let d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        return new Date(y, m - 1, d);
    }
    return new Date(str);
}

function updateChartLogic(athleteRaces, activeKey, sport, chartType, configs) {
    const opt = (configs || CHART_EVENT_CONFIGS[sport || 'distance']).find(o => o.key === activeKey);
    const isTime = (chartType || (opt && opt.type) || 'time') === 'time';

    let plotData;
    if (isTime) {
        const keyToIndex = { m800: 3, m1600: 4, m3200: 5, m1mile: 6, m100: 3, m200: 4, m400: 5, h110: 7, h300: 8, r4x100: 9, r4x400: 10, r4x200: 11 };
        const idx = keyToIndex[activeKey];
        plotData = athleteRaces.map(row => {
            const meetName = Array.isArray(row) ? row[1] : row.meet;
            const meetDate = Array.isArray(row) ? row[2] : row.date;
            const timeStr = Array.isArray(row) ? (row[idx] || "") : (row[activeKey] || "");
            return {
                meet: meetName || "Unknown Meet",
                date: meetDate || "",
                value: timeToSeconds(timeStr),
                displayVal: timeStr
            };
        }).filter(d => d.displayVal && d.displayVal !== '-' && d.displayVal !== '0' && d.value > 0 && d.value < 999999);
    } else {
        const getVal = opt && opt.getVal ? opt.getVal : (r) => r[activeKey];
        plotData = athleteRaces.map(row => {
            const meetName = row.meet;
            const meetDate = row.date || "";
            const markStr = getVal(row) || "";
            const inches = parseThrowDistance(markStr);
            return {
                meet: meetName || "Unknown Meet",
                date: meetDate,
                value: inches,
                displayVal: markStr
            };
        }).filter(d => d.displayVal && d.displayVal !== '-' && d.displayVal !== '0' && d.value > 0);
    }

    plotData.sort((a, b) => parseMeetDate(a.date) - parseMeetDate(b.date));

    const canvas = document.getElementById('progressionChart');
    const ctx = canvas.getContext('2d');
    if (window.myChart instanceof Chart) window.myChart.destroy();

    if (plotData.length === 0) {
        console.warn("Chart Error: No valid data points for key:", activeKey);
        return;
    }

    const yAxisConfig = isTime
        ? {
            reverse: true,
            ticks: {
                callback: (v) => {
                    const m = Math.floor(v / 60);
                    const s = v % 60;
                    if (m > 0) {
                        const sec = Math.floor(s);
                        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
                    }
                    return s === Math.floor(s) ? String(Math.floor(s)) : s.toFixed(1);
                }
            }
        }
        : {
            reverse: false,
            ticks: {
                callback: (v) => formatInchesAsFeetInches(v)
            }
        };

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: plotData.map(d => d.date ? `${d.meet} (${d.date})` : d.meet),
            datasets: [{
                label: activeKey,
                data: plotData.map(d => d.value),
                borderColor: 'chocolate',
                backgroundColor: 'rgba(210, 105, 30, 0.2)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointBackgroundColor: 'chocolate'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: yAxisConfig },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => (isTime ? `Time: ` : `Mark: `) + plotData[ctx.dataIndex].displayVal
                    }
                }
            }
        }
    });
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    document.getElementById('chart-overlay').style.display = 'none';
}

async function fetchThrowsPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Throws_PRs!A2:G?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.values) {
            document.getElementById('throws-pr-container').innerHTML = "<p>No throws data found.</p>";
            throwsPRSheetRows = [];
            const throwsSearch = document.getElementById('throws-pr-search');
            if (throwsSearch) throwsSearch.value = '';
            return;
        }

        throwsPRSheetRows = data.values;
        throwsPRSortState = { column: null, ascending: true };
        const throwsSearchIn = document.getElementById('throws-pr-search');
        if (throwsSearchIn) throwsSearchIn.value = '';
        allThrowsPRs = [];

        data.values.forEach(row => {
            // Boys PRs (columns A–C)
            const boyName = row[0]?.trim();
            if (boyName) {
                allThrowsPRs.push({
                    name: boyName,
                    shotPR: row[1] || "",
                    discusPR: row[2] || ""
                });
            }

            // Girls PRs (columns E–G)
            const girlName = row[4]?.trim();
            if (girlName) {
                allThrowsPRs.push({
                    name: girlName,
                    shotPR: row[5] || "",
                    discusPR: row[6] || ""
                });
            }
        });

        renderThrowsPRTable();
        updateTimestamp2();

    } catch (error) {
        console.error("Throws PR Fetch Error:", error);
    }
}

function partitionThrowsPRAthletes(rows) {
    const boys = [];
    const girls = [];
    if (!rows || !rows.length) return { boys, girls };
    rows.forEach(row => {
        const boyName = cleanName(row[0]);
        const boyShot = row[1];
        const boyDisc = row[2];
        const girlName = cleanName(row[4]);
        const girlShot = row[5];
        const girlDisc = row[6];
        if (boyName && boyName.trim() !== "") {
            boys.push({ name: boyName, shot: boyShot || '--', disc: boyDisc || '--' });
        }
        if (girlName && girlName.trim() !== "") {
            girls.push({ name: girlName, shot: girlShot || '--', disc: girlDisc || '--' });
        }
    });
    return { boys, girls };
}

function getThrowsPRBoysGirlsForDisplay() {
    let { boys, girls } = partitionThrowsPRAthletes(throwsPRSheetRows);
    const input = document.getElementById('throws-pr-search');
    const q = input ? input.value.toLowerCase().trim() : '';
    if (q) {
        boys = boys.filter(a => a.name.toLowerCase().includes(q));
        girls = girls.filter(a => a.name.toLowerCase().includes(q));
    }
    if (throwsPRSortState.column !== null) {
        boys = sortThrowsPRAthleteList(boys, throwsPRSortState.column, throwsPRSortState.ascending);
        girls = sortThrowsPRAthleteList(girls, throwsPRSortState.column, throwsPRSortState.ascending);
    }
    return { boys, girls };
}

window.filterThrowsPRs = function () {
    renderThrowsPRTable();
};

window.resetThrowsPRs = function () {
    const input = document.getElementById('throws-pr-search');
    if (input) input.value = '';
    throwsPRSortState = { column: null, ascending: true };
    renderThrowsPRTable();
};

function sortThrowsPRAthleteList(athletes, columnIndex, ascending) {
    const list = [...athletes];
    list.sort((a, b) => {
        if (columnIndex === 0) {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return ascending ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        const rawA = columnIndex === 1 ? a.shot : a.disc;
        const rawB = columnIndex === 1 ? b.shot : b.disc;
        const emptyA = isEmptyFieldEventMark(rawA);
        const emptyB = isEmptyFieldEventMark(rawB);
        if (emptyA && emptyB) return 0;
        if (emptyA) return 1;
        if (emptyB) return -1;
        const distA = parseThrowDistance(rawA);
        const distB = parseThrowDistance(rawB);
        return ascending ? distB - distA : distA - distB;
    });
    return list;
}

window.sortThrowsPRs = function (columnIndex) {
    const { boys, girls } = partitionThrowsPRAthletes(throwsPRSheetRows);
    if (boys.length + girls.length === 0) return;

    if (throwsPRSortState.column === columnIndex) {
        throwsPRSortState.ascending = !throwsPRSortState.ascending;
    } else {
        throwsPRSortState.column = columnIndex;
        throwsPRSortState.ascending = true;
    }

    renderThrowsPRTable();
};

function renderThrowsPRTable() {
    const container = document.getElementById("throws-pr-container");
    if (!container) return;

    let { boys, girls } = getThrowsPRBoysGirlsForDisplay();

    const getArrow = (col) => {
        if (throwsPRSortState.column !== col) return '⇅';
        return throwsPRSortState.ascending ? '▲' : '▼';
    };

    let html = `
        <table>
            <thead>
                <tr>
                    <th onclick="sortThrowsPRs(0)" style="cursor:pointer">Name ${getArrow(0)}</th>
                    <th>Shot Put <button type="button" class="mini-sort" onclick="sortThrowsPRs(1)">${getArrow(1)}</button></th>
                    <th>Discus <button type="button" class="mini-sort" onclick="sortThrowsPRs(2)">${getArrow(2)}</button></th>
                </tr>
            </thead>
            <tbody>
    `;

    // 3️⃣ Render Boys First
    if (boys.length > 0) {
        html += `
            <tr class="group-header-row">
                <td colspan="3">
                    Boys
                    <span class="implement-info">
                        (Shot Put: 12lb • Discus: 1.6kg)
                    </span>
                </td>
            </tr>
        `;

        boys.forEach(athlete => {
            const nameEsc = (athlete.name || '').replace(/'/g, "\\'");
            html += `
                <tr>
                    <td class="name-cell" style="cursor:pointer; color:chocolate; text-decoration:underline;" onclick="showAthleteChart('${nameEsc}', 'throws')">${athlete.name}</td>
                    <td>${athlete.shot}</td>
                    <td>${athlete.disc}</td>
                </tr>
            `;
        });
    }

    // 4️⃣ Render Girls After
    if (girls.length > 0) {
        html += `
            <tr class="group-header-row">
                <td colspan="3">
                    Girls 
                    <span style="font-weight: normal; font-size: 0.85rem;">
                        (Shot Put: 4kg • Discus: 1kg)
                    </span>
                </td>
            </tr>
        `;

        girls.forEach(athlete => {
            const nameEsc = (athlete.name || '').replace(/'/g, "\\'");
            html += `
                <tr>
                    <td class="name-cell" style="cursor:pointer; color:chocolate; text-decoration:underline;" onclick="showAthleteChart('${nameEsc}', 'throws')">${athlete.name}</td>
                    <td>${athlete.shot}</td>
                    <td>${athlete.disc}</td>
                </tr>
            `;
        });
    }

    html += "</tbody></table>";

    container.innerHTML = html;
}

// ==============================
// THROWS MEET RESULTS FUNCTIONS
// ==============================

// ------------------------------
// Fetch Throws meet data (FIXED: Newest First in Dropdown)
// ------------------------------
async function fetchThrowsMeetResults() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Throws_Results!A2:G?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.values || data.values.length === 0) return;

        // 1. Map rows to objects
        throwsMeetData = data.values.map(row => ({
            name: row[0],
            meet: row[1],
            date: row[2] || "", 
            shot12: row[3],
            disc16: row[4],
            shot4: row[5],
            disc1: row[6]
        }));

        // 2. Extract unique meets and calculate their timestamps
        const meetMap = {};
        throwsMeetData.forEach(r => {
            if (r.meet) {
                const parts = r.date.split('/');
                let timestamp = 0;
                if (parts.length === 3) {
                    const month = parseInt(parts[0]);
                    const day = parseInt(parts[1]);
                    let year = parseInt(parts[2]);
                    if (year < 100) year += 2000;
                    timestamp = new Date(year, month - 1, day).getTime();
                }
                
                // Track the date for each unique meet name
                if (!meetMap[r.meet] || timestamp > meetMap[r.meet].ts) {
                    meetMap[r.meet] = { name: r.meet, ts: timestamp };
                }
            }
        });

        // 3. Sort meets by date: OLDEST FIRST (so newest is at the bottom)
        const sortedMeetObjects = Object.values(meetMap).sort((a, b) => a.ts - b.ts);
        const sortedNames = sortedMeetObjects.map(obj => obj.name);

        // 4. Update the Dropdown
        const selector = document.getElementById("throws-meet-selector");
        selector.innerHTML = sortedNames
            .map(name => `<option value="${name}">${name}</option>`)
            .join('');

        // 5. SELECT THE NEWEST (The last item in our sorted array)
        if (sortedNames.length > 0) {
            const newestMeetName = sortedNames[sortedNames.length - 1];
            selector.value = newestMeetName;
            
            // Render the results for that newest meet immediately
            if (typeof window.displaySelectedThrowsMeet === 'function') {
                window.displaySelectedThrowsMeet();
            }
        }

    } catch (error) {
        console.error("Throws Meet Fetch Error:", error);
    }
}

// ------------------------------
// Sort Throws Meet Table (UPDATED: Name=Alpha, Distance=Descending)
// ------------------------------
function sortThrowsMeet(columnIndex) {
    const container = document.getElementById('throws-meet-results-container');
    const table = container.querySelector('table');
    if (!table) return;

    if (throwsMeetSortState.column === columnIndex) {
        throwsMeetSortState.ascending = !throwsMeetSortState.ascending;
    } else {
        throwsMeetSortState.column = columnIndex;
        // Default: Names A-Z (true), Distances Greatest-to-Least (true)
        throwsMeetSortState.ascending = true; 
    }

    const tbody = table.querySelector('tbody');
    const rowsArray = Array.from(tbody.querySelectorAll('tr'));

    rowsArray.sort((a, b) => {
        const valA = getThrowsSortValue(a, columnIndex);
        const valB = getThrowsSortValue(b, columnIndex);

        if (valA === valB) return 0;
        if (valA === '-' || valA === '' || valA === 0) return 1;
        if (valB === '-' || valB === '' || valB === 0) return -1;

        if (columnIndex === 0) {
            // Name: A-Z if ascending
            return throwsMeetSortState.ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            // Distances: Greatest-to-Least if ascending (Up Arrow)
            return throwsMeetSortState.ascending ? valB - valA : valA - valB;
        }
    });

    rowsArray.forEach(row => tbody.appendChild(row));
    updateThrowsHeaderArrows(columnIndex);
}

function updateThrowsHeaderArrows(activeColumn) {
    const headers = document.querySelectorAll('#throws-meet-results-container th.sortable');
    headers.forEach((th, index) => {
        th.classList.remove('active-asc', 'active-desc');
        if (index === activeColumn) {
            // active-asc usually shows the UP arrow in CSS
            if (throwsMeetSortState.ascending) {
                th.classList.add('active-asc'); 
            } else {
                th.classList.add('active-desc');
            }
        }
    });
}

// ------------------------------
// Display selected Throws Meet
// ------------------------------
function displaySelectedThrowsMeet() {
    const selector = document.getElementById("throws-meet-selector");
    currentThrowsMeet = selector.value;

    if (!currentThrowsMeet) return;

    document.getElementById("throws-meet-results-controls").style.display = "flex";

    renderThrowsMeetTable();
    renderThrowsMeetSummary();

    // Reset sort state on new meet
    throwsMeetSortState = { column: null, ascending: true };
}

// ------------------------------
// Render Throws Meet Table
// ------------------------------
function renderThrowsMeetTable() {
    const container = document.getElementById("throws-meet-results-container");
    const filtered = throwsMeetData.filter(r => r.meet === currentThrowsMeet);

    let html = `
        <table>
            <thead>
                <tr>
                    <th class="sortable" onclick="sortThrowsMeet(0)">Name</th>
                    <th class="sortable" onclick="sortThrowsMeet(1)">Shot Put</th>
                    <th class="sortable" onclick="sortThrowsMeet(2)">Discus</th>
                </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach(r => {
        const shotMark = r.shot12 || r.shot4 || '--';
        const discMark = r.disc16 || r.disc1 || '--';

        html += `
            <tr>
                <td>${r.name}</td>
                <td>${shotMark}</td>
                <td>${discMark}</td>
            </tr>
        `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

// ------------------------------
// Render Summary Card
// ------------------------------
function renderThrowsMeetSummary() {
    const card = document.getElementById("throws-meet-summary");
    const meetResults = throwsMeetData.filter(r => r.meet === currentThrowsMeet);
    card.innerHTML = `<strong>${currentThrowsMeet}</strong><br>Athletes Competed: ${meetResults.length}`;
    card.classList.remove("hidden-section");
}

// ------------------------------
// Athlete Search Filter
// ------------------------------
function filterThrowsMeetResults() {
    const query = document.getElementById("throws-meet-search").value.toLowerCase().trim();
    const rows = document.querySelectorAll("#throws-meet-results-container tbody tr");
    rows.forEach(row => {
        const name = row.querySelector(".name-cell").textContent.toLowerCase();
        row.style.display = name.includes(query) ? "" : "none";
    });
}

// ------------------------------
// Reset Search + Sort
// ------------------------------
function resetThrowsMeetSort() {
    // Clear search
    document.getElementById("throws-meet-search").value = "";

    // Reset sort state
    throwsMeetSortState = { column: null, ascending: true };

    // Remove active arrow classes from headers
    const headers = document.querySelectorAll('#throws-meet-results-container th.sortable');
    headers.forEach(th => th.classList.remove('active-asc', 'active-desc'));

    // Re-render table
    renderThrowsMeetTable();
    //document.getElementById("throws-meet-summary").classList.remove("hidden-section");
    displaySelectedThrowsMeet(); // full re-render with PRs
}

// ------------------------------
// Helper: Get sortable value
// ------------------------------
function getThrowsSortValue(row, colIndex) {
    const cells = row.querySelectorAll('td');
    if (!cells[colIndex]) return '';

    let text = cells[colIndex].textContent.trim();
    text = text.replace(/⭐|\(-?\d+\.\d+s\)/g, '').trim(); // remove PR highlights

    if (colIndex === 0) return text; // Name
    return parseThrowDistance(text); // Shot or Discus
}

/*
// ------------------------------
// Parse Throw Distance like 15' 6" → inches
// ------------------------------
function parseThrowDistance(mark) {
    if (!mark || mark === '--') return 0;

    // Remove spaces
    mark = mark.trim();

    // Match feet and inches using regex
    const match = mark.match(/(\d+)'(?:\s*(\d+)"?)?/);
    if (!match) return 0;

    const feet = parseInt(match[1]) || 0;
    const inches = parseInt(match[2]) || 0;

    return feet * 12 + inches;
}
*/

// ------------------------------
// Smart display for Throws Meet
// ------------------------------
window.displaySelectedThrowsMeet = function() {
    if (!allThrowsPRs || allThrowsPRs.length === 0) {
        setTimeout(displaySelectedThrowsMeet, 100);
        return;
    }

    const selectedMeet = document.getElementById('throws-meet-selector').value;
    if (!selectedMeet) return;

    const container = document.getElementById('throws-meet-results-container');
    const meetRows = throwsMeetData.filter(r => r.meet === selectedMeet);

    document.getElementById('throws-meet-results-controls').style.display =
        meetRows.length > 0 ? 'flex' : 'none';

    // Reset search
    document.getElementById('throws-meet-search').value = '';

    // Copy rows for sorting/filtering
    originalThrowsRows = meetRows.map(r => ({ ...r }));

    const headers = ["Athlete", "Shot Put", "Discus"];

    // ✅ Initialize counters for this meet
    let totalThrowsPerformances = 0;
    let totalThrowsPRs = 0;

    let html = `<table><thead><tr>`;
    headers.forEach((h, i) => {
        html += `<th class="sortable" data-index="${i}" onclick="sortThrowsMeet(${i})">${h}</th>`;
    });
    html += `</tr></thead><tbody>`;

    meetRows.forEach(r => {
        const athleteName = r.name || "";
        const athletePR = allThrowsPRs.find(p => p.name.trim().toLowerCase() === athleteName.trim().toLowerCase()) || {};

        const formatThrowCell = (mark, prMark) => {
            if (!mark || mark.trim() === '' || mark === '--') return '--';

            totalThrowsPerformances++;

            const inchesMark = parseThrowDistance(mark);
            const inchesPR   = parseThrowDistance(prMark);

            // Debut PR (no previous PR)
            if (!prMark || prMark === '--') {
                totalThrowsPRs++;  // Count for summary
                return `<span class="pr-highlight">
                            ${mark} <span class="pr-star">⭐</span><span class="pr-delta">(Debut)</span>
                        </span>`;
            }

            // New PR (greater than previous)
            if (inchesMark > inchesPR) {
                totalThrowsPRs++;  // Count for summary
                const deltaText = formatThrowDelta(prMark, mark); // e.g., +1' 3"
                return `<span class="pr-highlight">
                            ${mark} <span class="pr-star">⭐</span><span class="pr-delta">${deltaText}</span>
                        </span>`;
            }

            // Equal to current PR (matches exactly)
            if (inchesMark === inchesPR) {
                totalThrowsPRs++;  // Count as PR for summary
                return `<span class="pr-highlight">
                            ${mark} <span class="pr-star">⭐</span>
                        </span>`;
            }

            // Otherwise, normal throw
            return mark;
        };

        const shotMark = formatThrowCell(r.shot12 || r.shot4, athletePR.shotPR);
        const discMark = formatThrowCell(r.disc16 || r.disc1, athletePR.discusPR);

        html += `
            <tr>
                <td class="name-cell">${cleanName(athleteName)}</td>
                <td>${shotMark}</td>
                <td>${discMark}</td>
            </tr>`;
    });

    html += "</tbody></table>";

    const summaryText = totalThrowsPerformances > 0
        ? `<strong>PR Rate:</strong> ${((totalThrowsPRs / totalThrowsPerformances) * 100).toFixed(1)}%
           (${totalThrowsPRs} PRs out of ${totalThrowsPerformances} throws)`
        : 'No performances yet';

    const summaryHTML = `
        <div class="meet-summary">
            <h3>${selectedMeet} – Throws Results</h3>
            <p>${summaryText}</p>
        </div>
    `;

    container.innerHTML = summaryHTML + html;

    setTimeout(() => {
        if (throwsMeetSortState.column !== null) {
            updateThrowsHeaderArrows(throwsMeetSortState.column);
        }
    }, 0);
};

function formatThrowDelta(prMark, meetMark) {
    if (!prMark || prMark === '--') return ' (Debut)';

    const meetInches = parseThrowDistance(meetMark);
    const prInches   = parseThrowDistance(prMark);

    const diff = meetInches - prInches;
    if (diff <= 0) return ""; 

    const feet = Math.floor(diff / 12);
    let inches = (diff % 12).toFixed(2);
    inches = parseFloat(inches);

    return ` (+${feet}' ${inches}")`;
}

function getSprintsPRSortField(row, columnIndex, tableKind) {
    if (tableKind === 'relay') {
        const keys = ['name', 'relay4x100', 'relay4x400', 'relay4x200'];
        return row[keys[columnIndex]];
    }
    const keys = ['name', 'm100', 'm200', 'm400', 'm800', 'hurdles110', 'hurdles300'];
    return row[keys[columnIndex]];
}

function orderedSprintsPRRows(tableKind) {
    const state = tableKind === 'relay' ? sprintsRelayPRSortState : sprintsIndividualPRSortState;
    let data = allSprintsPRs.filter(row => row.name && String(row.name).trim());
    if (state.column === null) return data;

    const columnIndex = state.column;
    const ascending = state.ascending;

    data.sort((a, b) => {
        const rawA = getSprintsPRSortField(a, columnIndex, tableKind);
        const rawB = getSprintsPRSortField(b, columnIndex, tableKind);

        if (columnIndex === 0) {
            const nameA = (rawA || '').toLowerCase();
            const nameB = (rawB || '').toLowerCase();
            return ascending ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }

        const emptyA = isMissingTrackTime(rawA);
        const emptyB = isMissingTrackTime(rawB);
        if (emptyA && emptyB) return 0;
        if (emptyA) return 1;
        if (emptyB) return -1;

        const timeA = timeToSeconds(rawA);
        const timeB = timeToSeconds(rawB);
        return ascending ? timeA - timeB : timeB - timeA;
    });

    return data;
}

window.sortSprintsPRs = function (columnIndex, tableKind) {
    const state = tableKind === 'relay' ? sprintsRelayPRSortState : sprintsIndividualPRSortState;
    const base = allSprintsPRs.filter(row => row.name && String(row.name).trim());
    if (base.length === 0) return;

    if (state.column === columnIndex) {
        state.ascending = !state.ascending;
    } else {
        state.column = columnIndex;
        state.ascending = true;
    }

    const data = orderedSprintsPRRows(tableKind);
    if (tableKind === 'relay') {
        renderSprintsRelayTable(data);
    } else {
        renderSprintsPRTable(data);
    }

    const q = document.getElementById('sprints-pr-search')?.value?.trim();
    if (q) filterSprintsPRs();
};

function renderSprintsPRTable(rows) {
    const container = document.getElementById("sprints-pr-container");
    if (!container) return;

    const getArrow = (col) => {
        if (sprintsIndividualPRSortState.column !== col) return '⇅';
        return sprintsIndividualPRSortState.ascending ? '▲' : '▼';
    };

    let html = `
    <table>
    <thead>
    <tr>
    <th onclick="sortSprintsPRs(0, 'individual')" style="cursor:pointer">Name ${getArrow(0)}</th>
    <th>100m <button type="button" class="mini-sort" onclick="sortSprintsPRs(1, 'individual')">${getArrow(1)}</button></th>
    <th>200m <button type="button" class="mini-sort" onclick="sortSprintsPRs(2, 'individual')">${getArrow(2)}</button></th>
    <th>400m <button type="button" class="mini-sort" onclick="sortSprintsPRs(3, 'individual')">${getArrow(3)}</button></th>
    <th>800m <button type="button" class="mini-sort" onclick="sortSprintsPRs(4, 'individual')">${getArrow(4)}</button></th>
    <th>100/110H <button type="button" class="mini-sort" onclick="sortSprintsPRs(5, 'individual')">${getArrow(5)}</button></th>
    <th>300H <button type="button" class="mini-sort" onclick="sortSprintsPRs(6, 'individual')">${getArrow(6)}</button></th>
    </tr>
    </thead>
    <tbody>
    `;

    rows.forEach(row => {
        const name = cleanName(row.name);
        if (!name) return;

        const m100 = row.m100 || '--';
        const m200 = row.m200 || '--';
        const m400 = row.m400 || '--';
        const m800 = row.m800 || '--';
        const h110 = row.hurdles110 || '--';
        const h300 = row.hurdles300 || '--';

        const nameEsc = (row.name || '').replace(/'/g, "\\'");
        html += `
        <tr>
        <td class="name-cell" style="cursor:pointer; color:chocolate; text-decoration:underline;" onclick="showAthleteChart('${nameEsc}', 'sprints')">${name}</td>
        <td>${m100}</td>
        <td>${m200}</td>
        <td>${m400}</td>
        <td>${m800}</td>
        <td>${h110}</td>
        <td>${h300}</td>
        </tr>
        `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

// ==============================
// SPRINTS MEET RESULTS FUNCTIONS
// ==============================

// Fetch Sprint meet data
async function fetchSprintsMeetResults() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sprints_Results!A2:L?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.values || data.values.length === 0) return;

        sprintsMeetData = data.values.map(row => ({
            name: row[0],
            meet: row[1],
            date: row[2] || "",
            m100: row[3],
            m200: row[4],
            m400: row[5],
            m800: row[6],
            h110: row[7],
            h300: row[8],
            r4x100: row[9],
            r4x400: row[10],
            r4x200: row[11]
        }));

        const meetMap = {};
        sprintsMeetData.forEach(r => {
            if (r.meet) {
                const parts = r.date.split('/');
                let ts = 0;
                if (parts.length === 3) {
                    let [m, d, y] = parts.map(n => parseInt(n));
                    if (y < 100) y += 2000;
                    ts = new Date(y, m - 1, d).getTime();
                }
                if (!meetMap[r.meet] || ts > meetMap[r.meet].ts) {
                    meetMap[r.meet] = { name: r.meet, ts };
                }
            }
        });

        const sortedNames = Object.values(meetMap).sort((a, b) => a.ts - b.ts).map(o => o.name);
        const selector = document.getElementById("sprints-meet-selector");

        selector.innerHTML = sortedNames.map(name => `<option value="${name}">${name}</option>`).join('');

        if (sortedNames.length > 0) {
            selector.value = sortedNames[sortedNames.length - 1]; // Select newest
            document.getElementById('sprints-meet-results-controls').style.display = 'block';
            document.getElementById('sprints-meet-summary').classList.remove('hidden-section');
            window.displaySelectedSprintsMeet();
        }
    } catch (error) {
        console.error("Sprints Meet Fetch Error:", error);
    }
}

function sortSprintsMeet(columnIndex){
    const container = document.getElementById('sprints-meet-results-container');
    const table = container.querySelector('table');
    if(!table) return;

    if(sprintsMeetSortState.column === columnIndex){
        sprintsMeetSortState.ascending = !sprintsMeetSortState.ascending;
    } else {
        sprintsMeetSortState.column = columnIndex;
        sprintsMeetSortState.ascending = true;
    }

    const tbody = table.querySelector('tbody');
    const rowsArray = Array.from(tbody.querySelectorAll('tr'));

    rowsArray.sort((a,b)=>{
        const valA = getSprintsSortValue(a,columnIndex);
        const valB = getSprintsSortValue(b,columnIndex);
        if(valA === valB) return 0;
        if(columnIndex === 0){
            return sprintsMeetSortState.ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return sprintsMeetSortState.ascending ? valA - valB : valB - valA;
        }
    });

    rowsArray.forEach(row=>tbody.appendChild(row));
    updateSprintsHeaderArrows(columnIndex);
}

function updateSprintsHeaderArrows(activeColumn){
    const headers = document.querySelectorAll('#sprints-meet-results-container th.sortable');
    headers.forEach((th,i)=>{
        th.classList.remove('active-asc','active-desc');
        if(i === activeColumn){
            th.classList.add(sprintsMeetSortState.ascending ? 'active-asc':'active-desc');
        }
    });
}

window.displaySelectedSprintsMeet = function() {
    const selector = document.getElementById('sprints-meet-selector');
    const container = document.getElementById('sprints-meet-results-container');
    const selectedMeet = selector.value;

    if (!selectedMeet) return;

    // Reset counters for the Summary Card
    window._totalPerformances = 0;
    window._totalPRs = 0;

    const meetRows = sprintsMeetData.filter(r => r.meet === selectedMeet);
    let headers = [];
    
    // Define Headers based on Tab
    if (currentSprintsMeetTab === "individual") {
        headers = ["Athlete", "100m", "200m", "400m", "800m", "100/110H", "300H"];
    } else {
        headers = ["Athlete", "4x100 Relay", "4x400 Relay", "4x200 Relay"];
    }

    let tableHtml = `<table><thead><tr>`;
    headers.forEach((h, i) => {
        tableHtml += `<th class="sortable" onclick="sortSprintsMeet(${i})">${h}</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    meetRows.forEach(r => {
        const athletePR = allSprintsPRs.find(p => p.name.toLowerCase().trim() === r.name.toLowerCase().trim()) || {};
        
        tableHtml += `<tr><td class="name-cell">${cleanName(r.name)}</td>`;

        if (currentSprintsMeetTab === "individual") {
            tableHtml += `<td>${formatCell(r.m100, athletePR.m100)}</td>`;
            tableHtml += `<td>${formatCell(r.m200, athletePR.m200)}</td>`;
            tableHtml += `<td>${formatCell(r.m400, athletePR.m400)}</td>`;
            tableHtml += `<td>${formatCell(r.m800, athletePR.m800)}</td>`;
            tableHtml += `<td>${formatCell(r.h110, athletePR.hurdles110)}</td>`; // Column H
            tableHtml += `<td>${formatCell(r.h300, athletePR.hurdles300)}</td>`; // Column I
        } else {
            tableHtml += `<td>${formatCell(r.r4x100, athletePR.relay4x100)}</td>`; // Column J
            tableHtml += `<td>${formatCell(r.r4x400, athletePR.relay4x400)}</td>`; // Column K
            tableHtml += `<td>${formatCell(r.r4x200, athletePR.relay4x200)}</td>`; // Column L
        }
        tableHtml += `</tr>`;
    });

    tableHtml += "</tbody></table>";

    // Build the Summary Card (Bubble)
    const prRate = window._totalPerformances > 0 ? ((window._totalPRs / window._totalPerformances) * 100).toFixed(1) : 0;
    const summaryHTML = `
        <div class="meet-summary">
            <h3>${selectedMeet}</h3>
            <p><strong>Sprint PR Rate:</strong> ${prRate}% (${window._totalPRs} PRs out of ${window._totalPerformances} performances)</p>
        </div>`;

    container.innerHTML = summaryHTML + tableHtml;
};

window.switchSprintsMeetTab = function(tab) {
    currentSprintsMeetTab = tab;
    
    // UI Update: Highlight the active button
    const buttons = document.querySelectorAll('#sprints-meet-tabs .tab-btn');
    buttons.forEach(btn => {
        if(btn.textContent.toLowerCase().includes(tab.substring(0,3))) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    window.displaySelectedSprintsMeet(); // Re-render table with new columns
};

function getSprintsSortValue(row,colIndex){

const cells = row.querySelectorAll('td');

if(!cells[colIndex]) return '';

let text = cells[colIndex].textContent.trim();

text = text.replace(/⭐|\(-?\d+\.\d+s\)/g,'').trim();

if(colIndex === 0) return text;

return timeToSeconds(text);

}

// Add/Replace these to ensure the search bars work for Sprints & Jumps
function filterSprintsMeetResults() {
    const query = document.getElementById("sprints-meet-search").value.toLowerCase().trim();
    const rows = document.querySelectorAll("#sprints-meet-results-container tbody tr");
    rows.forEach(row => {
        const name = row.querySelector(".name-cell")?.textContent.toLowerCase() || "";
        row.style.display = name.includes(query) ? "" : "none";
    });
}

window.filterJumpsMeetResults = function() {
    const query = document.getElementById("jumps-meet-search").value.toLowerCase().trim();
    const rows = document.querySelectorAll("#jumps-meet-results-container tbody tr");
    rows.forEach(row => {
        const name = row.querySelector(".name-cell")?.textContent.toLowerCase() || "";
        row.style.display = name.includes(query) ? "" : "none";
    });
};

function resetSprintsMeetSort(){

document.getElementById("sprints-meet-search").value = "";

sprintsMeetSortState = { column:null, ascending:true };

displaySelectedSprintsMeet();

}

// After fetching Sprints meet data from Google Sheets
function populateSprintsMeets(meetRows) {
    const meetMap = {};

    meetRows.forEach(r => {
        if (!r.meet) return;

        const dateParts = (r.date || '').split('/');
        let ts = 0;
        if (dateParts.length === 3) {
            let month = parseInt(dateParts[0], 10);
            let day = parseInt(dateParts[1], 10);
            let year = parseInt(dateParts[2], 10);
            if (year < 100) year += 2000;
            ts = new Date(year, month - 1, day).getTime();
        }

        if (!meetMap[r.meet] || ts > meetMap[r.meet].ts) {
            meetMap[r.meet] = { name: r.meet, ts };
        }
    });

    const sortedNames = Object.values(meetMap)
        .sort((a, b) => a.ts - b.ts)
        .map(o => o.name);

    const selector = document.getElementById("meet-selector");
    selector.innerHTML = sortedNames
        .map(name => `<option value="${name}">${name}</option>`)
        .join('');

    if (sortedNames.length > 0) {
        selector.value = sortedNames[sortedNames.length - 1]; // select newest meet
        if (typeof window.displaySelectedMeet === 'function') {
            window.displaySelectedMeet();
        }
    }
}

function getCurrentMeetData() {
    const sportTab = document.querySelector('.sport-tab.active').dataset.sport;
    if (sportTab === 'sprints') return sprintsMeetData;
    if (sportTab === 'distance') return distanceMeetData; // or whatever your distance array is
    return [];
}




// START OF JUMPS CODE
let allJumpsPRs = [];
let jumpsPRSortState = { column: null, ascending: true };
let jumpsMeetData = [];
let jumpsMeetSortState = { column: null, ascending: true };

// --- JUMPS DATA FETCHING ---
async function fetchJumpsPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Jumps_PRs!A2:E?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            document.getElementById("jumps-pr-container").innerHTML = "<p>No jumps PR data found.</p>";
            const jumpsSearch = document.getElementById('jumps-pr-search');
            if (jumpsSearch) jumpsSearch.value = '';
            return;
        }

        const jumpsSearchIn = document.getElementById('jumps-pr-search');
        if (jumpsSearchIn) jumpsSearchIn.value = '';

        // Map the unified columns: Name, LJ, TJ, HJ, PV
        allJumpsPRs = data.values.map(row => ({
            name: row[0]?.trim() || "",
            long: row[1] || "--",
            triple: row[2] || "--",
            high: row[3] || "--",
            pole: row[4] || "--"
        }));

        jumpsPRSortState = { column: null, ascending: true };
        renderJumpsPRTable();
    } catch (error) {
        console.error("Jumps PR Fetch Error:", error);
    }
    const lastUpdated = document.getElementById('last-updated-jumps');
    if (lastUpdated) {
        const now = new Date();
        const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
        lastUpdated.textContent = `Synced with Google Sheets: ${now.toLocaleString('en-US', options)}`;
    }
}

function getJumpsPRSortField(row, columnIndex) {
    const keys = ['name', 'long', 'triple', 'high', 'pole'];
    return row[keys[columnIndex]] ?? '';
}

function getJumpsPRRowsForDisplay() {
    const input = document.getElementById('jumps-pr-search');
    const q = input ? input.value.toLowerCase().trim() : '';
    const athletes = allJumpsPRs.filter(a => a.name);
    if (!q) return athletes;
    return athletes.filter(a => a.name.toLowerCase().includes(q));
}

function orderedJumpsPRRows(rowsIn) {
    let data = rowsIn != null ? [...rowsIn] : allJumpsPRs.filter(a => a.name);
    if (jumpsPRSortState.column === null) return data;

    const col = jumpsPRSortState.column;
    const asc = jumpsPRSortState.ascending;
    data = [...data];
    data.sort((a, b) => {
        const rawA = getJumpsPRSortField(a, col);
        const rawB = getJumpsPRSortField(b, col);
        if (col === 0) {
            const nameA = (rawA || '').toLowerCase();
            const nameB = (rawB || '').toLowerCase();
            return asc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        const emptyA = isEmptyFieldEventMark(rawA);
        const emptyB = isEmptyFieldEventMark(rawB);
        if (emptyA && emptyB) return 0;
        if (emptyA) return 1;
        if (emptyB) return -1;
        const distA = parseThrowDistance(rawA);
        const distB = parseThrowDistance(rawB);
        return asc ? distB - distA : distA - distB;
    });
    return data;
}

window.sortJumpsPRs = function (columnIndex) {
    if (allJumpsPRs.filter(a => a.name).length === 0) return;
    if (jumpsPRSortState.column === columnIndex) {
        jumpsPRSortState.ascending = !jumpsPRSortState.ascending;
    } else {
        jumpsPRSortState.column = columnIndex;
        jumpsPRSortState.ascending = true;
    }
    renderJumpsPRTable();
};

window.filterJumpsPRs = function () {
    renderJumpsPRTable();
};

window.resetJumpsPRs = function () {
    const input = document.getElementById('jumps-pr-search');
    if (input) input.value = '';
    jumpsPRSortState = { column: null, ascending: true };
    renderJumpsPRTable();
};

function renderJumpsPRTable() {
    const container = document.getElementById("jumps-pr-container");
    if (!container) return;

    const rows = orderedJumpsPRRows(getJumpsPRRowsForDisplay());
    const getArrow = (col) => {
        if (jumpsPRSortState.column !== col) return '⇅';
        return jumpsPRSortState.ascending ? '▲' : '▼';
    };

    let html = `
    <table>
        <thead>
            <tr>
                <th onclick="sortJumpsPRs(0)" style="cursor:pointer">Name ${getArrow(0)}</th>
                <th>Long Jump <button type="button" class="mini-sort" onclick="sortJumpsPRs(1)">${getArrow(1)}</button></th>
                <th>Triple Jump <button type="button" class="mini-sort" onclick="sortJumpsPRs(2)">${getArrow(2)}</button></th>
                <th>High Jump <button type="button" class="mini-sort" onclick="sortJumpsPRs(3)">${getArrow(3)}</button></th>
                <th>Pole Vault <button type="button" class="mini-sort" onclick="sortJumpsPRs(4)">${getArrow(4)}</button></th>
            </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(athlete => {
        const nameEsc = (athlete.name || '').replace(/'/g, "\\'");
        html += `
            <tr>
                <td class="name-cell" style="cursor:pointer; color:chocolate; text-decoration:underline;" onclick="showAthleteChart('${nameEsc}', 'jumps')">${cleanName(athlete.name)}</td>
                <td>${athlete.long}</td>
                <td>${athlete.triple}</td>
                <td>${athlete.high}</td>
                <td>${athlete.pole}</td>
            </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

async function fetchJumpsMeetResults() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Jumps_Results!A2:G?key=${API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.values || data.values.length === 0) return;

        jumpsMeetData = data.values.map(row => ({
            name: row[0],
            meet: row[1],
            date: row[2],
            long: row[3],
            triple: row[4],
            high: row[5],
            pole: row[6]
        }));

        const meetMap = {};
        jumpsMeetData.forEach(r => {
            if (r.meet) {
                const parts = (r.date || "").split('/');
                let ts = 0;
                if (parts.length === 3) {
                    let [m, d, y] = parts.map(n => parseInt(n));
                    if (y < 100) y += 2000;
                    ts = new Date(y, m - 1, d).getTime();
                }
                if (!meetMap[r.meet] || ts > meetMap[r.meet].ts) {
                    meetMap[r.meet] = { name: r.meet, ts };
                }
            }
        });

        const sortedMeets = Object.values(meetMap).sort((a, b) => a.ts - b.ts).map(o => o.name);
        const selector = document.getElementById("jumps-meet-selector");
        if (selector) {
            selector.innerHTML = sortedMeets.map(m => `<option value="${m}">${m}</option>`).join('');
            if (sortedMeets.length > 0) {
                selector.value = sortedMeets[sortedMeets.length - 1];
                window.displaySelectedJumpsMeet();
            }
        }
    } catch (error) {
        console.error("Jumps Results Fetch Error:", error);
    }
}

// --- JUMPS DISPLAY LOGIC ---
// Helper to calculate the difference in inches and format it
function calculateJumpsDelta(oldMark, newMark) {
    const oldInches = parseThrowDistance(oldMark);
    const newInches = parseThrowDistance(newMark);
    const diff = newInches - oldInches;
    
    if (diff <= 0) return "";
    
    const feet = Math.floor(diff / 12);
    // Use toFixed(2) and then remove trailing zeros to keep it clean (e.g., 0.5 instead of 0.50)
    let inches = (diff % 12).toFixed(2);
    inches = parseFloat(inches); 
    
    return `+${feet}' ${inches}"`;
}

window.displaySelectedJumpsMeet = function() {
    if (!allJumpsPRs || allJumpsPRs.length === 0) {
        setTimeout(displaySelectedJumpsMeet, 100);
        return;
    }

    const selector = document.getElementById("jumps-meet-selector");
    const container = document.getElementById("jumps-meet-results-container");
    if (!selector || !container) return;

    const selectedMeet = selector.value;
    container.innerHTML = "";
    if (!selectedMeet) return;

    const meetRows = jumpsMeetData.filter(r => r.meet === selectedMeet);
    let totalAttempts = 0;
    let totalPRs = 0;

    const headers = ["Athlete", "Long Jump", "Triple Jump", "High Jump", "Pole Vault"];
    let tableHtml = `<table><thead><tr>`;
    headers.forEach((h, i) => {
        tableHtml += `<th class="sortable" onclick="sortJumpsMeet(${i})">${h}</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    meetRows.forEach(r => {
        const athletePR = allJumpsPRs.find(p => p.name.toLowerCase().trim() === r.name.toLowerCase().trim()) || {};

        const formatJump = (mark, prMark) => {
            if (!mark || mark === '--' || mark === '-' || mark.trim() === "") return '--';
            totalAttempts++;
            
            const markVal = parseThrowDistance(mark); 
            const prVal = parseThrowDistance(prMark);

            if (!prMark || prMark === '--' || prMark === '-') {
                totalPRs++;
                return `<span class="pr-highlight">${mark} ⭐<span class="pr-delta">(Debut)</span></span>`;
            }

            if (markVal > prVal) {
                totalPRs++;
                const delta = calculateJumpsDelta(prMark, mark);
                return `<span class="pr-highlight">${mark} ⭐<span class="pr-delta">(${delta})</span></span>`;
            }
            if (markVal === prVal && markVal > 0) {
                totalPRs++;
                return `<span class="pr-highlight">${mark} ⭐</span>`;
            }
            return mark;
        };

        tableHtml += `<tr>
            <td class="name-cell">${cleanName(r.name)}</td>
            <td>${formatJump(r.long, athletePR.long)}</td>
            <td>${formatJump(r.triple, athletePR.triple)}</td>
            <td>${formatJump(r.high, athletePR.high)}</td>
            <td>${formatJump(r.pole, athletePR.pole)}</td>
        </tr>`;
    });

    tableHtml += "</tbody></table>";

    const prPercent = totalAttempts > 0 ? ((totalPRs / totalAttempts) * 100).toFixed(1) : 0;
    
    // Updated Summary to match Distance style
    const summaryHTML = `
        <div class="meet-summary">
            <h3>${selectedMeet} – Jumps Results</h3>
            <p><strong>PR Rate:</strong> ${prPercent}% (${totalPRs} PRs out of ${totalAttempts} Jumps/Vaults)</p>
        </div>
    `;

    container.innerHTML = summaryHTML + tableHtml;
    
    if (jumpsMeetSortState.column !== null) {
        updateJumpsHeaderArrows(jumpsMeetSortState.column);
    }
};

function sortJumpsMeet(col) {
    if (jumpsMeetSortState.column === col) {
        jumpsMeetSortState.ascending = !jumpsMeetSortState.ascending;
    } else {
        jumpsMeetSortState.column = col;
        jumpsMeetSortState.ascending = true;
    }

    const table = document.querySelector("#jumps-meet-results-container table");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    rows.sort((a, b) => {
        const aVal = a.children[col].textContent.trim();
        const bVal = b.children[col].textContent.trim();

        if (col === 0) {
            return jumpsMeetSortState.ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
            const distA = parseThrowDistance(aVal);
            const distB = parseThrowDistance(bVal);
            // FLIPPED: If ascending is true, we want the BIGGEST (Best) at the top
            return jumpsMeetSortState.ascending ? distB - distA : distA - distB;
        }
    });

    rows.forEach(r => tbody.appendChild(r));
    updateJumpsHeaderArrows(col);
}

function updateJumpsHeaderArrows(activeCol) {
    const headers = document.querySelectorAll("#jumps-meet-results-container th.sortable");
    headers.forEach((th, i) => {
        th.classList.remove('active-asc', 'active-desc');
        if (i === activeCol) {
            th.classList.add(jumpsMeetSortState.ascending ? 'active-asc' : 'active-desc');
        }
    });
}

function parseThrowDistance(distStr) {
    if (!distStr || distStr === '--' || distStr === '-' || distStr === '0') return 0;
    
    // 1. Clean up stars, deltas, and labels
    let cleanStr = distStr.toString()
        .replace(/⭐|\(PR!\)|\(Debut\)|\+/g, '')
        .replace(/\(.*?\)/g, '') // Removes anything in parentheses like (+1' 2")
        .trim();
    
    // 2. Regex to find Feet (') and Inches (") including decimals
    // This looks for: Numbers -> optionally a decimal -> optionally more numbers
    const feetMatch = cleanStr.match(/(\d+(\.\d+)?)\s*'/);
    const inchMatch = cleanStr.match(/(\d+(\.\d+)?)\s*"/);
    
    let totalInches = 0;
    
    if (feetMatch) {
        totalInches += parseFloat(feetMatch[1]) * 12;
    }
    
    if (inchMatch) {
        totalInches += parseFloat(inchMatch[1]);
    }
    
    // 3. Fallback: If no symbols found, try to parse as a raw number
    if (!feetMatch && !inchMatch) {
        return parseFloat(cleanStr) || 0;
    }
    
    return totalInches;
}

function isEmptyFieldEventMark(val) {
    if (!val || val === '--' || val === '-' || String(val).trim() === '') return true;
    return parseThrowDistance(val) === 0;
}

function resetJumpsMeetSort() {
    const searchBar = document.getElementById("jumps-meet-search");
    if (searchBar) searchBar.value = "";
    jumpsMeetSortState = { column: null, ascending: true };
    displaySelectedJumpsMeet();
}


/**
 * AUTO-LOAD TRIGGER
 * This waits for the data to arrive and then "kicks" the tables into rendering.
 */


window.addEventListener("load", () => {
    // We wait 1.2 seconds to ensure the Google Sheets API has finished its job
    setTimeout(() => {
        console.log("Auto-triggering PR tables...");
        
        // Trigger Distance PRs
        if (typeof resetPRs === "function") {
            resetPRs();
        }
        /*
        // Trigger Sprints PRs (if that function exists)
        if (typeof resetSprintsPRs === "function") {
            resetSprintsPRs();
        } else if (typeof renderSprintsPRTable === "function" && allSprintsPRs.length > 0) {
            // Fallback if you don't have a resetSprintsPRs function yet
            renderSprintsPRTable(allSprintsPRs);
        }
            */
    }, 1000); 
});


// --- Fetch Sprints PRs ---
async function fetchSprintsPRs() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sprints_PRs!A2:J?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.values) {
            document.getElementById('sprints-pr-container').innerHTML = "<p>No sprints data found.</p>";
            return;
        }

        allSprintsPRs = [];

        data.values.forEach(row => {
            const name = row[0]?.trim();
            if (name) {
                allSprintsPRs.push({
                    name: name,
                    m100: row[1] || "",
                    m200: row[2] || "",
                    m400: row[3] || "",
                    m800: row[4] || "",
                    hurdles110: row[5] || "",
                    hurdles300: row[6] || "",
                    relay4x100: row[7] || "",
                    relay4x400: row[8] || "",
                    relay4x200: row[9] || ""
                });
            }
        });

        // --- Reset table AFTER allSprintsPRs is ready ---
        resetSprintsPRs();

    } catch (error) {
        console.error("Sprint PR Fetch Error:", error);
    }

    const lastUpdated = document.getElementById('last-updated-sprints');
    if (lastUpdated) {
        const now = new Date();
        const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
        lastUpdated.textContent = `Synced with Google Sheets: ${now.toLocaleString('en-US', options)}`;
    }
}

// --- Reset Sprints PR Table ---
window.resetSprintsPRs = function() {
    document.getElementById('sprints-pr-search').value = '';
    sprintsIndividualPRSortState = { column: null, ascending: true };
    sprintsRelayPRSortState = { column: null, ascending: true };

    renderSprintsPRTable(orderedSprintsPRRows('individual'));
    renderSprintsRelayTable(orderedSprintsPRRows('relay'));

    console.log("Sprints PRs reset.");
};

// --- Tab click logic ---
document.addEventListener("DOMContentLoaded", () => {
    const sportTabs = document.querySelectorAll(".sport-tab");

    sportTabs.forEach(tab => {
        tab.addEventListener("click", async () => {
            const sport = tab.dataset.sport;

            // hide all wrappers first
            document.querySelectorAll("#distance-wrapper, #sprints-wrapper, #throws-wrapper, #jumps-wrapper")
                .forEach(w => w.classList.add("hidden-section"));

            // remove active class from all tabs, set current active
            sportTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // show selected sport
            const wrapper = document.getElementById(`${sport}-wrapper`);
            if (wrapper) wrapper.classList.remove("hidden-section");

            // --- Only auto-load/reset Sprints PRs when Sprints tab is opened ---
            if (sport === "sprints" && allSprintsPRs.length === 0) {
                await fetchSprintsPRs();  // fetch & reset happens inside this function
                resetSprintsPRs();
                renderSprintsRelayTable(); // 👈 this line
            } else if (sport === "sprints") {
                // Data already exists, just reset
                resetSprintsPRs();
            }
        });
    });

    // Auto-open default tab on page load (Distance)
    sportTabs[0].click(); 
});

document.querySelectorAll(".sub-tab").forEach(btn => {
    btn.addEventListener("click", () => {

        // hide both sections
        document.getElementById("sprints-individual").classList.add("hidden-section");
        document.getElementById("sprints-relays").classList.add("hidden-section");

        // remove active state
        document.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));

        // activate clicked tab
        btn.classList.add("active");

        // show correct section
        const tab = btn.dataset.tab;
        document.getElementById(`sprints-${tab}`).classList.remove("hidden-section");
    });
});

function renderSprintsRelayTable(rowsToRender) {
    const container = document.getElementById("sprints-relays-container");
    if (!container) return;

    const rows = rowsToRender || allSprintsPRs;

    const getArrow = (col) => {
        if (sprintsRelayPRSortState.column !== col) return '⇅';
        return sprintsRelayPRSortState.ascending ? '▲' : '▼';
    };

    let html = `
    <table>
    <thead>
    <tr>
        <th onclick="sortSprintsPRs(0, 'relay')" style="cursor:pointer">Name ${getArrow(0)}</th>
        <th>4x100 <button type="button" class="mini-sort" onclick="sortSprintsPRs(1, 'relay')">${getArrow(1)}</button></th>
        <th>4x400 <button type="button" class="mini-sort" onclick="sortSprintsPRs(2, 'relay')">${getArrow(2)}</button></th>
        <th>4x200 <button type="button" class="mini-sort" onclick="sortSprintsPRs(3, 'relay')">${getArrow(3)}</button></th>
    </tr>
    </thead>
    <tbody>
    `;

    rows.forEach(row => {
        if (!row.name) return;

        const nameEsc = (row.name || '').replace(/'/g, "\\'");
        html += `
        <tr>
            <td class="name-cell" style="cursor:pointer; color:chocolate; text-decoration:underline;" onclick="showAthleteChart('${nameEsc}', 'sprints')">${cleanName(row.name)}</td>
            <td>${row.relay4x100 || '--'}</td>
            <td>${row.relay4x400 || '--'}</td>
            <td>${row.relay4x200 || '--'}</td>
        </tr>
        `;
    });

    html += "</tbody></table>";

    container.innerHTML = html;
}

function formatCell(mark, pr) {
    if (!mark || mark === '--' || mark.trim() === "") return '--';

    let secondsMark = timeToSeconds(mark);
    let secondsPR = timeToSeconds(pr);

    // Count performance
    if (secondsMark > 0) window._totalPerformances = (window._totalPerformances || 0) + 1;

    // Debut PR
    if (!pr || pr === '--') {
        window._totalPRs = (window._totalPRs || 0) + 1;
        return `<span class="pr-highlight">${mark} ⭐<span class="pr-delta">(Debut)</span></span>`;
    }

    // New PR (LOWER time is better)
    if (secondsMark < secondsPR) {
        window._totalPRs = (window._totalPRs || 0) + 1;
        const delta = (secondsPR - secondsMark).toFixed(2);
        return `<span class="pr-highlight">${mark} ⭐<span class="pr-delta">(-${delta}s)</span></span>`;
    }

    // Equal PR
    if (secondsMark === secondsPR) {
        window._totalPRs = (window._totalPRs || 0) + 1;
        return `<span class="pr-highlight">${mark} ⭐</span>`;
    }

    return mark;
}

function switchSprintsMeetTab(tab) {
    document.getElementById("sprints-individual").classList.add("hidden-section");
    document.getElementById("sprints-relays").classList.add("hidden-section");

    document.querySelectorAll("#sprints-meet-tabs .tab-btn").forEach(b => b.classList.remove("active"));

    document.querySelector(`#sprints-meet-tabs .tab-btn[data-tab='${tab}']`).classList.add("active");

    document.getElementById(`sprints-${tab}`).classList.remove("hidden-section");
}

window.switchSprintsPRTab = function(tab) {
    // 1. Update Button Visuals
    const prTabButtons = document.querySelectorAll('#sprints-pr-tabs .tab-btn');
    prTabButtons.forEach(btn => {
        // Simple check: does the button text contain "Indiv" or "Relay"?
        const isMatch = btn.textContent.toLowerCase().includes(tab.substring(0, 3));
        btn.classList.toggle('active', isMatch);
    });

    // 2. Toggle the wrappers defined in your HTML
    const individualWrapper = document.getElementById("sprints-individual");
    const relayWrapper = document.getElementById("sprints-relays");

    if (tab === 'individual') {
        individualWrapper.classList.remove("hidden-section");
        relayWrapper.classList.add("hidden-section");
        renderSprintsPRTable(orderedSprintsPRRows('individual'));
    } else {
        individualWrapper.classList.add("hidden-section");
        relayWrapper.classList.remove("hidden-section");
        renderSprintsRelayTable(orderedSprintsPRRows('relay'));
    }

    const q = document.getElementById('sprints-pr-search')?.value?.trim();
    if (q) filterSprintsPRs();
};
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRs!A1:E?key=${API_KEY}`;
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
                        <th>1 Mile <button class="mini-sort" onclick="sortPRs(4)">${getArrow(4)}</button></th>
                    </tr>
                </thead>
                <tbody>`;

    dataRows.forEach(row => {
        if (row[0]) {
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Race_Results!A2:K?key=${API_KEY}`;
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

        document.getElementById('meet-tabs').style.display = 'flex';

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
        setTimeout(displaySelectedMeet, 100);
        return;
    }

    const selectedMeet = document.getElementById('meet-selector').value;
    if (!selectedMeet) {
        document.getElementById('meet-results-container').innerHTML = "<p>Select a meet to view results.</p>";
        return;
    }

    const container = document.getElementById('meet-results-container');
    const meetRows = allRaceData.filter(row => row[1] === selectedMeet);

    // Show/hide controls only when there's data
    document.getElementById('meet-results-controls').style.display = 
    (meetRows.length > 0 && selectedMeet) ? 'flex' : 'none';

    document.getElementById('meet-search').value = '';

    // Store clean copy for reset/sort
    originalMeetRows = meetRows.map(row => [...row]);  // deep copy per row

    document.getElementById('meet-tabs').style.display = meetRows.length > 0 ? 'flex' : 'none';

    let filteredRows;
    let tableTitle;
    let headers;

    if (currentMeetTab === "relay") {
        // Include rows that have AT LEAST one relay split
        filteredRows = meetRows.filter(row => 
            (row[7] && row[7].trim() !== '' && row[6] !== '-') ||
            (row[9] && row[9].trim() !== '' && row[8] !== '-')
        );
        tableTitle = "Relay Performances";
        headers = ["Athlete", "Team Time 1", "Event 1", "Team Time 2", "Event 2"];
    } else {
        filteredRows = meetRows.filter(row => 
            (row[3] && row[3].trim() !== '' && row[3] !== '-') || 
            (row[4] && row[4].trim() !== '' && row[4] !== '-') || 
            (row[5] && row[5].trim() !== '' && row[5] !== '-') || 
            (row[6] && row[6].trim() !== '' && row[6] !== '-')
        );
        tableTitle = "Individual Events";
        headers = ["Athlete", "800m", "1600m", "3200m", "1 Mile"];
    }

    let totalPerformances = 0;
    let totalPRs = 0;

    let html = `<table>
        <thead>
            <tr>`;

    headers.forEach((h, index) => {
        html += `<th class="sortable" data-index="${index}" onclick="sortMeetResults(${index})">${h}</th>`;
    });

    html += `</tr></thead><tbody>`;

    filteredRows.forEach(row => {
        const athleteName = row[0] || "";
        const athletePR = allPRs.find(p => 
            (p[0] || "").trim().toLowerCase() === athleteName.trim().toLowerCase()
        ) || [];

        if (currentMeetTab === "relay") {
            const teamTime1 = row[7] || '-';
            const event1     = row[8] || '-';
            const teamTime2  = row[9] || '-';
            const event2     = row[10] || '-';
        
            // Skip if both team times are empty/invalid
            if (teamTime1 === '-' && teamTime2 === '-') return;
        
            html += `
                <tr>
                    <td class="name-cell">${cleanName(athleteName)}</td>
                    <td class="relay-split-cell" style="font-weight: bold; color: #c0392b;">${teamTime1}</td>
                    <td class="relay-event-cell">${event1}</td>
                    <td class="relay-split-cell" style="font-weight: bold; color: #c0392b;">${teamTime2}</td>
                    <td class="relay-event-cell">${event2}</td>
                </tr>`;
        } else {
            // Individual – same as before
            const formatCell = (raceTime, prTime) => {
                if (!raceTime || raceTime === '-' || raceTime === '0' || raceTime.trim() === '') {
                    return '-';
                }
                totalPerformances++;

                if (isNewPR(raceTime, prTime)) {
                    totalPRs++;
                    const delta = formatTimeDelta(prTime, raceTime);
                    return `
                        <span class="pr-highlight">
                            ${raceTime}
                            <span class="pr-star">⭐</span>
                            <span class="pr-delta">${delta}</span>
                        </span>`;
                }
                return raceTime;
            };

            html += `
                <tr>
                    <td class="name-cell">${cleanName(athleteName)}</td>
                    <td>${formatCell(row[3], athletePR[1])}</td>
                    <td>${formatCell(row[4], athletePR[2])}</td>
                    <td>${formatCell(row[5], athletePR[3])}</td>
                    <td>${formatCell(row[6], athletePR[4])}</td>
                </tr>`;
        }
    });

    html += "</tbody></table>";

    // Summary
    let summaryText;
    if (currentMeetTab === "relay") {
        let totalAthleteParticipations = 0;
        const uniqueRelays = new Set();  // still keep unique team results

        filteredRows.forEach(row => {
            const time1 = (row[7] || '').trim();
            const event1 = (row[8] || '').trim();
            if (time1 !== '' && time1 !== '-' && time1 !== '0') {
                totalAthleteParticipations++;
                uniqueRelays.add(`${time1}||${event1}`);
            }

            const time2 = (row[9] || '').trim();
            const event2 = (row[10] || '').trim();
            if (time2 !== '' && time2 !== '-' && time2 !== '0') {
                totalAthleteParticipations++;
                uniqueRelays.add(`${time2}||${event2}`);
            }
        });

        const uniqueCount = uniqueRelays.size;

        summaryText = `
            ${totalAthleteParticipations} relay athlete performances,
            ${uniqueCount} unique relay team result${uniqueCount === 1 ? '' : 's'}
        `;
    } else {
        let prRate = totalPerformances > 0 
            ? ((totalPRs / totalPerformances) * 100).toFixed(1) 
            : 0;
        summaryText = `<strong>PR Rate:</strong> ${prRate}% (${totalPRs} PRs out of ${totalPerformances} races)`;
    }

    const summaryHTML = `
        <div class="meet-summary">
            <h3>${selectedMeet} – ${tableTitle}</h3>
            <p>${summaryText}</p>
        </div>
    `;

    // After rendering, apply current sort state to headers
    setTimeout(() => {
        if (meetSortState.column !== null) {
            updateHeaderArrows(meetSortState.column);
        }
    }, 0);

    container.innerHTML = summaryHTML + html;
};

// Filter meet results table by athlete name search
window.filterMeetResults = function() {
    const searchTerm = document.getElementById('meet-search').value.toLowerCase().trim();
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
    meetSortState = { column: null, ascending: true };
    document.getElementById('meet-search').value = '';
    displaySelectedMeet();  // re-renders + clears arrows
};

window.switchMeetTab = function(tab) {
    currentMeetTab = tab;

    // Update active button style
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Re-render current meet with new tab filter
    displaySelectedMeet();
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

function showAthleteChart(athleteName) {
    // 1. Get the data for this person
    const athleteRaces = allRaceData.filter(row => 
        row[0] && row[0].trim().toLowerCase() === athleteName.trim().toLowerCase()
    );

    if (athleteRaces.length === 0) {
        alert("No race data found for this athlete.");
        return;
    }

    // 2. Setup the Modal and Dropdown
    document.getElementById('chart-modal').style.display = 'block';
    document.getElementById('chart-overlay').style.display = 'block';
    document.getElementById('chart-title').textContent = cleanName(athleteName);

    // Add a dropdown selector if it doesn't exist, or just reset it
    // Add or find the event selector
    let selector = document.getElementById('event-selector');
    if (!selector) {
        selector = document.createElement('select');
        selector.id = 'event-selector';
        // Styled to look like your other dropdowns
        // Styled to be more compact
        selector.style = "width: auto; min-width: 140px; padding: 8px 16px; border-radius: 20px; border: 2px solid #e6c2a6; background: #fffaf5; color: #8b4513; font-weight: bold; cursor: pointer; outline: none; margin: 0 auto 5px auto; display: block;";
        
        // Inject it specifically at the top of the content wrapper
        const wrapper = document.getElementById('chart-content-wrapper');
        wrapper.insertBefore(selector, wrapper.firstChild);
    }

    // Define the columns: 800m is Col 3, 1600m is Col 4, 3200m is Col 5
    const eventOptions = [
        { label: "800m", index: 3 },
        { label: "1600m", index: 4 },
        { label: "3200m", index: 5 }
    ];

    // Build dropdown and pick the first one that has data
    selector.innerHTML = "";
    let firstValidIndex = null;

    eventOptions.forEach(opt => {
        const hasData = athleteRaces.some(r => r[opt.index] && r[opt.index] !== '-' && r[opt.index] !== '0');
        if (hasData) {
            let el = document.createElement('option');
            el.value = opt.index;
            el.textContent = opt.label;
            selector.appendChild(el);
            if (firstValidIndex === null) firstValidIndex = opt.index;
        }
    });

    // When the coach changes the dropdown, redraw the chart
    selector.onchange = () => updateChartLogic(athleteRaces, parseInt(selector.value));

    // 3. Draw the initial chart
    if (firstValidIndex !== null) {
        updateChartLogic(athleteRaces, firstValidIndex);
    } else {
        alert("This athlete has no individual race times recorded.");
        closeChart();
    }
}

function updateChartLogic(athleteRaces, colIndex) {
    const plotData = athleteRaces
        .filter(row => row[colIndex] && row[colIndex] !== '-' && row[colIndex] !== '' && row[colIndex] !== '0')
        .map(row => ({
            meet: row[1],
            date: row[2] || "", // Assuming Date is in Column C (Index 2)
            seconds: timeToSeconds(row[colIndex]),
            displayTime: row[colIndex]
        }));

    const ctx = document.getElementById('progressionChart').getContext('2d');
    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: plotData.map(d => d.date ? `${d.meet} (${d.date})` : d.meet),
            datasets: [{
                data: plotData.map(d => d.seconds),
                borderColor: 'chocolate',
                backgroundColor: 'rgba(210, 105, 30, 0.2)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                // THIS FIXES THE DOTS (Tooltips)
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` Time: ${plotData[context.dataIndex].displayTime}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45, // Tilts the text if it gets too crowded
                        minRotation: 0,
                        autoSkip: true,
                        font: { size: 11 } // Slightly smaller for better fit
                    },
                },
                y: {
                    reverse: true,
                    ticks: {
                        callback: function(value) {
                            let m = Math.floor(value / 60);
                            let s = Math.floor(value % 60);
                            return m + ":" + (s < 10 ? '0' : '') + s;
                        }
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

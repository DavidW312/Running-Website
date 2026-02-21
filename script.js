const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// --- GLOBAL STATE ---
let currentWeekData = [];
let originalWeekData = [];
let allPRs = [];
let prSortState = { column: null, ascending: true };
let allRaceData = [];
let currentMeetTab = "individual";

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

    // Determine which weekday columns have any data (even A/XA/INJ)
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
        if (!row[0] && !row[1]) return;

        const gender = getGender(buildName(row));
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
            <td class="name-cell">${cleanName(buildName(row))}</td>`;

        // Weekday columns
        weekdayCols.forEach(colIdx => {
            let val = row[colIdx];

            // If the column has any entry and this cell is empty, mark as P
            if ((!val || val === "") && activeWeekdays[colIdx]) {
                val = "P";
            }

            htmlContent += `<td class="${getStatusClass(val)}">${val}</td>`;
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Race_Results!A2:J?key=${API_KEY}`;
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

    document.getElementById('meet-tabs').style.display = meetRows.length > 0 ? 'flex' : 'none';

    let filteredRows;
    let tableTitle;
    let headers;

    if (currentMeetTab === "relay") {
        // Include rows that have AT LEAST one relay split
        filteredRows = meetRows.filter(row => 
            (row[6] && row[6].trim() !== '' && row[6] !== '-') ||
            (row[8] && row[8].trim() !== '' && row[8] !== '-')
        );
        tableTitle = "Relay Performances";
        headers = ["Athlete", "Team Time 1", "Event 1", "Team Time 2", "Event 2"];
    } else {
        filteredRows = meetRows.filter(row => 
            (row[3] && row[3].trim() !== '' && row[3] !== '-') || 
            (row[4] && row[4].trim() !== '' && row[4] !== '-') || 
            (row[5] && row[5].trim() !== '' && row[5] !== '-')
        );
        tableTitle = "Individual Events";
        headers = ["Athlete", "800m", "1600m", "3200m"];
    }

    let totalPerformances = 0;
    let totalPRs = 0;

    let html = `<table>
        <thead>
            <tr>`;

    headers.forEach(h => {
        html += `<th>${h}</th>`;
    });

    html += `</tr></thead><tbody>`;

    filteredRows.forEach(row => {
        const athleteName = row[0] || "";
        const athletePR = allPRs.find(p => 
            (p[0] || "").trim().toLowerCase() === athleteName.trim().toLowerCase()
        ) || [];

        if (currentMeetTab === "relay") {
            const teamTime1 = row[6] || '-';
            const event1     = row[7] || '-';
            const teamTime2  = row[8] || '-';
            const event2     = row[9] || '-';
        
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
            const time1 = (row[6] || '').trim();
            const event1 = (row[7] || '').trim();
            if (time1 !== '' && time1 !== '-' && time1 !== '0') {
                totalAthleteParticipations++;
                uniqueRelays.add(`${time1}||${event1}`);
            }

            const time2 = (row[8] || '').trim();
            const event2 = (row[9] || '').trim();
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

    container.innerHTML = summaryHTML + html;
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


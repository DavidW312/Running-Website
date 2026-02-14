const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';

// 1. When the page loads, first find what weeks exist in the sheet
window.onload = function() {
    initDropdown();
};

// 2. This function looks at your Google Sheet and builds the dropdown menu automatically
async function initDropdown() {
    const selector = document.getElementById('week-selector');
    // We fetch the metadata of the spreadsheet to get tab titles
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const spreadsheet = await response.json();
        
        // Clear the dropdown
        selector.innerHTML = "";

        // Loop through all sheets (tabs) and add them as options
        spreadsheet.sheets.forEach(sheet => {
            const title = sheet.properties.title;
            // We only add the tab if it has the word "Week" in it
            if (title.includes("Week")) {
                const option = document.createElement('option');
                option.value = title;
                option.textContent = title;
                selector.appendChild(option);
            }
        });

        // 3. IMPORTANT: Tell the dropdown to refresh the table when clicked
        selector.addEventListener('change', function() {
            fetchWeeklyData(this.value);
        });

        // 4. Load the very first week found by default
        if (selector.options.length > 0) {
            fetchWeeklyData(selector.options[0].value);
        } else {
            document.getElementById('mileage-container').innerHTML = "No tabs named 'Week' found.";
        }

    } catch (error) {
        console.error("Error building dropdown:", error);
    }
}

// 5. This fetches the specific mileage data for the selected week
async function fetchWeeklyData(tabName) {
    const container = document.getElementById('mileage-container');
    container.innerHTML = `<p>Loading ${tabName}...</p>`;

    // Range A1:H captures Name, 6 days (M-S), and Total
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

            // Skip index 0 (the header row in your Google Sheet)
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
        console.error("The call failed:", error);
        container.innerHTML = "<p>Error loading data. Check Sheet sharing settings.</p>";
    }
}
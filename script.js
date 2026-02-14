const SHEET_ID = '1z-tYsvka0xCvYAp6iki0o5IIaUXi-ZOosnvUDxmylIA';
const API_KEY = 'AIzaSyAijjbGyF0cY0BLgEa_LmkYjyL1UDnQVQ8';
const RANGE = 'Sheet1!A2:B'; // This grabs columns A and B, starting at row 2 (skipping headers)

async function fetchRealMileage() {
    // 1. Construct the secret URL
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`;

    try {
        // 2. Make the "phone call"
        const response = await fetch(url);
        const data = await response.json(); // Convert the response to a list we can read

        // 3. Find the container in our HTML
        const container = document.getElementById('mileage-container');
        
        // 4. "data.values" is an array of rows (e.g. [["Alex", "40"], ["Jordan", "30"]])
        if (data.values) {
            let htmlContent = "<ul>";
            
            data.values.forEach(row => {
                // row[0] is Name, row[1] is Miles
                // We check if the row actually has data before adding it
                if (row[0] && row[1]) {
                    htmlContent += `
                        <li class="athlete-item">
                            <span class="name">${row[0]}</span> 
                            <span class="miles">${row[1]} miles</span>
                        </li>`;
                }
            });
            
            htmlContent += "</ul>";
            container.innerHTML = htmlContent;
        } else {
            container.innerHTML = "No data found in that range.";
        }

    } catch (error) {
        console.error("The call failed:", error);
        document.getElementById('mileage-container').innerHTML = "Error loading data.";
    }
}

// Don't forget to call it when the page loads!
window.onload = fetchRealMileage;
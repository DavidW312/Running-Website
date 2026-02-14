// 1. This function runs as soon as the page loads
window.onload = function() {
    console.log("Files are linked correctly!");
    displayMileage();
};

// 2. A simple function to show some fake data
function displayMileage() {
    const container = document.getElementById('mileage-container');
    
    // Imagine this data came from your Google Sheet
    const athletes = [
        { name: "Alex", miles: 35 },
        { name: "Jordan", miles: 42 },
        { name: "Taylor", miles: 28 }
    ];

    // Create some HTML to show the names and miles
    let htmlContent = "<ul>";
    
    athletes.forEach(athlete => {
        htmlContent += `<li><strong>${athlete.name}:</strong> ${athlete.miles} miles</li>`;
    });

    htmlContent += "</ul>";
    
    // Put that HTML into the container
    container.innerHTML = htmlContent;
}
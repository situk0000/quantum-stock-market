document.addEventListener("DOMContentLoaded", () => {
    // API URL
    const API_URL = window.location.origin;

    // --- Global Elements ---
    const loadingSpinner = document.getElementById("loading-spinner");
    const resultsContainer = document.getElementById("results-container");
    const chartContainer = document.getElementById("chart-container");
    const chartCanvas = document.getElementById("results-chart");
    let resultsChart = null; // Variable to hold the chart instance

    // --- Tab Switching Logic ---
    const tabs = document.querySelectorAll(".tab-link");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));

            // Activate clicked
            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");

            // Clear results when switching tabs
            clearResults();
        });
    });

    /**
     * Toggles the loading spinner visibility
     */
    function showLoading(show) {
        loadingSpinner.style.display = show ? "block" : "none";
    }

    /**
     * Clears all results and hides the chart
     */
    function clearResults() {
        resultsContainer.innerHTML = "";
        chartContainer.style.display = "none";
        if (resultsChart) {
            resultsChart.destroy(); // Destroy the old chart instance
            resultsChart = null;
        }
    }

    /**
     * Fetches the list of available dates and populates the dropdown
     */
    const dateSelect = document.getElementById("date-select");
    async function loadDates() {
        try {
            const response = await fetch(`${API_URL}/api/dates`);
            if (!response.ok) throw new Error("Failed to load dates");
            const dates = await response.json();
            
            dateSelect.innerHTML = '<option value="">Select a date</option>'; // Clear loading text
            dates.forEach(date => {
                const option = document.createElement("option");
                option.value = date;
                option.textContent = date;
                dateSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Error loading dates:", error);
            dateSelect.innerHTML = '<option value="">Could not load dates</option>';
        }
    }

    /**
     * Generic function to display API results in the container
     * @param {Array|Object} data - The data from the API
     */
    function displayResults(data) {
        clearResults(); // Clear previous results and chart

        if (data.detail) { // Handle FastAPI error messages
            resultsContainer.innerHTML = `<div class="error-message">${data.detail}</div>`;
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            resultsContainer.innerHTML = "<p>No results found.</p>";
            return;
        }

        // --- Chart Data Preparation ---
        const chartLabels = [];
        const chartData = {
            open: [],
            high: [],
            low: [],
            close: [],
        };

        // --- Create Result Cards ---
        data.forEach(item => {
            const card = document.createElement("div");
            card.className = "result-card";
            
            const rank = item.Rank ?? 'N/A';
            const date = item.Date ?? 'N/A';
            const open = parseFloat(item.Open) ?? 0;
            const high = parseFloat(item.High) ?? 0;
            const low = parseFloat(item.Low) ?? 0;
            const close = parseFloat(item.Close) ?? 0;
            const volume = item.Volume?.toLocaleString() ?? 'N/A';
            
            const scoreType = item.Similarity !== undefined ? 'Similarity' : 'Variance';
            const scoreValue = item.Similarity ?? item.Variance;
            const score = scoreValue !== undefined ? parseFloat(scoreValue).toFixed(4) : 'N/A';

            card.innerHTML = `
                <div class="result-card-header">
                    <h3>${date}</h3>
                    <span class="rank-badge">Rank ${rank}</span>
                </div>
                <div class="result-card-body">
                    <div class="metric">Open<strong>${open.toFixed(2)}</strong></div>
                    <div class="metric high">High<strong class="high">${high.toFixed(2)}</strong></div>
                    <div class="metric low">Low<strong class="low">${low.toFixed(2)}</strong></div>
                    <div class="metric">Close<strong>${close.toFixed(2)}</strong></div>
                    <div class="metric">Volume<strong>${volume}</strong></div>
                </div>
                <div class="result-card-footer">
                    <div class="score"><span>${scoreType}:</span> ${score}</div>
                </div>
            `;
            resultsContainer.appendChild(card);

            // Add data for the chart (only if it's not a volatility-only search)
            if (item.Open !== undefined) {
                chartLabels.push(`Rank ${rank} (${date})`);
                chartData.open.push(open);
                chartData.high.push(high);
                chartData.low.push(low);
                chartData.close.push(close);
            }
        });

        // --- Render the Chart ---
        if (chartLabels.length > 0) {
            chartContainer.style.display = "block";
            const ctx = chartCanvas.getContext("2d");
            resultsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [
                        {
                            label: 'Open',
                            data: chartData.open,
                            backgroundColor: 'rgba(54, 162, 235, 0.6)', // Blue
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'High',
                            data: chartData.high,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)', // Green
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Low',
                            data: chartData.low,
                            backgroundColor: 'rgba(255, 99, 132, 0.6)', // Red
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Close',
                            data: chartData.close,
                            backgroundColor: 'rgba(153, 102, 255, 0.6)', // Purple
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { labels: { color: 'white' } },
                        title: {
                            display: true,
                            text: 'Similar Pattern OHLC Comparison',
                            color: 'white',
                            font: { size: 16 }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            ticks: { color: 'white' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        x: {
                            ticks: { color: 'white' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }
    }

    // --- Event Listeners for Forms ---

    // 1. Pattern Search Form
    document.getElementById("pattern-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        showLoading(true);
        clearResults();

        const params = new URLSearchParams({
            open_price: document.getElementById("open-price").value,
            high_price: document.getElementById("high-price").value,
            low_price: document.getElementById("low-price").value,
            close_price: document.getElementById("close-price").value,
            top_k: 5
        });

        try {
            const response = await fetch(`${API_URL}/api/search/pattern?${params}`);
            const data = await response.json();
            displayResults(data);
        } catch (error) {
            console.error(error);
            resultsContainer.innerHTML = `<div class="error-message">An error occurred: ${error.message}</div>`;
        } finally {
            showLoading(false);
        }
    });

    // 2. Date Search Form
    document.getElementById("date-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        showLoading(true);
        clearResults();

        const params = new URLSearchParams({
            target_date: dateSelect.value,
            top_k: 5
        });

        try {
            const response = await fetch(`${API_URL}/api/search/date?${params}`);
            const data = await response.json();
            displayResults(data);
        } catch (error) {
            console.error(error);
            resultsContainer.innerHTML = `<div class="error-message">An error occurred: ${error.message}</div>`;
        } finally {
            showLoading(false);
        }
    });

    // 3. Volatility Search Form
    document.getElementById("volatility-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        showLoading(true);
        clearResults();

        const params = new URLSearchParams({
            top_k: document.getElementById("vol-top-k").value
        });

        try {
            const response = await fetch(`${API_URL}/api/search/volatility?${params}`);
            const data = await response.json();
            displayResults(data);
        } catch (error)
            {
            console.error(error);
            resultsContainer.innerHTML = `<div class="error-message">An error occurred: ${error.message}</div>`;
        } finally {
            showLoading(false);
        }
    });

    // --- Initial App Load ---
    loadDates();
});
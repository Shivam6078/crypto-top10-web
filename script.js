/*
 * script.js
 *
 * Fetches the top cryptocurrencies from the CoinGecko API and renders
 * them into an interactive table complete with mini 7‑day sparkline
 * charts. Users can switch between rankings by market cap or by
 * 24‑hour trading volume. Charts are drawn using Chart.js, a
 * JavaScript charting library that renders on HTML5 canvas and is
 * responsive across modern browsers【872127742695703†L61-L75】.
 *
 * Data is requested from the public `coins/markets` endpoint,
 * which provides price, market cap, volume and sparkline data【892626425153966†L145-L153】. The API
 * allows sorting by various fields such as market cap or volume
 * through the `order` parameter【892626425153966†L319-L334】. We set
 * `sparkline=true` to include 7‑day price arrays and
 * `price_change_percentage=24h` to obtain the 24‑hour percentage change【892626425153966†L351-L365】.
 */

// API base URL and query constants
const API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const MARKET_CAP_DESC = 'market_cap_desc';
const VOLUME_DESC = 'volume_desc';
const PER_PAGE = 10;

// State variable to keep track of current order
let currentOrder = MARKET_CAP_DESC;

/**
 * Initialises event listeners once the DOM is ready. Sets up
 * handlers for the two navigation buttons and triggers the
 * first fetch to populate the table.
 */
document.addEventListener('DOMContentLoaded', () => {
  const marketBtn = document.getElementById('marketCapBtn');
  const volumeBtn = document.getElementById('volumeBtn');
  // Handle switching to market cap view
  marketBtn.addEventListener('click', () => {
    if (currentOrder !== MARKET_CAP_DESC) {
      currentOrder = MARKET_CAP_DESC;
      marketBtn.classList.add('active');
      volumeBtn.classList.remove('active');
      fetchData();
    }
  });
  // Handle switching to volume view
  volumeBtn.addEventListener('click', () => {
    if (currentOrder !== VOLUME_DESC) {
      currentOrder = VOLUME_DESC;
      volumeBtn.classList.add('active');
      marketBtn.classList.remove('active');
      fetchData();
    }
  });
  // Trigger initial fetch
  fetchData();
});

/**
 * Fetches cryptocurrency data from CoinGecko according to the
 * selected order (market cap or volume) and updates the table.
 * Displays a loading message while requesting data and hides
 * the content area until the results are ready.
 */
async function fetchData() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');
  const tbody = document.getElementById('tableBody');
  // Show loading state
  loading.style.display = 'block';
  content.classList.add('hidden');
  tbody.innerHTML = '';
  try {
    // Build API URL with query parameters
    const url = `${API_URL}?vs_currency=usd&order=${currentOrder}&per_page=${PER_PAGE}&page=1&sparkline=true&price_change_percentage=24h`;
    const response = await fetch(url);
    const data = await response.json();
    // Populate table rows
    data.forEach((coin, index) => {
      // Create table row
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${coin.market_cap_rank ?? index + 1}</td>
        <td class="coin-info">
          <img src="${coin.image}" alt="${coin.name} logo" class="coin-img" />
          <span>${coin.name} (${coin.symbol.toUpperCase()})</span>
        </td>
        <td>${formatCurrency(coin.current_price)}</td>
        <td>${formatLargeNumber(coin.market_cap)}</td>
        <td>${formatLargeNumber(coin.total_volume)}</td>
        <td class="percent ${coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}">
          ${coin.price_change_percentage_24h?.toFixed(2) ?? '0.00'}%
        </td>
        <td><canvas id="chart-${index}" class="sparkline"></canvas></td>
      `;
      tbody.appendChild(row);
      // Draw sparkline using the 7‑day price array
      drawSparkline(`chart-${index}`, coin.sparkline_in_7d?.price || [], coin.price_change_percentage_24h);
    });
    // Hide loading, show content
    loading.style.display = 'none';
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    loading.textContent = 'Error fetching data. Please try again later.';
  }
}

/**
 * Draws a small line chart (sparkline) inside a specified canvas
 * element using Chart.js. The sparkline displays the last 7 days of
 * price data. Colour coding reflects whether the 24 h change is
 * positive (green) or negative (red).
 *
 * @param {string} canvasId – ID of the canvas element
 * @param {number[]} prices – Array of price points for the last 7 days
 * @param {number} change24h – 24 hour percentage change for colour
 */
function drawSparkline(canvasId, prices, change24h) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  // Use slice to avoid mutating original data
  const data = prices.slice();
  // Determine line colour based on change
  const lineColour = change24h >= 0 ? '#10b981' : '#ef4444';
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [
        {
          data: data,
          borderColor: lineColour,
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: { display: false },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => {
              // Format tooltip value with currency and rounding
              return formatCurrency(context.raw);
            },
          },
        },
      },
    },
  });
}

/**
 * Formats a number as USD currency with comma separators.
 * @param {number} value – numeric value to format
 * @returns {string} formatted string
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats large numbers into a compact form using K, M, B, T units.
 * For example, 12345678 becomes $12.35M.
 * @param {number} value – numeric value to format
 * @returns {string} formatted string
 */
function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-';
  const units = ['', 'K', 'M', 'B', 'T', 'Q'];
  let unitIndex = 0;
  let scaled = value;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex++;
  }
  return '$' + scaled.toFixed(scaled < 100 ? 2 : 0) + units[unitIndex];
}
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

// State variables
let currentOrder = MARKET_CAP_DESC; // current sort order
let chartTimeframe = '7d'; // current chart timeframe: '7d' or '30d'
let refreshTimer = null; // timer for auto-refresh

// Refresh interval in milliseconds. Adjust this constant to change how often
// the data is refreshed automatically. The default is 60 seconds (60000 ms).
const REFRESH_INTERVAL_MS = 60000;
let coinsData = []; // holds coins along with additional computed data
const chartInstances = {}; // track Chart.js instances per canvas

/**
 * Initialises event listeners once the DOM is ready. Sets up
 * handlers for the two navigation buttons and triggers the
 * first fetch to populate the table.
 */
document.addEventListener('DOMContentLoaded', () => {
  const marketBtn = document.getElementById('marketCapBtn');
  const volumeBtn = document.getElementById('volumeBtn');
  const chart7Btn = document.getElementById('chart7dBtn');
  const chart30Btn = document.getElementById('chart30dBtn');
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
  // Chart timeframe: 7 days
  chart7Btn.addEventListener('click', () => {
    if (chartTimeframe !== '7d') {
      chartTimeframe = '7d';
      chart7Btn.classList.add('active');
      chart30Btn.classList.remove('active');
      updateAllCharts();
    }
  });
  // Chart timeframe: 30 days
  chart30Btn.addEventListener('click', () => {
    if (chartTimeframe !== '30d') {
      chartTimeframe = '30d';
      chart30Btn.classList.add('active');
      chart7Btn.classList.remove('active');
      updateAllCharts();
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
  // Clear existing refresh timer to avoid overlapping fetches
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  try {
    // Build API URL with query parameters
    const url = `${API_URL}?vs_currency=usd&order=${currentOrder}&per_page=${PER_PAGE}&page=1&sparkline=true&price_change_percentage=24h`;
    const response = await fetch(url);
    const data = await response.json();
    // Retrieve 50‑day historical data for each coin and compute metrics
    coinsData = await Promise.all(
      data.map(async (coin) => {
        try {
          const extra = await fetchMarketChart(coin.id);
          return Object.assign({}, coin, extra);
        } catch (err) {
          console.error('Error fetching historical data for', coin.id, err);
          return Object.assign({}, coin, { avg50: null, prices30: [] });
        }
      })
    );
    // Populate table rows with additional data
    coinsData.forEach((coin, index) => {
      const row = document.createElement('tr');
      // Determine if current price is above or below the 50‑day moving average
      const above50 = coin.avg50 != null && coin.current_price >= coin.avg50;
      const dmaClass = above50 ? 'positive' : 'negative';
      const dmaText = coin.avg50 == null ? '-' : above50 ? 'Above' : 'Below';
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
        <td class="dma ${dmaClass}">${dmaText}</td>
        <td><canvas id="chart-${index}" class="sparkline"></canvas></td>
      `;
      tbody.appendChild(row);
    });
    // After adding rows, draw charts according to current timeframe
    updateAllCharts();
    // Hide loading, show content
    loading.style.display = 'none';
    content.classList.remove('hidden');
    // Set up auto-refresh to update every REFRESH_INTERVAL_MS milliseconds
    refreshTimer = setTimeout(fetchData, REFRESH_INTERVAL_MS);
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    loading.textContent = 'Error fetching data. Please try again later.';
  }
}

/**
 * Fetches the 50‑day market chart for a given coin ID and computes
 * the 50‑day moving average and the last 30 closing prices. The
 * `market_chart` endpoint accepts a `days` parameter to specify
 * the number of days to retrieve, and the `interval` parameter can
 * request daily data【283702890470731†L320-L344】. Here we request 50 days
 * of daily data.
 *
 * @param {string} id – CoinGecko coin ID
 * @returns {Promise<{avg50: number|null, prices30: number[]}>}
 */
async function fetchMarketChart(id) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=50&interval=daily`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!json || !json.prices || json.prices.length === 0) {
    return { avg50: null, prices30: [] };
  }
  const prices = json.prices.map((p) => p[1]);
  // Compute 50‑day moving average
  const sum = prices.reduce((acc, val) => acc + val, 0);
  const avg50 = sum / prices.length;
  // Extract last 30 days for 30‑day chart (or fewer if not available)
  const prices30 = prices.slice(-30);
  return { avg50, prices30 };
}

/**
 * Update all charts on the page based on the selected timeframe.
 */
function updateAllCharts() {
  coinsData.forEach((coin, index) => {
    drawChart(`chart-${index}`, coin);
  });
}

/**
 * Draws a chart for a coin using Chart.js. This function replaces
 * the previous drawSparkline and chooses between 7‑day and 30‑day
 * data based on the current `chartTimeframe`. Chart instances are
 * stored to allow destruction before re‑drawing when the timeframe
 * changes.
 *
 * @param {string} canvasId – ID of the canvas element
 * @param {object} coin – Coin data including sparkline and prices30
 */
function drawChart(canvasId, coin) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  // Choose the appropriate data series
  let dataSeries;
  let changeColour;
  if (chartTimeframe === '30d' && coin.prices30 && coin.prices30.length > 0) {
    dataSeries = coin.prices30.slice();
    // determine colour based on 30‑day trend (compare last price vs first)
    const trend = dataSeries[dataSeries.length - 1] - dataSeries[0];
    changeColour = trend >= 0 ? '#10b981' : '#ef4444';
  } else {
    // default to 7‑day sparkline
    dataSeries = (coin.sparkline_in_7d && coin.sparkline_in_7d.price)
      ? coin.sparkline_in_7d.price.slice()
      : [];
    changeColour = coin.price_change_percentage_24h >= 0 ? '#10b981' : '#ef4444';
  }
  // Destroy existing chart if it exists to avoid overlap
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dataSeries.map((_, i) => i),
      datasets: [
        {
          data: dataSeries,
          borderColor: changeColour,
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
              return formatCurrency(context.raw);
            },
          },
        },
      },
    },
  });
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
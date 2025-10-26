/*
 * script.js
 *
 * Fetches the top cryptocurrencies from the CoinGecko API and renders
 * them into an interactive table complete with mini 7‑day and 30‑day
 * sparkline charts.  This simplified version displays the top 10
 * coins sorted by market cap only (no ranking toggles) and shows
 * key technical indicators such as the 50‑day and 200‑day moving
 * averages, a 14‑day RSI and the volume‑to‑market‑cap ratio.
 * Charts are drawn using Chart.js, a JavaScript charting library
 * that renders on HTML5 canvas and is responsive across modern browsers【872127742695703†L61-L75】.
 *
 * Data is requested from the public `coins/markets` endpoint,
 * which provides price, market cap, volume and sparkline data【892626425153966†L145-L153】.  The API
 * allows sorting by various fields such as market cap or volume
 * through the `order` parameter【892626425153966†L319-L334】.  In this
 * simple page we always use `market_cap_desc` to sort by market cap.
 * We set `sparkline=true` to include 7‑day price arrays and
 * `price_change_percentage=24h` to obtain the 24‑hour percentage change【892626425153966†L351-L365】.
 */

// API base URL and query constants
const API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const MARKET_CAP_DESC = 'market_cap_desc';
const VOLUME_DESC = 'volume_desc';
const PER_PAGE = 10;

// State variables
// Current sort order: only market cap (simplified site)
let currentOrder = MARKET_CAP_DESC;
// Use 30‑day charts by default; no user selection
let chartTimeframe = '30d';
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
  // Immediately fetch data on page load (single page, no toggles)
  fetchData();

  // Dark mode toggle setup
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    // Apply saved preference
    if (localStorage.getItem('cryptoDarkMode') === 'true') {
      document.body.classList.add('dark-mode');
      darkToggle.textContent = '☀️ Light Mode';
    }
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const enabled = document.body.classList.contains('dark-mode');
      localStorage.setItem('cryptoDarkMode', enabled);
      // Swap label between dark and light mode
      darkToggle.textContent = enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
  }
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
          return Object.assign({}, coin, {
            avg50: null,
            avg200: null,
            prices30: [],
            rsi14: null,
          });
        }
      })
    );
    // Populate table rows with additional data
    coinsData.forEach((coin, index) => {
      const row = document.createElement('tr');
      // Compute percent difference from the 50‑day moving average.  A positive
      // percentage indicates the current price is above the average, while a
      // negative percentage indicates it is below.  If no average is available,
      // display a dash.  Format the percentage to two decimals and include a
      // plus sign when positive.
      let dma50Class = '';
      let dma50Text = '-';
      if (coin.avg50 != null) {
        const diff = ((coin.current_price - coin.avg50) / coin.avg50) * 100;
        dma50Class = diff >= 0 ? 'positive' : 'negative';
        dma50Text = (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
      }
      // Determine 200‑day moving average indicator
      const above200 = coin.avg200 != null && coin.current_price >= coin.avg200;
      const dma200Class = above200 ? 'positive' : 'negative';
      const dma200Text = coin.avg200 == null ? '-' : above200 ? 'Above' : 'Below';
      // Determine RSI colour: oversold (<30), overbought (>70), neutral
      let rsiClass = '';
      if (coin.rsi14 != null) {
        if (coin.rsi14 < 30) rsiClass = 'positive';
        else if (coin.rsi14 > 70) rsiClass = 'negative';
      }
      const rsiText = coin.rsi14 == null ? '-' : coin.rsi14.toFixed(2);
      // Compute volume to market cap ratio
      const ratio = coin.market_cap && coin.market_cap > 0
        ? (coin.total_volume / coin.market_cap)
        : null;
      const ratioText = ratio == null ? '-' : ratio.toFixed(3);
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
        <td class="dma ${dma50Class}">${dma50Text}</td>
        <td class="dma ${dma200Class}">${dma200Text}</td>
        <td class="rsi ${rsiClass}">${rsiText}</td>
        <td class="ratio">${ratioText}</td>
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
  // Request up to 200 days of historical daily prices. The CoinGecko market_chart
  // endpoint accepts a `days` parameter that can be any integer; values over 90
  // return daily data【59135095249831†L320-L330】. We use 200 days to compute
  // medium and long‑term indicators such as the 50‑day and 200‑day moving
  // averages, RSI and last 30‑day prices.
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=200&interval=daily`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!json || !json.prices || json.prices.length === 0) {
    return { avg50: null, avg200: null, prices30: [], rsi14: null };
  }
  const prices = json.prices.map((p) => p[1]);
  // Compute 50‑day moving average using the last 50 prices
  const last50 = prices.slice(-50);
  const avg50 = last50.reduce((acc, val) => acc + val, 0) / last50.length;
  // Compute 200‑day moving average using the last 200 prices (or all if fewer)
  const last200 = prices.slice(-200);
  const avg200 = last200.reduce((acc, val) => acc + val, 0) / last200.length;
  // Extract last 30 days for 30‑day chart (or fewer if not available)
  const prices30 = prices.slice(-30);
  // Compute 14‑day RSI using the last 15 closing prices (14 periods)
  const rsi = calculateRSI(prices.slice(-15));
  return { avg50, avg200, prices30, rsi14: rsi };
}

/**
 * Calculates the Relative Strength Index (RSI) over a given period. The RSI is a
 * momentum oscillator that measures the magnitude of recent price changes to
 * evaluate overbought or oversold conditions. A 14‑period RSI is commonly
 * used【775080324767626†L653-L655】; values above 70 may indicate an asset is
 * overbought while values below 30 may indicate oversold conditions【775080324767626†L693-L705】.
 *
 * @param {number[]} prices – Array of closing prices, length should be period+1
 * @param {number} period – Number of periods to use for RSI (default 14)
 * @returns {number|null} – RSI value between 0 and 100, or null if calculation is not possible
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) return null;
  // Compute price changes
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  // Avoid division by zero
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
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
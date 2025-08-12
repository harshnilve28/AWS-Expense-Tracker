const PRESIGN_URL = "https://your-api-gateway-url/presign";
const SUMMARY_URL = "https://your-api-gateway-url/summary";

const fileInput   = document.getElementById("fileInput");
const uploadBtn   = document.getElementById("uploadBtn");
const uploadMsg   = document.getElementById("uploadMsg");
const loadingBar  = document.getElementById("loadingBar");
const loadingCont = document.getElementById("loadingBarContainer");

// Chart variables
let currentChart = null;
let currentChartType = 'radar';
let chartData = { Food: 0, Clothes: 0, Travel: 0, Medical: 0 };

// Handle upload click
uploadBtn.addEventListener("click", async () => {
  if (!fileInput.files.length) return alert("Select a file first.");
  uploadBtn.disabled = true;
  uploadMsg.textContent = "";
  loadingCont.classList.remove("hidden");
  loadingBar.style.width = "0%";

  try {
    // 1 Get pre-signed S3 POST fields
    const presign = await fetch(PRESIGN_URL, { method: "POST" }).then(r => r.json());

    // 2 Build form data (original working version)
    const formData = new FormData();
    Object.entries(presign.fields).forEach(([k,v]) => formData.append(k, v));
    formData.append("file", fileInput.files[0]);

    // 3 Upload to S3
    await fetch(presign.url, { method: "POST", body: formData });
    loadingBar.style.width = "100%";
    uploadMsg.textContent = "Uploaded! Data has updated!";

    // 4 Wait a bit & refresh chart
    setTimeout(() => {
      loadingCont.classList.add("hidden");
      refreshChart();
      uploadBtn.disabled = false;
      fileInput.value = "";
      loadingBar.style.width = "0%";
    }, 3000);

  } catch (err) {
    console.error(err);
    uploadMsg.textContent = "Upload failed.";
    loadingCont.classList.add("hidden");
    uploadBtn.disabled = false;
  }
});

// Function to create radar chart configuration (clean, no data labels)
function createRadarChart(data) {
  return {
    type: "radar",
    data: {
      labels: ["Food", "Clothes", "Travel", "Medical"],
      datasets: [{
        label: "Amount (₹)",
        data: [data.Food || 0, data.Clothes || 0, data.Travel || 0, data.Medical || 0],
        fill: true,
        backgroundColor: "rgba(224,122,95,0.15)",
        borderColor: "#e07a5f",
        pointBackgroundColor: "#e07a5f",
        pointBorderColor: "#fff",
        pointRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 50000,
          ticks: {
            stepSize: 10000,
            backdropColor: "transparent",
            color: "#bbb",
            callback: value => value.toLocaleString()
          },
          angleLines: { color: "#333" },
          grid: { color: "#444" },
          pointLabels: { 
            color: "#fff", 
            font: { size: 14, weight: 'bold' }
          }
        }
      },
      plugins: {
        legend: { 
          labels: { color: "#fff" },
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.r || 0;
              return `${context.label}: ₹${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  };
}

// pie chart with data labels
function createPieChart(data) {
  const categories = ["Food", "Clothes", "Travel", "Medical"];
  const amounts = categories.map(cat => data[cat] || 0);
  const colors = ['#e74c3c', '#f39c12', '#236693ff', '#2ecc71'];
  const total = amounts.reduce((sum, val) => sum + val, 0);
  
  return {
    type: 'pie',
    data: {
      labels: categories,
      datasets: [{
        data: amounts,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#fff',
            font: { size: 12 },
            padding: 20,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ₹${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    },
    plugins: [{
      // labels for pie chart
      afterDatasetsDraw: function(chart) {
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        
        meta.data.forEach((arc, index) => {
          const value = dataset.data[index];
          if (value > 0) {
            // Calculate percentage
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            
            // Get the center point of the arc
            const centerPoint = arc.tooltipPosition();
            
            // Style the text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Create the label text
            const amountText = `₹${value.toLocaleString()}`;
            const percentText = `${percentage}%`;
            
            //label bg
            const maxTextWidth = Math.max(
              ctx.measureText(amountText).width,
              ctx.measureText(percentText).width
            );
            const padding = 4;

            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(
              centerPoint.x - (maxTextWidth/2 + padding), 
              centerPoint.y - 15, 
              maxTextWidth + (padding * 2), 
              30
            );
            
            // Amount text
            ctx.fillStyle = '#fff';
            ctx.fillText(amountText, centerPoint.x, centerPoint.y - 5);
            
            // Percentage text
            ctx.font = 'bold 10px Inter';
            ctx.fillStyle = '#ccc';
            ctx.fillText(percentText, centerPoint.x, centerPoint.y + 8);
          }
        });
      }
    }]
  };
}

function switchChart(type) {
  currentChartType = type;
  
  // Update button states
  document.getElementById('radarBtn').classList.toggle('active', type === 'radar');
  document.getElementById('pieBtn').classList.toggle('active', type === 'pie');
  
  // Destroy existing chart
  if (currentChart) {
    currentChart.destroy();
  }
  
  // Create new chart based on type
  const ctx = document.getElementById("expenseChart");
  const config = type === 'radar' ? createRadarChart(chartData) : createPieChart(chartData);
  currentChart = new Chart(ctx, config);
}

// Fetch and update chart data
async function refreshChart() {
  try {
    const totals = await fetch(SUMMARY_URL).then(r => r.json());
    console.log('Chart data:', totals);
    
    // Update stored chart data
    chartData = {
      Food: totals.Food || 0,
      Clothes: totals.Clothes || 0,
      Travel: totals.Travel || 0,
      Medical: totals.Medical || 0
    };
    
    // Recreate current chart with new data
    switchChart(currentChartType);
    
  } catch (err) {
    console.error('Error fetching chart data:', err);
  }
}

// Initialize chart on page load
refreshChart();

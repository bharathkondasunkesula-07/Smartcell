/**
 * SmartCell — Real-time & Analytical Charting System
 * Renders real-time rolling charts for Voltage (Voc/Vload), Current (A/mA),
 * and Battery Temperature (°C) using Chart.js with an offline canvas fallback.
 */

export class ChartManager {
  constructor(options = {}) {
    this.maxPoints = options.maxPoints || 60;
    this.voltageChart = null;
    this.currentChart = null;
    this.tempChart = null;

    // Time-series ring buffers
    this.labels = [];
    this.voltageData = [];
    this.currentData = [];
    this.tempData = [];

    // DOM Canvas elements
    this.voltageCanvas = document.getElementById('voltageChartCanvas');
    this.currentCanvas = document.getElementById('currentChartCanvas');
    this.tempCanvas = document.getElementById('tempChartCanvas');

    this.hasChartJs = typeof Chart !== 'undefined';
    this.initCharts();
  }

  setMaxPoints(pts) {
    this.maxPoints = Math.max(20, Math.min(300, Number(pts) || 60));
    this.trimBuffers();
    this.update();
  }

  initCharts() {
    if (this.hasChartJs) {
      this.initChartJs();
    } else {
      this.initFallback();
    }
  }

  initChartJs() {
    const commonScales = {
      x: {
        grid: { color: 'rgba(237, 233, 254, 0.6)' },
        ticks: { font: { size: 10 }, color: '#7c3aed', maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(237, 233, 254, 0.6)' },
        ticks: { font: { size: 10 }, color: '#64748b' }
      }
    };

    // 1. Voltage Chart
    if (this.voltageCanvas) {
      const ctxV = this.voltageCanvas.getContext('2d');
      this.voltageChart = new Chart(ctxV, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'Voltage (V)',
            data: this.voltageData,
            borderColor: '#7c3aed', // Purple primary
            backgroundColor: 'rgba(124, 58, 237, 0.08)',
            borderWidth: 2.2,
            tension: 0.25,
            fill: true,
            pointRadius: 1.5,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          scales: commonScales,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Voltage: ${ctx.parsed.y.toFixed(3)} V`
              }
            }
          }
        }
      });
    }

    // 2. Current Chart
    if (this.currentCanvas) {
      const ctxI = this.currentCanvas.getContext('2d');
      this.currentChart = new Chart(ctxI, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'Current (mA)',
            data: this.currentData,
            borderColor: '#059669', // Mint green
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            borderWidth: 2,
            tension: 0.2,
            fill: true,
            pointRadius: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          scales: commonScales,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Current: ${ctx.parsed.y.toFixed(1)} mA (${(ctx.parsed.y / 1000).toFixed(3)} A)`
              }
            }
          }
        }
      });
    }

    // 3. Temperature Chart
    if (this.tempCanvas) {
      const ctxT = this.tempCanvas.getContext('2d');
      this.tempChart = new Chart(ctxT, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'Temperature (°C)',
            data: this.tempData,
            borderColor: '#d97706', // Amber
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          scales: commonScales,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Temp: ${ctx.parsed.y.toFixed(1)} °C`
              }
            }
          }
        }
      });
    }
  }

  addReading(timeStr, voltage, current_mA, temperature_C) {
    this.labels.push(timeStr);
    this.voltageData.push(Number.isFinite(voltage) ? Number(voltage) : null);
    this.currentData.push(Number.isFinite(current_mA) ? Number(current_mA) : 0);
    this.tempData.push(Number.isFinite(temperature_C) ? Number(temperature_C) : null);

    this.trimBuffers();
    this.update();
  }

  trimBuffers() {
    while (this.labels.length > this.maxPoints) {
      this.labels.shift();
      this.voltageData.shift();
      this.currentData.shift();
      this.tempData.shift();
    }
  }

  update() {
    if (this.hasChartJs) {
      if (this.voltageChart) this.voltageChart.update();
      if (this.currentChart) this.currentChart.update();
      if (this.tempChart) this.tempChart.update();
    } else {
      this.renderFallback();
    }
  }

  clear() {
    this.labels.length = 0;
    this.voltageData.length = 0;
    this.currentData.length = 0;
    this.tempData.length = 0;
    this.update();
  }

  // --- Offline Fallback Canvas Renderer ---
  initFallback() {
    this.renderFallback();
  }

  renderFallback() {
    this.drawFallbackPlot(this.voltageCanvas, this.voltageData, 'Voltage (V)', '#7c3aed', 'V');
    this.drawFallbackPlot(this.currentCanvas, this.currentData, 'Current (mA)', '#059669', 'mA');
    this.drawFallbackPlot(this.tempCanvas, this.tempData, 'Temperature (°C)', '#d97706', '°C');
  }

  drawFallbackPlot(canvas, values, title, color, unit) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth || 300;
    const h = canvas.height = canvas.parentElement.clientHeight || 180;

    ctx.clearRect(0, 0, 0, w, h);
    ctx.fillStyle = '#faf8ff';
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = '#e9e5f5';
    ctx.strokeRect(0, 0, w, h);

    const validVals = values.filter(v => v != null && !isNaN(v));
    if (validVals.length < 2) {
      ctx.fillStyle = '#8b5cf6';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Awaiting telemetry for ${title}...`, w / 2, h / 2);
      return;
    }

    const min = Math.min(...validVals);
    const max = Math.max(...validVals);
    const span = (max - min) || 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const pad = 24;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = (h - pad) - ((v - min) / span) * (h - 2 * pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#4c1d95';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${title}: ${validVals[validVals.length - 1].toFixed(2)} ${unit}`, 10, 16);
  }
}

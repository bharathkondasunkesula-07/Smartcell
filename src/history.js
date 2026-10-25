/**
 * SmartCell — Test History Persistence & Export Subsystem
 * Persists verified test runs to localStorage, supports searching/filtering,
 * detailed record inspection, and RFC 4180 CSV export.
 */

const STORAGE_KEY = 'smartcell_test_history_v2';

export class TestHistoryManager {
  constructor() {
    this.tests = this.loadTests();
  }

  loadTests() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load test history from localStorage:', e);
      return [];
    }
  }

  saveTests() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tests));
    } catch (e) {
      console.error('Failed to save test history to localStorage:', e);
    }
  }

  /**
   * Adds a new completed test record.
   * Rejects incomplete or fake measurements.
   */
  addTestRecord(record) {
    if (!record || !record.timestamp) {
      console.warn('Attempted to record invalid test.');
      return null;
    }

    const testItem = {
      id: 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: record.timestamp || new Date().toISOString(),
      dateFormatted: new Date().toLocaleString(),
      chemistryId: record.chemistryId || 'liion',
      chemistryName: record.chemistryName || '18650 Lithium-Ion',
      voc_V: record.voc_V != null ? Number(record.voc_V.toFixed(3)) : null,
      vload_V: record.vload_V != null ? Number(record.vload_V.toFixed(3)) : null,
      current_A: record.current_A != null ? Number(record.current_A.toFixed(3)) : null,
      current_mA: record.current_mA != null ? Number(record.current_mA.toFixed(1)) : null,
      temperature_C: record.temperature_C != null ? Number(record.temperature_C.toFixed(1)) : null,
      sag_V: record.sag_V != null ? Number(record.sag_V.toFixed(3)) : null,
      sag_pct: record.sag_pct != null ? Number(record.sag_pct.toFixed(2)) : null,
      rint_mohm: record.rint_mohm != null ? Number(record.rint_mohm.toFixed(1)) : null,
      assessment: record.assessment || 'NOT TESTED',
      assessmentSummary: record.assessmentSummary || '',
      assessmentReason: record.assessmentReason || '',
      sensorErrors: record.sensorErrors || [],
      loadDuration_s: record.loadDuration_s || 3.0
    };

    this.tests.unshift(testItem); // Newest first
    this.saveTests();
    return testItem;
  }

  getTests(filter = {}) {
    let result = [...this.tests];

    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      result = result.filter(t =>
        t.chemistryName.toLowerCase().includes(q) ||
        t.assessment.toLowerCase().includes(q) ||
        t.dateFormatted.toLowerCase().includes(q) ||
        (t.id && t.id.toLowerCase().includes(q))
      );
    }

    if (filter.chemistry && filter.chemistry !== 'all') {
      result = result.filter(t => t.chemistryId === filter.chemistry);
    }

    if (filter.assessment && filter.assessment !== 'all') {
      result = result.filter(t => t.assessment === filter.assessment);
    }

    return result;
  }

  getTestById(id) {
    return this.tests.find(t => t.id === id) || null;
  }

  deleteTest(id) {
    const idx = this.tests.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.tests.splice(idx, 1);
      this.saveTests();
      return true;
    }
    return false;
  }

  clearAll() {
    this.tests = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
  }

  /**
   * Generates and downloads RFC 4180 CSV export with UTF-8 BOM.
   */
  exportToCSV() {
    if (this.tests.length === 0) {
      alert('No test history available to export.');
      return;
    }

    const headers = [
      'Test ID',
      'Date & Time',
      'Battery Chemistry',
      'Open-Circuit Voltage (Voc V)',
      'Loaded Voltage (Vload V)',
      'Test Current (A)',
      'Current (mA)',
      'Temperature (C)',
      'Voltage Sag (V)',
      'Voltage Sag (%)',
      'Internal Resistance (mOhm)',
      'Health Assessment',
      'Assessment Summary',
      'Assessment Reasons',
      'Sensor Errors'
    ];

    const rows = this.tests.map(t => [
      `"${t.id}"`,
      `"${t.timestamp}"`,
      `"${t.chemistryName}"`,
      t.voc_V ?? '',
      t.vload_V ?? '',
      t.current_A ?? '',
      t.current_mA ?? '',
      t.temperature_C ?? '',
      t.sag_V ?? '',
      t.sag_pct ?? '',
      t.rint_mohm ?? '',
      `"${t.assessment}"`,
      `"${(t.assessmentSummary || '').replace(/"/g, '""')}"`,
      `"${(t.assessmentReason || '').replace(/"/g, '""')}"`,
      `"${(t.sensorErrors || []).join('; ').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `smartcell_tests_${new Date().toISOString().slice(0, 10)}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates and downloads structured JSON export.
   */
  exportToJSON() {
    if (this.tests.length === 0) {
      alert('No test history available to export.');
      return;
    }

    const payload = {
      application: 'SmartCell — Smart Battery Screening and Monitoring System',
      version: '2.1.0',
      exportedAt: new Date().toISOString(),
      totalRecords: this.tests.length,
      records: this.tests
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `smartcell_tests_${new Date().toISOString().slice(0, 10)}.json`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Exports an individual test record to CSV.
   */
  exportSingleTestToCSV(testId) {
    const t = this.getTestById(testId);
    if (!t) {
      alert('Test record not found.');
      return;
    }

    const headers = [
      'Test ID',
      'Date & Time',
      'Battery Chemistry',
      'Open-Circuit Voltage (Voc V)',
      'Loaded Voltage (Vload V)',
      'Test Current (A)',
      'Current (mA)',
      'Temperature (C)',
      'Voltage Sag (V)',
      'Voltage Sag (%)',
      'Internal Resistance (mOhm)',
      'Health Assessment',
      'Assessment Summary',
      'Assessment Reasons',
      'Sensor Errors'
    ];

    const row = [
      `"${t.id}"`,
      `"${t.timestamp}"`,
      `"${t.chemistryName}"`,
      t.voc_V ?? '',
      t.vload_V ?? '',
      t.current_A ?? '',
      t.current_mA ?? '',
      t.temperature_C ?? '',
      t.sag_V ?? '',
      t.sag_pct ?? '',
      t.rint_mohm ?? '',
      `"${t.assessment}"`,
      `"${(t.assessmentSummary || '').replace(/"/g, '""')}"`,
      `"${(t.assessmentReason || '').replace(/"/g, '""')}"`,
      `"${(t.sensorErrors || []).join('; ').replace(/"/g, '""')}"`
    ];

    const csvContent = '\uFEFF' + [headers.join(','), row.join(',')].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `smartcell_test_${t.id}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Exports an individual test record to JSON.
   */
  exportSingleTestToJSON(testId) {
    const t = this.getTestById(testId);
    if (!t) {
      alert('Test record not found.');
      return;
    }

    const payload = {
      application: 'SmartCell — Smart Battery Screening and Monitoring System',
      version: '2.1.0',
      exportedAt: new Date().toISOString(),
      record: t
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `smartcell_test_${t.id}.json`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Opens a formal printable / PDF laboratory certificate for a single test.
   */
  printSingleTestCertificate(testId) {
    const t = this.getTestById(testId);
    if (!t) {
      alert('Test record not found.');
      return;
    }

    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) {
      alert('Popup blocker prevented opening the print report. Please allow popups for localhost.');
      return;
    }

    const statusColor = t.assessment === 'GOOD' ? '#059669' : t.assessment === 'WARNING' ? '#d97706' : '#e11d48';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SmartCell Battery Screening Certificate - ${t.id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 2rem; color: #1e1b4b; background: #fff; line-height: 1.5; }
          .header { border-bottom: 2px solid #7c3aed; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 1.5rem; font-weight: bold; color: #4c1d95; }
          .subtitle { font-size: 0.85rem; color: #64748b; }
          .badge { display: inline-block; padding: 0.35rem 0.85rem; font-weight: bold; border-radius: 9999px; color: #fff; background: ${statusColor}; font-size: 0.9rem; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }
          .cell { background: #f8f6ff; border: 1px solid #e9e5f5; border-radius: 8px; padding: 0.85rem 1rem; }
          .cell-label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .cell-val { font-size: 1.2rem; font-weight: bold; color: #1e1b4b; margin-top: 0.2rem; font-family: monospace; }
          .summary-box { background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 1rem; border-radius: 0 8px 8px 0; margin-top: 1rem; font-size: 0.9rem; }
          .footer { margin-top: 2rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button onclick="window.print()" style="padding: 0.5rem 1.25rem; background: #7c3aed; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
          <button onclick="window.close()" style="padding: 0.5rem 1rem; background: #e2e8f0; color: #1e293b; border: none; border-radius: 6px; cursor: pointer;">Close</button>
        </div>
        <div class="header">
          <div>
            <div class="title">⚡ SmartCell Battery Screening Report</div>
            <div class="subtitle">Arduino Uno & INA219 Laboratory Testing System</div>
          </div>
          <div>
            <span class="badge">${t.assessment}</span>
          </div>
        </div>
        <div>
          <p><strong>Test Record ID:</strong> <code>${t.id}</code></p>
          <p><strong>Screening Timestamp:</strong> ${new Date(t.timestamp).toLocaleString()}</p>
          <p><strong>Cell Chemistry:</strong> ${t.chemistryName}</p>
        </div>
        <div class="grid">
          <div class="cell"><div class="cell-label">Open-Circuit Voltage (Voc)</div><div class="cell-val">${t.voc_V != null ? t.voc_V.toFixed(3) + ' V' : '--'}</div></div>
          <div class="cell"><div class="cell-label">Under-Load Voltage (Vload)</div><div class="cell-val">${t.vload_V != null ? t.vload_V.toFixed(3) + ' V' : '--'}</div></div>
          <div class="cell"><div class="cell-label">Test Current</div><div class="cell-val">${t.current_A != null ? t.current_A.toFixed(3) + ' A' : '--'}</div></div>
          <div class="cell"><div class="cell-label">Cell Temperature</div><div class="cell-val">${t.temperature_C != null ? t.temperature_C.toFixed(1) + ' °C' : '--'}</div></div>
          <div class="cell"><div class="cell-label">Voltage Sag</div><div class="cell-val">${t.sag_V != null ? t.sag_V.toFixed(3) + ' V (' + (t.sag_pct != null ? t.sag_pct.toFixed(1) : '') + '%)' : '--'}</div></div>
          <div class="cell"><div class="cell-label">DC Internal Resistance (Rint)</div><div class="cell-val">${t.rint_mohm != null ? t.rint_mohm.toFixed(0) + ' mΩ' : '--'}</div></div>
        </div>
        <div class="summary-box">
          <strong>Screening Assessment:</strong><br />
          ${t.assessmentReason || t.assessmentSummary || 'Standard 3-second controlled load profile applied.'}
        </div>
        <div class="footer">
          SmartCell Educational Screening Prototype &bull; Document Generated: ${new Date().toLocaleString()} &bull; Not a Certified Commercial Analyzer
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  /**
   * Opens a formal printable / PDF laboratory summary report for all filtered tests.
   */
  printSummaryReport(filter = {}) {
    const list = this.getTests(filter);
    if (list.length === 0) {
      alert('No test records match the current filter to generate a report.');
      return;
    }

    const printWin = window.open('', '_blank', 'width=900,height=950');
    if (!printWin) {
      alert('Popup blocker prevented opening the print report. Please allow popups for localhost.');
      return;
    }

    const goodCount = list.filter(t => t.assessment === 'GOOD').length;
    const warnCount = list.filter(t => t.assessment === 'WARNING').length;
    const critCount = list.filter(t => t.assessment === 'CRITICAL').length;
    const rintVals = list.map(t => t.rint_mohm).filter(r => r != null && Number.isFinite(r));
    const avgRint = rintVals.length > 0 ? (rintVals.reduce((a, b) => a + b, 0) / rintVals.length).toFixed(0) : '--';

    const rowsHtml = list.map(t => `
      <tr>
        <td>${new Date(t.timestamp).toLocaleDateString()} ${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td><strong>${t.chemistryName}</strong></td>
        <td>${t.voc_V != null ? t.voc_V.toFixed(3) : '--'}</td>
        <td>${t.vload_V != null ? t.vload_V.toFixed(3) : '--'}</td>
        <td>${t.current_A != null ? t.current_A.toFixed(3) : '--'}</td>
        <td>${t.temperature_C != null ? t.temperature_C.toFixed(1) + ' °C' : '--'}</td>
        <td>${t.sag_pct != null ? t.sag_pct.toFixed(1) + '%' : '--'}</td>
        <td><strong>${t.rint_mohm != null ? t.rint_mohm.toFixed(0) + ' mΩ' : '--'}</strong></td>
        <td><span style="font-weight: bold; color: ${t.assessment === 'GOOD' ? '#059669' : t.assessment === 'WARNING' ? '#d97706' : '#e11d48'};">${t.assessment}</span></td>
      </tr>
    `).join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SmartCell Battery Laboratory Screening Summary</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 2rem; color: #1e1b4b; background: #fff; line-height: 1.4; font-size: 0.85rem; }
          .header { border-bottom: 2px solid #7c3aed; padding-bottom: 0.75rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 1.4rem; font-weight: bold; color: #4c1d95; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
          .metric-card { background: #f8f6ff; border: 1px solid #e9e5f5; border-radius: 6px; padding: 0.75rem; text-align: center; }
          .metric-label { font-size: 0.7rem; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .metric-val { font-size: 1.25rem; font-weight: bold; margin-top: 0.2rem; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.6rem; text-align: left; }
          th { background-color: #f1edfd; color: #4c1d95; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; }
          tr:nth-child(even) { background-color: #fcfbfe; }
          .footer { margin-top: 2rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 1.5rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button onclick="window.print()" style="padding: 0.5rem 1.25rem; background: #7c3aed; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
          <button onclick="window.close()" style="padding: 0.5rem 1rem; background: #e2e8f0; color: #1e293b; border: none; border-radius: 6px; cursor: pointer;">Close</button>
        </div>
        <div class="header">
          <div>
            <div class="title">⚡ SmartCell Battery Laboratory Screening Summary</div>
            <div style="font-size: 0.8rem; color: #64748b;">Generated on ${new Date().toLocaleString()} &bull; Total Tests: ${list.length}</div>
          </div>
        </div>
        <div class="metrics">
          <div class="metric-card"><div class="metric-label">Total Screened</div><div class="metric-val" style="color: #4c1d95;">${list.length}</div></div>
          <div class="metric-card"><div class="metric-label">GOOD Status</div><div class="metric-val" style="color: #059669;">${goodCount}</div></div>
          <div class="metric-card"><div class="metric-label">WARNING / CRITICAL</div><div class="metric-val" style="color: #d97706;">${warnCount} / ${critCount}</div></div>
          <div class="metric-card"><div class="metric-label">Avg Internal Resistance</div><div class="metric-val" style="color: #7c3aed;">${avgRint} mΩ</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Chemistry</th>
              <th>Voc (V)</th>
              <th>Vload (V)</th>
              <th>Current (A)</th>
              <th>Temp</th>
              <th>Sag (%)</th>
              <th>Rint (mΩ)</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          SmartCell Battery Screening Prototype &bull; Automated Laboratory Summary &bull; Confidential Lab Records
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  }
}

// ============================================================
// NY Lease Generator - Client-Side Logic
// ============================================================

// --- Monthly Rent Auto-Calculate Annual Rent ---
const monthlyRentInput = document.getElementById('monthlyRent');
const annualRentInput = document.getElementById('annualRent');

monthlyRentInput.addEventListener('input', () => {
  const raw = monthlyRentInput.value.replace(/[^0-9.]/g, '');
  const monthly = parseFloat(raw);
  if (!isNaN(monthly) && monthly > 0) {
    const annual = monthly * 12;
    annualRentInput.value = '$' + annual.toLocaleString('en-US', { minimumFractionDigits: 0 });
  } else {
    annualRentInput.value = '';
  }
});

// --- Amendment Add / Remove / Renumber ---
function renumberAmendments() {
  const container = document.getElementById('amendments-container');
  const rows = container.querySelectorAll('.amendment-row');
  rows.forEach((row, i) => {
    row.querySelector('.amendment-num').textContent = (i + 1) + '.';
  });
}

function removeAmendment(btn) {
  const row = btn.closest('.amendment-row');
  row.remove();
  renumberAmendments();
}

function addAmendment() {
  const container = document.getElementById('amendments-container');
  const count = container.querySelectorAll('.amendment-row').length + 1;
  const row = document.createElement('div');
  row.className = 'amendment-row';
  row.innerHTML = `
    <span class="amendment-num">${count}.</span>
    <textarea class="amendment-text" rows="2" placeholder="Enter amendment text..."></textarea>
    <button type="button" class="btn-remove-amendment" onclick="removeAmendment(this)">&times;</button>
  `;
  container.appendChild(row);
}

// --- Collect All Form Data ---
function collectFormData() {
  // Gather all amendment texts
  const amendmentTextareas = document.querySelectorAll('#amendments-container .amendment-text');
  const amendments = [];
  amendmentTextareas.forEach(ta => {
    if (ta.value.trim()) {
      amendments.push(ta.value.trim());
    }
  });

  // Gather strikethrough selections
  const strikethroughs = [];
  document.querySelectorAll('input[name="strikethrough"]:checked').forEach(cb => {
    strikethroughs.push(cb.value);
  });

  // Get date values - use dateOfLease as the sign date for all parties
  const dateOfLease = document.getElementById('dateOfLease').value;

  return {
    // Property
    premises: document.getElementById('premises').value,
    unit: document.getElementById('unit').value,
    leaseTerm: document.getElementById('leaseTerm').value,

    // Parties
    landlord1: document.getElementById('landlord1').value,
    landlord2: document.getElementById('landlord2').value,
    landlordAddress: document.getElementById('landlordAddress').value,
    tenant1: document.getElementById('tenant1').value,
    tenant2: document.getElementById('tenant2').value,
    tenantAddress: document.getElementById('tenantAddress').value,

    // Dates & Financials
    dateOfLease: dateOfLease,
    commencementDate: document.getElementById('commencementDate').value,
    terminationDate: document.getElementById('terminationDate').value,
    monthlyRent: document.getElementById('monthlyRent').value,
    annualRent: document.getElementById('annualRent').value,
    securityDeposit: document.getElementById('securityDeposit').value,

    // Broker
    brokerName: document.getElementById('brokerName').value,
    agentName: document.getElementById('agentName').value,

    // Signature dates (same as lease date)
    signDate1: dateOfLease,
    signDate2: dateOfLease,
    signDate3: dateOfLease,
    signDate4: dateOfLease,

    // Strikethroughs
    strikethroughs: strikethroughs,
    flatten: true,

    // Addendum
    addendumDate: document.getElementById('addendumDate').value || dateOfLease,
    amendments: amendments,

    // For the addendum endpoint (uses slightly different field names)
    landlordName: document.getElementById('landlord1').value,
    tenantName: document.getElementById('tenant1').value,
    propertyAddress: document.getElementById('premises').value + (document.getElementById('unit').value ? ', ' + document.getElementById('unit').value : ''),
    leaseDate: dateOfLease,
  };
}

// --- Validation ---
function validateForm() {
  const required = ['premises', 'landlord1', 'tenant1', 'commencementDate', 'terminationDate', 'monthlyRent'];
  const missing = [];
  for (const id of required) {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      missing.push(el.previousElementSibling?.textContent || id);
      el.style.borderColor = '#d63031';
    } else {
      el.style.borderColor = '';
    }
  }
  if (missing.length > 0) {
    alert('Please fill in required fields:\n\n' + missing.join('\n'));
    return false;
  }
  return true;
}

// --- Download Helper ---
async function downloadPdf(url, data, fallbackName) {
  // Disable all generate buttons
  const buttons = document.querySelectorAll('.btn-generate');
  buttons.forEach(b => { b.disabled = true; b.dataset.origText = b.textContent; b.textContent = 'Generating...'; });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to generate PDF');
    }

    // Get filename from Content-Disposition header if available
    const disposition = response.headers.get('Content-Disposition');
    let filename = fallbackName;
    if (disposition) {
      const match = disposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }

    // Download the PDF blob
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    alert('Error: ' + error.message);
    console.error(error);
  } finally {
    // Re-enable buttons
    buttons.forEach(b => { b.disabled = false; b.textContent = b.dataset.origText; });
  }
}

// --- Generate Functions ---
function generateLease() {
  if (!validateForm()) return;
  const data = collectFormData();
  const name = (data.tenant1 || 'tenant').replace(/\s+/g, '_');
  downloadPdf('/api/generate-lease', data, `Lease_${name}.pdf`);
}

function generateAddendum() {
  if (!validateForm()) return;
  const data = collectFormData();
  const name = (data.tenant1 || 'tenant').replace(/\s+/g, '_');
  downloadPdf('/api/generate-addendum', data, `Addendum_${name}.pdf`);
}

function generateBoth() {
  if (!validateForm()) return;
  const data = collectFormData();
  const name = (data.tenant1 || 'tenant').replace(/\s+/g, '_');
  downloadPdf('/api/generate-both', data, `Lease_and_Addendum_${name}.pdf`);
}

// --- Auto-fill security deposit from monthly rent ---
monthlyRentInput.addEventListener('change', () => {
  const deposit = document.getElementById('securityDeposit');
  if (!deposit.value) {
    deposit.value = monthlyRentInput.value;
  }
});

// --- Initialize: set today's date as default ---
(function init() {
  const today = new Date();
  const dateStr = (today.getMonth() + 1) + '/' + today.getDate() + '/' + today.getFullYear();
  const dateOfLease = document.getElementById('dateOfLease');
  if (!dateOfLease.value) {
    dateOfLease.value = dateStr;
  }
})();

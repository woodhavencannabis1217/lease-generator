const express = require('express');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LEASE_TEMPLATE = path.join(__dirname, 'templates', 'lease-template.pdf');

// ============================================================
// GENERATE FILLED LEASE PDF
// ============================================================
app.post('/api/generate-lease', async (req, res) => {
  try {
    const data = req.body;

    // Load the blank template
    const templateBytes = fs.readFileSync(LEASE_TEMPLATE);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill in lease header fields
    const fieldMap = {
      'PREMISES': data.premises || '',
      'UNIT': data.unit || '',
      'LANDLORD 1': data.landlord1 || '',
      'LANDLORD 2': data.landlord2 || '',
      'TENANT 1': data.tenant1 || '',
      'TENANT 2': data.tenant2 || '',
      'Date of Lease': data.dateOfLease || '',
      'Annual Rent': data.annualRent || '',
      'Lease Term': data.leaseTerm || '',
      'Monthly Rent': data.monthlyRent || '',
      'Commencement Date': data.commencementDate || '',
      'Security Deposit': data.securityDeposit || '',
      'Termination Date': data.terminationDate || '',
      'Tenant states that': data.brokerName || '',
      // Signature page - Landlord
      'Date': data.signDate1 || '',
      'Print Name': data.landlord1 || '',
      // Signature page - Tenant 1
      'Date_2': data.signDate2 || '',
      'Print Name_2': data.tenant1 || '',
      // Signature page - Tenant 2
      'Date_3': data.signDate3 || '',
      'Print Name_3': data.tenant2 || '',
      // Signature page - Agent
      'Print Name_4': data.agentName || '',
      'Date_4': data.signDate4 || '',
    };

    for (const [fieldName, value] of Object.entries(fieldMap)) {
      try {
        const field = form.getTextField(fieldName);
        if (field && value) {
          field.setText(value);
        }
      } catch (e) {
        // Field not found, skip
      }
    }

    // Add strikethrough lines for selected paragraphs
    if (data.strikethroughs && data.strikethroughs.length > 0) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      // Strikethrough coordinates mapping - these are approximate y-ranges on each page
      // Based on the standard NY apartment lease template layout
      const strikethroughMap = {
        // Page 1 (index 0)
        'p1_spouse': { page: 0, lines: [{ y: 267, x1: 245, x2: 420 }] }, // "and Tenant's spouse and children"
        'p3_additional_rent': { page: 0, lines: [
          { y: 165, x1: 72, x2: 540 },
          { y: 155, x1: 72, x2: 540 },
          { y: 145, x1: 72, x2: 540 },
          { y: 135, x1: 72, x2: 540 },
          { y: 125, x1: 72, x2: 540 },
          { y: 115, x1: 72, x2: 540 },
        ]},
        // Page 2 (index 1)
        'p6_utilities': { page: 1, lines: [
          { y: 622, x1: 72, x2: 540 },
          { y: 612, x1: 72, x2: 540 },
          { y: 602, x1: 72, x2: 540 },
        ]},
        'p6_appliances': { page: 1, lines: [
          { y: 570, x1: 72, x2: 540 },
          { y: 560, x1: 72, x2: 540 },
        ]},
        'p10_pets': { page: 1, lines: [{ y: 388, x1: 165, x2: 200 }] }, // strike "(shall)"
        // Page 3 (index 2)
        'p21c_floorcovering': { page: 2, lines: [
          { y: 538, x1: 72, x2: 540 },
          { y: 528, x1: 72, x2: 540 },
        ]},
        'p21i_elevator': { page: 2, lines: [
          { y: 418, x1: 72, x2: 540 },
          { y: 408, x1: 72, x2: 540 },
        ]},
        'p21l_laundry': { page: 2, lines: [
          { y: 368, x1: 72, x2: 540 },
          { y: 358, x1: 72, x2: 540 },
        ]},
        'p21m_windows': { page: 2, lines: [
          { y: 338, x1: 72, x2: 540 },
          { y: 328, x1: 72, x2: 540 },
        ]},
        'p21n_parking': { page: 2, lines: [
          { y: 308, x1: 72, x2: 540 },
          { y: 298, x1: 72, x2: 540 },
        ]},
      };

      for (const key of data.strikethroughs) {
        const info = strikethroughMap[key];
        if (info) {
          const page = pages[info.page];
          for (const line of info.lines) {
            page.drawLine({
              start: { x: line.x1, y: line.y },
              end: { x: line.x2, y: line.y },
              thickness: 1,
              color: rgb(1, 0, 0), // red strikethrough
            });
          }
        }
      }
    }

    // Flatten form (optional - makes fields non-editable)
    if (data.flatten) {
      form.flatten();
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lease_${(data.tenant1 || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Lease generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GENERATE ADDENDUM PDF
// ============================================================
app.post('/api/generate-addendum', async (req, res) => {
  try {
    const data = req.body;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    const margin = 72;
    const lineHeight = 16;
    let y = height - margin;

    function drawText(text, options = {}) {
      const f = options.bold ? fontBold : font;
      const size = options.size || 12;
      const x = options.x || margin;
      page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
      y -= options.spacing || lineHeight;
    }

    function drawWrappedText(text, options = {}) {
      const f = options.bold ? fontBold : font;
      const size = options.size || 12;
      const maxWidth = options.maxWidth || (width - margin * 2);
      const words = text.split(' ');
      let line = '';

      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        const testWidth = f.widthOfTextAtSize(testLine, size);
        if (testWidth > maxWidth && line) {
          page.drawText(line, { x: options.x || margin, y, size, font: f, color: rgb(0, 0, 0) });
          y -= lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x: options.x || margin, y, size, font: f, color: rgb(0, 0, 0) });
        y -= options.spacing || lineHeight;
      }
    }

    // Title
    drawText('LEASE ADDENDUM', { bold: true, size: 16, x: width / 2 - fontBold.widthOfTextAtSize('LEASE ADDENDUM', 16) / 2, spacing: 24 });

    // Header info
    drawWrappedText(`This addendum, made on ${data.addendumDate || '___________'}, is between:`);
    y -= 8;
    drawWrappedText(`Landlord: ${data.landlordName || '___________'}, ${data.landlordAddress || '___________'}`);
    y -= 4;
    drawWrappedText(`Tenant: ${data.tenantName || '___________'}, ${data.tenantAddress || '___________'}`);
    y -= 8;
    drawWrappedText(`This addendum is added to the lease agreement dated ${data.leaseDate || '___________'} for the property located at:`);
    y -= 4;
    drawText(`${data.propertyAddress || '___________'}`, { bold: true });
    y -= 12;

    drawWrappedText('The following amendments are hereby made to the above-referenced lease agreement:');
    y -= 12;

    // Amendments
    const amendments = data.amendments || [];
    amendments.forEach((text, i) => {
      if (text.trim()) {
        drawWrappedText(`${i + 1}. ${text}`, { spacing: lineHeight + 4 });
        y -= 4;
      }
    });

    y -= 16;
    drawWrappedText('All other terms and conditions of the original lease agreement remain in full force and effect. In the event of any conflict between this addendum and the original lease, the terms of this addendum shall prevail.');
    y -= 20;
    drawWrappedText('Both parties acknowledge that they have read and understood this addendum and agree to its terms.');

    // Signature blocks
    y -= 40;
    const sigWidth = 200;

    // Landlord signature
    drawText('Landlord:', { bold: true });
    y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText('Signature', { size: 9 });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText(`Print Name: ${data.landlordName || ''}`, { size: 10 });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText('Date', { size: 9 });

    // Tenant signature
    y -= 24;
    drawText('Tenant:', { bold: true });
    y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText('Signature', { size: 9 });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText(`Print Name: ${data.tenantName || ''}`, { size: 10 });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigWidth, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14;
    drawText('Date', { size: 9 });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Addendum_${(data.tenantName || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Addendum generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GENERATE BOTH (Lease + Addendum combined)
// ============================================================
app.post('/api/generate-both', async (req, res) => {
  try {
    const data = req.body;

    // Generate lease first by calling internal logic
    const templateBytes = fs.readFileSync(LEASE_TEMPLATE);
    const leasePdf = await PDFDocument.load(templateBytes);
    const form = leasePdf.getForm();

    // Fill fields
    const fieldMap = {
      'PREMISES': data.premises || '',
      'UNIT': data.unit || '',
      'LANDLORD 1': data.landlord1 || '',
      'LANDLORD 2': data.landlord2 || '',
      'TENANT 1': data.tenant1 || '',
      'TENANT 2': data.tenant2 || '',
      'Date of Lease': data.dateOfLease || '',
      'Annual Rent': data.annualRent || '',
      'Lease Term': data.leaseTerm || '',
      'Monthly Rent': data.monthlyRent || '',
      'Commencement Date': data.commencementDate || '',
      'Security Deposit': data.securityDeposit || '',
      'Termination Date': data.terminationDate || '',
      'Tenant states that': data.brokerName || '',
      'Date': data.signDate1 || '',
      'Print Name': data.landlord1 || '',
      'Date_2': data.signDate2 || '',
      'Print Name_2': data.tenant1 || '',
      'Date_3': data.signDate3 || '',
      'Print Name_3': data.tenant2 || '',
      'Print Name_4': data.agentName || '',
      'Date_4': data.signDate4 || '',
    };

    for (const [fieldName, value] of Object.entries(fieldMap)) {
      try {
        const field = form.getTextField(fieldName);
        if (field && value) field.setText(value);
      } catch (e) {}
    }

    form.flatten();
    const leaseBytes = await leasePdf.save();

    // Now create addendum
    const addendumPdf = await PDFDocument.create();
    const font = await addendumPdf.embedFont(StandardFonts.TimesRoman);
    const fontBold = await addendumPdf.embedFont(StandardFonts.TimesRomanBold);
    const page = addendumPdf.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 72;
    const lineHeight = 16;
    let y = height - margin;

    function drawText(text, options = {}) {
      const f = options.bold ? fontBold : font;
      const size = options.size || 12;
      page.drawText(text, { x: options.x || margin, y, size, font: f, color: rgb(0, 0, 0) });
      y -= options.spacing || lineHeight;
    }

    function drawWrapped(text, options = {}) {
      const f = options.bold ? fontBold : font;
      const size = options.size || 12;
      const maxWidth = width - margin * 2;
      const words = text.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        if (f.widthOfTextAtSize(testLine, size) > maxWidth && line) {
          page.drawText(line, { x: margin, y, size, font: f, color: rgb(0, 0, 0) });
          y -= lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x: margin, y, size, font: f, color: rgb(0, 0, 0) });
        y -= options.spacing || lineHeight;
      }
    }

    drawText('LEASE ADDENDUM', { bold: true, size: 16, x: width / 2 - fontBold.widthOfTextAtSize('LEASE ADDENDUM', 16) / 2, spacing: 24 });
    drawWrapped(`This addendum, made on ${data.addendumDate || data.dateOfLease || '___'}, is between:`);
    y -= 8;
    drawWrapped(`Landlord: ${data.landlord1 || ''}, ${data.landlordAddress || ''}`);
    y -= 4;
    drawWrapped(`Tenant: ${data.tenant1 || ''}, ${data.tenantAddress || ''}`);
    y -= 8;
    drawWrapped(`This addendum is added to the lease agreement dated ${data.terminationDate || '___'} for the property located at:`);
    y -= 4;
    drawText(`${data.premises || ''} ${data.unit || ''}`, { bold: true });
    y -= 12;
    drawWrapped('The following amendments are hereby made to the above-referenced lease agreement:');
    y -= 12;

    const amendments = data.amendments || [];
    amendments.forEach((text, i) => {
      if (text.trim()) {
        drawWrapped(`${i + 1}. ${text}`, { spacing: lineHeight + 4 });
        y -= 4;
      }
    });

    y -= 16;
    drawWrapped('All other terms and conditions of the original lease agreement remain in full force and effect.');
    y -= 20;

    // Signatures
    y -= 20;
    const sigW = 200;
    drawText('Landlord:', { bold: true }); y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText('Signature', { size: 9 }); y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText(`Print Name: ${data.landlord1 || ''}`, { size: 10 }); y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText('Date', { size: 9 });

    y -= 24;
    drawText('Tenant:', { bold: true }); y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText('Signature', { size: 9 }); y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText(`Print Name: ${data.tenant1 || ''}`, { size: 10 }); y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + sigW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 14; drawText('Date', { size: 9 });

    const addendumBytes = await addendumPdf.save();

    // Merge: load both and combine
    const finalPdf = await PDFDocument.load(leaseBytes);
    const addendumDoc = await PDFDocument.load(addendumBytes);
    const [addendumPage] = await finalPdf.copyPages(addendumDoc, [0]);
    finalPdf.addPage(addendumPage);

    const finalBytes = await finalPdf.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lease_and_Addendum_${(data.tenant1 || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(finalBytes));
  } catch (error) {
    console.error('Combined generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Lease Generator running at http://localhost:${PORT}`);
});

const express = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// PDF RENDERER - handles text layout, wrapping, page breaks
// ============================================================
class PDFRenderer {
  constructor(pdfDoc, font, fontBold, fontItalic) {
    this.pdfDoc = pdfDoc;
    this.font = font;
    this.fontBold = fontBold;
    this.fontItalic = fontItalic || font;
    this.PAGE_W = 612;
    this.PAGE_H = 792;
    this.MARGIN = 72;
    this.CONTENT_W = this.PAGE_W - this.MARGIN * 2;
    this.FONT_SIZE = 10;
    this.LINE_H = 13;
    this.page = null;
    this.y = 0;
  }

  addPage() {
    this.page = this.pdfDoc.addPage([this.PAGE_W, this.PAGE_H]);
    this.y = this.PAGE_H - this.MARGIN;
    return this.page;
  }

  ensureSpace(needed) {
    if (this.y - needed < this.MARGIN + 20) {
      this.addPage();
    }
  }

  drawText(text, opts = {}) {
    const f = opts.bold ? this.fontBold : (opts.italic ? this.fontItalic : this.font);
    const size = opts.size || this.FONT_SIZE;
    const x = opts.x || this.MARGIN;
    this.ensureSpace(size + 4);
    this.page.drawText(text, { x, y: this.y, size, font: f, color: rgb(0, 0, 0) });
    this.y -= opts.spacing || this.LINE_H;
  }

  drawCentered(text, opts = {}) {
    const f = opts.bold ? this.fontBold : this.font;
    const size = opts.size || this.FONT_SIZE;
    const w = f.widthOfTextAtSize(text, size);
    this.drawText(text, { ...opts, x: (this.PAGE_W - w) / 2 });
  }

  drawWrapped(text, opts = {}) {
    const f = opts.bold ? this.fontBold : this.font;
    const size = opts.size || this.FONT_SIZE;
    const indent = opts.indent || 0;
    const maxW = this.CONTENT_W - indent;
    const x = this.MARGIN + indent;
    const lh = opts.lineHeight || this.LINE_H;
    const words = text.split(' ');
    let line = '';

    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        this.ensureSpace(lh);
        this.page.drawText(line, { x, y: this.y, size, font: f, color: rgb(0, 0, 0) });
        this.y -= lh;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      this.ensureSpace(lh);
      this.page.drawText(line, { x, y: this.y, size, font: f, color: rgb(0, 0, 0) });
      this.y -= lh;
    }
  }

  heading(text) {
    this.ensureSpace(this.LINE_H * 2);
    this.y -= 6;
    this.drawWrapped(text, { bold: true });
  }

  paragraph(text, opts = {}) {
    this.drawWrapped(text, { indent: opts.indent || 20, ...opts });
  }

  space(n) { this.y -= n || 4; }

  line(x1, x2) {
    this.page.drawLine({
      start: { x: x1, y: this.y },
      end: { x: x2, y: this.y },
      thickness: 0.5, color: rgb(0, 0, 0)
    });
  }
}

// ============================================================
// BUILD LEASE PDF FROM CODE
// ============================================================
async function buildLeasePdf(data) {
  const remove = new Set(data.strikethroughs || []);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const r = new PDFRenderer(pdfDoc, font, fontBold, fontItalic);

  // ---- PAGE 1: Header ----
  r.addPage();
  r.drawText('Consult your lawyer before signing this lease', { size: 8 });
  r.y += r.LINE_H; // restore y since we want the title on the same visual line
  r.drawText('\u00A9 2004 The Judicial Title Insurance Agency LLC', { size: 8, x: r.PAGE_W - r.MARGIN - font.widthOfTextAtSize('\u00A9 2004 The Judicial Title Insurance Agency LLC', 8) });
  r.space(8);
  r.drawCentered('NEW YORK APARTMENT LEASE AGREEMENT', { bold: true, size: 14, spacing: 20 });
  r.drawCentered('Landlord and Tenant agree to lease the Premises at the rent and for the term stated:', { size: 10, spacing: 16 });

  // ---- Info Box ----
  const boxY = r.y;
  const boxH = 130;
  r.page.drawRectangle({ x: r.MARGIN, y: boxY - boxH, width: r.CONTENT_W, height: boxH, borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(1, 1, 1) });

  let iy = boxY - 16;
  const col2 = r.MARGIN + r.CONTENT_W / 2 + 20;
  const labelSize = 9;
  const valSize = 12;

  function infoLine(label, value, x, yPos) {
    r.page.drawText(label, { x, y: yPos, size: labelSize, font: fontBold, color: rgb(0, 0, 0) });
    const lw = fontBold.widthOfTextAtSize(label, labelSize);
    r.page.drawText(value || '', { x: x + lw + 4, y: yPos, size: valSize, font, color: rgb(0, 0, 0) });
  }

  infoLine('PREMISES: ', data.premises || '', r.MARGIN + 8, iy);
  infoLine('UNIT: ', data.unit || '', col2, iy);
  iy -= 20;
  infoLine('LANDLORD: ', data.landlord1 || '', r.MARGIN + 8, iy);
  infoLine('TENANT: ', data.tenant1 || '', col2, iy);
  iy -= 24;
  infoLine('Date of Lease: ', data.dateOfLease || '', r.MARGIN + 8, iy);
  infoLine('Annual Rent: $ ', data.annualRent || '', col2, iy);
  iy -= 18;
  infoLine('Lease Term: ', data.leaseTerm || '', r.MARGIN + 8, iy);
  infoLine('Monthly Rent: $ ', data.monthlyRent || '', col2, iy);
  iy -= 18;
  infoLine('Commencement Date: ', data.commencementDate || '', r.MARGIN + 8, iy);
  infoLine('Security Deposit: $ ', data.securityDeposit || '', col2, iy);
  iy -= 18;
  infoLine('Termination Date: ', data.terminationDate || '', r.MARGIN + 8, iy);

  r.y = boxY - boxH - 16;

  // ============================================================
  // ALL 45 PARAGRAPHS OF THE NY APARTMENT LEASE
  // ============================================================

  // --- 1. Use and Occupancy ---
  r.heading('1. Use and Occupancy');
  let p1 = 'The Unit may only be used strictly for residential purposes and may only be occupied by Tenant';
  if (!remove.has('p1_spouse')) {
    p1 += ' and Tenant\'s spouse and children';
  }
  p1 += '.';
  r.paragraph(p1);
  r.space(4);

  // --- 2. Inability to Give Possession ---
  r.heading('2. Inability to Give Possession');
  r.paragraph('The failure of Landlord to give Tenant possession of the Unit on the Commencement Date shall not create liability for Landlord. In the event that possession of the Unit is not delivered on the Commencement Date, Monthly Rent hereunder shall begin on the date that possession of the Unit is delivered to Tenant and shall be prorated for that portion of the month in which possession is delivered.');
  r.space(4);

  // --- 3. Rent ---
  r.heading('3. Rent');
  r.paragraph('Tenant shall pay Monthly Rent in full on the first day of each month of the Lease. Monthly Rent shall be paid in advance with no notice being required from Landlord. Tenant shall not deduct any sums from the Monthly Rent unless Landlord consents thereto in writing.');
  r.space(2);
  r.paragraph('Upon signing this Lease, Tenant shall pay Landlord the first Monthly Rent due and the Security Deposit. The entire amount of rent due for the Lease Term is due upon signing this Lease; however, Landlord consents to the Tenant paying same in monthly installments provided there exists no defaults by Tenant under the terms of this Lease.');
  if (!remove.has('p3_additional_rent')) {
    r.space(2);
    r.paragraph('Additional Rent may include, but is not limited to any additional insurance premiums and/or expenses paid by Landlord which are chargeable to Tenant as stated hereinafter. Additional Rent is due and payable with the Monthly Rent for the next month after Tenant receives notice from Landlord that Additional Rent is due and payable.');
  }
  r.space(4);

  // --- 4. Condition of Unit ---
  r.heading('4. Condition of Unit');
  r.paragraph('Tenant acknowledges that Tenant is accepting the Unit in its "as is" condition. Tenant further acknowledges that Tenant has thoroughly inspected the Unit and has found the Unit to be in good order and repair and that the appliances, if any, are in good operating condition. Tenant further states that Tenant knows how to operate the appliances and shall do so in accordance with the manufacturer\'s instructions.');
  r.space(4);

  // --- 5. Security ---
  r.heading('5. Security');
  r.paragraph('The Security Deposit is due upon the Tenant signing this Lease. The Security Deposit shall not be used for the payment of Monthly Rent unless agreed to, in writing, by Landlord and Tenant. Landlord shall deposit the Security Deposit in a bank insured by the FDIC and same will accrue interest if mandated by law. Within ten (10) days after Tenant surrenders possession of the Unit at the expiration of the Lease Term, Landlord shall return the Security Deposit, less any cost of repairs as authorized by this Lease, to Tenant at an address Tenant provides.');
  r.space(4);

  // --- 6. Services and Utilities ---
  r.heading('6. Services and Utilities');
  let p6a = 'Tenant is responsible for paying all electric, gas';
  if (!remove.has('p6_utilities')) {
    p6a += ', water, telephone and any other utilities';
  }
  p6a += ' allocated to the Unit.';
  r.paragraph(p6a);
  r.space(2);

  let p6b = 'Use of a dishwasher, clothes washer and dryer machines, freezer, air purifier, portable heater, air conditioner or similar appliances is prohibited without Landlord\'s written consent.';
  r.paragraph(p6b);
  r.space(2);

  let p6c = 'Landlord will supply (a) heat, in such quantity and for such time as mandated by law, (b) hot and cold water, (c) air conditioning, if already existing in the Unit, (d) garbage removal from the Premises (the "Services"). If the Services are temporarily interrupted due to an accident, emergency and/or repairs, Tenant\'s obligation to pay rent, in full, shall not be affected thereby.';
  r.paragraph(p6c);

  if (!remove.has('p6_appliances')) {
    r.space(2);
    r.paragraph('Landlord will also supply a refrigerator, stove/oven, dishwasher, window air conditioning unit, clothes washer and clothes dryer (the "Appliances"). Any damage to the Appliances which is caused by the willful and/or negligent acts of Tenant may be repaired by Landlord, the cost of which shall be Additional Rent.');
  }
  r.space(4);

  // --- 7. Furnishings ---
  r.heading('7. Furnishings');
  r.paragraph('The Unit is being delivered (furnished) (unfurnished). If furnished, Landlord has given an inventory of the furnishings which inventory has been signed by Tenant and Landlord. Tenant acknowledges that said furnishings are in good condition and Tenant accepts same in "as is" condition.');
  r.space(4);

  // --- 8. Repairs and Alterations ---
  r.heading('8. Repairs and Alterations');
  r.paragraph('Tenant shall maintain all appliances, equipment, furniture, furnishings and other personal property included under this Lease and, upon the surrender of the Unit on the Termination Date, Tenant shall surrender same to Landlord in the same condition as received, reasonable wear and tear excepted. Tenant shall make all repairs which become necessary due to Tenant\'s acts and/or negligence. If Tenant does not make such repairs, Landlord may do so, the cost of which shall be Additional Rent. In the event that Tenant defaults under the terms of this Paragraph 9, Landlord may make necessary repairs or replacement, the cost of which shall be deducted from the Security Deposit.');
  r.space(2);
  r.paragraph('Tenant shall not make any alterations, additions, modifications and/or changes to the Unit during the Lease Term.');
  r.space(4);

  // --- 9. Maintenance of Unit ---
  r.heading('9. Maintenance of Unit');
  r.paragraph('Tenant shall maintain the Unit in a neat, clean and presentable condition.');
  r.space(4);

  // --- 10. Pets ---
  r.heading('10. Pets');
  let p10 = 'Pets of any kind or nature ';
  if (!remove.has('p10_pets')) {
    p10 += '(shall) (shall not)';
  } else {
    p10 += '(shall not)';
  }
  p10 += ' be allowed in the Unit.';
  r.paragraph(p10);
  r.space(4);

  // --- 11. Damage, Fire or Other Catastrophe ---
  r.heading('11. Damage, Fire or Other Catastrophe');
  r.paragraph('In the case of fire damage or other damage to the Unit not caused by Tenant, Tenant shall give Landlord immediate notice of same. Upon receipt of such notice, Landlord may either (a) repair the Unit or (b) terminate the Lease. If Landlord makes repairs to the Unit, Landlord shall have a reasonable time in which to do so. If the damage to the Premises or the Unit renders the Unit uninhabitable, Landlord shall give notice to Tenant, after repairs are made, of the date on which the Unit may be reoccupied. Monthly Rent for the period that Tenant can not occupy the Unit because of the damage shall be forgiven.');
  r.space(2);
  r.paragraph('In the event that Landlord terminates this Lease because of the damage, Landlord shall give Tenant three (3) days notice of Landlord\'s intent to so terminate, in which event, Monthly Rent shall be due for the period up to the date the Premises or the Unit incurred the damage.');
  r.space(2);
  r.paragraph('Notwithstanding the provisions of Section 227 of the New York Real Property Law, if the building in which the Unit is situated is substantially damaged by fire or other catastrophe (the "Occurrence"), Landlord has the absolute right to demolish, renovate or rebuild the Premises. Landlord may cancel this Lease, in such event, upon thirty (30) days written notice to Tenant of Landlord\'s intent, which notice shall include the date on which the Lease terminates, which shall, in no event, be less than thirty (30) days from the date of said notice. By canceling this Lease in accordance with the terms of this Paragraph, Landlord is not obligated to repair, renovate or rebuild the Premises. Monthly Rent and Additional Rent shall be paid by Tenant up to the date of the Occurrence.');
  r.space(4);

  // --- 12. Liability ---
  r.heading('12. Liability');
  r.paragraph('Landlord shall not be liable for any loss, damage or expense to any person or property except if such loss is caused by the willful acts of Landlord.');
  r.space(2);
  r.paragraph('Tenant shall be liable for the acts of Tenant, Tenant\'s family, guests and/or invitees. Landlord\'s cost and expense in repairing any such damage or from any claim resulting from such acts shall be billed as Additional Rent and shall be paid by Tenant to Landlord.');
  r.space(4);

  // --- 13. Landlord's Entry ---
  r.heading('13. Landlord\'s Entry');
  r.paragraph('Except in an emergency, for the purposes of repair, inspection, extermination, installation or repair of any system, utility or appliance or to do any work deemed necessary by Landlord, Landlord may enter the Unit on reasonable notice and at reasonable times. Upon giving such notice, Landlord may also enter the Unit to show the Unit to prospective purchasers, lenders or other persons deemed appropriate and necessary by Landlord. During the last three (3) months of the Term of this Lease, Landlord may enter the Unit to show the Unit to prospective tenants.');
  r.space(4);

  // --- 14. Assigning or Subletting ---
  r.heading('14. Assigning or Subletting');
  r.paragraph('This Lease may not be assigned by Tenant nor shall Tenant sublet the Unit.');
  r.space(4);

  // --- 15. Subordination ---
  r.heading('15. Subordination');
  r.paragraph('This Lease and Tenant\'s rights hereunder are subject and subordinate to all existing and future leases for the land on which the Premises stand, to all mortgages on said leases and/or the Premises and/or the land and all renewals, modifications and extensions thereof. Upon request by Landlord, Tenant shall execute any certificate to this effect.');
  r.space(4);

  // --- 16. Landlord's Consent ---
  r.heading('16. Landlord\'s Consent');
  r.paragraph('If, under the terms of this Lease, the consent of Landlord is required, such consent shall not be unreasonably withheld.');
  r.space(4);

  // --- 17. Keys, Locks ---
  r.heading('17. Keys, Locks');
  r.paragraph('Tenant shall give Landlord keys to all locks for the Unit. Tenant shall not change any locks or add any locks to the Unit without obtaining Landlord\'s consent, and if given, Tenant shall provide keys to Landlord for these locks.');
  r.space(4);

  // --- 18. Signs ---
  r.heading('18. Signs');
  r.paragraph('Tenant shall not place any signs on the Premises or upon the grounds on which the Premises stand or in the Unit so as to be seen from outside the Unit.');
  r.space(2);
  r.paragraph('Landlord shall have the right to place or cause to be placed on the Premises and/or upon the grounds on which the Premises stand or in or on the Unit, "For Rent" and/or "For Sale" signs.');
  r.space(4);

  // --- 19. Compliance with Authorities ---
  r.heading('19. Compliance with Authorities');
  r.paragraph('Tenant shall, at its own cost and expense, comply promptly with all laws, rules, ordinances and directions of governmental and/or municipal authorities, insurance carriers and/or homeowners\' associations.');
  r.space(4);

  // --- 20. Tenant's Defaults, Landlord's Remedies ---
  r.heading('20. Tenant\'s Defaults, Landlord\'s Remedies');
  r.paragraph('A. Landlord must give Tenant notice of default (except for a default in the payment of Monthly Rent and/or Additional Rent) and Tenant, upon receipt of such notice must cure the default within the time stated hereinafter:');
  r.paragraph('1. a default under Paragraphs 8, 9, 10, 11, 12, 14, 17 or 21 of this Lease, ten (10) days;', { indent: 40 });
  r.paragraph('2. a default under Paragraph 30 of this Lease, thirty (30) days.', { indent: 40 });
  r.space(2);
  r.paragraph('B. In the event that Tenant fails to cure a default within the time stated therefore, Landlord may terminate this Lease. In such event, Landlord shall give Tenant notice stating the date upon which this Lease shall terminate, such date being not less than three (3) days after the date of such notice at which time this Lease shall then terminate. Tenant shall be responsible for Monthly Rent and Additional Rent as set forth in this Lease up to the date of termination.');
  r.space(2);
  r.paragraph('C. If this Lease is terminated or Tenant vacates the Unit prior to the Termination Date, Landlord may enter the Unit and remove Tenant and any person or property and/or commence summary proceedings for eviction. The aforesaid actions are not the sole remedies of Landlord.');
  r.space(2);
  r.paragraph('D. If this Lease is cancelled or Landlord takes back the Unit:');
  r.paragraph('1. Monthly Rent and Additional Rent for the unexpired portion of the Term immediately becomes due and payable. In addition, any cost or repair expended by Landlord shall be the obligation of Tenant and shall be deemed Additional Rent.', { indent: 40 });
  r.paragraph('2. Landlord may re-rent the Unit and anything in it for any term and at any rental and any cost in connection therewith shall be borne by Tenant which may include, but is not limited to the cost of repairs, decorations, preparation for renting, broker\'s fees, advertising costs and attorney\'s fees. Any rent recovered by Landlord for the re-renting of the Unit shall reduce the amount of money that Tenant owes to Landlord.', { indent: 40 });
  r.space(4);

  // --- 21. Landlord's Rules ---
  r.heading('21. Landlord\'s Rules');
  r.paragraph('Tenant shall comply with these rules (the "Rules") at all times. If there is a change in the rules, Landlord will give Tenant notice of same. Landlord shall not be liable to Tenant for another Tenant\'s violation of the Rules. The rights afforded under the following Rules are for the sole benefit of Landlord:');
  r.space(2);
  r.paragraph('(a) the quiet enjoyment of other tenants shall not be interfered with;', { indent: 30 });
  r.paragraph('(b) sounds, odors and lights which are annoying to other tenants are not allowed;', { indent: 30 });

  if (!remove.has('p21c_floorcovering')) {
    r.paragraph('(c) floors within the Unit must be covered over 70% of the area of each room except for the bathroom and kitchen;', { indent: 30 });
  }

  r.paragraph('(d) all posted rules must be followed;', { indent: 30 });
  r.paragraph('(e) smoking is not permitted in the Unit or hallways;', { indent: 30 });
  r.paragraph('(f) All flammable or dangerous items may not be kept or stored in the Unit;', { indent: 30 });
  r.paragraph('(g) no one is allowed access to or the enjoyment of the roof;', { indent: 30 });
  r.paragraph('(h) nothing shall be placed on or attached to the fire escapes, windows, doors or in the hallways or common areas;', { indent: 30 });

  if (!remove.has('p21i_elevator')) {
    r.paragraph('(i) elevators, if any, are to be used by tenants and their guests only. Bicycles are not allowed in the elevators. Tenants and their guests are not to leave any garbage, trash and/or debris in the elevators;', { indent: 30 });
  }

  r.paragraph('(j) moving of furniture in and out of the Unit must be scheduled with the Landlord;', { indent: 30 });
  r.paragraph('(k) all deliveries must be made by means of the service entrance, if any;', { indent: 30 });

  if (!remove.has('p21l_laundry')) {
    r.paragraph('(l) laundry machines, if provided, may be used at tenants\' risk and cost, may only be used at reasonable hours and all instructions for their use must be strictly followed;', { indent: 30 });
  }

  if (!remove.has('p21m_windows')) {
    r.paragraph('(m) cleaning of the exterior of the windows from the outside is strictly forbidden;', { indent: 30 });
  }

  if (!remove.has('p21n_parking')) {
    r.paragraph('(n) if parking is provided, improperly parked vehicles may be immediately removed at tenant\'s cost;', { indent: 30 });
  }

  r.paragraph('(o) tenant may not leave any baby carriages/strollers, bicycles, boxes, cartons and/or any items in hallways;', { indent: 30 });
  r.paragraph('(p) tenant shall use its best efforts to conserve energy and water;', { indent: 30 });
  r.paragraph('(q) hot plates or means of cooking other than the stove are not permitted.', { indent: 30 });
  r.space(4);

  // --- 22-45 (remaining paragraphs) ---
  r.heading('22. Warranty of Habitability');
  r.paragraph('Landlord warrants that the Unit and Premises are suitable for living and that they are free from any condition that is dangerous to health, life and/or safety.');
  r.space(4);

  r.heading('23. Limitation of Recovery');
  r.paragraph('Should Tenant obtain a judgment or other remedy from a court of competent jurisdiction for the payment of money by Landlord, Tenant is limited to the Landlord\'s interest in the Premises for the collection of same.');
  r.space(4);

  r.heading('24. Construction and Demolition');
  r.paragraph('Construction and/or demolition may be done in or near the Premises and if same interferes with the ventilation, view and/or enjoyment of the Unit, Tenant\'s obligations under this Lease shall, in no way, be affected.');
  r.space(4);

  r.heading('25. Demolition of Premises');
  r.paragraph('Should Landlord deem it necessary to demolish the Premises, Landlord may terminate this Lease upon six (6) months written notice to Tenant provided such notice is given to all other tenants in the Premises. In such event, Tenant shall surrender the Unit to Landlord upon such date as set forth in the notice.');
  r.space(4);

  r.heading('26. Terraces and Balconies');
  r.paragraph('If there is a terrace or balcony as an adjunct to the Unit, such terrace or balcony is subject to the terms of this Lease.');
  r.space(2);
  r.paragraph('Tenant shall keep the terrace or balcony clean, clear of snow, ice, garbage and other debris. No alteration or additions may be made to the terrace or balcony. Tenant\'s property may not be stored on the terrace or balcony. Cooking on the terrace or balcony is prohibited.');
  r.space(2);
  r.paragraph('Tenant shall maintain the terrace or balcony in good condition and make all repairs at Tenant\'s cost, except those of a structural nature which is the responsibility of Landlord.');
  r.space(4);

  r.heading('27. Common Recreational Areas');
  r.paragraph('If applicable, Landlord may give Tenant use of any playground, pool, parking or other areas, the use of which will be at Tenant\'s own risk and Tenant shall pay any charge imposed by Landlord for such use. Landlord\'s permission to use these areas may be revoked at any time.');
  r.space(4);

  r.heading('28. Landlord\'s Employees');
  r.paragraph('The employees of Landlord shall not perform any work for Tenant at Tenant\'s request. Such employees may not do any personal chores of Tenant.');
  r.space(4);

  r.heading('29. Condemnation');
  r.paragraph('If any or part of the Premises is taken or condemned by any governmental authority, Landlord may cancel this Lease on notice to Tenant and Tenant\'s rights hereunder shall end as of the date the authority takes title to the Premises which cancellation date can not be less than thirty (30) days from the date of Landlord\'s notice. Tenant shall be liable for Monthly Rent and Additional Rent to the date of cancellation and shall make no claim for the unexpired term of the Lease. Any award for the condemnation is the property of Landlord and Tenant assigns to Landlord any and all rights, interest and/or claim in and to such award.');
  r.space(4);

  r.heading('30. Bankruptcy');
  r.paragraph('Should Tenant file a voluntary petition in bankruptcy or an involuntary petition is filed against Tenant, or should Tenant assign any property for the benefit of creditors or should a trustee/receiver be appointed of Tenant and/or Tenant\'s property, Landlord can cancel this Lease upon thirty (30) days written notice to Tenant.');
  r.space(4);

  r.heading('31. Notices');
  r.paragraph('Any notice to be given under this Lease shall be in writing addressed to the party at the addresses set forth herein by certified mail or overnight courier service. Notice by Landlord to one named Tenant shall be deemed given to all Tenants and occupants of the Unit. Each party hereto shall accept notices sent by the other. Any change of address by one party must be given, by notice, to the other. Notice shall be deemed given when posted or delivered to the overnight courier service.');
  r.space(4);

  r.heading('32. Waiver of Jury Trial, Set-Off or Counterclaim');
  r.paragraph('The parties hereto waive trial by jury in all matters except for personal injury or property damage claims. In a summary proceeding for eviction, Tenant waives Tenant\'s right to any set-off and/or counterclaim.');
  r.space(4);

  r.heading('33. Broker');
  r.paragraph(`Tenant states that ${data.brokerName || '___________________'} is the sole Broker who showed the Unit to Tenant. Tenant shall hold harmless and indemnify Landlord for any monies expended by Landlord should Tenant\'s statement herein be untrue.`);
  r.space(4);

  r.heading('34. Inability of Landlord to Perform');
  r.paragraph('If Landlord is unable to perform any of its obligations to be performed hereunder due to governmental orders, labor strife or inability to secure goods or materials, through no fault on the part of Landlord, this Lease shall not be terminated or cancelled and such inability shall not impact upon Tenant\'s obligations hereunder.', { bold: true });
  r.space(4);

  r.heading('35. Illegality');
  r.paragraph('Should any part of this Lease be deemed illegal, the remaining portions of this Lease shall not be affected thereby and shall remain in full force and effect.');
  r.space(4);

  r.heading('36. Non-Disturbance');
  r.paragraph('So long as Tenant pays the Monthly Rent and Additional Rent and there exists no defaults under any of the terms of this Lease, Tenant may peacefully occupy the Unit for the Lease Term.');
  r.space(4);

  r.heading('37. Non-Waiver');
  r.paragraph('Any failure by Landlord to insist upon Tenant\'s full compliance with the terms of this Lease and/or to enforce such terms shall not be deemed to be a waiver of Landlord\'s rights to insist upon or so enforce the terms of this Lease at a future date.');
  r.space(4);

  r.heading('38. Parties Bound');
  r.paragraph('This Lease is binding upon Landlord and Tenant and their respective assignees and/or successors in interest.');
  r.space(4);

  r.heading('39. Paragraph Headings');
  r.paragraph('Paragraph headings are for reference only.');
  r.space(4);

  r.heading('40. Effectiveness');
  r.paragraph('This Lease shall become effective as of the date when Landlord delivers a fully executed copy hereof to Tenant or Tenant\'s attorney.');
  r.space(4);

  r.heading('41. Entire Agreement');
  r.paragraph('Tenant states that Tenant has read this Lease and that it fully incorporates all understandings, representations and promises made to Tenant by Landlord and/or Landlord\'s agent and that this Lease supercedes all prior representations, agreements and promises, whether oral or written.');
  r.space(4);

  r.heading('42. Amendments');
  r.paragraph('This Lease may only be changed or amended in a writing signed by the parties hereto.');
  r.space(4);

  r.heading('43. Riders');
  r.paragraph('Additional terms are contained in the riders annexed hereto and designated Rider ________________.');
  r.space(4);

  r.heading('44. Surrender of Premises');
  r.paragraph('On the Termination Date, Tenant shall deliver the Unit to Landlord vacant, in good condition and broom clean. Prior to such delivery, Tenant shall have vacated the Unit, removed Tenant\'s property, repaired all damages caused by Tenant and return the Unit in the same condition as received, reasonable wear and tear excepted.');
  r.space(4);

  r.heading('45. Sprinkler System Disclosure');
  r.paragraph('The leased premises (choose one of the following) is/is not serviced by a maintained and operative sprinkler system that was last maintained on __/__/__ and was last inspected on __/__/__.');
  r.space(12);

  // ---- SIGNATURE PAGE ----
  r.ensureSpace(200);
  r.drawWrapped('This Lease has been entered into as of the Date of Lease.', { indent: 0 });
  r.space(24);

  const sigW = 220;
  const dateX = r.MARGIN + 340;

  // Landlord
  r.drawText('Landlord\'s Signature ___________________________', { bold: true });
  r.y += r.LINE_H;
  r.drawText(`Date: ${data.signDate1 || '____________'}`, { x: dateX });
  r.space(4);
  r.drawText(`Print Name: ${data.landlord1 || '________________'}`);
  r.space(16);

  // Tenant 1
  r.drawText('Tenant\'s Signature ___________________________', { bold: true });
  r.y += r.LINE_H;
  r.drawText(`Date: ${data.signDate2 || '____________'}`, { x: dateX });
  r.space(4);
  r.drawText(`Print Name: ${data.tenant1 || '________________'}`);
  r.space(16);

  // Tenant 2
  r.drawText('Tenant\'s Signature ___________________________', { bold: true });
  r.y += r.LINE_H;
  r.drawText(`Date: ${data.signDate3 || '____________'}`, { x: dateX });
  r.space(4);
  r.drawText(`Print Name: ${data.tenant2 || '________________'}`);
  r.space(16);

  // Agent
  r.drawText('Agent\'s Signature ___________________________', { bold: true });
  r.y += r.LINE_H;
  r.drawText(`Date: ${data.signDate4 || '____________'}`, { x: dateX });
  r.space(4);
  r.drawText(`Print Name: ${data.agentName || '________________'}`);

  return pdfDoc;
}

// ============================================================
// BUILD ADDENDUM PDF
// ============================================================
async function buildAddendumPdf(data) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const r = new PDFRenderer(pdfDoc, font, fontBold);
  r.FONT_SIZE = 12;
  r.LINE_H = 16;

  r.addPage();
  r.drawCentered('LEASE ADDENDUM', { bold: true, size: 16, spacing: 24 });

  r.drawWrapped(`This addendum, made on ${data.addendumDate || data.dateOfLease || '___________'}, is between:`);
  r.space(8);
  r.drawWrapped(`Landlord: ${data.landlord1 || '___________'}, ${data.landlordAddress || '___________'}`);
  r.space(4);
  r.drawWrapped(`Tenant: ${data.tenant1 || '___________'}, ${data.tenantAddress || '___________'}`);
  r.space(8);
  r.drawWrapped(`This addendum is added to the lease agreement dated ${data.dateOfLease || '___________'} for the property located at:`);
  r.space(4);
  r.drawWrapped(`${data.premises || '___________'} ${data.unit || ''}`, { bold: true });
  r.space(12);
  r.drawWrapped('The following amendments are hereby made to the above-referenced lease agreement:');
  r.space(12);

  const amendments = data.amendments || [];
  amendments.forEach((text, i) => {
    if (text.trim()) {
      r.drawWrapped(`${i + 1}. ${text}`, { indent: 20 });
      r.space(8);
    }
  });

  r.space(16);
  r.drawWrapped('All other terms and conditions of the original lease agreement remain in full force and effect. In the event of any conflict between this addendum and the original lease, the terms of this addendum shall prevail.');
  r.space(12);
  r.drawWrapped('Both parties acknowledge that they have read and understood this addendum and agree to its terms.');

  // Signature blocks
  r.space(40);
  const sigW = 220;

  r.drawText('Landlord:', { bold: true }); r.space(20);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText('Signature', { size: 9 }); r.space(12);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText(`Print Name: ${data.landlord1 || ''}`, { size: 10 }); r.space(12);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText('Date', { size: 9 });

  r.space(24);
  r.drawText('Tenant:', { bold: true }); r.space(20);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText('Signature', { size: 9 }); r.space(12);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText(`Print Name: ${data.tenant1 || ''}`, { size: 10 }); r.space(12);
  r.line(r.MARGIN, r.MARGIN + sigW); r.y -= 14;
  r.drawText('Date', { size: 9 });

  return pdfDoc;
}

// ============================================================
// API ENDPOINTS
// ============================================================
app.post('/api/generate-lease', async (req, res) => {
  try {
    const pdfDoc = await buildLeasePdf(req.body);
    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lease_${(req.body.tenant1 || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Lease generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-addendum', async (req, res) => {
  try {
    const pdfDoc = await buildAddendumPdf(req.body);
    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Addendum_${(req.body.tenant1 || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Addendum generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-both', async (req, res) => {
  try {
    // Build lease
    const leasePdfDoc = await buildLeasePdf(req.body);
    const leaseBytes = await leasePdfDoc.save();

    // Build addendum
    const addendumPdfDoc = await buildAddendumPdf(req.body);
    const addendumBytes = await addendumPdfDoc.save();

    // Merge
    const finalPdf = await PDFDocument.load(leaseBytes);
    const addendumDoc = await PDFDocument.load(addendumBytes);
    const addendumPages = await finalPdf.copyPages(addendumDoc, addendumDoc.getPageIndices());
    for (const p of addendumPages) {
      finalPdf.addPage(p);
    }

    const finalBytes = await finalPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lease_and_Addendum_${(req.body.tenant1 || 'tenant').replace(/\s+/g, '_')}.pdf"`);
    res.send(Buffer.from(finalBytes));
  } catch (error) {
    console.error('Combined generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Lease Generator running at http://localhost:${PORT}`);
});

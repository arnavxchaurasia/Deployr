'use strict';

const PDFDocument = require('pdfkit');

function formatAmount(amountPaise, currency) {
  const major = (amountPaise / 100).toFixed(2);
  return currency === 'INR' ? `₹${major}` : `${major} ${currency}`;
}

// Streams a simple, one-page PDF receipt directly to an Express response.
// Deliberately plain (no logo/branding assets to manage) — invoice number,
// payer, line item, amount, and the Razorpay payment id for their records.
function streamInvoicePdf(res, invoice, payerName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="deployr-receipt-${invoice.id}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text('Deployr', { continued: false });
  doc.fontSize(10).fillColor('#666').text('Receipt');
  doc.moveDown(2);

  doc.fillColor('#000').fontSize(12);
  doc.text(`Receipt #: ${invoice.id}`);
  doc.text(`Date: ${invoice.createdAt.toISOString().slice(0, 10)}`);
  doc.text(`Billed to: ${payerName}`);
  doc.moveDown(1);

  doc.fontSize(11).text(invoice.description);
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Payment ID: ${invoice.razorpayPaymentId}`);
  doc.text(`Order ID: ${invoice.razorpayOrderId}`);
  doc.moveDown(1);

  doc.fontSize(16).text(`Total paid: ${formatAmount(invoice.amountPaise, invoice.currency)}`);
  doc.moveDown(2);

  doc.fontSize(9).fillColor('#999').text('This is a computer-generated receipt and does not require a signature.');

  doc.end();
}

module.exports = { streamInvoicePdf };

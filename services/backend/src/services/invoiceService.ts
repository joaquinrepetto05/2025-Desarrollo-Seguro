// src/services/invoiceService.ts
import db from '../db';
import { Invoice } from '../types/invoice';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';

interface InvoiceRow {
  id: string;
  userId: string;
  amount: number;
  dueDate: Date;
  status: string;
}

const INVOICES_DIR =
  process.env.INVOICES_DIR || path.join(__dirname, '../../invoices'); // Carpeta raíz para todos los invoices

class InvoiceService {
  static async list(
    userId: string,
    status?: string,
    operator?: string
  ): Promise<Invoice[]> {
    let q = db<InvoiceRow>('invoices').where({ userId });
    if (status) {
      const allowedOps = new Set(['=', '!=', '<', '>', '<=', '>=', 'like']);
      let op = (operator || '=').toLowerCase();
      if (!allowedOps.has(op)) op = '=';
      q = q.andWhere('status', op as any, status);
    }
    const rows = await q.select();
    return rows.map(
      (row) =>
        ({
          id: row.id,
          userId: row.userId,
          amount: row.amount,
          dueDate: row.dueDate,
          status: row.status,
        } as Invoice)
    );
  }

  static async setPaymentCard(
    userId: string,
    invoiceId: string,
    paymentBrand: string,
    ccNumber: string,
    ccv: string,
    expirationDate: string
  ): Promise<void> {
    const paymentResponse = await axios.post(`http://${paymentBrand}/payments`, {
      ccNumber,
      ccv,
      expirationDate,
    });
    if (paymentResponse.status !== 200) {
      throw new Error('Payment failed');
    }

    const updated = await db('invoices')
      .where({ id: invoiceId, userId })
      .update({ status: 'paid' });

    if (!updated) {
      throw new Error('Invoice not found');
    }
  }

  // Overloads para admitir ambos usos
  static async getInvoice(invoiceId: string, userId: string): Promise<Invoice>;
  static async getInvoice(invoiceId: string): Promise<Invoice>;
  static async getInvoice(
    invoiceId: string,
    userId?: string
  ): Promise<Invoice> {
    const q = db<InvoiceRow>('invoices').where({ id: invoiceId });
    if (userId) q.andWhere({ userId });
    const invoice = await q.first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    return invoice as Invoice;
  }

  // Overloads para admitir ambos usos
  static async getReceipt(
    invoiceId: string,
    userId: string,
    pdfName: string
  ): Promise<Buffer>;
  static async getReceipt(invoiceId: string, pdfName: string): Promise<Buffer>;
  static async getReceipt(
    invoiceId: string,
    userOrPdf: string,
    maybePdfName?: string
  ): Promise<Buffer> {
    let userId: string | undefined;
    let pdfName: string;
    if (maybePdfName !== undefined) {
      userId = userOrPdf;
      pdfName = maybePdfName;
    } else {
      pdfName = userOrPdf;
    }

    const q = db<InvoiceRow>('invoices').where({ id: invoiceId });
    if (userId) q.andWhere({ userId });
    const invoice = await q.first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (!pdfName || typeof pdfName !== 'string') {
      throw new Error('Invalid file name');
    }
    if (pdfName.includes('/') || pdfName.includes('\\')) {
      throw new Error('Invalid file name');
    }

    const candidatePath = path.resolve(INVOICES_DIR, pdfName);

    const realInvoicesDir = await fs
      .realpath(INVOICES_DIR)
      .catch(() => {
        throw new Error('Invoices directory not accessible');
      });

    const realCandidate = await fs.realpath(candidatePath).catch(() => null);
    if (!realCandidate) {
      throw new Error('Receipt not found');
    }

    if (
      !realCandidate.startsWith(realInvoicesDir + path.sep) &&
      realCandidate !== realInvoicesDir
    ) {
      throw new Error('Access to the requested resource is forbidden');
    }

    const content = await fs.readFile(realCandidate);
    return content;
  }
}

export default InvoiceService;

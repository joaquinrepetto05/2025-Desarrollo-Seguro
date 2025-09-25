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

const INVOICES_DIR = process.env.INVOICES_DIR || path.join(__dirname, '../../invoices'); // Carpeta raíz para todos los invoices

class InvoiceService {
  static async list( userId: string, status?: string, operator?: string): Promise<Invoice[]> {
    let q = db<InvoiceRow>('invoices').where({ userId: userId });
    if (status) q = q.andWhereRaw(" status "+ operator + " '"+ status +"'");
    const rows = await q.select();
    const invoices = rows.map(row => ({
      id: row.id,
      userId: row.userId,
      amount: row.amount,
      dueDate: row.dueDate,
      status: row.status} as Invoice
    ));
    return invoices;
  }

  static async setPaymentCard(
    userId: string,
    invoiceId: string,
    paymentBrand: string,
    ccNumber: string,
    ccv: string,
    expirationDate: string
  ) {
    // use axios to call http://paymentBrand/payments as a POST request
    // with the body containing ccNumber, ccv, expirationDate
    // and handle the response accordingly
    const paymentResponse = await axios.post(`http://${paymentBrand}/payments`, {
      ccNumber,
      ccv,
      expirationDate
    });
    if (paymentResponse.status !== 200) {
      throw new Error('Payment failed');
    }

    // Update the invoice status in the database
    await db('invoices')
      .where({ id: invoiceId, userId })
      .update({ status: 'paid' });  
    };
  static async  getInvoice( invoiceId:string): Promise<Invoice> {
    const invoice = await db<InvoiceRow>('invoices').where({ id: invoiceId }).first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    return invoice as Invoice;
  }


  static async getReceipt(invoiceId: string, pdfName: string) {
    const invoice = await db<InvoiceRow>('invoices').where({ id: invoiceId }).first();
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (!pdfName || typeof pdfName !== 'string') {
      throw new Error('Invalid file name');
    }
    if (pdfName.includes('/') || pdfName.includes('\\')) { // Filtramos caracteres que se usan en rutas
      throw new Error('Invalid file name');
    }

    const candidatePath = path.resolve(INVOICES_DIR, pdfName); // Construimos la ruta

    const realInvoicesDir = await fs.realpath(INVOICES_DIR).catch(() => {
      throw new Error('Invoices directory not accessible');
    });
    const realCandidate = await fs.realpath(candidatePath).catch(() => null);

    if (!realCandidate) {
      throw new Error('Receipt not found');
    }

    if (!realCandidate.startsWith(realInvoicesDir + path.sep) && realCandidate !== realInvoicesDir) { // Verificamos que la direccion este permitida
      throw new Error('Access to the requested resource is forbidden');
    }

    const content = await fs.readFile(realCandidate, 'utf-8');
    return content;
  }

};

export default InvoiceService;

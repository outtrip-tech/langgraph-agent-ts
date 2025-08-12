import fs from "fs/promises";
import path from "path";
import { SimpleQuotation } from "../types/simpleQuotation.js";

const SIMPLE_QUOTATIONS_FILE = path.join(process.cwd(), "simple_quotations.json");

export class SimpleDataManager {
  // Load all quotations
  static async loadQuotations(): Promise<SimpleQuotation[]> {
    try {
      const data = await fs.readFile(SIMPLE_QUOTATIONS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, return empty array
      return [];
    }
  }

  // Save all quotations
  static async saveQuotations(quotations: SimpleQuotation[]): Promise<void> {
    await fs.writeFile(SIMPLE_QUOTATIONS_FILE, JSON.stringify(quotations, null, 2));
  }

  // Generate a simple sequential ID
  static async generateQuotationId(): Promise<string> {
    const quotations = await this.loadQuotations();
    const nextId = quotations.length + 1;
    return `SQ-${String(nextId).padStart(4, '0')}`;
  }

  // Create a new quotation
  static async createQuotation(quotationData: Omit<SimpleQuotation, 'id' | 'createdAt'>): Promise<SimpleQuotation> {
    const quotations = await this.loadQuotations();
    
    const newQuotation: SimpleQuotation = {
      ...quotationData,
      id: await this.generateQuotationId(),
      createdAt: new Date(),
    };
    
    quotations.push(newQuotation);
    await this.saveQuotations(quotations);
    
    return newQuotation;
  }

  // Find quotations by client email
  static async findQuotationsByEmail(clientEmail: string): Promise<SimpleQuotation[]> {
    const quotations = await this.loadQuotations();
    return quotations.filter(q => q.clientEmail.toLowerCase() === clientEmail.toLowerCase());
  }

  // Check if an email was already processed (to avoid duplicates)
  static async isEmailProcessed(emailId: string): Promise<boolean> {
    const quotations = await this.loadQuotations();
    return quotations.some(q => q.emailId === emailId);
  }

  // Get basic statistics
  static async getStatistics(): Promise<{
    totalQuotations: number;
    uniqueClients: number;
    todayQuotations: number;
  }> {
    const quotations = await this.loadQuotations();
    const today = new Date().toDateString();
    
    const uniqueEmails = new Set(quotations.map(q => q.clientEmail));
    const todayQuotations = quotations.filter(q => 
      new Date(q.createdAt).toDateString() === today
    );

    return {
      totalQuotations: quotations.length,
      uniqueClients: uniqueEmails.size,
      todayQuotations: todayQuotations.length,
    };
  }
}
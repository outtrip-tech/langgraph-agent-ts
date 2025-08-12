import fs from "fs/promises";
import path from "path";
import { SimpleQuotation } from "../types/simpleQuotation.js";

const SIMPLE_QUOTATIONS_FILE = path.join(
  process.cwd(),
  "simple_quotations.json"
);

// Optimized in-memory cache for better performance
let quotationsCache: SimpleQuotation[] | null = null;
let cacheTimestamp = 0;
let emailProcessedCache = new Set<string>();
const CACHE_TTL = 60 * 1000; // 60 seconds for better performance

export class SimpleDataManager {
  // Load all quotations with caching
  static async loadQuotations(): Promise<SimpleQuotation[]> {
    const now = Date.now();

    // Return cached data if still valid
    if (quotationsCache && now - cacheTimestamp < CACHE_TTL) {
      return quotationsCache;
    }

    try {
      const data = await fs.readFile(SIMPLE_QUOTATIONS_FILE, "utf-8");
      const parsedData = JSON.parse(data);
      quotationsCache = parsedData;
      cacheTimestamp = now;
      return parsedData;
    } catch (error) {
      // File doesn't exist yet, return empty array
      quotationsCache = [];
      cacheTimestamp = now;
      return [];
    }
  }

  // Save all quotations with cache invalidation
  static async saveQuotations(quotations: SimpleQuotation[]): Promise<void> {
    // Update cache immediately for better performance
    quotationsCache = quotations;
    cacheTimestamp = Date.now();
    
    // Update email processed cache
    emailProcessedCache.clear();
    quotations.forEach(q => emailProcessedCache.add(q.emailId));

    // Async write to disk (non-blocking)
    const dataString = JSON.stringify(quotations, null, 2);
    await fs.writeFile(SIMPLE_QUOTATIONS_FILE, dataString);
  }

  // Generate a simple sequential ID
  static async generateQuotationId(): Promise<string> {
    const quotations = await this.loadQuotations();
    const nextId = quotations.length + 1;
    return `SQ-${String(nextId).padStart(4, "0")}`;
  }

  // Create a new quotation
  static async createQuotation(
    quotationData: Omit<SimpleQuotation, "id">
  ): Promise<SimpleQuotation> {
    const quotations = await this.loadQuotations();

    const newQuotation: SimpleQuotation = {
      ...quotationData,
      id: await this.generateQuotationId(),
      // createdAt is now provided in quotationData as ISO string
    };

    quotations.push(newQuotation);
    await this.saveQuotations(quotations);

    return newQuotation;
  }

  // Find quotations by client email (optimized with cache)
  static async findQuotationsByEmail(
    clientEmail: string
  ): Promise<SimpleQuotation[]> {
    const quotations = await this.loadQuotations();
    const lowerEmail = clientEmail.toLowerCase();
    return quotations.filter((q) => q.clientEmail.toLowerCase() === lowerEmail);
  }

  // Check if an email was already processed (optimized with cache)
  static async isEmailProcessed(emailId: string): Promise<boolean> {
    // Check cache first if available
    if (emailProcessedCache.size > 0) {
      return emailProcessedCache.has(emailId);
    }
    
    // Fallback to loading quotations
    const quotations = await this.loadQuotations();
    // Update cache
    emailProcessedCache.clear();
    quotations.forEach(q => emailProcessedCache.add(q.emailId));
    
    return emailProcessedCache.has(emailId);
  }

  // Get basic statistics
  static async getStatistics(): Promise<{
    totalQuotations: number;
    uniqueClients: number;
    todayQuotations: number;
  }> {
    const quotations = await this.loadQuotations();
    const today = new Date().toDateString();

    const uniqueEmails = new Set(quotations.map((q) => q.clientEmail));
    const todayQuotations = quotations.filter(
      (q) => new Date(q.createdAt).toDateString() === today
    );

    return {
      totalQuotations: quotations.length,
      uniqueClients: uniqueEmails.size,
      todayQuotations: todayQuotations.length,
    };
  }
}

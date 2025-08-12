import fs from "fs/promises";
import path from "path";
import { SimpleQuotation, EmailData } from "../types/simpleQuotation.js";
import { SimpleDataManager } from "./simpleDataManager.js";

// Interfaces para el seguimiento
export interface FollowUpRecord {
  quotationId: string;
  emailId: string;
  clientEmail: string;
  status: "pending_info" | "completed" | "abandoned" | "responded";
  lastContactDate: string;
  followUpsSent: number;
  maxFollowUps: number;
  nextFollowUpDate?: string;
  emailHistory: FollowUpEmail[];
}

export interface FollowUpEmail {
  date: string;
  type: "missing_data_request" | "completion_notification" | "follow_up" | "response_received";
  emailId?: string;
  content?: string;
}

const FOLLOW_UP_FILE = path.join(process.cwd(), "follow_ups.json");

// Optimized cache for better performance
let followUpCache: FollowUpRecord[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

export class FollowUpManager {
  /**
   * Carga todos los registros de seguimiento
   */
  static async loadFollowUps(): Promise<FollowUpRecord[]> {
    const now = Date.now();

    if (followUpCache && now - cacheTimestamp < CACHE_TTL) {
      return followUpCache;
    }

    try {
      const data = await fs.readFile(FOLLOW_UP_FILE, "utf-8");
      const parsedData = JSON.parse(data);
      followUpCache = parsedData;
      cacheTimestamp = now;
      return parsedData;
    } catch (error) {
      followUpCache = [];
      cacheTimestamp = now;
      return [];
    }
  }

  /**
   * Guarda todos los registros de seguimiento
   */
  static async saveFollowUps(followUps: FollowUpRecord[]): Promise<void> {
    followUpCache = followUps;
    cacheTimestamp = Date.now();

    const dataString = JSON.stringify(followUps, null, 2);
    await fs.writeFile(FOLLOW_UP_FILE, dataString);
  }

  /**
   * Crea un nuevo registro de seguimiento para cotización incompleta
   */
  static async createFollowUpRecord(
    quotation: SimpleQuotation,
    emailOriginal: EmailData
  ): Promise<FollowUpRecord> {
    const followUps = await this.loadFollowUps();

    const record: FollowUpRecord = {
      quotationId: quotation.id,
      emailId: emailOriginal.id,
      clientEmail: quotation.clientEmail,
      status: "pending_info",
      lastContactDate: new Date().toISOString(),
      followUpsSent: 1, // Primer email de solicitud de datos
      maxFollowUps: 2, // Máximo 2 seguimientos
      nextFollowUpDate: this.calculateNextFollowUpDate(1),
      emailHistory: [
        {
          date: new Date().toISOString(),
          type: "missing_data_request",
          emailId: emailOriginal.id,
        },
      ],
    };

    followUps.push(record);
    await this.saveFollowUps(followUps);

    return record;
  }

  /**
   * Marca una cotización como completada
   */
  static async markAsCompleted(quotationId: string): Promise<void> {
    const followUps = await this.loadFollowUps();
    const record = followUps.find(f => f.quotationId === quotationId);

    if (record) {
      record.status = "completed";
      record.lastContactDate = new Date().toISOString();
      record.emailHistory.push({
        date: new Date().toISOString(),
        type: "completion_notification",
      });

      await this.saveFollowUps(followUps);
    }
  }

  /**
   * Registra una respuesta del cliente
   */
  static async markAsResponded(
    quotationId: string,
    responseEmailId: string
  ): Promise<void> {
    const followUps = await this.loadFollowUps();
    const record = followUps.find(f => f.quotationId === quotationId);

    if (record) {
      record.status = "responded";
      record.lastContactDate = new Date().toISOString();
      record.emailHistory.push({
        date: new Date().toISOString(),
        type: "response_received",
        emailId: responseEmailId,
      });

      await this.saveFollowUps(followUps);
    }
  }

  /**
   * Registra el envío de un email de seguimiento
   */
  static async recordFollowUpSent(quotationId: string): Promise<void> {
    const followUps = await this.loadFollowUps();
    const record = followUps.find(f => f.quotationId === quotationId);

    if (record) {
      record.followUpsSent += 1;
      record.lastContactDate = new Date().toISOString();
      
      if (record.followUpsSent >= record.maxFollowUps) {
        record.status = "abandoned";
        record.nextFollowUpDate = undefined;
      } else {
        record.nextFollowUpDate = this.calculateNextFollowUpDate(record.followUpsSent);
      }

      record.emailHistory.push({
        date: new Date().toISOString(),
        type: "follow_up",
      });

      await this.saveFollowUps(followUps);
    }
  }

  /**
   * Obtiene cotizaciones que necesitan seguimiento
   */
  static async getQuotationsNeedingFollowUp(): Promise<{
    quotation: SimpleQuotation;
    followUpRecord: FollowUpRecord;
  }[]> {
    const followUps = await this.loadFollowUps();
    const now = new Date();
    const results = [];

    for (const record of followUps) {
      if (
        record.status === "pending_info" &&
        record.nextFollowUpDate &&
        new Date(record.nextFollowUpDate) <= now
      ) {
        try {
          const quotations = await SimpleDataManager.loadQuotations();
          const quotation = quotations.find(q => q.id === record.quotationId);
          
          if (quotation) {
            results.push({ quotation, followUpRecord: record });
          }
        } catch (error) {
          // Silent error handling for quotation loading
        }
      }
    }

    return results;
  }

  /**
   * Calcula la fecha del próximo seguimiento
   */
  private static calculateNextFollowUpDate(followUpNumber: number): string {
    const now = new Date();
    const daysToAdd = followUpNumber === 1 ? 3 : 7; // 3 días para el primer seguimiento, 7 para el segundo
    
    now.setDate(now.getDate() + daysToAdd);
    return now.toISOString();
  }

  /**
   * Obtiene estadísticas de seguimiento
   */
  static async getFollowUpStats(): Promise<{
    totalFollowUps: number;
    pendingInfo: number;
    completed: number;
    abandoned: number;
    responded: number;
    needingFollowUp: number;
  }> {
    const followUps = await this.loadFollowUps();
    const now = new Date();

    const stats = {
      totalFollowUps: followUps.length,
      pendingInfo: 0,
      completed: 0,
      abandoned: 0,
      responded: 0,
      needingFollowUp: 0,
    };

    for (const record of followUps) {
      switch (record.status) {
        case "pending_info":
          stats.pendingInfo++;
          break;
        case "completed":
          stats.completed++;
          break;
        case "abandoned":
          stats.abandoned++;
          break;
        case "responded":
          stats.responded++;
          break;
      }
      
      if (
        record.status === "pending_info" &&
        record.nextFollowUpDate &&
        new Date(record.nextFollowUpDate) <= now
      ) {
        stats.needingFollowUp++;
      }
    }

    return stats;
  }

  /**
   * Busca un registro de seguimiento por ID de cotización
   */
  static async findByQuotationId(quotationId: string): Promise<FollowUpRecord | null> {
    const followUps = await this.loadFollowUps();
    return followUps.find(f => f.quotationId === quotationId) || null;
  }

  /**
   * Busca registros de seguimiento por email del cliente
   */
  static async findByClientEmail(clientEmail: string): Promise<FollowUpRecord[]> {
    const followUps = await this.loadFollowUps();
    return followUps.filter(f => 
      f.clientEmail.toLowerCase() === clientEmail.toLowerCase()
    );
  }

  /**
   * Identifica si un email entrante es una respuesta a una solicitud de seguimiento
   */
  static async isFollowUpResponse(emailData: EmailData): Promise<{
    isResponse: boolean;
    quotationId?: string;
    followUpRecord?: FollowUpRecord;
  }> {
    const followUps = await this.loadFollowUps();
    const senderEmail = emailData.fromEmail || emailData.from;

    // Buscar registros de seguimiento para este email
    const clientRecords = followUps.filter(f => 
      f.clientEmail.toLowerCase() === senderEmail.toLowerCase() &&
      f.status === "pending_info"
    );

    if (clientRecords.length === 0) {
      return { isResponse: false };
    }

    // Verificar si el email contiene información relevante o referencia a cotización
    const emailBody = emailData.body.toLowerCase();
    const emailSubject = emailData.subject.toLowerCase();

    for (const record of clientRecords) {
      const quotationRef = record.quotationId.toLowerCase();
      
      if (
        emailBody.includes(quotationRef) ||
        emailSubject.includes(quotationRef) ||
        emailSubject.includes("cotización") ||
        emailSubject.includes("viaje")
      ) {
        return {
          isResponse: true,
          quotationId: record.quotationId,
          followUpRecord: record
        };
      }
    }

    return { isResponse: false };
  }

  /**
   * Limpia registros antiguos de seguimiento
   */
  static async cleanupOldRecords(daysOld: number = 30): Promise<number> {
    const followUps = await this.loadFollowUps();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const initialCount = followUps.length;
    const filtered = followUps.filter(record => {
      const recordDate = new Date(record.lastContactDate);
      return recordDate > cutoffDate || record.status === "pending_info";
    });

    await this.saveFollowUps(filtered);
    return initialCount - filtered.length;
  }
}
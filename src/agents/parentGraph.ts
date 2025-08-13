import { SimpleLogger } from "../utils/simpleLogger.js";
import { EmailData, SimpleQuotation } from "../types/simpleQuotation.js";
import { readEmailsTool } from "../tools/gmailTools.js";
import { buildProcessEmailGraph, ProcessEmailGraph } from "./processEmailGraph.js";

export class ParentGraph {
  private processEmailGraphInstance: ProcessEmailGraph;

  constructor() {
    this.processEmailGraphInstance = buildProcessEmailGraph();
  }

  async processEmailsBatch(options: {
    maxEmails?: number;
    concurrency?: number;
    perEmail?: {
      recursionLimit?: number;
      timeoutMs?: number;
    };
  } = {}): Promise<SimpleQuotation[]> {
    try {
      const config = {
        maxEmails: options.maxEmails || 50,
        concurrency: options.concurrency || 3,
        perEmailConfig: {
          recursionLimit: options.perEmail?.recursionLimit || 50,
          timeoutMs: options.perEmail?.timeoutMs || 25000,
        },
      };

      SimpleLogger.startSession();
      console.log(`🚀 Iniciando procesamiento batch con configuración:`);
      console.log(`   📊 Max emails: ${config.maxEmails}`);
      console.log(`   🔄 Concurrencia: ${config.concurrency}`);
      console.log(`   🔁 Recursión por email: ${config.perEmailConfig.recursionLimit}`);
      console.log(`   ⏱️  Timeout por email: ${config.perEmailConfig.timeoutMs}ms\n`);

      const startTime = Date.now();

      // Read emails
      console.log(`📧 Leyendo hasta ${config.maxEmails} emails...`);
      const emailsResult = await readEmailsTool.invoke({ 
        maxResults: config.maxEmails 
      });

      if (emailsResult.emails.length === 0) {
        console.log("📭 No se encontraron emails para procesar");
        return [];
      }

      console.log(`📬 ${emailsResult.emails.length} emails encontrados para procesar`);

      // Process emails with controlled concurrency using Promise.allSettled
      const results: SimpleQuotation[] = [];
      const pLimit = (await import('p-limit')).default;
      const limit = pLimit(config.concurrency);

      const processingPromises = emailsResult.emails.map((email, index) =>
        limit(async () => {
          const emailIndex = index + 1;
          const totalEmails = emailsResult.emails.length;

          console.log(`⚙️  Procesando email ${emailIndex}/${totalEmails}: ${email.subject}`);
          const emailStartTime = Date.now();

          try {
            const result = await this.processEmailGraphInstance.processEmail(email, {
              recursionLimit: config.perEmailConfig.recursionLimit,
              timeout: config.perEmailConfig.timeoutMs,
            });

            const processingTime = Date.now() - emailStartTime;

            if (result.quotation) {
              SimpleLogger.logEmailProcessing({
                index: emailIndex,
                total: totalEmails,
                from: email.from,
                subject: email.subject,
                result: "COTIZACIÓN B2C",
                quoteId: result.quotation.id,
              });

              console.log(`✅ Email ${emailIndex}/${totalEmails} procesado (${processingTime}ms) - Cotización creada: ${result.quotation.id}`);
              return { success: true, quotation: result.quotation };
            } else {
              const errorMsg = result.error || "No se pudo procesar como cotización";
              
              SimpleLogger.logEmailProcessing({
                index: emailIndex,
                total: totalEmails,
                from: email.from,
                subject: email.subject,
                result: "NO COTIZACIÓN",
                error: errorMsg,
              });

              console.log(`❌ Email ${emailIndex}/${totalEmails} procesado (${processingTime}ms) - ${errorMsg}`);
              return { success: false, error: errorMsg };
            }
          } catch (error) {
            console.error(`💥 Error procesando email ${emailIndex}: ${error}`);
            SimpleLogger.logError(`Error processing email ${email.id}`, error as Error);
            return { success: false, error: `Error procesando email: ${error}` };
          }
        })
      );

      // Wait for all processing to complete
      const processedResults = await Promise.allSettled(processingPromises);
      
      // Collect successful quotations
      processedResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.quotation) {
          results.push(result.value.quotation);
        }
      });

      // Final summary
      const processingTimeMs = Date.now() - startTime;
      const emailsProcessed = emailsResult.emails.length;
      const quotationsCreated = results.length;
      const notQuotations = emailsProcessed - quotationsCreated;

      const quotationsSummary = results.map((q: SimpleQuotation) => ({
        id: q.id,
        clientName: q.clientName,
        subject: q.subject,
        type: "B2C" as "B2B" | "B2C",
      }));

      SimpleLogger.logProcessingSummary({
        emailsProcessed,
        quotationsCreated,
        notQuotations,
        processingTimeMs,
        quotations: quotationsSummary,
      });

      console.log(`\n🎯 Procesamiento completado:`);
      console.log(`   📧 Emails procesados: ${emailsProcessed}`);
      console.log(`   ✅ Cotizaciones creadas: ${quotationsCreated}`);
      console.log(`   ❌ No cotizaciones: ${notQuotations}`);
      console.log(`   ⏱️  Tiempo total: ${Math.round(processingTimeMs / 1000)}s`);

      if (quotationsCreated > 0) {
        console.log(`\n📋 Cotizaciones creadas:`);
        quotationsSummary.forEach((q, idx) => {
          console.log(`   ${idx + 1}. ${q.clientName} - ${q.subject} (ID: ${q.id.substring(0, 8)}...)`);
        });
      }

      return results;
    } catch (error) {
      SimpleLogger.logError("Error in batch processing", error as Error);
      throw error;
    }
  }
}

// Factory function
export function buildParentGraph(): ParentGraph {
  return new ParentGraph();
}

// Keep this for backward compatibility but make it an alias
export function buildParentGraphFallback(): ParentGraph {
  return new ParentGraph();
}
import { 
  ConfigGmail, 
  SimpleQuotation, 
  BatchProcessingResult,
  EmailProcessingConfig 
} from "../types/simpleQuotation.js";
import { initializeGmailTools } from "../tools/gmailTools.js";
import { SimpleLogger } from "../utils/simpleLogger.js";
import { buildParentGraph } from "./parentGraph.js";

export class SimpleQuoteAgent {
  constructor(config: ConfigGmail) {
    // Initialize Gmail tools with the provided configuration
    initializeGmailTools(config);
  }

  // Enhanced map-reduce processing method with comprehensive metrics
  async processEmailsMapReduce(opts?: EmailProcessingConfig): Promise<BatchProcessingResult> {
    try {
      // Use the parent graph to process emails in batches with enhanced configuration
      const parentGraph = buildParentGraph();
      const result = await parentGraph.processEmailsBatch(opts);
      
      console.log(`✅ Procesamiento Map-Reduce completado:`);
      console.log(`   📊 ${result.summary.totalEmails} emails procesados`);
      console.log(`   ✅ ${result.summary.successfulQuotations} cotizaciones creadas`);
      console.log(`   📈 Tasa de éxito: ${result.metrics.successRate.toFixed(1)}%`);
      console.log(`   ⏱️  Tiempo: ${result.summary.processingTime}`);
      
      return result;
    } catch (error) {
      SimpleLogger.logError("Error en procesamiento Map-Reduce", error as Error);
      throw error;
    }
  }

  // Legacy method for backward compatibility - now delegates to map-reduce
  async processEmails(): Promise<SimpleQuotation[]> {
    console.log("⚠️  Usando método legacy processEmails() - delegando a processEmailsMapReduce()");
    const result = await this.processEmailsMapReduce({
      maxEmails: 5, // Smaller batch for legacy method
      concurrency: 2,
      retries: 1,
      perEmail: {
        recursionLimit: 50,
        timeoutMs: 25000,
      },
    });
    
    // Return only quotations for backward compatibility
    return result.quotations;
  }
}
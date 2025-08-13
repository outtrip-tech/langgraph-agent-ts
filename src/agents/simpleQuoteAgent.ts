import { ConfigGmail, SimpleQuotation } from "../types/simpleQuotation.js";
import { initializeGmailTools } from "../tools/gmailTools.js";
import { SimpleLogger } from "../utils/simpleLogger.js";
import { buildParentGraph } from "./parentGraph.js";

export class SimpleQuoteAgent {
  constructor(config: ConfigGmail) {
    // Initialize Gmail tools with the provided configuration
    initializeGmailTools(config);
  }

  // New map-reduce processing method with subgraph per email
  async processEmailsMapReduce(opts?: {
    maxEmails?: number;
    concurrency?: number;
    perEmail?: {
      recursionLimit?: number;
      timeoutMs?: number;
    };
  }): Promise<SimpleQuotation[]> {
    try {
      // Set default options
      const options = {
        maxEmails: opts?.maxEmails || 50,
        concurrency: opts?.concurrency || 3,
        perEmail: {
          recursionLimit: opts?.perEmail?.recursionLimit || 50,
          timeoutMs: opts?.perEmail?.timeoutMs || 25000,
        },
      };

      console.log(`🚀 Iniciando procesamiento Map-Reduce:`);
      console.log(`   📊 Max emails: ${options.maxEmails}`);
      console.log(`   🔄 Concurrencia: ${options.concurrency}`);
      console.log(`   🔁 Límite recursión por email: ${options.perEmail.recursionLimit}`);
      console.log(`   ⏱️  Timeout por email: ${options.perEmail.timeoutMs}ms`);

      // Use the parent graph to process emails in batches
      const parentGraph = buildParentGraph();
      const quotations = await parentGraph.processEmailsBatch(options);
      console.log(`✅ Procesamiento Map-Reduce completado`);
      return quotations;
    } catch (error) {
      SimpleLogger.logError("Error en procesamiento Map-Reduce", error as Error);
      throw error;
    }
  }

  // Legacy method for backward compatibility - now delegates to map-reduce
  async processEmails(): Promise<SimpleQuotation[]> {
    console.log("⚠️  Usando método legacy processEmails() - delegando a processEmailsMapReduce()");
    return this.processEmailsMapReduce({
      maxEmails: 5, // Smaller batch for legacy method
      concurrency: 2,
      perEmail: {
        recursionLimit: 50,
        timeoutMs: 25000,
      },
    });
  }
}
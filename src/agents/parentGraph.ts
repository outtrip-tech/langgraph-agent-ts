import pLimit from "p-limit";
import { StateGraph, Annotation, Send } from "@langchain/langgraph";
import { SimpleLogger } from "../utils/simpleLogger.js";
import { 
  EmailData, 
  SimpleQuotation, 
  ProcessingMetrics, 
  BatchProcessingResult,
  EmailProcessingConfig
} from "../types/simpleQuotation.js";
import { readEmailsTool } from "../tools/gmailTools.js";
import { buildProcessEmailGraph, ProcessEmailGraph } from "./processEmailGraph.js";

// State definition for the parent graph
const ParentStateAnnotation = Annotation.Root({
  emails: Annotation<EmailData[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  quotations: Annotation<SimpleQuotation[]>({
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  }),
  errors: Annotation<Array<{ emailId: string; error: string; timestamp: string }>>({
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  }),
  config: Annotation<Required<EmailProcessingConfig>>({
    reducer: (x, y) => y ?? x,
  }),
  startTime: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => Date.now(),
  }),
  finished: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  metrics: Annotation<ProcessingMetrics | undefined>({
    reducer: (x, y) => y ?? x,
  }),
});

export type ParentState = typeof ParentStateAnnotation.State;

export class ParentGraph {
  private graph: any;
  private processEmailGraphInstance: ProcessEmailGraph;

  constructor() {
    this.processEmailGraphInstance = buildProcessEmailGraph();
    this.initializeGraph();
  }

  private initializeGraph() {
    const workflow = new StateGraph(ParentStateAnnotation)
      .addNode("readBatch", this.readBatch.bind(this))
      .addNode("mapEmails", this.mapEmails.bind(this))
      .addNode("processEmailNode", this.processEmailNode.bind(this))
      .addNode("aggregate", this.aggregate.bind(this))
      .addEdge("__start__", "readBatch")
      .addConditionalEdges(
        "readBatch",
        this.routeAfterRead.bind(this),
        {
          process: "mapEmails",
          aggregate: "aggregate",
        }
      )
      .addEdge("mapEmails", "processEmailNode")
      .addEdge("processEmailNode", "aggregate")
      .addEdge("aggregate", "__end__");

    this.graph = workflow.compile();
  }

  // Node: Read batch of emails
  private async readBatch(state: ParentState): Promise<Partial<ParentState>> {
    try {
      SimpleLogger.startSession();
      const config = state.config;
      
      console.log(`📧 Leyendo hasta ${config.maxEmails} emails...`);
      
      const result = await readEmailsTool.invoke({ 
        maxResults: config.maxEmails 
      });

      if (result.emails.length === 0) {
        console.log("📭 No se encontraron emails para procesar");
        return {
          emails: [],
          finished: true,
        };
      }

      console.log(`📬 ${result.emails.length} emails encontrados para procesar`);
      
      return {
        emails: result.emails,
        startTime: Date.now(),
      };
    } catch (error) {
      SimpleLogger.logError("Error reading email batch", error as Error);
      return {
        finished: true,
        errors: [{
          emailId: "batch_read",
          error: `Error leyendo emails: ${error}`,
          timestamp: new Date().toISOString(),
        }],
      };
    }
  }

  // Node: Map emails to individual processing using Send
  private mapEmails(state: ParentState): Send[] {
    try {
      if (!state.emails || state.emails.length === 0) {
        return [];
      }

      console.log(`🔄 Iniciando procesamiento de ${state.emails.length} emails con concurrencia ${state.config.concurrency}`);

      // Use Send to fan-out to individual email processors
      return state.emails.map((email, index) =>
        new Send(
          "processEmailNode",
          {
            email,
            emailIndex: index + 1,
            totalEmails: state.emails!.length,
            config: state.config,
          }
        )
      );
    } catch (error) {
      SimpleLogger.logError("Error mapping emails", error as Error);
      return [];
    }
  }

  // Node: Process individual email (receives data from Send)
  private async processEmailNode(
    data: { 
      email: EmailData; 
      emailIndex: number; 
      totalEmails: number;
      config: Required<EmailProcessingConfig>;
    }
  ): Promise<{ quotation?: SimpleQuotation; error?: { emailId: string; error: string; timestamp: string } }> {
    const { email, emailIndex, totalEmails, config } = data;
    
    console.log(`⚙️  Procesando email ${emailIndex}/${totalEmails}: ${email.subject}`);
    const startTime = Date.now();

    // Implement retry mechanism
    let lastError: string = "";
    
    for (let attempt = 1; attempt <= (config.retries || 1); attempt++) {
      try {
        const result = await this.processEmailGraphInstance.processEmail(email, {
          recursionLimit: config.perEmail?.recursionLimit || 50,
          timeout: config.perEmail?.timeoutMs || 25000,
        });

        const processingTime = Date.now() - startTime;

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
          return { quotation: result.quotation };
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
          return {};
        }
      } catch (error) {
        lastError = `Error procesando email (intento ${attempt}/${config.retries || 1}): ${error}`;
        console.error(`💥 ${lastError}`);
        
        if (attempt < (config.retries || 1)) {
          console.log(`🔄 Reintentando email ${emailIndex}/${totalEmails}...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff
        } else {
          SimpleLogger.logError(`Failed to process email ${email.id} after ${config.retries || 1} attempts`, error as Error);
          
          return { 
            error: {
              emailId: email.id,
              error: lastError,
              timestamp: new Date().toISOString(),
            }
          };
        }
      }
    }

    return {};
  }

  // Node: Aggregate results and generate metrics
  private async aggregate(state: ParentState): Promise<Partial<ParentState>> {
    try {
      const processingTimeMs = Date.now() - state.startTime;
      const emailsProcessed = state.emails ? state.emails.length : 0;
      const quotationsCreated = state.quotations ? state.quotations.length : 0;
      const errors = state.errors || [];

      // Generate comprehensive metrics
      const metrics: ProcessingMetrics = {
        emailsProcessed,
        quotationsCreated,
        notQuotations: emailsProcessed - quotationsCreated,
        processingTimeMs,
        avgProcessingTimePerEmail: emailsProcessed > 0 ? processingTimeMs / emailsProcessed : 0,
        successRate: emailsProcessed > 0 ? (quotationsCreated / emailsProcessed) * 100 : 0,
        errors,
      };

      // Log summary using existing SimpleLogger
      const quotationsSummary = (state.quotations || []).map((q: SimpleQuotation) => ({
        id: q.id,
        clientName: q.clientName,
        subject: q.subject,
        type: "B2C" as "B2B" | "B2C",
      }));

      SimpleLogger.logProcessingSummary({
        emailsProcessed: metrics.emailsProcessed,
        quotationsCreated: metrics.quotationsCreated,
        notQuotations: metrics.notQuotations,
        processingTimeMs: metrics.processingTimeMs,
        quotations: quotationsSummary,
      });

      console.log(`\n🎯 Procesamiento completado:`);
      console.log(`   📧 Emails procesados: ${metrics.emailsProcessed}`);
      console.log(`   ✅ Cotizaciones creadas: ${metrics.quotationsCreated}`);
      console.log(`   ❌ No cotizaciones: ${metrics.notQuotations}`);
      console.log(`   📊 Tasa de éxito: ${metrics.successRate.toFixed(1)}%`);
      console.log(`   ⏱️  Tiempo total: ${Math.round(metrics.processingTimeMs / 1000)}s`);
      console.log(`   ⚡ Promedio por email: ${Math.round(metrics.avgProcessingTimePerEmail)}ms`);

      if (errors.length > 0) {
        console.log(`   ⚠️  Errores: ${errors.length}`);
      }

      if (quotationsCreated > 0) {
        console.log(`\n📋 Cotizaciones creadas:`);
        quotationsSummary.forEach((q, idx) => {
          console.log(`   ${idx + 1}. ${q.clientName} - ${q.subject} (ID: ${q.id.substring(0, 8)}...)`);
        });
      }

      return {
        finished: true,
        // Store metrics in state for retrieval
        metrics,
      };
    } catch (error) {
      SimpleLogger.logError("Error aggregating results", error as Error);
      return {
        finished: true,
        errors: [...(state.errors || []), {
          emailId: "aggregation",
          error: `Error agregando resultados: ${error}`,
          timestamp: new Date().toISOString(),
        }],
      };
    }
  }

  // Routing function
  private routeAfterRead(state: ParentState): string {
    if (state.finished || !state.emails || state.emails.length === 0) {
      return "aggregate";
    }
    return "process";
  }

  // Enhanced public method with structured return
  async processEmailsBatch(options: EmailProcessingConfig = {}): Promise<BatchProcessingResult> {
    try {
      // Set comprehensive defaults
      const config: Required<EmailProcessingConfig> = {
        maxEmails: options.maxEmails || 50,
        concurrency: options.concurrency || 3,
        retries: options.retries || 1,
        perEmail: {
          recursionLimit: options.perEmail?.recursionLimit || 50,
          timeoutMs: options.perEmail?.timeoutMs || 25000,
        },
      };

      console.log(`🚀 Iniciando procesamiento batch con configuración avanzada:`);
      console.log(`   📊 Max emails: ${config.maxEmails}`);
      console.log(`   🔄 Concurrencia: ${config.concurrency}`);
      console.log(`   🔁 Reintentos: ${config.retries}`);
      console.log(`   🔁 Recursión por email: ${config.perEmail.recursionLimit}`);
      console.log(`   ⏱️  Timeout por email: ${config.perEmail.timeoutMs}ms\n`);

      let result: any;
      
      try {
        // Try StateGraph approach first
        result = await this.graph.invoke({ config });
      } catch (sendError) {
        console.log(`⚠️  StateGraph Send/Command failed, using fallback: ${sendError}`);
        // Fallback to direct processing
        result = await this.processBatchFallback(config);
      }

      const quotations = result.quotations || [];
      const errors = result.errors || [];
      const metrics = result.metrics || this.calculateFallbackMetrics(quotations, errors, Date.now() - result.startTime);

      const summary = {
        totalEmails: metrics.emailsProcessed,
        successfulQuotations: metrics.quotationsCreated,
        failedEmails: errors.length,
        processingTime: `${Math.round(metrics.processingTimeMs / 1000)}s`,
      };

      return {
        quotations,
        metrics,
        summary,
      };
    } catch (error) {
      SimpleLogger.logError("Error in batch processing", error as Error);
      throw error;
    }
  }

  // Fallback method using p-limit
  private async processBatchFallback(config: Required<EmailProcessingConfig>): Promise<any> {
    const startTime = Date.now();
    
    // Read emails
    console.log(`📧 Leyendo hasta ${config.maxEmails} emails...`);
    const emailsResult = await readEmailsTool.invoke({ maxResults: config.maxEmails });

    if (emailsResult.emails.length === 0) {
      console.log("📭 No se encontraron emails para procesar");
      return { quotations: [], errors: [], startTime };
    }

    console.log(`📬 ${emailsResult.emails.length} emails encontrados para procesar`);

    // Process with concurrency control
    const quotations: SimpleQuotation[] = [];
    const errors: Array<{ emailId: string; error: string; timestamp: string }> = [];
    const limit = pLimit(config.concurrency);

    const processingPromises = emailsResult.emails.map((email, index) =>
      limit(async () => {
        const result = await this.processEmailNode({
          email,
          emailIndex: index + 1,
          totalEmails: emailsResult.emails.length,
          config,
        });

        if (result.quotation) {
          quotations.push(result.quotation);
        } else if (result.error) {
          errors.push(result.error);
        }
      })
    );

    await Promise.allSettled(processingPromises);

    const metrics = this.calculateFallbackMetrics(quotations, errors, Date.now() - startTime);

    return { quotations, errors, metrics, startTime };
  }

  private calculateFallbackMetrics(
    quotations: SimpleQuotation[], 
    errors: Array<{ emailId: string; error: string; timestamp: string }>,
    processingTimeMs: number
  ): ProcessingMetrics {
    const emailsProcessed = quotations.length + errors.length;
    
    return {
      emailsProcessed,
      quotationsCreated: quotations.length,
      notQuotations: errors.length,
      processingTimeMs,
      avgProcessingTimePerEmail: emailsProcessed > 0 ? processingTimeMs / emailsProcessed : 0,
      successRate: emailsProcessed > 0 ? (quotations.length / emailsProcessed) * 100 : 0,
      errors,
    };
  }
}

// Factory function
export function buildParentGraph(): ParentGraph {
  return new ParentGraph();
}

// Backward compatibility
export function buildParentGraphFallback(): ParentGraph {
  return new ParentGraph();
}
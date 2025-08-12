import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { SimpleDataManager } from "../utils/simpleDataManager.js";
import { SimpleLogger, EmailProcessingResult } from "../utils/simpleLogger.js";
import {
  EmailData,
  ConfigGmail,
  ClassificationResult,
  SimpleQuotation,
  SimpleExtractionResult,
} from "../types/simpleQuotation.js";
import {
  getClassificationPrompt,
  parseClassificationResponse,
  classifyEmailMultiLevel,
} from "../prompts/classification.js";
import {
  getSimpleExtractionPrompt,
  parseSimpleExtractionResponse,
} from "../prompts/simpleExtraction.js";
import {
  initializeGmailTools,
  readEmailsTool,
  markAsReadTool,
  labelEmailTool,
  getStatsTool,
} from "../tools/gmailTools.js";

// State definition for the StateGraph
const StateAnnotation = Annotation.Root({
  emails: Annotation<EmailData[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentEmailIndex: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  currentEmail: Annotation<EmailData | undefined>(),
  esCotizacion: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  extractionResult: Annotation<SimpleExtractionResult | undefined>(),
  quotation: Annotation<SimpleQuotation | undefined>(),
  processedQuotations: Annotation<SimpleQuotation[]>({
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  }),
  error: Annotation<string | undefined>(),
  finished: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

export class SimpleQuoteAgent {
  private model: ChatOpenAI;
  private graph: any;

  constructor(config: ConfigGmail) {
    this.model = new ChatOpenAI({
      model: "gpt-4o-mini-2024-07-18",
      temperature: 0,
      maxTokens: 1000,
    });

    // Initialize Gmail tools
    initializeGmailTools(config);
    this.initializeGraph();
  }

  private initializeGraph() {
    const workflow = new StateGraph(StateAnnotation)
      .addNode("leerEmails", this.leerEmails.bind(this))
      .addNode("clasificarEmail", this.clasificarEmail.bind(this))
      .addNode("extraerDatos", this.extraerDatos.bind(this))
      .addNode("generarCotizacion", this.generarCotizacion.bind(this))
      .addNode("procesarEmail", this.procesarEmail.bind(this))
      .addNode("finalizar", this.finalizar.bind(this))
      .addEdge("__start__", "leerEmails")
      .addConditionalEdges(
        "leerEmails",
        this.decidirDespuesLeerEmails.bind(this),
        {
          clasificar: "clasificarEmail",
          finalizar: "finalizar",
        }
      )
      .addConditionalEdges(
        "clasificarEmail",
        this.decidirDespuesClasificar.bind(this),
        {
          extraer: "extraerDatos",
          procesar: "procesarEmail",
        }
      )
      .addEdge("extraerDatos", "generarCotizacion")
      .addEdge("generarCotizacion", "procesarEmail")
      .addConditionalEdges(
        "procesarEmail",
        this.decidirDespuesProcesar.bind(this),
        {
          continuar: "leerEmails",
          finalizar: "finalizar",
        }
      )
      .addEdge("finalizar", "__end__");

    this.graph = workflow.compile();
  }

  // Node: Read emails
  private async leerEmails(state: any): Promise<any> {
    try {
      // If we have emails and haven't finished processing, get next email
      if (
        state.emails.length > 0 &&
        state.currentEmailIndex < state.emails.length
      ) {
        const currentEmail = state.emails[state.currentEmailIndex];

        return {
          currentEmail,
        };
      }

      // First time or need to read new emails

      const result = await readEmailsTool.invoke({ maxResults: 5 });

      if (result.emails.length === 0) {
        return {
          emails: [],
          finished: true,
        };
      }

      return {
        emails: result.emails,
        currentEmailIndex: 0,
        currentEmail: result.emails[0],
        finished: false,
      };
    } catch (error) {
      return {
        error: `Error leyendo emails: ${error}`,
        finished: true,
      };
    }
  }

  // Node: Classify email
  private async clasificarEmail(state: any): Promise<any> {
    try {
      if (!state.currentEmail) {
        return { error: "No hay email actual para clasificar" };
      }

      const { subject, body, fromEmail } = state.currentEmail;

      // Prepare logging info
      const emailIndex = state.currentEmailIndex + 1;
      const totalEmails = state.emails.length;

      // First, use multi-level classification engine
      const multiLevelResult = classifyEmailMultiLevel(
        subject,
        body,
        fromEmail
      );

      let result: ClassificationResult;

      // Decide if LLM validation is needed
      const needsLLMValidation =
        (multiLevelResult.finalConfidence >= 40 &&
          multiLevelResult.finalConfidence <= 80) ||
        multiLevelResult.quoteType === "unclear";

      if (!needsLLMValidation) {
        // High confidence from multi-level analysis - skip LLM
        result = {
          is_quote: multiLevelResult.isQuoteRequest,
          confidence: multiLevelResult.finalConfidence,
          signals: multiLevelResult.allSignals,
          quote_type:
            multiLevelResult.quoteType === "unclear"
              ? null
              : multiLevelResult.quoteType,
        };
      } else {
        // Medium confidence - use LLM for validation

        const prompt = getClassificationPrompt(subject, body);

        const response = await this.model.invoke([
          new SystemMessage(
            "Eres un asistente especializado en identificar consultas de viajes y turismo para una agencia de viajes profesional."
          ),
          new HumanMessage(prompt),
        ]);

        result = parseClassificationResponse(response.content.toString());

        // Cross-validation between multi-level and LLM results
        if (
          multiLevelResult.isQuoteRequest &&
          !result.is_quote &&
          multiLevelResult.finalConfidence >= 60
        ) {
          console.log(
            `⚠️  Discrepancia: Multi-nivel dice SÍ, LLM dice NO - usando multi-nivel`
          );
          result.is_quote = true;
          result.confidence = Math.max(
            result.confidence,
            multiLevelResult.finalConfidence
          );
        } else if (
          !multiLevelResult.isQuoteRequest &&
          result.is_quote &&
          result.confidence < 70
        ) {
          console.log(
            `⚠️  Discrepancia: Multi-nivel dice NO, LLM dice SÍ con baja confianza - usando multi-nivel`
          );
          result.is_quote = false;
          result.confidence = multiLevelResult.finalConfidence;
        }

        // Enhance with multi-level signals
        result.signals = [
          ...new Set([...result.signals, ...multiLevelResult.allSignals]),
        ];
        result.quote_type = result.quote_type || multiLevelResult.quoteType;
      }

      // Early exit for very low confidence
      if (result.confidence < 30) {
        labelEmailTool
          .invoke({
            emailId: state.currentEmail.id,
            label: "NOT_QUOTE",
          })
          .catch(() => {
            // Silenciar errores de etiquetado
          });

        // Log processing result
        SimpleLogger.logEmailProcessing({
          index: emailIndex,
          total: totalEmails,
          from: state.currentEmail.from,
          subject: subject,
          result: "NO COTIZACIÓN",
          error: `Confianza muy baja (${result.confidence}%)`,
        });

        return { esCotizacion: false };
      }

      const isQuote = result.is_quote && result.confidence >= 70;

      // Determine result type for logging
      let resultType: EmailProcessingResult["result"] = "NO COTIZACIÓN";
      if (isQuote) {
        resultType =
          result.quote_type === "B2B" ? "COTIZACIÓN B2B" : "COTIZACIÓN B2C";
      }

      // Label the email based on classification
      labelEmailTool
        .invoke({
          emailId: state.currentEmail.id,
          label: isQuote ? "QUOTE" : "NOT_QUOTE",
        })
        .catch(() => {
          // Silenciar errores de etiquetado
        });

      // Store result for later logging (will be completed when quotation is created or processing finishes)
      return {
        esCotizacion: isQuote,
        classificationResult: result,
        loggingInfo: { emailIndex, totalEmails, resultType },
      };
    } catch (error) {
      return {
        error: `Error clasificando email: ${error}`,
        esCotizacion: false,
      };
    }
  }

  // Node: Extract data
  private async extraerDatos(state: any): Promise<any> {
    try {
      if (!state.currentEmail) {
        return { error: "No hay email para extraer datos" };
      }

      const { subject, body, from, fromEmail } = state.currentEmail;
      const fromName = from.includes("<")
        ? from.split("<")[0].trim().replace(/"/g, "")
        : from;
      const cleanFromEmail = fromEmail || from;

      const prompt = getSimpleExtractionPrompt(
        subject,
        body,
        cleanFromEmail,
        fromName
      );

      const response = await this.model.invoke([
        new SystemMessage(
          "Eres un especialista en extraer información básica de solicitudes turísticas. Extrae solo datos que estén claramente mencionados, no inventes información."
        ),
        new HumanMessage(prompt),
      ]);

      const extractionResult: SimpleExtractionResult =
        parseSimpleExtractionResponse(response.content.toString());

      // Early validation - skip if very low confidence or no useful data
      if (
        extractionResult.confidence < 30 ||
        (!extractionResult.destination &&
          !extractionResult.dates &&
          !extractionResult.travelers)
      ) {
        return {
          extractionResult,
          error: "Datos insuficientes para crear cotización",
        };
      }

      return { extractionResult };
    } catch (error) {
      return {
        error: `Error extrayendo datos: ${error}`,
        extractionResult: { confidence: 0 },
      };
    }
  }

  // Node: Create quotation
  private async generarCotizacion(state: any): Promise<any> {
    try {
      if (!state.currentEmail || !state.extractionResult) {
        return { error: "Faltan datos para crear cotización" };
      }

      // Silent quotation creation
      const { currentEmail, extractionResult } = state;

      // Extract clean email from "from" field
      const fromEmail =
        currentEmail.fromEmail ||
        (currentEmail.from.includes("<")
          ? currentEmail.from.match(/<([^>]+)>/)?.[1]
          : currentEmail.from) ||
        currentEmail.from;

      // Create quotation
      const quotation = await SimpleDataManager.createQuotation({
        clientName: extractionResult.clientName || "Cliente",
        clientEmail: fromEmail,
        subject: currentEmail.subject,
        destination: extractionResult.destination || "",
        dates: extractionResult.dates || "",
        travelers: extractionResult.travelers || "",
        budget: extractionResult.budget || "",
        notes:
          extractionResult.notes || `Email original de: ${currentEmail.from}`,
        emailId: currentEmail.id,
      });

      // Silent quotation creation - logging handled in procesarEmail

      return { quotation };
    } catch (error) {
      return {
        error: `Error creando cotización: ${error}`,
      };
    }
  }

  // Node: Process email (mark as processed)
  private async procesarEmail(state: any): Promise<any> {
    try {
      if (!state.currentEmail) {
        return { error: "No hay email para procesar" };
      }

      const { currentEmail, loggingInfo } = state;

      // Batch Gmail operations for better performance
      try {
        await Promise.all([
          markAsReadTool.invoke({ emailId: currentEmail.id }),
          labelEmailTool
            .invoke({
              emailId: currentEmail.id,
              label: "PROCESSED",
            })
            .catch(() => {
              // Silenciar errores de etiquetado - no son críticos
            }),
        ]);
      } catch (error) {
        // Solo marcar como leído si falla el etiquetado
        try {
          await markAsReadTool.invoke({ emailId: currentEmail.id });
        } catch (markError) {}
      }

      if (loggingInfo) {
        SimpleLogger.logEmailProcessing({
          index: loggingInfo.emailIndex,
          total: loggingInfo.totalEmails,
          from: currentEmail.from,
          subject: currentEmail.subject,
          result: loggingInfo.resultType,
          quoteId: state.quotation?.id,
        });
      }

      // Add quotation to processed list if created
      const newProcessedQuotations = state.quotation ? [state.quotation] : [];

      // Move to next email
      const nextIndex = state.currentEmailIndex + 1;
      const hasMoreEmails = nextIndex < state.emails.length;

      return {
        currentEmailIndex: nextIndex,
        processedQuotations: newProcessedQuotations,
        currentEmail: undefined, // Clear current email
        quotation: undefined, // Clear quotation
        extractionResult: undefined, // Clear extraction result
        esCotizacion: false, // Reset flag
        finished: !hasMoreEmails,
        error: undefined, // Clear any previous errors
      };
    } catch (error) {
      console.error("❌ Error procesando email:", error);
      return {
        error: `Error procesando email: ${error}`,
        finished: true,
      };
    }
  }

  // Node: Finalize
  private async finalizar(_state: any): Promise<any> {
    return { finished: true };
  }

  // Routing functions (optimized for smart routing)
  private decidirDespuesLeerEmails(state: any): string {
    // Fast path for completion
    if (state.finished || state.error || !state.currentEmail) {
      return "finalizar";
    }
    return "clasificar";
  }

  private decidirDespuesClasificar(state: any): string {
    // Smart routing - avoid unnecessary processing
    if (state.error) {
      return "procesar"; // Process with error to mark as read
    }

    // Early exit for non-quotes
    if (!state.esCotizacion) {
      return "procesar"; // Skip extraction, go straight to processing
    }

    return "extraer";
  }

  private decidirDespuesProcesar(state: any): string {
    // Early termination conditions
    if (state.finished || state.error) {
      return "finalizar";
    }
    return "continuar"; // Continue with next email
  }

  // Main processing method - maintains same API as before
  async processEmails(): Promise<SimpleQuotation[]> {
    try {
      // Initialize clean logging
      SimpleLogger.startSession();

      // Initialize state
      const initialState = {
        emails: [],
        currentEmailIndex: 0,
        processedQuotations: [],
        finished: false,
      };

      const startTime = Date.now();

      // Run the graph
      const result = await this.graph.invoke(initialState);

      const processedQuotations = result.processedQuotations || [];
      const processingTimeMs = Date.now() - startTime;

      // Get statistics for summary
      await getStatsTool.invoke({});

      // Calculate summary data
      const emailsProcessed = result.emails?.length || 0;
      const quotationsCreated = processedQuotations.length;
      const notQuotations = emailsProcessed - quotationsCreated;

      // Prepare quotations for summary
      const quotationsSummary = processedQuotations.map(
        (q: SimpleQuotation) => ({
          id: q.id,
          clientName: q.clientName,
          subject: q.subject,
          type: "B2C" as "B2B" | "B2C", // Default for now, could be enhanced
        })
      );

      // Display clean summary
      SimpleLogger.logProcessingSummary({
        emailsProcessed,
        quotationsCreated,
        notQuotations,
        processingTimeMs,
        quotations: quotationsSummary,
      });

      return processedQuotations;
    } catch (error) {
      SimpleLogger.logError("Error en procesamiento principal", error as Error);
      throw error;
    }
  }
}

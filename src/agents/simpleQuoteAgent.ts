import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { SimpleDataManager } from "../utils/simpleDataManager.js";
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
      model: "gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 2000,
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
      console.log("📧 Nodo: Leyendo emails...");

      // If we have emails and haven't finished processing, get next email
      if (state.emails.length > 0 && state.currentEmailIndex < state.emails.length) {
        const currentEmail = state.emails[state.currentEmailIndex];
        console.log(`📋 Procesando email ${state.currentEmailIndex + 1}/${state.emails.length}: ${currentEmail.subject}`);
        
        return { 
          currentEmail,
        };
      }

      // First time or need to read new emails
      console.log("🔍 Obteniendo nuevos emails...");
      
      const result = await readEmailsTool.invoke({ maxResults: 5 });
      
      if (result.emails.length === 0) {
        console.log("✅ No hay emails para procesar");
        return { 
          emails: [],
          finished: true,
        };
      }

      console.log(`📩 ${result.emails.length} emails encontrados`);
      
      return {
        emails: result.emails,
        currentEmailIndex: 0,
        currentEmail: result.emails[0],
        finished: false,
      };

    } catch (error) {
      console.error("❌ Error leyendo emails:", error);
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

      console.log(`🔍 Nodo: Clasificando email de ${state.currentEmail.from}`);
      
      const { subject, body } = state.currentEmail;
      const prompt = getClassificationPrompt(subject, body);

      const response = await this.model.invoke([
        new SystemMessage("Eres un asistente especializado en identificar consultas de viajes y turismo para una agencia de viajes profesional."),
        new HumanMessage(prompt),
      ]);

      const result: ClassificationResult = parseClassificationResponse(
        response.content.toString()
      );

      const isQuote = result.is_quote && result.confidence >= 70;

      console.log(
        `📊 Resultado: ${
          isQuote ? "ES COTIZACIÓN" : "NO ES COTIZACIÓN"
        } (${result.confidence}%)`
      );

      // Label the email based on classification
      await labelEmailTool.invoke({ 
        emailId: state.currentEmail.id, 
        label: isQuote ? "QUOTE" : "NOT_QUOTE" 
      });

      return { esCotizacion: isQuote };

    } catch (error) {
      console.error("❌ Error clasificando email:", error);
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

      console.log("🔬 Nodo: Extrayendo datos básicos...");

      const { subject, body, from, fromEmail } = state.currentEmail;
      const fromName = from.includes("<")
        ? from.split("<")[0].trim().replace(/"/g, "")
        : from;
      const cleanFromEmail = fromEmail || from;

      const prompt = getSimpleExtractionPrompt(subject, body, cleanFromEmail, fromName);

      const response = await this.model.invoke([
        new SystemMessage(
          "Eres un especialista en extraer información básica de solicitudes turísticas. Extrae solo datos que estén claramente mencionados, no inventes información."
        ),
        new HumanMessage(prompt),
      ]);

      const extractionResult: SimpleExtractionResult = parseSimpleExtractionResponse(
        response.content.toString()
      );

      console.log(`🎯 Datos extraídos con confianza: ${extractionResult.confidence}%`);
      
      if (extractionResult.confidence < 30) {
        console.log("⚠️ Confianza muy baja en extracción");
        return { 
          extractionResult,
          error: "Confianza muy baja en extracción de datos",
        };
      }

      return { extractionResult };

    } catch (error) {
      console.error("❌ Error extrayendo datos:", error);
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

      console.log("💾 Nodo: Creando cotización simple...");

      const { currentEmail, extractionResult } = state;

      // Extract clean email from "from" field
      const fromEmail = currentEmail.fromEmail || 
        (currentEmail.from.includes("<") ? currentEmail.from.match(/<([^>]+)>/)?.[1] : currentEmail.from) ||
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
        notes: extractionResult.notes || `Email original de: ${currentEmail.from}`,
        emailId: currentEmail.id,
      });

      console.log(`✅ Cotización creada: ${quotation.id}`);
      console.log(`👤 Cliente: ${quotation.clientName} (${quotation.clientEmail})`);
      if (quotation.destination) console.log(`🌍 Destino: ${quotation.destination}`);
      if (quotation.dates) console.log(`📅 Fechas: ${quotation.dates}`);
      if (quotation.travelers) console.log(`✈️ Viajeros: ${quotation.travelers}`);
      if (quotation.budget) console.log(`💰 Presupuesto: ${quotation.budget}`);

      return { quotation };

    } catch (error) {
      console.error("❌ Error creando cotización:", error);
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

      console.log("✅ Nodo: Procesando email...");
      
      const { currentEmail } = state;

      // Mark as read
      await markAsReadTool.invoke({ emailId: currentEmail.id });
      
      // Label as processed
      await labelEmailTool.invoke({ 
        emailId: currentEmail.id, 
        label: "PROCESSED" 
      });
      
      console.log("🏷️ Email marcado como procesado");

      // Add quotation to processed list if created
      const newProcessedQuotations = state.quotation ? [state.quotation] : [];
      
      // Move to next email
      const nextIndex = state.currentEmailIndex + 1;
      const hasMoreEmails = nextIndex < state.emails.length;

      console.log("✨ Email procesado exitosamente");

      return { 
        currentEmailIndex: nextIndex,
        processedQuotations: newProcessedQuotations,
        currentEmail: undefined, // Clear current email
        quotation: undefined, // Clear quotation
        extractionResult: undefined, // Clear extraction result
        esCotizacion: false, // Reset flag
        finished: !hasMoreEmails,
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
  private async finalizar(state: any): Promise<any> {
    console.log("🏁 Nodo: Finalizando procesamiento...");
    
    if (state.error) {
      console.log("❌ Proceso terminó con errores:", state.error);
    } else {
      const quotationsCount = state.processedQuotations?.length || 0;
      console.log(`🎉 Procesamiento completado. ${quotationsCount} nuevas cotizaciones creadas`);
    }

    return { finished: true };
  }

  // Routing functions
  private decidirDespuesLeerEmails(state: any): string {
    if (state.finished || state.error || !state.currentEmail) {
      return "finalizar";
    }
    return "clasificar";
  }

  private decidirDespuesClasificar(state: any): string {
    if (state.error) {
      return "procesar"; // Process even with error to mark as read
    }
    if (state.esCotizacion) {
      return "extraer";
    }
    return "procesar"; // Not a quote, just process (mark as read)
  }

  private decidirDespuesProcesar(state: any): string {
    if (state.finished || state.error) {
      return "finalizar";
    }
    return "continuar"; // Continue with next email
  }

  // Main processing method - maintains same API as before
  async processEmails(): Promise<SimpleQuotation[]> {
    try {
      console.log("🚀 Iniciando procesamiento con StateGraph...");

      // Show current statistics
      const stats = await getStatsTool.invoke({});
      console.log(
        `📊 Estadísticas actuales: ${stats.totalQuotations} cotizaciones, ${stats.uniqueClients} clientes únicos`
      );

      // Initialize state
      const initialState = {
        emails: [],
        currentEmailIndex: 0,
        processedQuotations: [],
        finished: false,
      };

      // Run the graph
      const result = await this.graph.invoke(initialState);

      const processedQuotations = result.processedQuotations || [];
      
      console.log(`\n🎉 Procesamiento completado. ${processedQuotations.length} nuevas cotizaciones creadas`);
      
      if (result.error) {
        console.log(`⚠️ Proceso terminó con errores: ${result.error}`);
      }

      return processedQuotations;

    } catch (error) {
      console.error("❌ Error en procesamiento principal:", error);
      throw error;
    }
  }
}

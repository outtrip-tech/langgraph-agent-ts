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
  ClassificationExtractionResult,
  QuoteExtractionResult,
} from "../types/simpleQuotation.js";
import {
  getClassificationPrompt,
  parseClassificationResponse,
  classifyEmailMultiLevel,
} from "../prompts/classification.js";
import {
  getSimpleExtractionPrompt,
  parseSimpleExtractionResponse,
  validateMissingFields,
} from "../prompts/simpleExtraction.js";
import {
  initializeGmailTools,
  readEmailsTool,
  markAsReadTool,
  labelEmailTool,
  getStatsTool,
  sendReplyEmailTool,
} from "../tools/gmailTools.js";
import { FollowUpManager } from "../utils/followUpManager.js";
import { EmailTemplateGenerator } from "../templates/emailTemplates.js";
import {
  getFollowUpExtractionPrompt,
  parseFollowUpExtractionResponse,
  getResponseClassificationPrompt,
  parseResponseClassificationResponse,
} from "../prompts/followUpPrompts.js";

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
  extractionResult: Annotation<ClassificationExtractionResult | undefined>(),
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
  followUpRecord: Annotation<any>(),
  isFollowUpResponse: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  completenessEvaluation: Annotation<any>(),
  emailSent: Annotation<boolean>({
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
      .addNode("verificarSeguimiento", this.verificarSeguimiento.bind(this))
      .addNode("clasificarEmail", this.clasificarEmail.bind(this))
      .addNode("extraerDatos", this.extraerDatos.bind(this))
      .addNode("generarCotizacion", this.generarCotizacion.bind(this))
      .addNode("verificarCompletitud", this.verificarCompletitud.bind(this))
      .addNode(
        "solicitarDatosFaltantes",
        this.solicitarDatosFaltantes.bind(this)
      )
      .addNode(
        "notificarCotizacionCompleta",
        this.notificarCotizacionCompleta.bind(this)
      )
      .addNode(
        "procesarRespuestaSeguimiento",
        this.procesarRespuestaSeguimiento.bind(this)
      )
      .addNode("actualizarCotizacion", this.actualizarCotizacion.bind(this))
      .addNode("procesarEmail", this.procesarEmail.bind(this))
      .addNode("finalizar", this.finalizar.bind(this))
      .addEdge("__start__", "leerEmails")
      .addConditionalEdges(
        "leerEmails",
        this.decidirDespuesLeerEmails.bind(this),
        {
          verificarSeguimiento: "verificarSeguimiento",
          clasificar: "clasificarEmail",
          finalizar: "finalizar",
        }
      )
      .addConditionalEdges(
        "verificarSeguimiento",
        this.decidirDespuesVerificarSeguimiento.bind(this),
        {
          procesarRespuesta: "procesarRespuestaSeguimiento",
          clasificar: "clasificarEmail",
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
      .addEdge("generarCotizacion", "verificarCompletitud")
      .addConditionalEdges(
        "verificarCompletitud",
        this.decidirDespuesVerificarCompletitud.bind(this),
        {
          solicitar: "solicitarDatosFaltantes",
          notificar: "notificarCotizacionCompleta",
          procesar: "procesarEmail",
        }
      )
      .addEdge("solicitarDatosFaltantes", "procesarEmail")
      .addEdge("notificarCotizacionCompleta", "procesarEmail")
      .addEdge("procesarRespuestaSeguimiento", "actualizarCotizacion")
      .addEdge("actualizarCotizacion", "verificarCompletitud")
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

  // Node: Verificar si email es respuesta de seguimiento
  private async verificarSeguimiento(state: any): Promise<any> {
    try {
      if (!state.currentEmail) {
        return { error: "No hay email actual para verificar seguimiento" };
      }

      const followUpCheck = await FollowUpManager.isFollowUpResponse(
        state.currentEmail
      );

      if (followUpCheck.isResponse) {
        return {
          isFollowUpResponse: true,
          followUpRecord: followUpCheck.followUpRecord,
        };
      }

      return {
        isFollowUpResponse: false,
      };
    } catch (error) {
      return {
        error: `Error verificando seguimiento: ${error}`,
        isFollowUpResponse: false,
      };
    }
  }

  // Node: Procesar respuesta de seguimiento
  private async procesarRespuestaSeguimiento(state: any): Promise<any> {
    try {
      if (!state.currentEmail || !state.followUpRecord) {
        return { error: "Faltan datos para procesar respuesta de seguimiento" };
      }

      const { currentEmail, followUpRecord } = state;

      // Clasificar si la respuesta contiene información relevante
      const classificationPrompt = getResponseClassificationPrompt(
        currentEmail.body,
        currentEmail.subject,
        followUpRecord.quotationId
      );

      const classificationResponse = await this.model.invoke([
        new SystemMessage(
          "Eres un especialista en analizar respuestas de clientes para cotizaciones turísticas."
        ),
        new HumanMessage(classificationPrompt),
      ]);

      const classification = parseResponseClassificationResponse(
        classificationResponse.content.toString()
      );

      if (
        !classification.isRelevantResponse ||
        classification.confidence < 60
      ) {
        // Marcar como respondido pero sin información útil
        await FollowUpManager.markAsResponded(
          followUpRecord.quotationId,
          currentEmail.id
        );

        return {
          extractionResult: { isQuoteRequest: false },
          error: "Respuesta sin información relevante para la cotización",
        };
      }

      // Cargar cotización existente
      const quotations = await SimpleDataManager.loadQuotations();
      const existingQuotation = quotations.find(
        (q) => q.id === followUpRecord.quotationId
      );

      if (!existingQuotation) {
        return { error: "Cotización no encontrada" };
      }

      // Extraer información adicional del email
      const extractionPrompt = getFollowUpExtractionPrompt(
        currentEmail.body,
        currentEmail.subject,
        existingQuotation
      );

      const extractionResponse = await this.model.invoke([
        new SystemMessage(
          "Eres un especialista en extraer información de respuestas de clientes para actualizar cotizaciones turísticas."
        ),
        new HumanMessage(extractionPrompt),
      ]);

      const extractionResult = parseFollowUpExtractionResponse(
        extractionResponse.content.toString()
      );

      if (extractionResult.hasNewInfo) {
        // Marcar como respondido con información
        await FollowUpManager.markAsResponded(
          followUpRecord.quotationId,
          currentEmail.id
        );

        return {
          extractionResult: {
            ...extractionResult.updatedFields,
            existingQuotation,
            hasNewInfo: true,
            isComplete: extractionResult.isComplete,
          },
        };
      }

      return {
        extractionResult: { isQuoteRequest: false },
        error: "Respuesta sin información nueva para la cotización",
      };
    } catch (error) {
      return {
        error: `Error procesando respuesta de seguimiento: ${error}`,
        extractionResult: { isQuoteRequest: false },
      };
    }
  }

  // Node: Actualizar cotización existente
  private async actualizarCotizacion(state: any): Promise<any> {
    try {
      if (
        !state.extractionResult ||
        !state.extractionResult.existingQuotation
      ) {
        return { error: "No hay datos para actualizar cotización" };
      }

      const { extractionResult } = state;
      const existingQuotation = extractionResult.existingQuotation;

      // Crear cotización base con datos existentes y nuevos datos
      const baseQuotation = {
        ...existingQuotation,
        // Solo actualizar campos que tienen nuevos valores
        ...(extractionResult.clientName && {
          clientName: extractionResult.clientName,
        }),
        ...(extractionResult.destination && {
          destination: extractionResult.destination,
        }),
        ...(extractionResult.city && { city: extractionResult.city }),
        ...(extractionResult.country && { country: extractionResult.country }),
        ...(extractionResult.startDate && {
          startDate: extractionResult.startDate,
        }),
        ...(extractionResult.endDate && { endDate: extractionResult.endDate }),
        ...(extractionResult.numberOfPeople && {
          numberOfPeople: extractionResult.numberOfPeople,
        }),
        ...(extractionResult.adults && { adults: extractionResult.adults }),
        ...(extractionResult.children !== undefined && {
          children: extractionResult.children,
        }),
        ...(extractionResult.childrenAges && {
          childrenAges: extractionResult.childrenAges,
        }),
        ...(extractionResult.interests && {
          interests: extractionResult.interests,
        }),
        ...(extractionResult.flexDates !== undefined && {
          flexDates: extractionResult.flexDates,
        }),
        ...(extractionResult.preferredMonth && {
          preferredMonth: extractionResult.preferredMonth,
        }),
        ...(extractionResult.dietaryRequirements && {
          dietaryRequirements: extractionResult.dietaryRequirements,
        }),
        ...(extractionResult.budget && { budget: extractionResult.budget }),
      };

      // Re-validar campos faltantes con la cotización actualizada
      const missingFields = validateMissingFields(baseQuotation);
      const emailStatus =
        missingFields.length === 0 ? "complete" : "incomplete";

      // Cotización final actualizada
      const updatedQuotation = {
        ...baseQuotation,
        missingFields,
        emailStatus,
        emailHistory: [
          ...existingQuotation.emailHistory,
          {
            date: new Date().toISOString(),
            type: "client_response" as const,
            emailId: state.currentEmail.id,
            content: "Información adicional recibida",
          },
        ],
      };

      // Limpiar campos que no pertenecen a la cotización final
      delete (updatedQuotation as any).existingQuotation;
      delete (updatedQuotation as any).hasNewInfo;
      delete (updatedQuotation as any).isComplete;
      delete (updatedQuotation as any).stillMissingFields;
      delete (updatedQuotation as any).extractionNotes;

      // Guardar cotización actualizada
      const quotations = await SimpleDataManager.loadQuotations();
      const index = quotations.findIndex((q) => q.id === existingQuotation.id);

      if (index !== -1) {
        quotations[index] = updatedQuotation;
        await SimpleDataManager.saveQuotations(quotations);
      }

      return { quotation: updatedQuotation };
    } catch (error) {
      SimpleLogger.logError("Error updating quotation", error as Error);
      return {
        error: `Error actualizando cotización: ${error}`,
      };
    }
  }

  // Node: Verificar completitud de cotización (simplificado y más confiable)
  private async verificarCompletitud(state: any): Promise<any> {
    try {
      if (!state.quotation) {
        return { error: "No hay cotización para verificar completitud" };
      }

      const quotation = state.quotation;

      // Verificación directa basada en missingFields
      const isComplete = quotation.missingFields.length === 0;

      // Campos esenciales mínimos que siempre se necesitan
      const essentialFields = ["destination", "clientName", "clientEmail"];
      const hasEssentials = essentialFields.every(
        (field) => quotation[field] && quotation[field].toString().trim() !== ""
      );

      let recommendation:
        | "complete"
        | "request_more_info"
        | "proceed_with_partial" = "request_more_info";
      let reasoning = "";

      if (isComplete && hasEssentials) {
        recommendation = "complete";
        reasoning = "Cotización completa con todos los datos necesarios";
      } else if (!hasEssentials) {
        recommendation = "request_more_info";
        reasoning = `Faltan datos esenciales: ${essentialFields
          .filter(
            (field) =>
              !quotation[field] || quotation[field].toString().trim() === ""
          )
          .join(", ")}`;
      } else if (quotation.missingFields.length <= 2) {
        // Si solo faltan 1-2 campos no críticos, podemos proceder
        const nonCriticalFields = [
          "budget.amount",
          "interests",
          "dietaryRequirements.preferences",
        ];
        const onlyNonCriticalMissing = quotation.missingFields.every(
          (field: string) =>
            nonCriticalFields.some((ncf) => field.includes(ncf))
        );

        if (onlyNonCriticalMissing) {
          recommendation = "proceed_with_partial";
          reasoning = "Solo faltan datos no críticos, se puede proceder";
        } else {
          recommendation = "request_more_info";
          reasoning = `Faltan datos importantes: ${quotation.missingFields.join(
            ", "
          )}`;
        }
      } else {
        recommendation = "request_more_info";
        reasoning = `Faltan múltiples campos: ${quotation.missingFields.join(
          ", "
        )}`;
      }

      const evaluation = {
        isComplete,
        missingEssentialFields: essentialFields.filter(
          (field) =>
            !quotation[field] || quotation[field].toString().trim() === ""
        ),
        missingImportantFields: quotation.missingFields,
        completenessScore: Math.max(
          0,
          100 - quotation.missingFields.length * 20
        ),
        recommendation,
        reasoning,
      };

      return { completenessEvaluation: evaluation };
    } catch (error) {
      SimpleLogger.logError("Error verifying completeness", error as Error);
      return {
        error: `Error verificando completitud: ${error}`,
        completenessEvaluation: {
          isComplete: false,
          recommendation: "request_more_info" as const,
          reasoning: "Error en la evaluación",
        },
      };
    }
  }

  // Node: Solicitar datos faltantes
  private async solicitarDatosFaltantes(state: any): Promise<any> {
    try {
      if (!state.currentEmail || !state.quotation) {
        return { error: "Faltan datos para solicitar información" };
      }

      const { currentEmail, quotation } = state;

      // Generar email de solicitud de datos
      const emailTemplate = EmailTemplateGenerator.generateMissingDataEmail(
        quotation,
        currentEmail
      );

      // Enviar email de respuesta
      const emailResult = await sendReplyEmailTool.invoke({
        emailOriginal: currentEmail,
        cuerpo: emailTemplate.body,
        esHtml: false,
      });

      if (emailResult.success) {
        // Crear registro de seguimiento
        await FollowUpManager.createFollowUpRecord(quotation, currentEmail);

        return { emailSent: true };
      } else {
        return {
          error: "Error enviando email de solicitud de datos",
          emailSent: false,
        };
      }
    } catch (error) {
      return {
        error: `Error solicitando datos faltantes: ${error}`,
        emailSent: false,
      };
    }
  }

  // Node: Notificar cotización completa
  private async notificarCotizacionCompleta(state: any): Promise<any> {
    try {
      if (!state.currentEmail || !state.quotation) {
        return { error: "Faltan datos para notificar cotización completa" };
      }

      const { currentEmail, quotation } = state;

      // Generar email de confirmación
      const emailTemplate = EmailTemplateGenerator.generateQuoteCompleteEmail(
        quotation,
        currentEmail
      );

      // Enviar email de notificación
      const emailResult = await sendReplyEmailTool.invoke({
        emailOriginal: currentEmail,
        cuerpo: emailTemplate.body,
        esHtml: false,
      });

      if (emailResult.success) {
        // Marcar seguimiento como completado si existe
        const followUpRecord = await FollowUpManager.findByQuotationId(
          quotation.id
        );
        if (followUpRecord) {
          await FollowUpManager.markAsCompleted(quotation.id);
        }

        return { emailSent: true };
      } else {
        return {
          error: "Error enviando email de confirmación",
          emailSent: false,
        };
      }
    } catch (error) {
      return {
        error: `Error notificando cotización completa: ${error}`,
        emailSent: false,
      };
    }
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

  // Helper: Get classification result from multi-level analysis
  private getMultiLevelClassificationResult(
    multiLevelResult: any
  ): ClassificationResult {
    return {
      is_quote: multiLevelResult.isQuoteRequest,
      confidence: multiLevelResult.finalConfidence,
      signals: multiLevelResult.allSignals,
      quote_type:
        multiLevelResult.quoteType === "unclear"
          ? null
          : multiLevelResult.quoteType,
    };
  }

  // Helper: Cross-validate LLM and rule-based results
  private crossValidateResults(
    multiLevelResult: any,
    llmResult: ClassificationResult
  ): ClassificationResult {
    // Multi-level override for high confidence rule-based results
    if (
      multiLevelResult.isQuoteRequest &&
      !llmResult.is_quote &&
      multiLevelResult.finalConfidence >= 60
    ) {
      llmResult.is_quote = true;
      llmResult.confidence = Math.max(
        llmResult.confidence,
        multiLevelResult.finalConfidence
      );
    } else if (
      !multiLevelResult.isQuoteRequest &&
      llmResult.is_quote &&
      llmResult.confidence < 70
    ) {
      llmResult.is_quote = false;
      llmResult.confidence = multiLevelResult.finalConfidence;
    }

    // Enhance with multi-level signals
    llmResult.signals = [
      ...new Set([...llmResult.signals, ...multiLevelResult.allSignals]),
    ];
    llmResult.quote_type = llmResult.quote_type || multiLevelResult.quoteType;

    return llmResult;
  }

  // Helper: Handle low confidence classification results
  private async handleLowConfidenceResult(
    state: any,
    result: ClassificationResult,
    emailIndex: number,
    totalEmails: number
  ): Promise<any> {
    labelEmailTool
      .invoke({
        emailId: state.currentEmail.id,
        label: "NOT_QUOTE",
      })
      .catch(() => {});

    SimpleLogger.logEmailProcessing({
      index: emailIndex,
      total: totalEmails,
      from: state.currentEmail.from,
      subject: state.currentEmail.subject,
      result: "NO COTIZACIÓN",
      error: `Confianza muy baja (${result.confidence}%)`,
    });

    return { esCotizacion: false };
  }

  // Node: Classify email (refactored for clarity)
  private async clasificarEmail(state: any): Promise<any> {
    try {
      if (!state.currentEmail) {
        return { error: "No hay email actual para clasificar" };
      }

      const { subject, body, fromEmail } = state.currentEmail;
      const emailIndex = state.currentEmailIndex + 1;
      const totalEmails = state.emails.length;

      // Step 1: Multi-level classification
      const multiLevelResult = classifyEmailMultiLevel(
        subject,
        body,
        fromEmail
      );

      // Step 2: Decide if LLM validation is needed
      const needsLLMValidation =
        (multiLevelResult.finalConfidence >= 40 &&
          multiLevelResult.finalConfidence <= 80) ||
        multiLevelResult.quoteType === "unclear";

      let result: ClassificationResult;

      if (!needsLLMValidation) {
        result = this.getMultiLevelClassificationResult(multiLevelResult);
      } else {
        // Step 3: LLM validation for uncertain cases
        const prompt = getClassificationPrompt(subject, body);
        const response = await this.model.invoke([
          new SystemMessage(
            "Eres un asistente especializado en identificar consultas de viajes y turismo para una agencia de viajes profesional."
          ),
          new HumanMessage(prompt),
        ]);

        const llmResult = parseClassificationResponse(
          response.content.toString()
        );
        result = this.crossValidateResults(multiLevelResult, llmResult);
      }

      // Step 4: Handle low confidence results
      if (result.confidence < 30) {
        return this.handleLowConfidenceResult(
          state,
          result,
          emailIndex,
          totalEmails
        );
      }

      // Step 5: Final classification and labeling
      const isQuote = result.is_quote && result.confidence >= 70;
      const resultType: EmailProcessingResult["result"] = isQuote
        ? result.quote_type === "B2B"
          ? "COTIZACIÓN B2B"
          : "COTIZACIÓN B2C"
        : "NO COTIZACIÓN";

      labelEmailTool
        .invoke({
          emailId: state.currentEmail.id,
          label: isQuote ? "QUOTE" : "NOT_QUOTE",
        })
        .catch(() => {});

      return {
        esCotizacion: isQuote,
        classificationResult: result,
        loggingInfo: { emailIndex, totalEmails, resultType },
      };
    } catch (error) {
      SimpleLogger.logError("Email classification failed", error as Error);
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

      const { subject, body, from, fromEmail, id } = state.currentEmail;
      const fromName = from.includes("<")
        ? from.split("<")[0].trim().replace(/"/g, "")
        : from;
      const cleanFromEmail = fromEmail || from;
      const createdAt = new Date().toISOString();

      const prompt = getSimpleExtractionPrompt(
        subject,
        body,
        cleanFromEmail,
        fromName,
        id,
        createdAt
      );

      const response = await this.model.invoke([
        new SystemMessage(
          "Eres un especialista en extraer información completa de solicitudes turísticas para una agencia DMC. Analiza cuidadosamente el email y extrae todos los datos disponibles en el formato JSON especificado."
        ),
        new HumanMessage(prompt),
      ]);

      const extractionResult = parseSimpleExtractionResponse(
        response.content.toString()
      );

      // Handle non-quote classification
      if (!extractionResult.isQuoteRequest) {
        return {
          extractionResult,
          error: "Email clasificado como no-cotización",
        };
      }

      // For quote requests, validate and update missing fields
      const quoteResult = extractionResult as QuoteExtractionResult;
      const missingFields = validateMissingFields(quoteResult);
      const updatedResult = {
        ...quoteResult,
        missingFields,
        emailStatus:
          missingFields.length === 0
            ? ("complete" as const)
            : ("incomplete" as const),
        emailId: id,
        createdAt,
        clientEmail: cleanFromEmail, // Ensure we have the email
      };

      // Validate minimum required data for quotation creation
      if (!updatedResult.destination && !updatedResult.clientName) {
        return {
          extractionResult: updatedResult,
          error: "Datos mínimos insuficientes (falta destino y nombre cliente)",
        };
      }

      return { extractionResult: updatedResult };
    } catch (error) {
      SimpleLogger.logError("Data extraction failed", error as Error);
      return {
        error: `Error extrayendo datos: ${error}`,
        extractionResult: { isQuoteRequest: false },
      };
    }
  }

  // Node: Create quotation
  private async generarCotizacion(state: any): Promise<any> {
    try {
      if (!state.currentEmail || !state.extractionResult) {
        return { error: "Faltan datos para crear cotización" };
      }

      const { currentEmail, extractionResult } = state;

      // Ensure we have a quote request result
      if (!extractionResult.isQuoteRequest) {
        return { error: "Resultado de extracción no es una cotización" };
      }

      // Extract clean email from "from" field
      const fromEmail =
        currentEmail.fromEmail ||
        (currentEmail.from.includes("<")
          ? currentEmail.from.match(/<([^>]+)>/)?.[1]
          : currentEmail.from) ||
        currentEmail.from;

      // Create comprehensive quotation with all new fields
      const quotationData = {
        isQuoteRequest: true as const,
        clientName: extractionResult.clientName || "Cliente",
        clientEmail: extractionResult.clientEmail || fromEmail,
        subject: extractionResult.subject || currentEmail.subject,
        destination: extractionResult.destination || "",
        city: extractionResult.city || "",
        country: extractionResult.country || "",
        startDate: extractionResult.startDate || "",
        endDate: extractionResult.endDate || "",
        flexDates: extractionResult.flexDates || false,
        preferredMonth: extractionResult.preferredMonth || "",
        numberOfPeople: extractionResult.numberOfPeople || 0,
        adults: extractionResult.adults || 0,
        children: extractionResult.children || 0,
        childrenAges: extractionResult.childrenAges || [],
        interests: extractionResult.interests || [],
        dietaryRequirements: extractionResult.dietaryRequirements || {
          preferences: [],
          allergies: [],
          restrictions: [],
          notes: "",
        },
        budget: extractionResult.budget || {
          amount: null,
          currency: "",
          scope: "",
          isFlexible: false,
        },
        emailId: extractionResult.emailId || currentEmail.id,
        emailStatus: extractionResult.emailStatus || "incomplete",
        missingFields: extractionResult.missingFields || [],
        createdAt: extractionResult.createdAt || new Date().toISOString(),
        emailHistory: extractionResult.emailHistory || [],
      };

      const quotation = await SimpleDataManager.createQuotation(quotationData);

      return { quotation };
    } catch (error) {
      SimpleLogger.logError("Quotation creation failed", error as Error);
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

    // Check if we need to verify follow-up first
    return "verificarSeguimiento";
  }

  private decidirDespuesVerificarSeguimiento(state: any): string {
    if (state.error) {
      return "clasificar"; // Continue with normal flow if verification fails
    }

    if (state.isFollowUpResponse) {
      return "procesarRespuesta";
    }

    return "clasificar";
  }

  private decidirDespuesVerificarCompletitud(state: any): string {
    if (state.error || !state.completenessEvaluation) {
      return "procesar"; // Skip email sending if evaluation fails
    }

    const { completenessEvaluation } = state;

    switch (completenessEvaluation.recommendation) {
      case "complete":
        return "notificar";
      case "request_more_info":
        return "solicitar";
      case "proceed_with_partial":
      default:
        return "procesar";
    }
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

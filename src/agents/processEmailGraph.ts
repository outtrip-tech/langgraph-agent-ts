import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { SimpleDataManager } from "../utils/simpleDataManager.js";
import { SimpleLogger } from "../utils/simpleLogger.js";
import {
  EmailData,
  SimpleQuotation,
  ClassificationExtractionResult,
  QuoteExtractionResult,
  ClassificationResult,
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
  markAsReadTool,
  labelEmailTool,
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

// State definition for individual email processing
const EmailStateAnnotation = Annotation.Root({
  email: Annotation<EmailData>({
    reducer: (x, y) => y ?? x,
  }),
  isFollowUpResponse: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  followUpRecord: Annotation<any>(),
  esCotizacion: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  extractionResult: Annotation<ClassificationExtractionResult | undefined>(),
  quotation: Annotation<SimpleQuotation | undefined>(),
  completenessEvaluation: Annotation<any>(),
  emailSent: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  error: Annotation<string | undefined>(),
  finished: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

export type EmailState = typeof EmailStateAnnotation.State;

export class ProcessEmailGraph {
  private model: ChatOpenAI;
  private graph: any;

  constructor() {
    this.model = new ChatOpenAI({
      model: "gpt-4o-mini-2024-07-18",
      temperature: 0,
      maxTokens: 1000,
    });

    this.initializeGraph();
  }

  private initializeGraph() {
    const workflow = new StateGraph(EmailStateAnnotation)
      .addNode("verificarSeguimiento", this.verificarSeguimiento.bind(this))
      .addNode("clasificarEmail", this.clasificarEmail.bind(this))
      .addNode("extraerDatos", this.extraerDatos.bind(this))
      .addNode("generarCotizacion", this.generarCotizacion.bind(this))
      .addNode("verificarCompletitud", this.verificarCompletitud.bind(this))
      .addNode("solicitarDatosFaltantes", this.solicitarDatosFaltantes.bind(this))
      .addNode("notificarCotizacionCompleta", this.notificarCotizacionCompleta.bind(this))
      .addNode("procesarRespuestaSeguimiento", this.procesarRespuestaSeguimiento.bind(this))
      .addNode("actualizarCotizacion", this.actualizarCotizacion.bind(this))
      .addNode("finalizar", this.finalizar.bind(this))
      .addEdge("__start__", "verificarSeguimiento")
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
          finalizar: "finalizar",
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
          finalizar: "finalizar",
        }
      )
      .addEdge("solicitarDatosFaltantes", "finalizar")
      .addEdge("notificarCotizacionCompleta", "finalizar")
      .addEdge("procesarRespuestaSeguimiento", "actualizarCotizacion")
      .addEdge("actualizarCotizacion", "verificarCompletitud")
      .addEdge("finalizar", "__end__");

    this.graph = workflow.compile();
  }

  // Node: Verificar si email es respuesta de seguimiento
  private async verificarSeguimiento(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email) {
        return { error: "No hay email para verificar seguimiento" };
      }

      const followUpCheck = await FollowUpManager.isFollowUpResponse(state.email);

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
  private async procesarRespuestaSeguimiento(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email || !state.followUpRecord) {
        return { error: "Faltan datos para procesar respuesta de seguimiento" };
      }

      const { email: currentEmail, followUpRecord } = state;

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

      if (!classification.isRelevantResponse || classification.confidence < 60) {
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
          } as any,
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
  private async actualizarCotizacion(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.extractionResult || !((state.extractionResult as any).existingQuotation)) {
        return { error: "No hay datos para actualizar cotización" };
      }

      const extractionResult = state.extractionResult as any;
      const existingQuotation = extractionResult.existingQuotation;

      // Crear cotización base con datos existentes y nuevos datos
      let baseQuotation = {
        ...existingQuotation,
        // Solo actualizar campos que tienen nuevos valores
        ...(extractionResult.clientName && { clientName: extractionResult.clientName }),
        ...(extractionResult.destination && { destination: extractionResult.destination }),
        ...(extractionResult.city && { city: extractionResult.city }),
        ...(extractionResult.country && { country: extractionResult.country }),
        ...(extractionResult.startDate && { startDate: extractionResult.startDate }),
        ...(extractionResult.endDate && { endDate: extractionResult.endDate }),
        ...(extractionResult.numberOfPeople && { numberOfPeople: extractionResult.numberOfPeople }),
        ...(extractionResult.adults && { adults: extractionResult.adults }),
        ...(extractionResult.children !== undefined && { children: extractionResult.children }),
        ...(extractionResult.childrenAges && { childrenAges: extractionResult.childrenAges }),
        ...(extractionResult.interests && { interests: extractionResult.interests }),
        ...(extractionResult.flexDates !== undefined && { flexDates: extractionResult.flexDates }),
        ...(extractionResult.preferredMonth && { preferredMonth: extractionResult.preferredMonth }),
        ...(extractionResult.dietaryRequirements && { dietaryRequirements: extractionResult.dietaryRequirements }),
        ...(extractionResult.budget && { budget: extractionResult.budget }),
      };

      // Validar consistencia en el número de personas
      baseQuotation = this.validateAndFixPersonCount(baseQuotation);

      // Re-validar campos faltantes con la cotización actualizada
      const missingFields = validateMissingFields(baseQuotation);
      const emailStatus = missingFields.length === 0 ? "complete" : "incomplete";

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
            emailId: state.email!.id,
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
      return { error: `Error actualizando cotización: ${error}` };
    }
  }

  // Node: Clasificar email
  private async clasificarEmail(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email) {
        return { error: "No hay email para clasificar" };
      }

      const { subject, body, fromEmail } = state.email;

      // Step 1: Multi-level classification
      const multiLevelResult = classifyEmailMultiLevel(subject, body, fromEmail);

      // Step 2: Decide if LLM validation is needed
      const needsLLMValidation =
        (multiLevelResult.finalConfidence >= 40 && multiLevelResult.finalConfidence <= 80) ||
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

        const llmResult = parseClassificationResponse(response.content.toString());
        result = this.crossValidateResults(multiLevelResult, llmResult);
      }

      // Handle low confidence results
      if (result.confidence < 30) {
        await labelEmailTool
          .invoke({
            emailId: state.email.id,
            label: "NOT_QUOTE",
          })
          .catch(() => {});

        return { esCotizacion: false, error: `Confianza muy baja (${result.confidence}%)` };
      }

      // Final classification
      const isQuote = result.is_quote && result.confidence >= 70;

      await labelEmailTool
        .invoke({
          emailId: state.email.id,
          label: isQuote ? "QUOTE" : "NOT_QUOTE",
        })
        .catch(() => {});

      return { esCotizacion: isQuote };
    } catch (error) {
      SimpleLogger.logError("Email classification failed", error as Error);
      return {
        error: `Error clasificando email: ${error}`,
        esCotizacion: false,
      };
    }
  }

  // Node: Extraer datos
  private async extraerDatos(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email) {
        return { error: "No hay email para extraer datos" };
      }

      const { subject, body, from, fromEmail, id } = state.email;
      const fromName = from.includes("<") ? from.split("<")[0].trim().replace(/"/g, "") : from;
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

      const extractionResult = parseSimpleExtractionResponse(response.content.toString());

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
        emailStatus: missingFields.length === 0 ? ("complete" as const) : ("incomplete" as const),
        emailId: id,
        createdAt,
        clientEmail: cleanFromEmail,
      };

      // Validate minimum required data
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

  // Node: Generar cotización
  private async generarCotizacion(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email || !state.extractionResult) {
        return { error: "Faltan datos para crear cotización" };
      }

      const { email: currentEmail, extractionResult } = state;

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

      const quoteResult = extractionResult as QuoteExtractionResult;

      // Create comprehensive quotation
      let quotationData = {
        isQuoteRequest: true as const,
        clientName: quoteResult.clientName || "Cliente",
        clientEmail: quoteResult.clientEmail || fromEmail,
        subject: quoteResult.subject || currentEmail.subject,
        destination: quoteResult.destination || "",
        city: quoteResult.city || "",
        country: quoteResult.country || "",
        startDate: quoteResult.startDate || "",
        endDate: quoteResult.endDate || "",
        flexDates: quoteResult.flexDates || false,
        preferredMonth: quoteResult.preferredMonth || "",
        numberOfPeople: quoteResult.numberOfPeople || 0,
        adults: quoteResult.adults || 0,
        children: quoteResult.children || 0,
        childrenAges: quoteResult.childrenAges || [],
        interests: quoteResult.interests || [],
        dietaryRequirements: quoteResult.dietaryRequirements || {
          preferences: [],
          allergies: [],
          restrictions: [],
          notes: "",
        },
        budget: quoteResult.budget || {
          amount: null,
          currency: "",
          scope: "",
          isFlexible: false,
        },
        emailId: quoteResult.emailId || currentEmail.id,
        emailStatus: quoteResult.emailStatus || "incomplete",
        missingFields: quoteResult.missingFields || [],
        createdAt: quoteResult.createdAt || new Date().toISOString(),
        emailHistory: quoteResult.emailHistory || [],
      };

      // Validate and fix person count
      quotationData = this.validateAndFixPersonCount(quotationData);

      const quotation = await SimpleDataManager.createQuotation(quotationData);

      return { quotation };
    } catch (error) {
      SimpleLogger.logError("Quotation creation failed", error as Error);
      return { error: `Error creando cotización: ${error}` };
    }
  }

  // Node: Verificar completitud
  private async verificarCompletitud(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.quotation) {
        return { error: "No hay cotización para verificar completitud" };
      }

      const quotation = state.quotation;
      const isComplete = quotation.missingFields.length === 0;

      // Campos esenciales mínimos
      const essentialFields = ["destination", "clientName", "clientEmail"];
      const hasEssentials = essentialFields.every(
        (field) => quotation[field as keyof SimpleQuotation] && quotation[field as keyof SimpleQuotation].toString().trim() !== ""
      );

      let recommendation: "complete" | "request_more_info" | "proceed_with_partial" = "request_more_info";
      let reasoning = "";

      if (isComplete && hasEssentials) {
        recommendation = "complete";
        reasoning = "Cotización completa con todos los datos necesarios";
      } else if (!hasEssentials) {
        recommendation = "request_more_info";
        reasoning = `Faltan datos esenciales: ${essentialFields
          .filter(
            (field) =>
              !quotation[field as keyof SimpleQuotation] || 
              quotation[field as keyof SimpleQuotation].toString().trim() === ""
          )
          .join(", ")}`;
      } else if (quotation.missingFields.length <= 2) {
        // Si solo faltan 1-2 campos no críticos, podemos proceder
        const nonCriticalFields = ["budget.amount", "interests", "dietaryRequirements.preferences"];
        const onlyNonCriticalMissing = quotation.missingFields.every((field: string) =>
          nonCriticalFields.some((ncf) => field.includes(ncf))
        );

        if (onlyNonCriticalMissing) {
          recommendation = "proceed_with_partial";
          reasoning = "Solo faltan datos no críticos, se puede proceder";
        } else {
          recommendation = "request_more_info";
          reasoning = `Faltan datos importantes: ${quotation.missingFields.join(", ")}`;
        }
      } else {
        recommendation = "request_more_info";
        reasoning = `Faltan múltiples campos: ${quotation.missingFields.join(", ")}`;
      }

      const evaluation = {
        isComplete,
        missingEssentialFields: essentialFields.filter(
          (field) =>
            !quotation[field as keyof SimpleQuotation] || 
            quotation[field as keyof SimpleQuotation].toString().trim() === ""
        ),
        missingImportantFields: quotation.missingFields,
        completenessScore: Math.max(0, 100 - quotation.missingFields.length * 20),
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
  private async solicitarDatosFaltantes(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email || !state.quotation) {
        return { error: "Faltan datos para solicitar información" };
      }

      const { email: currentEmail, quotation } = state;

      // Generar email de solicitud de datos
      const emailTemplate = EmailTemplateGenerator.generateMissingDataEmail(quotation, currentEmail);

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
  private async notificarCotizacionCompleta(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (!state.email || !state.quotation) {
        return { error: "Faltan datos para notificar cotización completa" };
      }

      const { email: currentEmail, quotation } = state;

      // Generar email de confirmación
      const emailTemplate = EmailTemplateGenerator.generateQuoteCompleteEmail(quotation, currentEmail);

      // Enviar email de notificación
      const emailResult = await sendReplyEmailTool.invoke({
        emailOriginal: currentEmail,
        cuerpo: emailTemplate.body,
        esHtml: false,
      });

      if (emailResult.success) {
        // Marcar seguimiento como completado si existe
        const followUpRecord = await FollowUpManager.findByQuotationId(quotation.id);
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

  // Node: Finalizar
  private async finalizar(state: EmailState): Promise<Partial<EmailState>> {
    try {
      if (state.email) {
        // Marcar email como procesado
        await Promise.all([
          markAsReadTool.invoke({ emailId: state.email.id }),
          labelEmailTool
            .invoke({
              emailId: state.email.id,
              label: "PROCESSED",
            })
            .catch(() => {}),
        ]);
      }
      return { finished: true };
    } catch (error) {
      return {
        error: `Error finalizando procesamiento: ${error}`,
        finished: true,
      };
    }
  }

  // Helper methods
  private getMultiLevelClassificationResult(multiLevelResult: any): ClassificationResult {
    return {
      is_quote: multiLevelResult.isQuoteRequest,
      confidence: multiLevelResult.finalConfidence,
      signals: multiLevelResult.allSignals,
      quote_type:
        multiLevelResult.quoteType === "unclear" ? null : multiLevelResult.quoteType,
    };
  }

  private crossValidateResults(multiLevelResult: any, llmResult: ClassificationResult): ClassificationResult {
    // Multi-level override for high confidence rule-based results
    if (
      multiLevelResult.isQuoteRequest &&
      !llmResult.is_quote &&
      multiLevelResult.finalConfidence >= 60
    ) {
      llmResult.is_quote = true;
      llmResult.confidence = Math.max(llmResult.confidence, multiLevelResult.finalConfidence);
    } else if (
      !multiLevelResult.isQuoteRequest &&
      llmResult.is_quote &&
      llmResult.confidence < 70
    ) {
      llmResult.is_quote = false;
      llmResult.confidence = multiLevelResult.finalConfidence;
    }

    // Enhance with multi-level signals
    llmResult.signals = [...new Set([...llmResult.signals, ...multiLevelResult.allSignals])];
    llmResult.quote_type = llmResult.quote_type || multiLevelResult.quoteType;

    return llmResult;
  }

  private validateAndFixPersonCount(quotation: any): any {
    const numberOfPeople = quotation.numberOfPeople || 0;
    const adults = quotation.adults || 0;
    const children = quotation.children || 0;

    // If we have a breakdown that adds up correctly, keep it
    if (adults > 0 || children > 0) {
      const calculatedTotal = adults + children;
      if (calculatedTotal === numberOfPeople) {
        return quotation; // Already consistent
      }

      // If total doesn't match breakdown, prefer breakdown if it makes sense
      if (calculatedTotal > 0 && numberOfPeople === 0) {
        return { ...quotation, numberOfPeople: calculatedTotal };
      }

      // If breakdown is suspicious, clear breakdown
      if (adults === 0 && numberOfPeople > children && numberOfPeople > 1) {
        return { ...quotation, adults: 0, children: 0 };
      }
    }

    return quotation;
  }

  // Routing functions
  private decidirDespuesVerificarSeguimiento(state: EmailState): string {
    if (state.error) {
      return "clasificar"; // Continue with normal flow if verification fails
    }
    if (state.isFollowUpResponse) {
      return "procesarRespuesta";
    }
    return "clasificar";
  }

  private decidirDespuesClasificar(state: EmailState): string {
    if (state.error || !state.esCotizacion) {
      return "finalizar"; // Skip extraction for non-quotes or errors
    }
    return "extraer";
  }

  private decidirDespuesVerificarCompletitud(state: EmailState): string {
    if (state.error || !state.completenessEvaluation) {
      return "finalizar"; // Skip email sending if evaluation fails
    }

    const { completenessEvaluation } = state;

    switch (completenessEvaluation.recommendation) {
      case "complete":
        return "notificar";
      case "request_more_info":
        return "solicitar";
      case "proceed_with_partial":
      default:
        return "finalizar";
    }
  }

  // Public method to process a single email
  async processEmail(
    email: EmailData,
    options: {
      recursionLimit?: number;
      timeout?: number;
    } = {}
  ): Promise<{ quotation?: SimpleQuotation; error?: string }> {
    try {
      const result = await this.graph.invoke(
        { email },
        {
          recursionLimit: options.recursionLimit || 50,
          configurable: {
            timeout: options.timeout || 25000,
          },
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { quotation: result.quotation };
    } catch (error) {
      SimpleLogger.logError(`Error processing email ${email.id}`, error as Error);
      return { error: `Error procesando email: ${error}` };
    }
  }
}

// Factory function to create the graph builder
export function buildProcessEmailGraph(): ProcessEmailGraph {
  return new ProcessEmailGraph();
}
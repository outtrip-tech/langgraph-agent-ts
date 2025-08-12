import { ClassificationResult } from "../types/simpleQuotation.js";

// Scoring system for better classification accuracy
export function analyzeEmailSignals(subject: string, body: string): {
  score: number;
  signals: string[];
  patterns: {
    strongSignals: string[];
    moderateSignals: string[];
    weakSignals: string[];
    negativeSignals: string[];
  };
} {
  const text = (subject + " " + body).toLowerCase();
  const patterns = {
    strongSignals: [] as string[],
    moderateSignals: [] as string[],
    weakSignals: [] as string[],
    negativeSignals: [] as string[]
  };

  let score = 0;

  // STRONG SIGNALS (80+ points each)
  const strongPatterns = [
    { pattern: /\b(solicitud|solicita|solicitar)\b.*\b(cotizaci[oó]n|presupuesto|propuesta)\b/g, signal: "solicitud_cotizacion", points: 90 },
    { pattern: /\b(cotizar|cotizaci[oó]n)\b.*\b(para|destino|viaje)\b/g, signal: "cotizar_destino", points: 85 },
    { pattern: /\b(representante|agencia emisora|operador|dmc)\b/g, signal: "representante_comercial", points: 80 },
    { pattern: /\b(propuesta\s+de\s+paquete|paquete\s+tur[ií]stico)\b/g, signal: "propuesta_paquete", points: 85 },
    { pattern: /\b(tarifas?\s+netas?|precios?\s+netos?)\b/g, signal: "tarifas_comerciales", points: 80 }
  ];

  // MODERATE SIGNALS (50+ points each)  
  const moderatePatterns = [
    { pattern: /\b\d+\s+(personas?|adultos?|ni[ñn]os?|huespedes?)\b/g, signal: "numero_personas", points: 60 },
    { pattern: /\b(del|desde)\s+\d+.*\b(al|hasta)\s+\d+/g, signal: "fechas_especificas", points: 65 },
    { pattern: /\b\d+\s+(noches?|d[ií]as?)\b/g, signal: "duracion_especifica", points: 55 },
    { pattern: /\b(hotel|hospedaje|alojamiento)\b.*\b(actividades?|tours?|excursiones?)\b/g, signal: "hotel_actividades", points: 50 },
    { pattern: /@[a-z]+\.(com|net|org|travel|tours?)\b/g, signal: "email_corporativo", points: 40 }
  ];

  // WEAK SIGNALS (20+ points each)
  const weakPatterns = [
    { pattern: /\b(viaje|turismo|vacaciones|destino)\b/g, signal: "mencion_turismo", points: 25 },
    { pattern: /\b(disponibilidad|disponible)\b/g, signal: "consulta_disponibilidad", points: 30 },
    { pattern: /\b(precio|costo|tarifa)\b/g, signal: "consulta_precios", points: 35 }
  ];

  // NEGATIVE SIGNALS (subtract points)
  const negativePatterns = [
    { pattern: /\b(newsletter|bolet[ií]n|suscripci[oó]n)\b/g, signal: "newsletter", points: -80 },
    { pattern: /\b(confirmaci[oó]n|confirmar)\b.*\b(reserva|booking)\b/g, signal: "confirmacion", points: -70 },
    { pattern: /\b(unsubscribe|darse de baja)\b/g, signal: "spam", points: -90 },
    { pattern: /\b(promociones?|ofertas?|descuentos?)\b.*\b(especiales?|limitadas?)\b/g, signal: "promocion", points: -60 },
    { pattern: /\b(reclamo|queja|problema|error)\b/g, signal: "reclamo", points: -50 }
  ];

  // Apply scoring
  strongPatterns.forEach(p => {
    const matches = text.match(p.pattern);
    if (matches) {
      score += p.points;
      patterns.strongSignals.push(p.signal);
    }
  });

  moderatePatterns.forEach(p => {
    const matches = text.match(p.pattern);
    if (matches) {
      score += p.points;
      patterns.moderateSignals.push(p.signal);
    }
  });

  weakPatterns.forEach(p => {
    const matches = text.match(p.pattern);
    if (matches) {
      score += p.points;
      patterns.weakSignals.push(p.signal);
    }
  });

  negativePatterns.forEach(p => {
    const matches = text.match(p.pattern);
    if (matches) {
      score += p.points; // points are negative
      patterns.negativeSignals.push(p.signal);
    }
  });

  // Combine all signals for output
  const allSignals = [
    ...patterns.strongSignals,
    ...patterns.moderateSignals,
    ...patterns.weakSignals,
    ...patterns.negativeSignals.map(s => `neg_${s}`)
  ];

  return {
    score: Math.max(0, Math.min(100, score)), // Clamp between 0-100
    signals: allSignals,
    patterns
  };
}

// Specialized B2B detection patterns
export function detectB2BPatterns(subject: string, body: string, fromEmail?: string): {
  isB2B: boolean;
  confidence: number;
  indicators: string[];
} {
  const text = (subject + " " + body).toLowerCase();
  const email = (fromEmail || "").toLowerCase();
  const indicators: string[] = [];
  let confidence = 0;

  // Corporate email domains
  const corporateDomains = /\.(travel|tours?|viajes?|turismo|agency|dmc|incoming|outgoing)\.([a-z]{2,})/;
  if (corporateDomains.test(email)) {
    indicators.push("dominio_corporativo");
    confidence += 25;
  }

  // B2B language patterns
  const b2bPatterns = [
    { pattern: /\b(representante|represento|represente)\b/g, indicator: "representante", points: 30 },
    { pattern: /\b(agencia\s+(emisora|receptiva|de\s+viajes?))\b/g, indicator: "agencia_profesional", points: 35 },
    { pattern: /\b(operador|dmc|incoming|outgoing|wholesaler)\b/g, indicator: "operador_turistico", points: 40 },
    { pattern: /\b(tarifas?\s+(netas?|confidenciales?|especiales?))\b/g, indicator: "tarifas_comerciales", points: 30 },
    { pattern: /\b(condiciones\s+(comerciales?|especiales?))\b/g, indicator: "condiciones_b2b", points: 25 },
    { pattern: /\b(comision|comisiones|markup|allotment)\b/g, indicator: "terminos_b2b", points: 35 },
    { pattern: /\b(con\s+sede\s+en|establecida?\s+en|ubicada?\s+en)\b/g, indicator: "sede_corporativa", points: 20 },
    { pattern: /\b(partnership|alianza|colaboraci[oó]n)\b.*\b(comercial|estrat[eé]gica)\b/g, indicator: "partnership", points: 30 }
  ];

  b2bPatterns.forEach(p => {
    const matches = text.match(p.pattern);
    if (matches) {
      indicators.push(p.indicator);
      confidence += p.points;
    }
  });

  // Professional signature patterns
  if (/\n.*\n.*@.*\.(com|net|org|travel)/.test(body)) {
    indicators.push("firma_profesional");
    confidence += 15;
  }

  // Business communication style
  if (/\b(estimados?|cordialmente|atentamente|saludos\s+cordiales?)\b/g.test(text)) {
    indicators.push("lenguaje_formal");
    confidence += 10;
  }

  return {
    isB2B: confidence >= 40,
    confidence: Math.min(100, confidence),
    indicators
  };
}

// Simplified and optimized classification engine
export function classifyEmailMultiLevel(subject: string, body: string, fromEmail?: string): {
  isTourismRelated: boolean;
  isCommercialInquiry: boolean;
  isQuoteRequest: boolean;
  quoteType: "B2B" | "B2C" | "unclear";
  finalConfidence: number;
  reasoning: string[];
  allSignals: string[];
} {
  // Fast analysis using pattern matching
  const patternAnalysis = analyzeEmailSignals(subject, body);
  const allSignals = patternAnalysis.signals;
  
  // Early exit for non-tourism related content
  const isTourismRelated = patternAnalysis.score > 20;
  if (!isTourismRelated) {
    return {
      isTourismRelated: false,
      isCommercialInquiry: false,
      isQuoteRequest: false,
      quoteType: "unclear",
      finalConfidence: 0,
      reasoning: ["No terms related to tourism"],
      allSignals: []
    };
  }

  // Determine if it's a commercial inquiry
  const hasStrongSignals = patternAnalysis.patterns.strongSignals.length > 0;
  const hasNegativeSignals = patternAnalysis.patterns.negativeSignals.length > 0;
  const isCommercialInquiry = hasStrongSignals && !hasNegativeSignals;

  // Quick B2B detection
  const b2bAnalysis = detectB2BPatterns(subject, body, fromEmail);
  allSignals.push(...b2bAnalysis.indicators);
  
  const quoteType: "B2B" | "B2C" | "unclear" = b2bAnalysis.isB2B ? "B2B" : 
                                                isCommercialInquiry ? "B2C" : "unclear";

  // Simplified confidence calculation
  let finalConfidence = patternAnalysis.score;
  if (b2bAnalysis.isB2B && hasStrongSignals) finalConfidence += 20;
  finalConfidence = Math.min(100, finalConfidence);

  const isQuoteRequest = finalConfidence >= 50;

  return {
    isTourismRelated,
    isCommercialInquiry,
    isQuoteRequest,
    quoteType,
    finalConfidence,
    reasoning: [`Score: ${finalConfidence}`, `Type: ${quoteType}`],
    allSignals: [...new Set(allSignals)]
  };
}

export function getClassificationPrompt(subject: string, body: string): string {
  const cleanBody = body.length > 800 ? body.substring(0, 800) + "..." : body;
  
  return `Analiza si este email es una solicitud de cotización turística (B2B o B2C).

ASUNTO: ${subject}
CONTENIDO: ${cleanBody}

CRITERIOS DE CLASIFICACIÓN:

✅ ES COTIZACIÓN si contiene:
SEÑALES FUERTES (80+ puntos):
- "solicitud de cotización/propuesta/presupuesto"
- "cotizar/cotización para [destino]"
- "propuesta de paquete turístico"
- "representante de agencia/operador"
- "agencia emisora solicita"
- "necesitamos tarifas/precios netos"

SEÑALES MODERADAS (50+ puntos):
- Destino específico + fechas concretas
- Número exacto de personas/habitaciones
- Duración específica del viaje
- Menciona actividades + hospedaje
- Lenguaje comercial profesional
- Firma corporativa/datos de contacto formales

SEÑALES DÉBILES (20+ puntos):
- Menciona viaje/turismo/vacaciones
- Pregunta por disponibilidad
- Consulta sobre servicios turísticos

❌ NO ES COTIZACIÓN si es:
- Newsletter/boletín informativo
- Confirmación de reserva existente
- Promoción/oferta no solicitada
- Spam/publicidad masiva
- Reclamo/queja de servicios
- Consulta muy vaga sin detalles

CASOS ESPECIALES B2B:
- Agencias emisoras pidiendo propuestas ✅
- DMCs solicitando tarifas ✅
- Operadores consultando disponibilidad ✅
- Wholesalers pidiendo condiciones ✅

EJEMPLOS:
✅ "Representante de EgyptTravel solicita propuesta para familia 4 personas Egipto septiembre 2025"
✅ "Necesito cotizar paquete Cancún 3 noches 2 adultos del 15-18 marzo"
✅ "Agencia emisora requiere tarifas netas Bariloche temporada alta"
❌ "Newsletter: Los mejores destinos 2024"
❌ "Confirmación reserva #12345 - Hotel Marriott"

Responde SOLO JSON:
{
  "is_quote": boolean,
  "signals": ["señal1", "señal2", "señal3"],
  "confidence": number,
  "quote_type": "B2B" | "B2C" | "unclear" | null
}`;
}

export function parseClassificationResponse(
  response: string
): ClassificationResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        is_quote: Boolean(parsed.is_quote),
        signals: Array.isArray(parsed.signals) ? parsed.signals : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        quote_type: parsed.quote_type || null,
      };
    }
  } catch (error) {
    // Silent error handling
  }

  // Fallback
  return {
    is_quote: false,
    signals: [],
    confidence: 0,
    quote_type: null,
  };
}

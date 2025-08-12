import { SimpleQuotation, EmailData } from "../types/simpleQuotation.js";

export function getFollowUpExtractionPrompt(
  emailBody: string,
  subject: string,
  existingQuotation: SimpleQuotation
): string {
  return `## Objetivo
Extraer información adicional de un email de respuesta del cliente y actualizar una cotización existente.

## Cotización Existente
ID: ${existingQuotation.id}
Cliente: ${existingQuotation.clientName}
Email: ${existingQuotation.clientEmail}
Destino: ${existingQuotation.destination}
Estado actual: ${existingQuotation.emailStatus}

## Campos que faltan actualmente:
${existingQuotation.missingFields.map(field => `- ${field}`).join('\n')}

## Email del Cliente
**Asunto:** ${subject}
**Contenido:** ${emailBody}

## Instrucciones
Analiza el email y extrae ÚNICAMENTE la información nueva o actualizada que puede completar los campos faltantes. 

Devuelve un JSON con SOLO los campos que se pueden actualizar basándose en la información del email:

\`\`\`json
{
  "hasNewInfo": boolean,
  "updatedFields": {
    // Solo incluir campos que se pueden actualizar con información del email
    "startDate": "DD/MM/YYYY", // solo si se menciona fecha específica
    "endDate": "DD/MM/YYYY",   // solo si se menciona fecha específica
    "numberOfPeople": number,   // solo si se menciona número específico
    "adults": number,           // solo si se especifica
    "children": number,         // solo si se especifica
    "childrenAges": [numbers],  // solo si se especifican edades
    "interests": ["string"],    // solo si se mencionan actividades/intereses
    "budget": {                 // solo si se menciona presupuesto
      "amount": number,
      "currency": "string",
      "scope": "string"
    },
    "dietaryRequirements": {    // solo si se mencionan restricciones alimentarias
      "preferences": ["string"],
      "allergies": ["string"], 
      "restrictions": ["string"],
      "notes": "string"
    }
  },
  "stillMissingFields": ["string"], // campos que aún faltan después de esta actualización
  "isComplete": boolean, // true si ya no faltan campos esenciales
  "extractionNotes": "string" // comentarios sobre la extracción
}
\`\`\`

## Reglas importantes:
1. Solo extraer información EXPLÍCITA del email
2. No inventar datos
3. Ser conservador - es mejor no extraer que extraer incorrectamente
4. Fechas solo en formato DD/MM/YYYY si están claramente especificadas
5. Números solo si son exactos y claros
6. Normalizar intereses y preferencias alimentarias en minúsculas y sin tildes`;
}

export function parseFollowUpExtractionResponse(response: string): {
  hasNewInfo: boolean;
  updatedFields: Partial<SimpleQuotation>;
  stillMissingFields: string[];
  isComplete: boolean;
  extractionNotes: string;
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        hasNewInfo: Boolean(parsed.hasNewInfo),
        updatedFields: parsed.updatedFields || {},
        stillMissingFields: Array.isArray(parsed.stillMissingFields) ? parsed.stillMissingFields : [],
        isComplete: Boolean(parsed.isComplete),
        extractionNotes: parsed.extractionNotes || ""
      };
    }
  } catch (error) {
    // Silent error handling
  }

  return {
    hasNewInfo: false,
    updatedFields: {},
    stillMissingFields: [],
    isComplete: false,
    extractionNotes: "Error al procesar la respuesta"
  };
}

export function getResponseClassificationPrompt(
  emailBody: string,
  subject: string,
  quotationId: string
): string {
  return `## Objetivo
Determinar si este email es una respuesta del cliente con información adicional para completar su cotización.

## Email a analizar
**Asunto:** ${subject}
**Contenido:** ${emailBody}
**ID de Cotización:** ${quotationId}

## Análisis requerido
Determina si este email contiene información relevante para una cotización de viaje.

Responde ÚNICAMENTE con este JSON:

\`\`\`json
{
  "isRelevantResponse": boolean, // true si contiene info para cotización
  "confidence": number, // 0-100, confianza en la clasificación
  "containsInfo": {
    "dates": boolean,           // contiene fechas de viaje
    "travelers": boolean,       // info sobre número de personas
    "budget": boolean,          // menciona presupuesto
    "activities": boolean,      // menciona actividades/intereses  
    "dietary": boolean,         // restricciones alimentarias
    "accommodation": boolean,   // preferencias de alojamiento
    "other": boolean           // otra información relevante
  },
  "reason": "string" // explicación breve de la decisión
}
\`\`\`

## Criterios para clasificar como relevante:
✅ Menciona fechas específicas de viaje
✅ Especifica número de personas, adultos, niños
✅ Habla sobre presupuesto o rango de precios
✅ Describe actividades o intereses
✅ Menciona restricciones alimentarias o preferencias
✅ Proporciona detalles sobre el viaje solicitado
✅ Hace referencia al ID de cotización

❌ Solo saluda o agradece
❌ Cancela o rechaza la cotización
❌ Pregunta sin proporcionar información
❌ Email automatico o spam`;
}

export function parseResponseClassificationResponse(response: string): {
  isRelevantResponse: boolean;
  confidence: number;
  containsInfo: {
    dates: boolean;
    travelers: boolean;
    budget: boolean;
    activities: boolean;
    dietary: boolean;
    accommodation: boolean;
    other: boolean;
  };
  reason: string;
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        isRelevantResponse: Boolean(parsed.isRelevantResponse),
        confidence: Number(parsed.confidence) || 0,
        containsInfo: {
          dates: Boolean(parsed.containsInfo?.dates),
          travelers: Boolean(parsed.containsInfo?.travelers),
          budget: Boolean(parsed.containsInfo?.budget),
          activities: Boolean(parsed.containsInfo?.activities),
          dietary: Boolean(parsed.containsInfo?.dietary),
          accommodation: Boolean(parsed.containsInfo?.accommodation),
          other: Boolean(parsed.containsInfo?.other)
        },
        reason: parsed.reason || ""
      };
    }
  } catch (error) {
    // Silent error handling
  }

  return {
    isRelevantResponse: false,
    confidence: 0,
    containsInfo: {
      dates: false,
      travelers: false,
      budget: false,
      activities: false,
      dietary: false,
      accommodation: false,
      other: false
    },
    reason: "Error al procesar la respuesta"
  };
}

export function getCompletenessEvaluationPrompt(quotation: SimpleQuotation): string {
  return `## Objetivo
Evaluar si una cotización tiene suficiente información para ser considerada completa.

## Datos de la Cotización
\`\`\`json
{
  "clientName": "${quotation.clientName}",
  "clientEmail": "${quotation.clientEmail}",
  "destination": "${quotation.destination}",
  "city": "${quotation.city}",
  "country": "${quotation.country}",
  "startDate": "${quotation.startDate}",
  "endDate": "${quotation.endDate}",
  "numberOfPeople": ${quotation.numberOfPeople},
  "adults": ${quotation.adults},
  "children": ${quotation.children},
  "childrenAges": ${JSON.stringify(quotation.childrenAges)},
  "interests": ${JSON.stringify(quotation.interests)},
  "budget": ${JSON.stringify(quotation.budget)},
  "currentStatus": "${quotation.emailStatus}",
  "currentMissingFields": ${JSON.stringify(quotation.missingFields)}
}
\`\`\`

## Criterios de Completitud

### Campos ESENCIALES (obligatorios):
- clientName: nombre del cliente
- clientEmail: email de contacto
- destination: destino del viaje  
- startDate: fecha de inicio
- endDate: fecha de finalización
- numberOfPeople o (adults + children): número de viajeros

### Campos IMPORTANTES (recomendados):
- interests: actividades de interés
- budget.amount: presupuesto aproximado
- childrenAges: si hay niños, sus edades

### Campos OPCIONALES:
- city: ciudad específica
- country: país (si no está en destination)
- dietaryRequirements: restricciones alimentarias
- budget.currency y budget.scope

## Evaluación
Analiza la cotización y responde con este JSON:

\`\`\`json
{
  "isComplete": boolean, // true si tiene todos los campos esenciales
  "missingEssentialFields": ["string"], // campos esenciales que faltan
  "missingImportantFields": ["string"], // campos importantes que faltan  
  "completenessScore": number, // 0-100, porcentaje de completitud
  "recommendation": "complete" | "request_more_info" | "proceed_with_partial",
  "reasoning": "string" // explicación de la decisión
}
\`\`\`

## Reglas de Evaluación:
- Si faltan campos ESENCIALES → isComplete = false
- Si solo faltan campos IMPORTANTES u OPCIONALES → isComplete = true
- completenessScore basado en campos presentes vs total posible
- recommendation basado en qué tan críticos son los campos faltantes`;
}

export function parseCompletenessEvaluationResponse(response: string): {
  isComplete: boolean;
  missingEssentialFields: string[];
  missingImportantFields: string[];
  completenessScore: number;
  recommendation: "complete" | "request_more_info" | "proceed_with_partial";
  reasoning: string;
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        isComplete: Boolean(parsed.isComplete),
        missingEssentialFields: Array.isArray(parsed.missingEssentialFields) ? parsed.missingEssentialFields : [],
        missingImportantFields: Array.isArray(parsed.missingImportantFields) ? parsed.missingImportantFields : [],
        completenessScore: Number(parsed.completenessScore) || 0,
        recommendation: ["complete", "request_more_info", "proceed_with_partial"].includes(parsed.recommendation) 
          ? parsed.recommendation 
          : "request_more_info",
        reasoning: parsed.reasoning || ""
      };
    }
  } catch (error) {
    // Silent error handling
  }

  return {
    isComplete: false,
    missingEssentialFields: [],
    missingImportantFields: [],
    completenessScore: 0,
    recommendation: "request_more_info",
    reasoning: "Error al procesar la evaluación"
  };
}
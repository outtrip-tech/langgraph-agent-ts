import { ClassificationExtractionResult, QuoteExtractionResult } from "../types/simpleQuotation.js";

export function getSimpleExtractionPrompt(subject: string, body: string, fromEmail: string, fromName: string, emailId: string, createdAt: string): string {
  const cleanBody = body.length > 800 ? body.substring(0, 800) + "..." : body;
  
  return `## Objetivo del modelo
Clasificar si un email es una solicitud de cotización turística y, en caso afirmativo, extraer los datos completos y estructurados en un JSON con el formato especificado. Si faltan datos, indicar los campos faltantes para que el sistema solicite la información por email.

---

## Instrucciones

Eres un asistente de una **agencia receptiva de turismo (DMC)** que recibe solicitudes de cotización por email.  
Tu tarea es:

### 1. Clasificación
Determinar si el email es una solicitud de cotización turística.
- Si **NO** es una solicitud de cotización → responder con:
\`\`\`json
{ "isQuoteRequest": false }
\`\`\`
- Si **SÍ** es una solicitud de cotización → extraer y estructurar la información en un JSON.

### 2. Extracción de datos
Analiza el contenido del email y extrae los siguientes campos en un JSON con la estructura:

\`\`\`json
{
  "isQuoteRequest": true,
  "clientName": "",
  "clientEmail": "",
  "subject": "Solicitud de Cotización",
  "destination": "",
  "city": "",
  "country": "",
  "startDate": "DD/MM/YYYY",
  "endDate": "DD/MM/YYYY",
  "flexDates": false,
  "preferredMonth": "",
  "numberOfPeople": 0,
  "adults": 0,
  "children": 0,
  "childrenAges": [],
  "interests": [],
  "dietaryRequirements": {
    "preferences": [],
    "allergies": [],
    "restrictions": [],
    "notes": ""
  },
  "budget": {
    "amount": null,
    "currency": "",
    "scope": "",
    "isFlexible": false
  },
  "emailId": "",
  "emailStatus": "incomplete",
  "missingFields": [],
  "createdAt": "",
  "emailHistory": []
}
\`\`\`

### 3. Validación de datos completos
- Si algún campo no está presente en el email, dejarlo vacío (\`""\` o \`[]\`) y agregar el nombre del campo en \`"missingFields"\`.
- \`"createdAt"\`: momento actual en formato ISO.
- \`"emailStatus"\`: \`"complete"\` si no hay campos faltantes, \`"incomplete"\` si los hay.

### 4. Reglas de extracción
- Solo usar datos explícitos del email (no inventar).
- Si el cliente no indica \`numberOfPeople\` pero sí adultos/niños → calcular: \`adults + children\`.
- Normalizar \`"interests"\` y \`"dietaryRequirements.preferences"\` como palabras clave en minúsculas y sin tildes.
- Fechas en formato **DD/MM/YYYY**.
- \`"emailId"\` lo proporciona el sistema de lectura de Gmail.

### 5. Salida estricta
- Devolver **únicamente** un JSON válido sin texto adicional.

---

## Email a analizar:

**DE:** ${fromName} (${fromEmail})
**ASUNTO:** ${subject}
**CONTENIDO:** ${cleanBody}

**Metadatos del sistema:**
\`\`\`
emailId: "${emailId}"
createdAt: "${createdAt}"
\`\`\`

Responde ÚNICAMENTE con el JSON correspondiente:`;
}

export function parseSimpleExtractionResponse(response: string): ClassificationExtractionResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Handle non-quote classification
      if (!parsed.isQuoteRequest) {
        return { isQuoteRequest: false };
      }
      
      // Extract all required fields for quote requests
      const result: QuoteExtractionResult = {
        isQuoteRequest: true,
        clientName: parsed.clientName || "",
        clientEmail: parsed.clientEmail || "",
        subject: parsed.subject || "Solicitud de Cotización",
        destination: parsed.destination || "",
        city: parsed.city || "",
        country: parsed.country || "",
        startDate: parsed.startDate || "",
        endDate: parsed.endDate || "",
        flexDates: Boolean(parsed.flexDates),
        preferredMonth: parsed.preferredMonth || "",
        numberOfPeople: Number(parsed.numberOfPeople) || 0,
        adults: Number(parsed.adults) || 0,
        children: Number(parsed.children) || 0,
        childrenAges: Array.isArray(parsed.childrenAges) ? parsed.childrenAges : [],
        interests: Array.isArray(parsed.interests) ? parsed.interests : [],
        dietaryRequirements: {
          preferences: Array.isArray(parsed.dietaryRequirements?.preferences) ? parsed.dietaryRequirements.preferences : [],
          allergies: Array.isArray(parsed.dietaryRequirements?.allergies) ? parsed.dietaryRequirements.allergies : [],
          restrictions: Array.isArray(parsed.dietaryRequirements?.restrictions) ? parsed.dietaryRequirements.restrictions : [],
          notes: parsed.dietaryRequirements?.notes || ""
        },
        budget: {
          amount: parsed.budget?.amount ? Number(parsed.budget.amount) : null,
          currency: parsed.budget?.currency || "",
          scope: parsed.budget?.scope || "",
          isFlexible: Boolean(parsed.budget?.isFlexible)
        },
        emailId: parsed.emailId || "",
        emailStatus: (parsed.emailStatus === "complete" || parsed.emailStatus === "incomplete") ? parsed.emailStatus : "incomplete",
        missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
        createdAt: parsed.createdAt || "",
        emailHistory: Array.isArray(parsed.emailHistory) ? parsed.emailHistory : []
      };
      
      return result;
    }
  } catch (error) {
    // Silent error handling
  }

  // Fallback for parsing errors
  return { isQuoteRequest: false };
}

// Utility function to validate missing fields based on extraction result
export function validateMissingFields(result: QuoteExtractionResult): string[] {
  const missingFields: string[] = [];
  
  if (!result.clientName) missingFields.push("clientName");
  if (!result.clientEmail) missingFields.push("clientEmail");
  if (!result.destination) missingFields.push("destination");
  if (!result.startDate) missingFields.push("startDate");
  if (!result.endDate) missingFields.push("endDate");
  if (!result.numberOfPeople && !result.adults) missingFields.push("numberOfPeople");
  
  return missingFields;
}
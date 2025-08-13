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
Analiza el contenido del email y extrae los siguientes campos en un JSON con la estructura.

**IMPORTANTE**: Presta especial atención a la extracción del destino. Busca menciones de:
- Ciudades específicas (ej: "Buenos Aires", "Madrid", "París")
- Países (ej: "Argentina", "España", "Francia")
- Combinaciones ciudad-país (ej: "Buenos Aires, Argentina", "Madrid, España")
- Regiones o provincias (ej: "Patagonia", "Andalucía")

Si encuentras información de destino, extráela completamente en los campos correspondientes:

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

#### Reglas especiales para número de personas:
- **Interpretar con cuidado "personas" en español**:
  - "4 personas y 1 niño" = 4 adultos + 1 niño (numberOfPeople: 5)
  - "5 personas total" = numberOfPeople: 5 (dejar adults/children vacío si no se especifica división)
  - "viajan 3 adultos" = adults: 3, numberOfPeople: 3
  - "somos una familia de 4" = numberOfPeople: 4 (dejar adults/children vacío)
- **Solo extraer adults/children si está CLARAMENTE separado en el texto**
- **Si la información es ambigua sobre adults/children, dejar esos campos vacíos (0)**
- **Validar que numberOfPeople = adults + children cuando ambos están presentes**
- Si el cliente no indica \`numberOfPeople\` pero sí adultos/niños → calcular: \`adults + children\`.

- **Intereses y actividades**: Extraer tanto actividades específicas como propósitos generales del viaje:
  - "conocer lugares nuevos" → ["turismo", "sightseeing"]
  - "explorar" → ["turismo", "exploracion"]  
  - "relajarse" → ["descanso", "relax"]
  - "aventura" → ["aventura", "deportes"]
  - "cultura" → ["cultura", "museos"]
  - "gastronomía" → ["gastronomia", "comida"]
  - "naturaleza" → ["naturaleza", "aire libre"]
  - "historia" → ["historia", "patrimonio"]
- Normalizar \`"interests"\` y \`"dietaryRequirements.preferences"\` como palabras clave en minúsculas y sin tildes.
- **Fechas específicas**: en formato **DD/MM/YYYY** en startDate/endDate.
- **Fechas flexibles**: Si solo se menciona un mes sin fechas específicas → configurar:
  - \`"flexDates": true\`
  - \`"preferredMonth": "nombre_del_mes"\`
  - \`"startDate": ""\` y \`"endDate": ""\`
- **Destino**: Extraer siempre la información completa de destino. Para "Buenos Aires, Argentina" extraer:
  - \`"destination": "Buenos Aires, Argentina"\`
  - \`"city": "Buenos Aires"\`
  - \`"country": "Argentina"\`
- \`"emailId"\` lo proporciona el sistema de lectura de Gmail.

### 5. Ejemplos de extracción de destino
**Ejemplo 1**: Email menciona "Buenos Aires, Argentina"
\`\`\`json
{
  "destination": "Buenos Aires, Argentina",
  "city": "Buenos Aires", 
  "country": "Argentina"
}
\`\`\`

**Ejemplo 2**: Email menciona "viaje a España"
\`\`\`json
{
  "destination": "España",
  "city": "",
  "country": "España"  
}
\`\`\`

**Ejemplo 3**: Email menciona "conocer París"
\`\`\`json
{
  "destination": "París",
  "city": "París",
  "country": "Francia"
}
\`\`\`

### 6. Salida estricta
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
      
      // Parse destination to extract city and country if not explicitly provided
      const destination = parsed.destination || "";
      const parsedDestination = parseDestination(destination);
      
      // Extract all required fields for quote requests
      const result: QuoteExtractionResult = {
        isQuoteRequest: true,
        clientName: parsed.clientName || "",
        clientEmail: parsed.clientEmail || "",
        subject: parsed.subject || "Solicitud de Cotización",
        destination: destination,
        city: parsed.city || parsedDestination.city,
        country: parsed.country || parsedDestination.country,
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

// Utility function to parse destination and extract city/country
export function parseDestination(destination: string): { city: string; country: string } {
  if (!destination || typeof destination !== 'string') {
    return { city: "", country: "" };
  }

  const dest = destination.trim();
  
  // Common patterns for destination parsing
  const patterns = [
    // "Ciudad, País" or "City, Country"
    /^(.+?),\s*(.+)$/,
    // "País - Ciudad" or "Country - City"  
    /^(.+?)\s*-\s*(.+)$/,
    // "Ciudad en País" or "City en Country"
    /^(.+?)\s+en\s+(.+)$/i,
    // "Ciudad de País" or "City de Country"
    /^(.+?)\s+de\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = dest.match(pattern);
    if (match) {
      let [, first, second] = match;
      first = first.trim();
      second = second.trim();
      
      // Common countries to help determine which is which
      const commonCountries = [
        'españa', 'spain', 'francia', 'france', 'italia', 'italy', 'alemania', 'germany',
        'egipto', 'egypt', 'japón', 'japan', 'china', 'brasil', 'brazil', 'argentina',
        'chile', 'perú', 'peru', 'colombia', 'méxico', 'mexico', 'estados unidos', 'usa',
        'reino unido', 'uk', 'grecia', 'greece', 'turquía', 'turkey', 'marruecos', 'morocco',
        'uruguay', 'paraguay', 'bolivia', 'ecuador', 'venezuela', 'costa rica', 'panama',
        'guatemala', 'honduras', 'nicaragua', 'el salvador', 'república dominicana', 'cuba'
      ];
      
      // Common cities to help with identification
      const commonCities = [
        'buenos aires', 'madrid', 'barcelona', 'paris', 'roma', 'milán', 'berlin',
        'londres', 'new york', 'los angeles', 'san francisco', 'chicago', 'miami',
        'ciudad de méxico', 'guadalajara', 'monterrey', 'bogotá', 'medellín', 'cali',
        'lima', 'cusco', 'arequipa', 'santiago', 'valparaíso', 'montevideo', 'asunción',
        'quito', 'guayaquil', 'caracas', 'maracaibo', 'la paz', 'santa cruz', 'cochabamba'
      ];
      
      // Check if second part is a known country
      if (commonCountries.some(country => second.toLowerCase().includes(country))) {
        return { city: first, country: second };
      }
      // Check if first part is a known country
      else if (commonCountries.some(country => first.toLowerCase().includes(country))) {
        return { city: second, country: first };
      }
      // Check if first part is a known city
      else if (commonCities.some(city => first.toLowerCase().includes(city))) {
        return { city: first, country: second };
      }
      // Check if second part is a known city
      else if (commonCities.some(city => second.toLowerCase().includes(city))) {
        return { city: second, country: first };
      }
      // Default: assume first is city, second is country for comma-separated
      else if (pattern === patterns[0]) {
        return { city: first, country: second };
      }
      // For other patterns, assume first is country, second is city
      else {
        return { city: second, country: first };
      }
    }
  }

  // If no pattern matches, try to identify if it's a known country
  const knownCountries = [
    'españa', 'francia', 'italia', 'alemania', 'egipto', 'japón', 'china',
    'brasil', 'argentina', 'chile', 'perú', 'colombia', 'méxico',
    'spain', 'france', 'italy', 'germany', 'egypt', 'japan', 'brazil', 'peru', 'mexico'
  ];
  
  if (knownCountries.some(country => dest.toLowerCase().includes(country))) {
    return { city: "", country: dest };
  }

  // If nothing else works, assume it's a city
  return { city: dest, country: "" };
}

// Utility function to validate missing fields based on extraction result
export function validateMissingFields(result: QuoteExtractionResult): string[] {
  const missingFields: string[] = [];
  
  if (!result.clientName) missingFields.push("clientName");
  if (!result.clientEmail) missingFields.push("clientEmail");
  if (!result.destination) missingFields.push("destination");
  
  // Date validation: only require specific dates if not flexible
  if (!result.flexDates) {
    if (!result.startDate) missingFields.push("startDate");
    if (!result.endDate) missingFields.push("endDate");
  } else {
    // For flexible dates, only require preferredMonth
    if (!result.preferredMonth) missingFields.push("preferredMonth");
  }
  
  // Person count validation with improved logic
  const hasNumberOfPeople = result.numberOfPeople && result.numberOfPeople > 0;
  const hasAdults = result.adults && result.adults > 0;
  const hasChildren = result.children && result.children > 0;
  
  if (!hasNumberOfPeople && !hasAdults) {
    missingFields.push("numberOfPeople");
  }
  
  // If we have numberOfPeople but no breakdown, request breakdown
  if (hasNumberOfPeople && !hasAdults && !hasChildren) {
    missingFields.push("adults");
    missingFields.push("children");
  }
  
  // Validate consistency: if we have both, they should add up
  if (hasNumberOfPeople && (hasAdults || hasChildren)) {
    const calculatedTotal = (result.adults || 0) + (result.children || 0);
    if (calculatedTotal !== result.numberOfPeople) {
      // If inconsistent, request clarification on all person fields
      missingFields.push("numberOfPeople");
      missingFields.push("adults"); 
      missingFields.push("children");
    }
  }
  
  return missingFields;
}

// Function to update existing quotation with parsed destination data
export function updateQuotationWithParsedDestination(quotation: any): any {
  if (quotation.destination && (!quotation.city || !quotation.country)) {
    const parsedDestination = parseDestination(quotation.destination);
    return {
      ...quotation,
      city: quotation.city || parsedDestination.city,
      country: quotation.country || parsedDestination.country
    };
  }
  return quotation;
}
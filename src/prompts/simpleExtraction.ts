import { SimpleExtractionResult } from "../types/simpleQuotation.js";

export function getSimpleExtractionPrompt(subject: string, body: string, fromEmail: string, fromName: string): string {
  return `
Extrae la información básica de esta solicitud de cotización turística.

DATOS DEL EMAIL:
- De: ${fromName} (${fromEmail})  
- Asunto: ${subject}
- Contenido: ${body}

INSTRUCCIONES:
- Extrae solo la información que esté claramente mencionada
- NO inventes datos que no estén en el email
- Si algo no está claro, déjalo vacío
- Sé conciso en las respuestas

RESPONDE SOLO CON JSON VÁLIDO:
{
  "clientName": "nombre del cliente (string o null)",
  "destination": "destino principal del viaje (string o null)", 
  "dates": "fechas de viaje mencionadas (string o null)",
  "travelers": "número y tipo de viajeros (string o null)",
  "budget": "presupuesto mencionado (string o null)",
  "notes": "cualquier información adicional relevante (string o null)",
  "confidence": número_0_a_100
}

EJEMPLOS:
- "Hola, soy María. Necesito cotizar Cancún para 4 personas del 15 al 22 de marzo, presupuesto 2000 USD"
  → {"clientName": "María", "destination": "Cancún", "dates": "15 al 22 de marzo", "travelers": "4 personas", "budget": "2000 USD", "notes": null, "confidence": 95}

- "Buenos días, consulta por paquete a Europa para familia, tenemos flexibilidad de fechas"  
  → {"clientName": null, "destination": "Europa", "dates": null, "travelers": "familia", "budget": null, "notes": "flexibilidad de fechas", "confidence": 70}
`;
}

export function parseSimpleExtractionResponse(response: string): SimpleExtractionResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        clientName: parsed.clientName || undefined,
        destination: parsed.destination || undefined,
        dates: parsed.dates || undefined,
        travelers: parsed.travelers || undefined,
        budget: parsed.budget || undefined,
        notes: parsed.notes || undefined,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      };
    }
  } catch (error) {
    console.error("Error parsing extraction response:", error);
  }

  // Fallback
  return {
    confidence: 0,
  };
}
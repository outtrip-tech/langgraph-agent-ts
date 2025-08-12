import { SimpleExtractionResult } from "../types/simpleQuotation.js";

export function getSimpleExtractionPrompt(subject: string, body: string, fromEmail: string, fromName: string): string {
  const cleanBody = body.length > 800 ? body.substring(0, 800) + "..." : body;
  
  return `Extrae datos de esta cotización turística.

DE: ${fromName} (${fromEmail})
ASUNTO: ${subject}
CONTENIDO: ${cleanBody}

Extrae solo información explícita. Si no está claro → null.

JSON:
{
  "clientName": string|null,
  "destination": string|null,
  "dates": string|null,
  "travelers": string|null,
  "budget": string|null,
  "notes": string|null,
  "confidence": number
}`;
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
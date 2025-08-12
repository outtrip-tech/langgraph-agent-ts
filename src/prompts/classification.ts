import { ClassificationResult } from "../types/simpleQuotation.js";

export function getClassificationPrompt(subject: string, body: string): string {
  return `
Analiza este email y determina si es una solicitud de cotización turística.

ASUNTO: ${subject}
CONTENIDO: ${body}

INSTRUCCIONES:
- Busca intención comercial: ¿solicita precios, cotizaciones, información comercial?
- Contexto turístico: ¿menciona viajes, hoteles, destinos, actividades turísticas?
- Detalles específicos: ¿incluye fechas, personas, preferencias de viaje?
- Estructura comercial: ¿parece una consulta genuina, no spam?

NO ES COTIZACIÓN si es:
- Newsletter o promoción de agencias
- Confirmación de reserva ya hecha
- Email personal sin intención comercial
- Spam o publicidad genérica
- Reclamo o queja de servicios

Responde SOLO con JSON válido:
{
  "is_quote": boolean,
  "signals": ["señal1", "señal2", ...],
  "confidence": number (0-100)
}

EJEMPLOS:
- "Hola, necesito cotizar un paquete para 4 personas a Cancún del 15 al 22 de marzo" → {"is_quote": true, "signals": ["solicitud_cotizacion", "destino_especifico", "fechas_definidas", "numero_personas"], "confidence": 95}
- "Newsletter: Los mejores destinos 2024" → {"is_quote": false, "signals": ["newsletter", "promocional"], "confidence": 90}
`;
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
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 0,
      };
    }
  } catch (error) {
    console.error("Error parsing classification response:", error);
  }

  // Fallback
  return {
    is_quote: false,
    signals: [],
    confidence: 0,
  };
}

import { SimpleQuotation, EmailData } from "../types/simpleQuotation.js";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface TemplateData {
  clientName: string;
  destination: string;
  missingFields: string[];
  quotationId: string;
  dmcName?: string;
}

// Configuración de la DMC
const DMC_CONFIG = {
  name: process.env.DMC_NAME || "Tu DMC de Confianza",
  signature: process.env.DMC_SIGNATURE || "Equipo de Reservas",
  phone: process.env.DMC_PHONE || "",
  website: process.env.DMC_WEBSITE || "",
};

// Mapeo de campos faltantes a descripciones humanas
const FIELD_DESCRIPTIONS: Record<string, string> = {
  clientEmail: "dirección de email de contacto",
  startDate: "fecha de inicio del viaje", 
  endDate: "fecha de finalización del viaje",
  numberOfPeople: "número total de personas",
  adults: "número de adultos",
  children: "número de niños",
  childrenAges: "edades de los niños",
  city: "ciudad específica de destino",
  country: "país de destino",
  interests: "actividades o experiencias de interés",
  "budget.amount": "presupuesto aproximado",
  "budget.currency": "moneda del presupuesto",
  "dietaryRequirements.preferences": "preferencias alimentarias",
  "dietaryRequirements.allergies": "alergias alimentarias",
  "dietaryRequirements.restrictions": "restricciones dietéticas"
};

export class EmailTemplateGenerator {
  /**
   * Genera email para solicitar datos faltantes
   */
  static generateMissingDataEmail(
    quotation: SimpleQuotation,
    emailOriginal: EmailData
  ): EmailTemplate {
    const clientName = quotation.clientName || "Estimado/a viajero/a";
    const destination = quotation.destination || "su destino";
    
    // Convertir campos faltantes a descripciones humanas
    const missingDescriptions = quotation.missingFields
      .map(field => FIELD_DESCRIPTIONS[field] || field)
      .filter(desc => desc); // Filtrar campos no mapeados

    // Crear lista de datos faltantes
    const missingList = missingDescriptions
      .map(desc => `• ${desc.charAt(0).toUpperCase() + desc.slice(1)}`)
      .join('\n');

    const body = `${clientName},

Muchas gracias por contactarnos para su solicitud de viaje a ${destination}. 

Estamos encantados de poder asistirle con su cotización personalizada. Para ofrecerle la mejor propuesta adaptada a sus necesidades, necesitaríamos algunos datos adicionales:

${missingList}

Una vez que recibamos esta información, nuestro equipo estará en condiciones de enviarle una cotización detallada y personalizada en un plazo máximo de 24 horas.

Le agradecemos su confianza y quedamos atentos a su respuesta.

Saludos cordiales,

${DMC_CONFIG.signature}
${DMC_CONFIG.name}${DMC_CONFIG.phone ? `\nTeléfono: ${DMC_CONFIG.phone}` : ''}${DMC_CONFIG.website ? `\nWeb: ${DMC_CONFIG.website}` : ''}

---
Ref: ${quotation.id}`;

    return {
      subject: `Re: ${emailOriginal.subject} - Información adicional requerida`,
      body
    };
  }

  /**
   * Genera email de confirmación para cotización completa
   */
  static generateQuoteCompleteEmail(
    quotation: SimpleQuotation,
    emailOriginal: EmailData
  ): EmailTemplate {
    const clientName = quotation.clientName || "Estimado/a viajero/a";
    const destination = quotation.destination || "su destino";
    
    // Detalles del viaje para confirmación
    const travelDetails = [];
    if (quotation.startDate && quotation.endDate) {
      travelDetails.push(`Fechas: ${quotation.startDate} al ${quotation.endDate}`);
    }
    if (quotation.numberOfPeople > 0) {
      travelDetails.push(`Viajeros: ${quotation.numberOfPeople} persona${quotation.numberOfPeople > 1 ? 's' : ''}`);
      if (quotation.adults > 0 && quotation.children > 0) {
        travelDetails.push(`  - ${quotation.adults} adulto${quotation.adults > 1 ? 's' : ''} y ${quotation.children} niño${quotation.children > 1 ? 's' : ''}`);
      }
    }

    const detailsSection = travelDetails.length > 0 
      ? `\nDetalles de su solicitud:\n${travelDetails.map(detail => `• ${detail}`).join('\n')}\n`
      : '\n';

    const body = `${clientName},

¡Excelente! Hemos recibido toda la información necesaria para su solicitud de viaje a ${destination}.
${detailsSection}
Nuestro equipo de especialistas ya está trabajando en su cotización personalizada y la recibirá en las próximas 24 horas.

La propuesta incluirá:
• Itinerario detallado adaptado a sus preferencias
• Opciones de alojamiento seleccionadas especialmente para ustedes
• Actividades y experiencias recomendadas
• Presupuesto transparente con todos los servicios incluidos

Gracias por confiar en nosotros para hacer realidad su experiencia de viaje. Estamos seguros de que podremos crear algo muy especial para ustedes.

Saludos cordiales,

${DMC_CONFIG.signature}
${DMC_CONFIG.name}${DMC_CONFIG.phone ? `\nTeléfono: ${DMC_CONFIG.phone}` : ''}${DMC_CONFIG.website ? `\nWeb: ${DMC_CONFIG.website}` : ''}

---
Ref: ${quotation.id}`;

    return {
      subject: `Re: ${emailOriginal.subject} - Cotización en proceso`,
      body
    };
  }

  /**
   * Genera email de seguimiento para cotizaciones abandonadas
   */
  static generateFollowUpEmail(
    quotation: SimpleQuotation,
    diasTranscurridos: number
  ): EmailTemplate {
    const clientName = quotation.clientName || "Estimado/a viajero/a";
    const destination = quotation.destination || "su destino";

    const body = `${clientName},

Esperamos que se encuentre muy bien.

Hace ${diasTranscurridos} días le enviamos una solicitud de información adicional para completar su cotización de viaje a ${destination}.

Entendemos que puede estar ocupado/a, pero no queremos que pierda la oportunidad de recibir nuestra propuesta personalizada.

Si ya no está interesado/a en este viaje, le agradecemos que nos lo haga saber para no molestarlo/a con más comunicaciones.

Si aún está interesado/a, simplemente responda a este email con la información que le solicitamos y tendrá su cotización en 24 horas.

Quedamos atentos a su respuesta.

Saludos cordiales,

${DMC_CONFIG.signature}
${DMC_CONFIG.name}

---
Ref: ${quotation.id}`;

    return {
      subject: `Seguimiento: Su cotización para ${destination} - ${quotation.id}`,
      body
    };
  }

  /**
   * Valida si un email es una respuesta con información adicional
   */
  static isResponseWithAdditionalInfo(emailBody: string, quotationId: string): boolean {
    const body = emailBody.toLowerCase();
    
    // Buscar indicadores de información adicional
    const indicators = [
      'fecha', 'personas', 'adultos', 'niños', 'presupuesto', 
      'actividades', 'preferencias', 'alojamiento', 'hotel',
      'días', 'noches', 'viajeros', 'huéspedes', 'comida',
      'alérgico', 'vegetariano', 'restricción', 'dietary'
    ];

    // Buscar el ID de cotización en el email
    const hasQuotationRef = body.includes(quotationId.toLowerCase());
    
    // Verificar si contiene información relevante
    const hasRelevantInfo = indicators.some(indicator => 
      body.includes(indicator)
    );

    return hasQuotationRef && hasRelevantInfo;
  }

  /**
   * Extrae información adicional de un email de respuesta
   */
  static extractAdditionalInfo(emailBody: string): Partial<SimpleQuotation> {
    // Esta función podría usar un LLM para extraer información
    // Por ahora retorna un objeto vacío
    return {};
  }
}

// Función de utilidad para personalizar mensajes
export function personalizarMensaje(
  template: string, 
  data: TemplateData
): string {
  return template
    .replace(/\{clientName\}/g, data.clientName)
    .replace(/\{destination\}/g, data.destination)
    .replace(/\{quotationId\}/g, data.quotationId)
    .replace(/\{dmcName\}/g, data.dmcName || DMC_CONFIG.name);
}
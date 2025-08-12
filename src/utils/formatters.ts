// Utility functions for formatting and data extraction

export function formatearFecha(fecha: string): string {
  try {
    const fechaObj = new Date(fecha);
    return fechaObj.toISOString().split("T")[0];
  } catch {
    return fecha;
  }
}

export function extraerNumero(texto: string): number | null {
  const match = texto.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export function extraerPresupuesto(texto: string): number | null {
  // Buscar patrones como $1000, USD 1000, €1000, etc.
  const patterns = [
    /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/,
    /USD\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    /€\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|usd|euros?)/i,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)/,
  ];

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      const numero = match[1].replace(/,/g, "");
      return parseFloat(numero);
    }
  }

  return null;
}

export function extraerFecha(texto: string): string | null {
  // Patrones para diferentes formatos de fecha
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD
    /(\d{2}\/\d{2}\/\d{4})/, // MM/DD/YYYY
    /(\d{2}-\d{2}-\d{4})/, // MM-DD-YYYY
    /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/i, // 15 de marzo de 2024
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/i, // March 15, 2024
  ];

  const mesesEspanol: { [key: string]: string } = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };

  const mesesIngles: { [key: string]: string } = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        return match[1]; // Ya está en formato YYYY-MM-DD
      } else if (pattern === patterns[1] || pattern === patterns[2]) {
        const partes = match[1].split(/[\/\-]/);
        return `${partes[2]}-${partes[0].padStart(2, "0")}-${partes[1].padStart(
          2,
          "0"
        )}`;
      } else if (pattern === patterns[3]) {
        const dia = match[1].padStart(2, "0");
        const mes = mesesEspanol[match[2].toLowerCase()] || "01";
        const año = match[3];
        return `${año}-${mes}-${dia}`;
      } else if (pattern === patterns[4]) {
        const mes = mesesIngles[match[1].toLowerCase()] || "01";
        const dia = match[2].padStart(2, "0");
        const año = match[3];
        return `${año}-${mes}-${dia}`;
      }
    }
  }

  return null;
}

export function normalizarTipoViaje(texto: string): string {
  const tipos: { [key: string]: string } = {
    familiar: "familiar",
    family: "familiar",
    romantico: "romántico",
    romantic: "romántico",
    romance: "romántico",
    aventura: "aventura",
    adventure: "aventura",
    negocio: "negocios",
    business: "negocios",
    trabajo: "negocios",
    "luna de miel": "luna de miel",
    honeymoon: "luna de miel",
    grupo: "grupal",
    group: "grupal",
    solo: "individual",
    individual: "individual",
    cultural: "cultural",
    culture: "cultural",
    playa: "playa",
    beach: "playa",
    montaña: "montaña",
    mountain: "montaña",
  };

  const textoLower = texto.toLowerCase();
  for (const [patron, tipo] of Object.entries(tipos)) {
    if (textoLower.includes(patron)) {
      return tipo;
    }
  }

  return texto.toLowerCase();
}

export function extraerEmail(texto: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = texto.match(emailRegex);
  return match ? match[0] : null;
}

export function extraerTelefono(texto: string): string | null {
  const telefonoPatterns = [
    /(?:\+\d{1,3}\s?)?(?:\(\d{1,4}\)\s?)?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,9}/,
    /\+?\d{7,15}/,
  ];

  for (const pattern of telefonoPatterns) {
    const match = texto.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return null;
}

export function calcularNoches(
  fechaLlegada: string,
  fechaSalida: string
): number {
  try {
    const llegada = new Date(fechaLlegada);
    const salida = new Date(fechaSalida);
    const diferencia = salida.getTime() - llegada.getTime();
    return Math.max(0, Math.ceil(diferencia / (1000 * 60 * 60 * 24)) - 1);
  } catch {
    return 0;
  }
}

export function calcularDias(
  fechaLlegada: string,
  fechaSalida: string
): number {
  try {
    const llegada = new Date(fechaLlegada);
    const salida = new Date(fechaSalida);
    const diferencia = salida.getTime() - llegada.getTime();
    return Math.max(1, Math.ceil(diferencia / (1000 * 60 * 60 * 24)));
  } catch {
    return 1;
  }
}

// generarResumenCotizacion function removed - was using complex types

export function limpiarTextoEmail(html: string): string {
  // Remove basic HTML tags
  let texto = html.replace(/<[^>]*>/g, " ");

  // Remove multiple spaces and line breaks
  texto = texto.replace(/\s+/g, " ");

  // Remove special encoding characters
  texto = texto.replace(/&[a-zA-Z]+;/g, " ");

  return texto.trim();
}

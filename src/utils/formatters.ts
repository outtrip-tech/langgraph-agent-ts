// Utility functions for email processing

export function limpiarTextoEmail(html: string): string {
  // Remove basic HTML tags
  let texto = html.replace(/<[^>]*>/g, " ");

  // Remove multiple spaces and line breaks
  texto = texto.replace(/\s+/g, " ");

  // Remove special encoding characters
  texto = texto.replace(/&[a-zA-Z]+;/g, " ");

  return texto.trim();
}

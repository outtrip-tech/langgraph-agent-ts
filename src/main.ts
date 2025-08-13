import dotenv from "dotenv";
import { SimpleQuoteAgent } from "./agents/simpleQuoteAgent.js";
import { ConfigGmail } from "./types/simpleQuotation.js";

dotenv.config();

async function main() {
  try {
    // Verificar variables de entorno
    const config: ConfigGmail = {
      clientId: process.env.GMAIL_CLIENT_ID!,
      clientSecret: process.env.GMAIL_CLIENT_SECRET!,
      redirectUri: process.env.GMAIL_REDIRECT_URI,
      accessToken: process.env.GMAIL_ACCESS_TOKEN!,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN!,
    };

    if (
      !config.clientId ||
      !config.clientSecret ||
      !config.accessToken ||
      !config.refreshToken
    ) {
      console.error("❌ Error: Variables de entorno faltantes para Gmail");
      console.log('💡 Ejecuta "yarn auth" para obtener los tokens OAuth2');
      process.exit(1);
    }

    // Verificar OpenAI API Key
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ Error: OPENAI_API_KEY no configurada");
      process.exit(1);
    }

    // Crear y ejecutar el agente con el nuevo método Map-Reduce mejorado
    const agent = new SimpleQuoteAgent(config);
    const result = await agent.processEmailsMapReduce({
      maxEmails: 50,
      concurrency: 3,
      retries: 2, // Reintentos por email
      perEmail: {
        recursionLimit: 50,
        timeoutMs: 25000,
      },
    });

    // Mostrar resumen final
    console.log(`\n📊 RESUMEN FINAL:`);
    console.log(`   📧 Total emails: ${result.summary.totalEmails}`);
    console.log(`   ✅ Cotizaciones exitosas: ${result.summary.successfulQuotations}`);
    console.log(`   ❌ Emails fallidos: ${result.summary.failedEmails}`);
    console.log(`   📈 Tasa de éxito: ${result.metrics.successRate.toFixed(1)}%`);
    console.log(`   ⏱️  Tiempo total: ${result.summary.processingTime}`);
    console.log(`   ⚡ Promedio por email: ${Math.round(result.metrics.avgProcessingTimePerEmail)}ms`);
    
    if (result.metrics.errors.length > 0) {
      console.log(`\n⚠️  ERRORES ENCONTRADOS (${result.metrics.errors.length}):`);
      result.metrics.errors.slice(0, 5).forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error.emailId}: ${error.error}`);
      });
      if (result.metrics.errors.length > 5) {
        console.log(`   ... y ${result.metrics.errors.length - 5} errores más`);
      }
    }

  } catch (error) {
    console.error("❌ Error ejecutando agente:", error);
    process.exit(1);
  }
}

// Ejecutar directamente
main();
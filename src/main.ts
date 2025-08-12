import dotenv from "dotenv";
import { SimpleQuoteAgent } from "./agents/simpleQuoteAgent.js";
import { ConfigGmail } from "./types/simpleQuotation.js";

dotenv.config();

async function main() {
  try {
    console.log("🤖 Iniciando Agente Simple de Cotizaciones...\n");

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

    // Crear y ejecutar el agente
    const agent = new SimpleQuoteAgent(config);
    const quotations = await agent.processEmails();

    // Mostrar resumen final
    console.log("\n" + "=".repeat(50));
    console.log("📄 RESUMEN DE PROCESAMIENTO");
    console.log("=".repeat(50));
    
    if (quotations.length === 0) {
      console.log("🔍 No se encontraron nuevas solicitudes de cotización");
    } else {
      console.log(`✅ ${quotations.length} nueva${quotations.length > 1 ? 's' : ''} cotización${quotations.length > 1 ? 'es' : ''} creada${quotations.length > 1 ? 's' : ''}:`);
      
      quotations.forEach((q, index) => {
        console.log(`\n${index + 1}. ${q.id}`);
        console.log(`   👤 Cliente: ${q.clientName} (${q.clientEmail})`);
        console.log(`   📝 Asunto: ${q.subject}`);
        if (q.destination) console.log(`   🌍 Destino: ${q.destination}`);
        if (q.dates) console.log(`   📅 Fechas: ${q.dates}`);
        if (q.travelers) console.log(`   ✈️ Viajeros: ${q.travelers}`);
        if (q.budget) console.log(`   💰 Presupuesto: ${q.budget}`);
        if (q.notes) console.log(`   📋 Notas: ${q.notes}`);
      });
    }

    console.log("\n✨ Procesamiento completado exitosamente");

  } catch (error) {
    console.error("❌ Error ejecutando agente simple:", error);
    process.exit(1);
  }
}

// Ejecutar directamente
main();
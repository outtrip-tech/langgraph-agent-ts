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

    // Crear y ejecutar el agente (logging handled internally)
    const agent = new SimpleQuoteAgent(config);
    await agent.processEmails();

  } catch (error) {
    console.error("❌ Error ejecutando agente:", error);
    process.exit(1);
  }
}

// Ejecutar directamente
main();
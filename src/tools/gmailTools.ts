import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { google } from "googleapis";
import { EmailData, ConfigGmail } from "../types/simpleQuotation.js";
import { SimpleDataManager } from "../utils/simpleDataManager.js";
import { limpiarTextoEmail } from "../utils/formatters.js";

// Gmail Tool class
class GmailTool {
  private gmail: any;
  private oauth2Client: any;

  constructor(config: ConfigGmail) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri || "http://localhost:3000/oauth2callback"
    );

    this.oauth2Client.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  async obtenerEmailsNoLeidos(maxResults: number = 10): Promise<EmailData[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults,
      });

      if (!response.data.messages) {
        return [];
      }

      const emails: EmailData[] = [];

      for (const message of response.data.messages) {
        try {
          const emailDetail = await this.gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "full",
          });

          const headers = emailDetail.data.payload.headers;
          const from = headers.find((h: any) => h.name === "From")?.value || "";
          const subject =
            headers.find((h: any) => h.name === "Subject")?.value || "";
          const date = headers.find((h: any) => h.name === "Date")?.value || "";
          const messageId =
            headers.find((h: any) => h.name === "Message-ID")?.value || "";
          const references =
            headers.find((h: any) => h.name === "References")?.value || "";
          const inReplyTo =
            headers.find((h: any) => h.name === "In-Reply-To")?.value || "";
          const replyTo =
            headers.find((h: any) => h.name === "Reply-To")?.value || "";

          // Extraer email limpio del campo From
          const fromEmailMatch = from.match(/([^<]*<)?([^>]+@[^>]+)/);
          const fromEmail = fromEmailMatch ? fromEmailMatch[2].trim() : from;

          let body = "";
          let isHtml = false;

          // Extraer el cuerpo del email
          if (emailDetail.data.payload.body.data) {
            body = Buffer.from(
              emailDetail.data.payload.body.data,
              "base64"
            ).toString();
          } else if (emailDetail.data.payload.parts) {
            for (const part of emailDetail.data.payload.parts) {
              if (part.mimeType === "text/plain" && part.body.data) {
                body = Buffer.from(part.body.data, "base64").toString();
                break;
              } else if (part.mimeType === "text/html" && part.body.data) {
                body = Buffer.from(part.body.data, "base64").toString();
                isHtml = true;
                break;
              }
            }
          }

          // Limpiar HTML si es necesario
          if (isHtml) {
            body = limpiarTextoEmail(body);
          }

          emails.push({
            id: message.id,
            from,
            subject,
            body,
            date,
            isHtml,
            threadId: emailDetail.data.threadId,
            messageId,
            references,
            inReplyTo,
            fromEmail,
            replyTo,
          });
        } catch (error) {
          console.error(`Error procesando email ${message.id}:`, error);
          continue;
        }
      }

      return emails;
    } catch (error) {
      console.error("Error obteniendo emails:", error);
      throw new Error("No se pudieron obtener los emails");
    }
  }

  async marcarComoLeido(emailId: string): Promise<boolean> {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: emailId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });

      return true;
    } catch (error) {
      console.error("Error marcando email como leído:", error);
      return false;
    }
  }

  async etiquetarEmail(
    emailId: string,
    etiqueta: "PROCESSED" | "QUOTE" | "NOT_QUOTE"
  ): Promise<boolean> {
    try {
      // Crear etiqueta si no existe
      await this.crearEtiquetaSiNoExiste(etiqueta);

      await this.gmail.users.messages.modify({
        userId: "me",
        id: emailId,
        requestBody: {
          addLabelIds: [etiqueta],
        },
      });

      return true;
    } catch (error) {
      console.error("Error etiquetando email:", error);
      return false;
    }
  }

  private async crearEtiquetaSiNoExiste(nombreEtiqueta: string): Promise<void> {
    try {
      const labels = await this.gmail.users.labels.list({ userId: "me" });
      const existeEtiqueta = labels.data.labels.some(
        (label: any) => label.name === nombreEtiqueta
      );

      if (!existeEtiqueta) {
        await this.gmail.users.labels.create({
          userId: "me",
          requestBody: {
            name: nombreEtiqueta,
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          },
        });
      }
    } catch (error) {
      console.error("Error creando etiqueta:", error);
    }
  }
}

// Gmail Tool instance (to be injected)
let gmailToolInstance: GmailTool;

export function initializeGmailTools(config: ConfigGmail) {
  gmailToolInstance = new GmailTool(config);
}

// Tool to read unread emails
export const readEmailsTool = tool(
  async ({ maxResults }: { maxResults: number }): Promise<{ 
    emails: EmailData[];
    unprocessedCount: number; 
  }> => {
    try {
      console.log("🔧 Tool: Leyendo emails no leídos...");
      
      const emails = await gmailToolInstance.obtenerEmailsNoLeidos(maxResults);
      
      if (emails.length === 0) {
        console.log("✉️ Tool: No se encontraron emails no leídos");
        return { emails: [], unprocessedCount: 0 };
      }

      // Filter out already processed emails
      const unprocessedEmails = [];
      for (const email of emails) {
        const isProcessed = await SimpleDataManager.isEmailProcessed(email.id);
        if (!isProcessed) {
          unprocessedEmails.push(email);
        }
      }

      console.log(`📩 Tool: ${unprocessedEmails.length} emails sin procesar de ${emails.length} total`);
      
      return { 
        emails: unprocessedEmails,
        unprocessedCount: unprocessedEmails.length 
      };

    } catch (error) {
      console.error("❌ Tool: Error leyendo emails:", error);
      return { emails: [], unprocessedCount: 0 };
    }
  },
  {
    name: "read_emails",
    description: "Lee emails no leídos de Gmail y filtra los ya procesados",
    schema: z.object({
      maxResults: z.number().min(1).max(50).default(5).describe("Número máximo de emails a leer"),
    }),
  }
);

// Tool to mark email as read
export const markAsReadTool = tool(
  async ({ emailId }: { emailId: string }): Promise<{ success: boolean }> => {
    try {
      console.log(`🔧 Tool: Marcando email ${emailId} como leído...`);
      
      const success = await gmailToolInstance.marcarComoLeido(emailId);
      
      if (success) {
        console.log("✅ Tool: Email marcado como leído");
      } else {
        console.log("❌ Tool: Error marcando email como leído");
      }
      
      return { success };

    } catch (error) {
      console.error("❌ Tool: Error marcando email como leído:", error);
      return { success: false };
    }
  },
  {
    name: "mark_as_read",
    description: "Marca un email como leído en Gmail",
    schema: z.object({
      emailId: z.string().describe("ID del email a marcar como leído"),
    }),
  }
);

// Tool to label email
export const labelEmailTool = tool(
  async ({ 
    emailId, 
    label 
  }: { 
    emailId: string; 
    label: "PROCESSED" | "QUOTE" | "NOT_QUOTE" 
  }): Promise<{ success: boolean }> => {
    try {
      console.log(`🔧 Tool: Etiquetando email ${emailId} con ${label}...`);
      
      const success = await gmailToolInstance.etiquetarEmail(emailId, label);
      
      if (success) {
        console.log(`✅ Tool: Email etiquetado como ${label}`);
      } else {
        console.log(`❌ Tool: Error etiquetando email como ${label}`);
      }
      
      return { success };

    } catch (error) {
      console.error("❌ Tool: Error etiquetando email:", error);
      return { success: false };
    }
  },
  {
    name: "label_email",
    description: "Agrega una etiqueta a un email en Gmail",
    schema: z.object({
      emailId: z.string().describe("ID del email a etiquetar"),
      label: z.enum(["PROCESSED", "QUOTE", "NOT_QUOTE"]).describe("Etiqueta a aplicar"),
    }),
  }
);

// Utility function to get statistics
export const getStatsTool = tool(
  async (): Promise<{
    totalQuotations: number;
    uniqueClients: number;
    todayQuotations: number;
  }> => {
    try {
      console.log("🔧 Tool: Obteniendo estadísticas...");
      
      const stats = await SimpleDataManager.getStatistics();
      
      console.log(`📊 Tool: ${stats.totalQuotations} cotizaciones, ${stats.uniqueClients} clientes únicos`);
      
      return stats;

    } catch (error) {
      console.error("❌ Tool: Error obteniendo estadísticas:", error);
      return { totalQuotations: 0, uniqueClients: 0, todayQuotations: 0 };
    }
  },
  {
    name: "get_stats",
    description: "Obtiene estadísticas del sistema de cotizaciones",
    schema: z.object({}),
  }
);
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

  // Encode subject for proper UTF-8 support with tildes and special characters
  private encodeSubject(subject: string): string {
    // Check if subject contains non-ASCII characters
    if (/[^\x00-\x7F]/.test(subject)) {
      // Use RFC 2047 encoding for non-ASCII characters
      const encoded = Buffer.from(subject, 'utf8').toString('base64');
      return `=?UTF-8?B?${encoded}?=`;
    }
    return subject;
  }

  async obtenerEmailsNoLeidos(maxResults: number = 10): Promise<EmailData[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: "me",
        q: "is:unread in:inbox -category:promotions -category:social -category:updates -category:spam",
        maxResults,
      });

      if (!response.data.messages) {
        return [];
      }

      // Parallel fetching of email details
      const emailPromises = response.data.messages.map(async (message: any) => {
        try {
          const emailDetail = await this.gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "full",
            fields: "id,threadId,payload(headers,body,parts)", // Only request needed fields
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
          if (emailDetail.data.payload.body?.data) {
            body = Buffer.from(
              emailDetail.data.payload.body.data,
              "base64"
            ).toString();
          } else if (emailDetail.data.payload.parts) {
            for (const part of emailDetail.data.payload.parts) {
              if (part.mimeType === "text/plain" && part.body?.data) {
                body = Buffer.from(part.body.data, "base64").toString();
                break;
              } else if (part.mimeType === "text/html" && part.body?.data) {
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

          return {
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
          };
        } catch (error) {
          return null;
        }
      });

      // Wait for all email fetches to complete in parallel
      const emailResults = await Promise.all(emailPromises);

      // Filter out null results (failed fetches)
      const emails = emailResults.filter(
        (email): email is EmailData => email !== null
      );

      return emails;
    } catch (error) {
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
      return false;
    }
  }

  async etiquetarEmail(
    emailId: string,
    etiqueta: "PROCESSED" | "QUOTE" | "NOT_QUOTE"
  ): Promise<boolean> {
    try {
      // Intentar crear etiqueta silenciosamente
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
    } catch (error) {}
  }

  async enviarRespuesta(
    emailOriginal: EmailData,
    cuerpo: string,
    esHtml: boolean = false
  ): Promise<boolean> {
    try {
      // Encode subject with UTF-8 support for special characters
      const encodedSubject = this.encodeSubject(`Re: ${emailOriginal.subject}`);
      
      // Extract clean email address
      const toEmail = emailOriginal.fromEmail || 
                     emailOriginal.replyTo || 
                     (emailOriginal.from.includes('<') 
                       ? emailOriginal.from.match(/<([^>]+)>/)?.[1] 
                       : emailOriginal.from);

      // Build proper references chain for threading
      let referencesHeader = '';
      if (emailOriginal.references && emailOriginal.messageId) {
        referencesHeader = `${emailOriginal.references} ${emailOriginal.messageId}`;
      } else if (emailOriginal.messageId) {
        referencesHeader = emailOriginal.messageId;
      }

      // Construct headers for proper email threading
      const headers = [
        `To: ${toEmail}`,
        `Subject: ${encodedSubject}`,
        `In-Reply-To: ${emailOriginal.messageId || ''}`,
        ...(referencesHeader ? [`References: ${referencesHeader}`] : []),
        `Content-Type: ${esHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        `Content-Transfer-Encoding: 8bit`,
      ].filter(header => !header.endsWith(': ')); // Remove empty headers

      const email = [
        ...headers,
        '',
        cuerpo
      ].join('\r\n');

      const encodedEmail = Buffer.from(email, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
          threadId: emailOriginal.threadId,
        },
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  async enviarEmail(
    destinatario: string,
    asunto: string,
    cuerpo: string,
    esHtml: boolean = false
  ): Promise<boolean> {
    try {
      // Encode subject with UTF-8 support for special characters
      const encodedSubject = this.encodeSubject(asunto);
      
      const headers = [
        `To: ${destinatario}`,
        `Subject: ${encodedSubject}`,
        `Content-Type: ${esHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        `Content-Transfer-Encoding: 8bit`,
      ];

      const email = [
        ...headers,
        '',
        cuerpo
      ].join('\r\n');

      const encodedEmail = Buffer.from(email, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
        },
      });

      return true;
    } catch (error) {
      return false;
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
  async ({
    maxResults,
  }: {
    maxResults: number;
  }): Promise<{
    emails: EmailData[];
    unprocessedCount: number;
  }> => {
    try {
      const emails = await gmailToolInstance.obtenerEmailsNoLeidos(maxResults);

      if (emails.length === 0) {
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

      return {
        emails: unprocessedEmails,
        unprocessedCount: unprocessedEmails.length,
      };
    } catch (error) {
      return { emails: [], unprocessedCount: 0 };
    }
  },
  {
    name: "read_emails",
    description: "Lee emails no leídos de Gmail y filtra los ya procesados",
    schema: z.object({
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(5)
        .describe("Número máximo de emails a leer"),
    }),
  }
);

// Tool to mark email as read
export const markAsReadTool = tool(
  async ({ emailId }: { emailId: string }): Promise<{ success: boolean }> => {
    try {
      const success = await gmailToolInstance.marcarComoLeido(emailId);

      return { success };
    } catch (error) {
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
    label,
  }: {
    emailId: string;
    label: "PROCESSED" | "QUOTE" | "NOT_QUOTE";
  }): Promise<{ success: boolean }> => {
    try {
      const success = await gmailToolInstance.etiquetarEmail(emailId, label);

      return { success };
    } catch (error) {
      return { success: false };
    }
  },
  {
    name: "label_email",
    description: "Agrega una etiqueta a un email en Gmail",
    schema: z.object({
      emailId: z.string().describe("ID del email a etiquetar"),
      label: z
        .enum(["PROCESSED", "QUOTE", "NOT_QUOTE"])
        .describe("Etiqueta a aplicar"),
    }),
  }
);

// Tool to send reply email
export const sendReplyEmailTool = tool(
  async ({
    emailOriginal,
    cuerpo,
    esHtml = false,
  }: {
    emailOriginal: EmailData;
    cuerpo: string;
    esHtml?: boolean;
  }): Promise<{ success: boolean }> => {
    try {
      const success = await gmailToolInstance.enviarRespuesta(
        emailOriginal,
        cuerpo,
        esHtml
      );

      return { success };
    } catch (error) {
      return { success: false };
    }
  },
  {
    name: "send_reply_email",
    description: "Envía una respuesta a un email específico manteniendo el hilo de conversación",
    schema: z.object({
      emailOriginal: z.object({
        id: z.string(),
        from: z.string(),
        subject: z.string(),
        body: z.string(),
        date: z.string(),
        isHtml: z.boolean(),
        threadId: z.string().optional(),
        messageId: z.string().optional(),
        references: z.string().optional(),
        inReplyTo: z.string().optional(),
        fromEmail: z.string().optional(),
        replyTo: z.string().optional(),
      }),
      cuerpo: z.string().describe("Contenido del email de respuesta"),
      esHtml: z.boolean().optional().default(false).describe("Si el contenido es HTML"),
    }),
  }
);

// Tool to send notification email
export const sendNotificationEmailTool = tool(
  async ({
    destinatario,
    asunto,
    cuerpo,
    esHtml = false,
  }: {
    destinatario: string;
    asunto: string;
    cuerpo: string;
    esHtml?: boolean;
  }): Promise<{ success: boolean }> => {
    try {
      const success = await gmailToolInstance.enviarEmail(
        destinatario,
        asunto,
        cuerpo,
        esHtml
      );

      return { success };
    } catch (error) {
      return { success: false };
    }
  },
  {
    name: "send_notification_email",
    description: "Envía un email de notificación a un destinatario",
    schema: z.object({
      destinatario: z.string().describe("Dirección de email del destinatario"),
      asunto: z.string().describe("Asunto del email"),
      cuerpo: z.string().describe("Contenido del email"),
      esHtml: z.boolean().optional().default(false).describe("Si el contenido es HTML"),
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
      const stats = await SimpleDataManager.getStatistics();

      return stats;
    } catch (error) {
      return { totalQuotations: 0, uniqueClients: 0, todayQuotations: 0 };
    }
  },
  {
    name: "get_stats",
    description: "Obtiene estadísticas del sistema de cotizaciones",
    schema: z.object({}),
  }
);

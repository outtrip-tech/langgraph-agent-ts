// Interfaces simplificadas para el agente de cotizaciones
export interface SimpleQuotation {
  id: string;
  clientName: string;
  clientEmail: string;
  subject: string;
  destination: string;
  dates: string;
  travelers: string;
  budget: string;
  notes: string;
  createdAt: Date;
  emailId: string; // Reference to the original email
}

export interface SimpleExtractionResult {
  clientName?: string;
  destination?: string;
  dates?: string;
  travelers?: string;
  budget?: string;
  notes?: string;
  confidence: number; // 0-100
}

// Mantenemos estas interfaces del código original que necesitamos
export interface EmailData {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  isHtml: boolean;
  threadId?: string;
  messageId?: string;
  references?: string;
  inReplyTo?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface ConfigGmail {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  accessToken: string;
  refreshToken: string;
}

export interface ClassificationResult {
  is_quote: boolean;
  signals: string[];
  confidence: number;
}
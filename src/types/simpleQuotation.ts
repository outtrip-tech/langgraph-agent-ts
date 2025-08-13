// New comprehensive quotation structure
export interface SimpleQuotation {
  isQuoteRequest: true;
  clientName: string;
  clientEmail: string;
  subject: string;
  destination: string;
  city: string;
  country: string;
  startDate: string; // DD/MM/YYYY format
  endDate: string; // DD/MM/YYYY format
  flexDates: boolean;
  preferredMonth: string;
  numberOfPeople: number;
  adults: number;
  children: number;
  childrenAges: number[];
  interests: string[];
  dietaryRequirements: {
    preferences: string[];
    allergies: string[];
    restrictions: string[];
    notes: string;
  };
  budget: {
    amount: number | null;
    currency: string;
    scope: string;
    isFlexible: boolean;
  };
  emailId: string;
  emailStatus: "complete" | "incomplete";
  missingFields: string[];
  id: string;
  createdAt: string; // ISO format
  emailHistory: EmailInteraction[];
}

// Classification result for non-quotes
export interface NonQuoteClassification {
  isQuoteRequest: false;
}

// Extraction result for quotes
export interface QuoteExtractionResult {
  isQuoteRequest: true;
  clientName: string;
  clientEmail: string;
  subject: string;
  destination: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  flexDates: boolean;
  preferredMonth: string;
  numberOfPeople: number;
  adults: number;
  children: number;
  childrenAges: number[];
  interests: string[];
  dietaryRequirements: {
    preferences: string[];
    allergies: string[];
    restrictions: string[];
    notes: string;
  };
  budget: {
    amount: number | null;
    currency: string;
    scope: string;
    isFlexible: boolean;
  };
  emailId: string;
  emailStatus: "complete" | "incomplete";
  missingFields: string[];
  createdAt: string;
  emailHistory: EmailInteraction[];
}

// Combined type for classification results
export type ClassificationExtractionResult = QuoteExtractionResult | NonQuoteClassification;

// Follow-up and email interaction tracking
export interface EmailInteraction {
  date: string;
  type: "initial_request" | "missing_data_request" | "completion_notification" | "follow_up" | "client_response";
  emailId?: string;
  content?: string;
  success?: boolean;
}

// Enhanced quotation with follow-up tracking
export interface QuotationWithFollowUp extends SimpleQuotation {
  followUpStatus: "none" | "pending_info" | "following_up" | "completed" | "abandoned";
  lastContactDate?: string;
  followUpsSent: number;
  nextFollowUpDate?: string;
  emailInteractions: EmailInteraction[];
}

// Response analysis result
export interface ResponseAnalysis {
  isRelevantResponse: boolean;
  confidence: number;
  hasNewInformation: boolean;
  updatedFields: Partial<SimpleQuotation>;
  stillMissingFields: string[];
  isComplete: boolean;
}

// Completeness evaluation result
export interface CompletenessEvaluation {
  isComplete: boolean;
  missingEssentialFields: string[];
  missingImportantFields: string[];
  completenessScore: number;
  recommendation: "complete" | "request_more_info" | "proceed_with_partial";
  reasoning: string;
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
  quote_type?: "B2B" | "B2C" | "unclear" | null;
}

// Processing metrics and results
export interface ProcessingMetrics {
  emailsProcessed: number;
  quotationsCreated: number;
  notQuotations: number;
  processingTimeMs: number;
  avgProcessingTimePerEmail: number;
  successRate: number;
  errors: Array<{
    emailId: string;
    error: string;
    timestamp: string;
  }>;
}

export interface BatchProcessingResult {
  quotations: SimpleQuotation[];
  metrics: ProcessingMetrics;
  summary: {
    totalEmails: number;
    successfulQuotations: number;
    failedEmails: number;
    processingTime: string;
  };
}

// Configuration interfaces
export interface EmailProcessingConfig {
  maxEmails?: number;
  concurrency?: number;
  retries?: number;
  perEmail?: {
    recursionLimit?: number;
    timeoutMs?: number;
  };
}
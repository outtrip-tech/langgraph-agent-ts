// Simple, clean logging system focused on essential information
export enum LogLevel {
  ERROR = 0,
  INFO = 1,
  DEBUG = 2
}

export interface EmailProcessingResult {
  index: number;
  total: number;
  from: string;
  subject: string;
  result: 'COTIZACIÓN B2B' | 'COTIZACIÓN B2C' | 'NO COTIZACIÓN';
  quoteId?: string;
  error?: string;
}

export interface ProcessingSummary {
  emailsProcessed: number;
  quotationsCreated: number;
  notQuotations: number;
  processingTimeMs: number;
  quotations: Array<{
    id: string;
    clientName: string;
    subject: string;
    type: 'B2B' | 'B2C';
  }>;
}

export class SimpleLogger {
  private static currentLogLevel: LogLevel = LogLevel.INFO;

  static setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  static startSession(): void {
    console.log('🚀 Agente iniciado - Procesando emails no leídos...\n');
  }

  static logEmailProcessing(result: EmailProcessingResult): void {
    if (this.currentLogLevel < LogLevel.INFO) return;

    const statusIcon = result.result === 'NO COTIZACIÓN' ? '❌' : '✅';
    const fromEmail = result.from.includes('<') 
      ? result.from.split('<')[1].replace('>', '') 
      : result.from;
    
    console.log(
      `📧 [${result.index}/${result.total}] ${fromEmail} | "${result.subject}" → ${result.result} ${statusIcon}`
    );

    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    }
  }

  static logProcessingSummary(summary: ProcessingSummary): void {
    if (this.currentLogLevel < LogLevel.INFO) return;

    const processingTime = this.formatProcessingTime(summary.processingTimeMs);
    const quotationRate = summary.emailsProcessed > 0 
      ? Math.round((summary.quotationsCreated / summary.emailsProcessed) * 100) 
      : 0;

    console.log('\n' + '━'.repeat(50));
    console.log('📊 RESUMEN EJECUTIVO');
    console.log('━'.repeat(50));
    
    console.log(`📧 Emails procesados: ${summary.emailsProcessed}`);
    console.log(`✅ Cotizaciones: ${summary.quotationsCreated} (${quotationRate}%)`);
    console.log(`❌ Descartados: ${summary.notQuotations} (${100-quotationRate}%)`);
    console.log(`⏱️  Tiempo: ${processingTime}`);

    if (summary.quotations.length > 0) {
      console.log('\n💼 NUEVAS COTIZACIONES:');
      summary.quotations.forEach(q => {
        console.log(`[${q.id}] ${q.clientName} - ${q.subject} (${q.type})`);
      });
    } else {
      console.log('\n🔍 No se encontraron nuevas solicitudes de cotización');
    }

    console.log('\n✨ Procesamiento completado');
  }

  static logError(message: string, error?: Error): void {
    console.error(`❌ ${message}`);
    if (error && this.currentLogLevel >= LogLevel.DEBUG) {
      console.error(error);
    }
  }

  static logInfo(message: string): void {
    if (this.currentLogLevel >= LogLevel.INFO) {
      console.log(message);
    }
  }

  static logDebug(message: string): void {
    if (this.currentLogLevel >= LogLevel.DEBUG) {
      console.log(`🔧 ${message}`);
    }
  }

  private static formatProcessingTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  // Silent methods for internal operations
  static silent = {
    log: () => {}, // No-op
    error: (message: string, error?: Error) => {
      // Only show critical errors
      if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        SimpleLogger.logError(message, error);
      }
    }
  };
}
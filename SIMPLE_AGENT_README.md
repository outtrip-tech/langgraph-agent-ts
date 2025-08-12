# Agente Simple de Cotizaciones con LangGraph

## Descripción

Este es un agente simplificado que procesa emails de Gmail para detectar y extraer solicitudes de cotizaciones turísticas. Utiliza **LangGraph StateGraph** para el flujo de procesamiento mientras mantiene datos simples y predecibles.

## Funcionalidades

✅ **Mantiene del sistema anterior:**
- Lectura de emails no leídos de Gmail
- Clasificación automática de solicitudes de cotización
- Integración con Gmail API

✨ **Nuevo enfoque simplificado con StateGraph:**
- **LangGraph StateGraph** con 5 nodos para flujo visual
- **Gmail Tools nativas** de LangGraph para operaciones
- Extracción básica de datos (no validaciones complejas)
- Estructura de datos simple
- Sin sistema de seguimiento automático
- Procesamiento en batch de múltiples emails

## Estructura de Datos Simple

```typescript
interface SimpleQuotation {
  id: string;              // SQ-0001, SQ-0002, etc.
  clientName: string;      // Nombre extraído del email
  clientEmail: string;     // Email del cliente
  subject: string;         // Asunto original
  destination: string;     // Destino mencionado
  dates: string;           // Fechas mencionadas
  travelers: string;       // Información de viajeros
  budget: string;          // Presupuesto mencionado
  notes: string;           // Información adicional
  createdAt: Date;         // Fecha de creación
  emailId: string;         // ID del email original
}
```

## Flujo StateGraph

### Arquitectura del Graph
```
START → readEmails → classifyEmail → extractData → createQuotation → processEmail → END
                         ↓                                                        ↓
                    [No es cotización]                                    [Más emails?]
                         ↓                                                        ↓  
                   processEmail ←───────────────────────────────────────── readEmails
```

### Nodos del StateGraph
1. **readEmails** - Lee emails no leídos de Gmail usando `readEmailsTool`
2. **classifyEmail** - Clasifica con GPT-4o-mini y etiqueta con `labelEmailTool`
3. **extractData** - Extrae datos básicos si es cotización (≥70% confianza)
4. **createQuotation** - Crea y guarda cotización en `simple_quotations.json`
5. **processEmail** - Marca como procesado con `markAsReadTool` y `labelEmailTool`

### Gmail Tools Integradas
- `readEmailsTool` - Lee emails y filtra ya procesados
- `markAsReadTool` - Marca emails como leídos
- `labelEmailTool` - Aplica etiquetas (QUOTE, NOT_QUOTE, PROCESSED)
- `getStatsTool` - Obtiene estadísticas del sistema

## Comandos

```bash
# Ejecutar el agente simple
yarn simple

# Otros comandos existentes
yarn auth          # Configurar Gmail OAuth
yarn build         # Compilar TypeScript
yarn quotes        # Ejecutar agente complejo anterior
```

## Configuración

Las mismas variables de entorno del sistema anterior:

```env
OPENAI_API_KEY=sk-...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_ACCESS_TOKEN=...
GMAIL_REFRESH_TOKEN=...
```

## Archivos de Datos

- `simple_quotations.json` - Base de datos simple de cotizaciones
- Se mantienen archivos anteriores sin modificar

## Diferencias con el Sistema Anterior

| Aspecto | Sistema Anterior Complejo | Sistema Simple con StateGraph |
|---------|---------------------------|-------------------------------|
| **Arquitectura** | LangGraph StateGraph (8 nodos complejos) | LangGraph StateGraph (5 nodos simples) |
| **Estructura de datos** | Quotation (30+ campos) | SimpleQuotation (10 campos) |
| **Validación** | Sistema complejo multi-nivel | Solo confianza de extracción |
| **Seguimiento** | Emails automáticos | Solo procesamiento |
| **Tools** | Métodos directos | Gmail Tools nativas de LangGraph |
| **Base de datos** | 3 archivos JSON complejos | 1 archivo JSON simple |
| **Estado** | Estado complejo con validaciones | Estado simple con batch processing |

## Ventajas del Sistema Simple con StateGraph

- 🚀 **Rápido**: Sin validaciones complejas, solo extracción básica
- 🧹 **Simple**: Lógica fácil de entender con StateGraph visual
- 🛡️ **Confiable**: Flujo StateGraph con manejo de errores robusto
- 📦 **Liviano**: Menos código complejo, más tools nativas
- 🔧 **Mantenible**: Debugging visual con LangGraph
- 📊 **Escalable**: Procesamiento en batch de múltiples emails
- 🔍 **Observable**: Estado del graph visible para debugging

## Logs de Ejemplo

```
🚀 Iniciando procesamiento con StateGraph...
📊 Estadísticas actuales: 15 cotizaciones, 12 clientes únicos

📧 Nodo: Leyendo emails...
🔍 Obteniendo nuevos emails...
📩 Tool: 3 emails sin procesar de 5 total
📋 Procesando email 1/3: Consulta viaje a Cancún

🔍 Nodo: Clasificando email de maria@email.com
📊 Resultado: ES COTIZACIÓN (85%)
🔧 Tool: Etiquetando email con QUOTE...

🔬 Nodo: Extrayendo datos básicos...
🎯 Datos extraídos con confianza: 92%

💾 Nodo: Creando cotización simple...
✅ Cotización creada: SQ-0016
👤 Cliente: María González (maria@email.com)
🌍 Destino: Cancún
📅 Fechas: 15 al 22 de marzo
✈️ Viajeros: 4 personas
💰 Presupuesto: 2000 USD

✅ Nodo: Procesando email...
🔧 Tool: Marcando email como leído...
🔧 Tool: Etiquetando email con PROCESSED...
✨ Email procesado exitosamente

🎉 Procesamiento completado. 1 nuevas cotizaciones creadas
```
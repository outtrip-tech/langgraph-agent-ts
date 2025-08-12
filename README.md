# 🚀 Agente de Cotizaciones Turísticas - Sistema Refactorizado

Un agente inteligente especializado en **procesar solicitudes de cotización recibidas por email**. Su misión es leer, clasificar, extraer datos relevantes, registrar clientes y generar cotizaciones organizadas, completas y fáciles de dar seguimiento.

## 🎯 Funcionalidades Principales

- ✅ **Lectura y clasificación automática** de emails no leídos
- ✅ **Identificación inteligente** de clientes (agencia vs cliente final)
- ✅ **Extracción completa de datos** usando GPT-4o-mini
- ✅ **Sistema de validación avanzado** (campos obligatorios vs deseables)
- ✅ **Seguimientos automáticos estructurados** con formato profesional
- ✅ **Trackeo completo de emails** y conversaciones
- ✅ **Base de datos JSON** para clientes y cotizaciones
- ✅ **Generación de IDs únicos** para cotizaciones (QT-AAAA-MM-DD-X)
- ✅ **Manejo de información incompleta** con pausas y continuaciones
- ✅ **Emails profesionales** con formato markdown

## 🏗️ Arquitectura Refactorizada del Agente

El agente utiliza **StateGraph** de LangGraph con 6 estados principales siguiendo el procedimiento detallado:

```
📧 ReadEmails → 🔍 ClassifyEmail → 👤 IdentifyClient → 🔬 ExtractData
                        ↓                                     ↓
                   🏁 Finalize                          ✅ ValidateData
                                                             ↓
                                               📤 SendFollowup | ✅ SendConfirmation
                                                             ↓
                                                      🏁 Finalize
```

### Estados del Flujo:

1. **📧 ReadEmails**: Obtiene emails no leídos y verifica si ya fueron procesados
2. **🔍 ClassifyEmail**: Determina si es una solicitud de cotización válida  
3. **👤 IdentifyClient**: Busca o crea cliente en `clients.json` y inicia trackeo
4. **🔬 ExtractData**: Extrae datos completos usando la nueva estructura
5. **✅ ValidateData**: Valida datos y crea/actualiza cotización en `quotations.json`
6. **📤 SendFollowup**: Envía seguimiento para datos faltantes (estado IN_PROGRESS)
7. **✅ SendConfirmation**: Envía confirmación cuando está completa (estado COMPLETED)
8. **🏁 Finalize**: Completa trackeo y limpia datos antiguos

## 📋 Nueva Estructura de Datos

### Cotizaciones (`quotations.json`)

```typescript
interface Quotation {
  quotationId: string;        // QT-AAAA-MM-DD-X format
  status: "IN_PROGRESS" | "COMPLETED";
  clientId: string;           // UUID reference
  requestDate: string;        // ISO8601
  requester: {
    type: "agency" | "final_client";
    name: string;
    contact: { firstName, lastName, email, phone };
    country: string;
  };
  endClient?: {               // Solo si es agencia
    name, lastName, nationality, phone, country;
  };
  travelDetails: {
    tripType: string;
    destinations: Array<{ country, citiesOrRegions }>;
    travelPeriod: {
      arrivalDate?: string;   // YYYY-MM-DD
      departureDate?: string; // YYYY-MM-DD  
      isFlexible: boolean;
      preferredMonth?: string;
      preferredYear?: string;
    };
    duration: { days?, nights? };
  };
  travelers: { adults, children, childrenAges, infants };
  accommodationPreferences: { hotelCategory, roomConfiguration, meal_plan };
  interests: string[];
  budget: { amount?, currency?, scope?, isFlexible };
  additionalInfo: { clientNotes, internalNotes };
  special_requirements: string[];
  missingReasons: string[];
  history: Array<{ emailId, date, subject, responseSent }>;
  lastActivity: string;       // ISO8601
}
```

### Clientes (`clients.json`)

```typescript
interface Client {
  clientId: string;           // UUID autogenerado
  clientType: "agency" | "final_client";
  companyName?: string;       // Si es agencia
  contact: { firstName, lastName, email, phone };
  country: string;
  creationDate: string;       // ISO8601
}
```

### Trackeo de Emails (`email_tracking.json`)

```typescript
interface EmailTracking {
  id: string;                 // emailId:messageId
  emailId: string;
  threadId: string; 
  messageId: string;
  status: "pending" | "processing" | "completed" | "error";
  createdAt: string;          // ISO8601
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
```

## 🚀 Instalación

### 1. Clonar e Instalar Dependencias

```bash
# Clonar el repositorio
git clone <repository-url>
cd langgraph-agent-ts

# Instalar dependencias
yarn install
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo y configúralo:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# Gmail Service Account
GMAIL_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GMAIL_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_PRIVATE_KEY_AQUI\n-----END PRIVATE KEY-----\n"
GMAIL_PROJECT_ID=your-project-id
```

### 3. Configurar Gmail API

#### Paso a paso para Gmail API:

1. **Google Cloud Console**: Ve a [console.cloud.google.com](https://console.cloud.google.com/)

2. **Crear/Seleccionar Proyecto**: Crea un nuevo proyecto o selecciona uno existente

3. **Habilitar Gmail API**:
   - Ve a "APIs & Services" > "Library"
   - Busca "Gmail API" y habilítala

4. **Crear Service Account**:
   - Ve a "APIs & Services" > "Credentials"
   - Clic en "Create Credentials" > "Service Account"
   - Completa el nombre y descripción

5. **Generar Clave**:
   - Clic en el Service Account creado
   - Ve a la pestaña "Keys"
   - "Add Key" > "Create New Key" > JSON
   - Descarga el archivo JSON

6. **Configurar .env**:
   - Extrae `client_email`, `private_key` y `project_id` del JSON
   - Agrega estos valores a tu archivo `.env`

7. **Habilitar acceso a Gmail** (si usas Gmail personal):
   - Ve a "APIs & Services" > "Domain-wide Delegation"
   - Habilita "Google Workspace Domain-wide Delegation"

## 🎮 Uso

### Agente Refactorizado

```bash
# Ejecutar el agente refactorizado
yarn refactored

# Ejecutar en modo desarrollo con logs detallados  
yarn dev:refactored

# Ejecutar agente original (legacy)
yarn dev
```

### Producción

```bash
# Compilar TypeScript
yarn build

# Ejecutar versión compilada
yarn start
```

### Programar Ejecución (Cron)

Agrega a tu crontab para ejecutar cada 30 minutos:

```bash
# Editar crontab
crontab -e

# Agregar línea (ejecutar cada 30 minutos)
*/30 * * * * cd /path/to/langgraph-agent-ts && yarn start >> /var/log/quotation.log 2>&1
```

## 📁 Estructura del Proyecto

```
src/
├── agents/
│   └── cotizacionAgent.ts    # Agente principal con StateGraph
├── tools/
│   └── gmailTool.ts         # Herramientas de Gmail
├── utils/
│   ├── validators.ts        # Validaciones con Zod
│   └── formatters.ts        # Formateo de datos
├── types/
│   └── quotation.ts        # Interfaces TypeScript
└── index.ts                 # Punto de entrada
```

## 🔧 Configuraciones Avanzadas

### Variables de Entorno Opcionales

```env
# Máximo emails por ejecución
MAX_EMAILS=10

# Idioma de respuestas
RESPONSE_LANGUAGE=es

# Activar modo debug
DEBUG=true
```

### Personalizar Validaciones

Edita `src/utils/validators.ts` para personalizar:

- Campos requeridos
- Reglas de validación
- Formatos de fecha
- Patrones de teléfono

### Personalizar Respuestas

Edita `src/tools/gmailTool.ts` método `generarMensajeSeguimiento()` para personalizar emails automáticos.

## 🛠️ Scripts Disponibles

```bash
# Desarrollo
yarn dev                    # Ejecutar con ts-node
yarn dev:with-args         # Ejecutar con argumentos personalizados

# Producción
yarn build                 # Compilar TypeScript
yarn start                 # Ejecutar versión compilada

# Utilidades
yarn lint                  # Linting (si está configurado)
yarn test                  # Tests (si está configurado)
```

## 📤 Formato de Salida

### Cotización Completa

```json
{
  "nombre": "Juan Pérez",
  "email": "juan@email.com",
  "telefono": "+1234567890",
  "paisOrigen": "Argentina",
  "fechaSolicitud": "2024-01-15",
  "fechaLlegada": "2024-03-01",
  "fechaSalida": "2024-03-08",
  "numeroPersonas": 4,
  "numeroDias": 7,
  "numeroNoches": 6,
  "numeroHabitaciones": 2,
  "destino": "Cancún, México",
  "tipoViaje": "familiar",
  "presupuesto": 3500,
  "estado": "completo"
}
```

### Cotización Incompleta

```json
{
  "nombre": "María García",
  "email": "maria@email.com",
  "destino": "Bariloche",
  "numeroPersonas": 2,
  "estado": "incompleto"
}
```

## 🔍 Casos de Uso Soportados

- ✅ Emails en HTML y texto plano
- ✅ Múltiples formatos de fecha
- ✅ Diferentes monedas y presupuestos
- ✅ Solicitudes en español e inglés
- ✅ Emails mal estructurados o incompletos
- ✅ Manejo de errores de red y API
- ✅ Validación de coherencia entre fechas

## 🐛 Troubleshooting

### Error: "No se pudieron obtener emails"

1. Verifica credenciales de Gmail API
2. Revisa permisos del Service Account
3. Confirma que Gmail API está habilitada

### Error: "OpenAI API key inválida"

1. Verifica que `OPENAI_API_KEY` está configurada
2. Confirma que la API key es válida
3. Revisa límites de uso en OpenAI

### Error: "No se encontraron emails no leídos"

1. Confirma que hay emails sin leer en la cuenta
2. Revisa filtros de búsqueda de emails
3. Verifica permisos de lectura del Service Account

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📜 Licencia

Distribuido bajo la Licencia MIT. Ve `LICENSE` para más información.

## 🎯 Alcance y Funcionalidad Completa

### ✅ Lo que SÍ hace el agente:

1. **Procesamiento Automático Completo**:
   - Lee todos los emails en estado "no leído"
   - Clasifica automáticamente si es cotización turística válida
   - Extrae datos completos de manera estructurada
   - Identifica tipo de solicitante (agencia vs cliente final)

2. **Gestión Inteligente de Datos**:
   - Registra clientes nuevos automáticamente
   - Mantiene historial completo de comunicaciones
   - Actualiza cotizaciones existentes con nueva información
   - Genera IDs únicos y trazables

3. **Comunicaciones Profesionales**:
   - Envía seguimientos estructurados para datos faltantes
   - Usa formato markdown para emails más legibles
   - Maneja threads de conversación correctamente
   - Personaliza mensajes según el contexto

4. **Validación Avanzada**:
   - Distingue campos obligatorios vs deseables
   - Pausa proceso hasta recibir datos críticos
   - Continúa con cotización aunque falten datos opcionales
   - Trackea razones específicas de información faltante

### ⚠️ Limitaciones del Sistema:

1. **Dependencias Externas**:
   - Requiere Gmail API configurada correctamente
   - Necesita OpenAI API Key válida
   - Solo funciona con emails de Gmail

2. **Procesamiento de Lenguaje**:
   - Optimizado para español, funcionalidad limitada en otros idiomas
   - Requiere emails estructurados mínimamente
   - No procesa imágenes o archivos adjuntos

3. **Volumen y Performance**:
   - Procesa emails de uno en uno (no batch)
   - Rate limits de OpenAI API pueden causar delays
   - Archivos JSON pueden crecer con uso intensivo

4. **Casos Edge**:
   - Emails muy mal estructurados pueden fallar
   - Fechas en formatos muy raros pueden no parsearse
   - No maneja cambios en cotizaciones ya completadas

### 🔧 Configuraciones Necesarias:

1. **Variables de entorno obligatorias**:
   ```
   OPENAI_API_KEY=sk-...
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   GMAIL_ACCESS_TOKEN=...
   GMAIL_REFRESH_TOKEN=...
   ```

2. **Permisos Gmail requeridos**:
   - Lectura de emails
   - Envío de respuestas
   - Modificación de etiquetas
   - Marcar como leído

### 📊 Métricas y Monitoreo:

El agente proporciona estadísticas en tiempo real:
- Total de clientes registrados
- Cotizaciones activas vs completadas
- Emails procesados exitosamente
- Errores y fallos por trackear

## 🚀 Próximas Mejoras Sugeridas

- [ ] Dashboard web para visualización
- [ ] Soporte para múltiples idiomas
- [ ] Integración con CRM externos
- [ ] Procesamiento de archivos adjuntos
- [ ] Templates de respuesta personalizables
- [ ] API REST para integraciones
- [ ] Análisis de sentimientos en emails
- [ ] Notificaciones push para nuevas cotizaciones
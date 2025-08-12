# Sistema de Seguimiento Automático para Cotizaciones

## Resumen del Sistema

El agente LangGraph ahora incluye un sistema completo de seguimiento automático que:

1. **Detecta cotizaciones incompletas** y solicita automáticamente los datos faltantes
2. **Envía emails humanos y profesionales** estilo recepcionista DMC
3. **Monitorea respuestas** de clientes con información adicional
4. **Actualiza cotizaciones** automáticamente cuando llega nueva información
5. **Notifica clientes** cuando las cotizaciones están completas

## Flujo de Trabajo Completo

```
Email Entrante
       ↓
1. Verificar Seguimiento
   ├─ Es respuesta → Procesar Respuesta de Seguimiento
   └─ Email nuevo → Clasificar Email
       ↓
2. Extraer Datos → Generar Cotización
       ↓
3. Verificar Completitud
   ├─ Completa → Notificar Cliente (Email de confirmación)
   ├─ Incompleta → Solicitar Datos Faltantes (Email pidiendo info)
   └─ Parcial → Procesar sin email
       ↓
4. Crear registro de seguimiento para cotizaciones incompletas
```

## Nuevos Componentes

### 1. **EmailTemplateGenerator** (`src/templates/emailTemplates.ts`)
- Genera emails humanos y profesionales
- Templates personalizables para diferentes situaciones
- Estilo cordial de recepcionista DMC

### 2. **FollowUpManager** (`src/utils/followUpManager.ts`)
- Gestiona registros de seguimiento en `follow_ups.json`
- Monitorea estado de cotizaciones incompletas
- Detecta respuestas de clientes con información adicional

### 3. **Nuevos Prompts** (`src/prompts/followUpPrompts.ts`)
- Evaluación de completitud de cotizaciones
- Extracción de información de respuestas
- Clasificación de respuestas relevantes

### 4. **Funciones de Email** (`src/tools/gmailTools.ts`)
- `sendReplyEmailTool`: Responde manteniendo el hilo de conversación
- `sendNotificationEmailTool`: Envía notificaciones independientes

## Ejemplos de Emails Automáticos

### Email para Datos Faltantes
```
Estimado/a Juan Pérez,

Muchas gracias por contactarnos para su solicitud de viaje a Tulum, México.

Estamos encantados de poder asistirle con su cotización personalizada. Para ofrecerle la mejor propuesta adaptada a sus necesidades, necesitaríamos algunos datos adicionales:

• Fecha de inicio del viaje
• Fecha de finalización del viaje
• Número total de personas

Una vez que recibamos esta información, nuestro equipo estará en condiciones de enviarle una cotización detallada y personalizada en un plazo máximo de 24 horas.

Le agradecemos su confianza y quedamos atentos a su respuesta.

Saludos cordiales,

Equipo de Reservas
Tu DMC de Confianza

---
Ref: SQ-0001
```

### Email de Cotización Completa
```
Estimado/a Juan Pérez,

¡Excelente! Hemos recibido toda la información necesaria para su solicitud de viaje a Tulum, México.

Detalles de su solicitud:
• Fechas: 15/03/2025 al 22/03/2025
• Viajeros: 4 personas
  - 2 adultos y 2 niños

Nuestro equipo de especialistas ya está trabajando en su cotización personalizada y la recibirá en las próximas 24 horas.

La propuesta incluirá:
• Itinerario detallado adaptado a sus preferencias
• Opciones de alojamiento seleccionadas especialmente para ustedes
• Actividades y experiencias recomendadas
• Presupuesto transparente con todos los servicios incluidos

Gracias por confiar en nosotros para hacer realidad su experiencia de viaje.

Saludos cordiales,

Equipo de Reservas
Tu DMC de Confianza

---
Ref: SQ-0001
```

## Configuración

### Variables de Entorno (Opcionales)
```env
# Personalización de la DMC
DMC_NAME="Mi Agencia de Viajes"
DMC_SIGNATURE="Equipo Comercial"
DMC_PHONE="+1-234-567-8900"
DMC_WEBSITE="www.miagencia.com"
```

### Archivos de Datos
- `quotations.json` - Cotizaciones (existente)
- `follow_ups.json` - Registros de seguimiento (nuevo)

## Características del Sistema

### ✅ Automatización Completa
- Detecta automáticamente qué información falta
- Envía emails sin intervención manual
- Actualiza cotizaciones con respuestas

### ✅ Comunicación Humana
- Emails cordiales y profesionales
- Personalización basada en datos del cliente
- Mantiene contexto de la conversación

### ✅ Seguimiento Inteligente
- Reconoce respuestas a solicitudes previas
- Extrae información incremental
- Evita spam con límites de seguimiento

### ✅ Estado de Cotizaciones
- `complete`: Lista para procesar
- `incomplete`: Esperando información
- `pending_info`: Seguimiento activo
- `responded`: Cliente respondió
- `abandoned`: Máximo seguimientos alcanzado

## Uso del Sistema

El sistema funciona automáticamente una vez configurado. Simplemente:

1. **Ejecutar el agente**: `yarn start`
2. **El sistema procesará emails** y enviará seguimientos automáticamente
3. **Monitorear logs** para ver actividad de seguimiento
4. **Revisar archivos JSON** para estado de cotizaciones

## Monitoreo

- **Logs del agente**: Muestran emails enviados y procesados
- **follow_ups.json**: Estado actual de todos los seguimientos
- **quotations.json**: Cotizaciones actualizadas con información del cliente

El sistema está diseñado para ser **completamente autónomo** mientras mantiene un **toque humano profesional** en todas las comunicaciones.
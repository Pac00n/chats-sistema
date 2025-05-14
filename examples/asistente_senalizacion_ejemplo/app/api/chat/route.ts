// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { assistants, getAssistantById } from '@/lib/assistants'; 
import { Buffer } from 'buffer';

export const runtime = "nodejs";
export const maxDuration = 60; // Cambiado de 90 a 60

// --- Cliente OpenAI (inicialización robusta) ---
let openai: OpenAI | null = null;
const openAIApiKey = process.env.OPENAI_API_KEY;

if (openAIApiKey && openAIApiKey.trim() !== "") {
    try {
        openai = new OpenAI({ apiKey: openAIApiKey });
        console.log("[API Chat] Cliente OpenAI inicializado exitosamente.");
    } catch (e) {
        console.error("[API Chat] Falló la inicialización del cliente OpenAI:", e);
        // openai permanecerá null. El handler POST lo verificará.
    }
} else {
    console.warn("[API Chat] OPENAI_API_KEY no está configurada. Los asistentes de OpenAI no funcionarán.");
}
// --- Fin Cliente OpenAI ---

const waitForRunCompletion = async (
  openaiClient: OpenAI, // Se asume que no es null cuando se llama
  threadId: string,
  runId: string,
  maxAttempts = 45, 
  delay = 2000 
): Promise<OpenAI.Beta.Threads.Runs.Run> => {
  let run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
  let attempts = 0;
  while (['queued', 'in_progress', 'cancelling'].includes(run.status) && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, delay)); 
    attempts++;
    console.log(`[API Chat] Esperando run OpenAI (${threadId}/${runId}). Intento ${attempts}. Estado: ${run.status}`);
    try {
        run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
    } catch (error) {
        console.error(`[API Chat] Error al recuperar estado run OpenAI ${runId} (intento ${attempts}):`, error);
        // Si hay un error recuperando, podría ser un problema de red o de OpenAI.
        // Continuamos para reintentar, el bucle eventualmente terminará por maxAttempts.
    }
  }
  console.log(`[API Chat] Run OpenAI ${runId} finalizado con estado: ${run.status}`);
  return run;
};

export async function POST(req: NextRequest) {
  console.log("[API Chat] Recibida solicitud POST /api/chat");
  try {
    // Verificar si el cliente OpenAI está disponible ANTES de hacer nada más
    if (!openai) {
      console.error("[API Chat] Intento de usar API pero el cliente OpenAI no está inicializado (problema de API Key?).");
      return NextResponse.json({ error: 'Configuración del servidor incompleta para asistentes OpenAI (API Key).' }, { status: 500 });
    }

    const body = await req.json();
    const { assistantId, message, imageBase64, threadId: existingThreadId } = body;
    console.log(`[API Chat] Datos recibidos: assistantId=${assistantId}, message=${message ? message.substring(0,30)+"...": "N/A"}, imageBase64=${imageBase64 ? "Presente" : "Ausente"}, threadId=${existingThreadId}`);

    // --- Validaciones de entrada ---
    if (typeof assistantId !== 'string' || !assistantId) return NextResponse.json({ error: 'assistantId es requerido' }, { status: 400 });
    if ((typeof message !== 'string' || !message.trim()) && (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image'))) return NextResponse.json({ error: 'Se requiere texto o imagen válida' }, { status: 400 });
    if (existingThreadId !== undefined && typeof existingThreadId !== 'string' && existingThreadId !== null) return NextResponse.json({ error: 'threadId inválido' }, { status: 400 });
    // La validación de process.env.OPENAI_API_KEY ya está implícita en la inicialización de `openai`
    // --- Fin Validaciones --- 
    
    const assistantConfig = getAssistantById(assistantId);
    if (!assistantConfig || !assistantConfig.assistant_id) {
         const errorMsg = !assistantConfig ? 'Asistente no encontrado' : `Configuración inválida (${assistantId}): falta assistant_id de OpenAI.`;
         console.error(`[API Chat] Configuración de asistente inválida: ${errorMsg}`);
         return NextResponse.json({ error: errorMsg }, { status: !assistantConfig ? 404 : 500 });
    }
    const openaiAssistantId = assistantConfig.assistant_id;
    console.log(`[API Chat] Usando assistant_id de OpenAI: ${openaiAssistantId}`);

    // --- Gestión del Thread --- 
    let currentThreadId = existingThreadId;
    if (!currentThreadId) {
      try {
           const thread = await openai.beta.threads.create();
           currentThreadId = thread.id;
           console.log('[API Chat] Nuevo thread de OpenAI creado:', currentThreadId);
      } catch (threadError) {
           console.error("[API Chat] Error creando thread de OpenAI:", threadError);
           return NextResponse.json({ error: 'No se pudo crear la conversación con el asistente OpenAI' }, { status: 500 });
      }
    } else {
      console.log('[API Chat] Usando thread de OpenAI existente:', currentThreadId);
    }
    if (!currentThreadId) {
         console.error("[API Chat] Thread ID es null después de creación/verificación.");
         return NextResponse.json({ error: 'Error interno gestionando ID de conversación' }, { status: 500 });
    }
    // --- Fin Gestión Thread --- 

    // --- Subida de Imagen (si existe) --- 
    let fileId: string | null = null;
    if (typeof imageBase64 === 'string' && imageBase64.startsWith('data:image')) {
        try {
            const base64Data = imageBase64.split(';base64,').pop();
            if (!base64Data) throw new Error("Formato base64 inválido para imagen");
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const mimeType = imageBase64.substring("data:".length, imageBase64.indexOf(";base64"));
            const fileName = `image.${mimeType.split('/')[1] || 'bin'}`;
            console.log(`[API Chat] Subiendo imagen ${fileName} (${mimeType}) a OpenAI...`);
            
            const fileObject = await openai.files.create({
                file: new File([imageBuffer], fileName, { type: mimeType }), 
                purpose: 'vision', 
            });
            fileId = fileObject.id;
            console.log(`[API Chat] Imagen subida con éxito. File ID: ${fileId}`);
        } catch (uploadError) {
            console.error("[API Chat] Error subiendo imagen a OpenAI:", uploadError);
             return NextResponse.json({ error: 'Error al procesar la imagen adjunta' }, { status: 500 });
        }
    }
    // --- Fin Subida Imagen --- 

    // --- Añadir Mensaje --- 
    const messageContent: OpenAI.Beta.Threads.Messages.MessageCreateParams.Content[] = [];
    if (typeof message === 'string' && message.trim()) {
        messageContent.push({ type: 'text', text: message });
    }
    if (fileId) {
        messageContent.push({ type: 'image_file', image_file: { file_id: fileId } });
    }
    if (messageContent.length === 0) {
         console.warn("[API Chat] No hay contenido para enviar (ni texto ni imagen válida procesada).");
         messageContent.push({type: 'text', text: '(Intento de enviar mensaje vacío o con imagen fallida)'}); 
    }

    try {
       await openai.beta.threads.messages.create(currentThreadId, {
         role: 'user',
         content: messageContent,
       });
       console.log(`[API Chat] Mensaje añadido al thread ${currentThreadId}. Partes: ${messageContent.length}`);
    } catch (msgError) {
       console.error(`[API Chat] Error añadiendo mensaje al thread ${currentThreadId}:`, msgError);
       return NextResponse.json({ error: 'No se pudo enviar el mensaje al asistente OpenAI' }, { status: 500 });
    }
    // --- Fin Añadir Mensaje --- 

    // --- Crear y Esperar Run --- 
    let run;
    try {
       run = await openai.beta.threads.runs.create(currentThreadId, { assistant_id: openaiAssistantId });
       console.log(`[API Chat] Run ${run.id} creado para thread ${currentThreadId} con asistente ${openaiAssistantId}`);
    } catch (runCreateError) {
         console.error(`[API Chat] Error iniciando run para asistente ${openaiAssistantId}:`, runCreateError);
         return NextResponse.json({ error: 'No se pudo iniciar el procesamiento con el asistente OpenAI' }, { status: 500 });
    }
    
    const completedRun = await waitForRunCompletion(openai, currentThreadId, run.id);
    
    if (completedRun.status !== "completed") {
        console.error(`[API Chat] Run ${run.id} no completado. Estado final: ${completedRun.status}. Último error:`, completedRun.last_error);
        if (completedRun.status === "requires_action") return NextResponse.json({ error: "El asistente requiere acciones adicionales (no implementado)" }, { status: 501 });
        if (['queued', 'in_progress', 'cancelling', 'failed'].includes(completedRun.status)) { 
            // Intentar cancelar si está en un estado activo, o si falló y queremos asegurarnos
            if (['queued', 'in_progress'].includes(completedRun.status)){
                 try { await openai.beta.threads.runs.cancel(currentThreadId, run.id); } catch (_) {}
            }
        }
        const errorMsg = completedRun.last_error?.message || `Ejecución del asistente OpenAI fallida o incompleta (${completedRun.status}).`;
        const errorCode = completedRun.last_error?.code ? ` (Code: ${completedRun.last_error.code})` : '';
        return NextResponse.json({ error: `${errorMsg}${errorCode}`, details: completedRun.last_error }, { status: 500 });
    }
    console.log(`[API Chat] Run ${run.id} completado.`);
    // --- Fin Crear y Esperar Run --- 

    // --- Recuperar Respuesta --- 
    let assistantReply = "No se encontró una respuesta de texto válida del asistente."; 
    try {
        const threadMessages = await openai.beta.threads.messages.list(currentThreadId, { order: "asc" });
        if (!threadMessages.data) throw new Error("No se encontraron mensajes en la conversación");
        const assistantResponses = threadMessages.data.filter(msg => msg.role === "assistant" && msg.run_id === run.id);
        if (assistantResponses.length === 0) throw new Error("El asistente no generó una respuesta para esta ejecución.");
        const lastAssistantMessage = assistantResponses[assistantResponses.length - 1];
        let foundText = false;
        if (lastAssistantMessage.content?.length > 0) {
             for (const contentPart of lastAssistantMessage.content) {
                 if (contentPart.type === "text" && contentPart.text?.value) {
                     assistantReply = contentPart.text.value;
                     foundText = true;
                     break; 
                 }
             }
        }
        if (!foundText) console.warn(`[API Chat] Mensaje del asistente ${lastAssistantMessage?.id} no contenía parte de texto válida o mensaje no encontrado.`);

    } catch (listMsgError) {
          console.error(`[API Chat] Error listando mensajes del thread ${currentThreadId}:`, listMsgError);
          const errorDetail = listMsgError instanceof Error ? listMsgError.message : "Error desconocido";
          return NextResponse.json({ error: 'No se pudo obtener la respuesta final del asistente OpenAI', details: errorDetail, ...(currentThreadId && { threadId: currentThreadId }) }, { status: 500 });
    }
    // --- Fin Recuperar Respuesta --- 

    console.log(`[API Chat] Respuesta del Asistente (${assistantId}) para thread ${currentThreadId}:`, assistantReply.substring(0,100) + "...");
    return NextResponse.json({ reply: assistantReply, threadId: currentThreadId });

  } catch (error) {
    // Error general no capturado específicamente arriba
    console.error('[API Chat] Error general no manejado en POST /api/chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido en el servidor.';
    // Evitar detalles de error sensibles en producción si no es un error de desarrollo
    const details = process.env.NODE_ENV === 'development' ? errorMessage : 'Error procesando su solicitud.';
    return NextResponse.json({ error: 'Error interno del servidor', details: details }, { status: 500 });
  }
}

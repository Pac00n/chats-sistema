import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = "nodejs";
export const maxDuration = 60; // Ajustado a 60s para el plan Hobby de Vercel

// --- OpenAI Client Initialization ---
let openai: OpenAI | null = null;
const openAIApiKey = process.env.OPENAI_API_KEY;
if (openAIApiKey && openAIApiKey.trim() !== "") {
  try {
    openai = new OpenAI({ apiKey: openAIApiKey });
    console.log("[API Analyze] OpenAI client initialized successfully.");
  } catch (e) {
    console.error("[API Analyze] Failed to initialize OpenAI client:", e);
  }
} else {
  console.warn("[API Analyze] OPENAI_API_KEY is not configured. OpenAI analysis will not work.");
}

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log("[API Analyze] Supabase client initialized successfully.");
  } catch(e) {
    console.error("[API Analyze] Failed to initialize Supabase client:", e);
  }
} else {
  console.warn("[API Analyze] Supabase URL or Service Role Key is not configured. Database tool calls will not work.");
}

const ANALYSIS_ASSISTANT_ID = "asst_SzkQZVNnT3HsrFzZZLyzVV7s";

// --- Function to execute get_chat_messages_from_db tool ---
async function executeGetChatMessagesFromDb(args: any): Promise<string> {
  if (!supabase) {
    console.error("[API Analyze Tool] Supabase client not initialized. Cannot query chat messages.");
    return JSON.stringify({ error: "Supabase client not initialized. Cannot query chat messages." });
  }
  console.log("[API Analyze Tool] Executing get_chat_messages_from_db with args:", args);

  try {
    let query = supabase.from('chat_messages').select('*');

    if (args.assistant_id) {
      query = query.eq('assistant_id', args.assistant_id);
    }
    if (args.employee_token) {
      query = query.eq('employee_token', args.employee_token);
    }
    if (args.role) {
      query = query.eq('role', args.role);
    }
    if (args.keywords) {
      query = query.ilike('content', `%${args.keywords}%`);
    }
    if (args.date_from) {
      query = query.gte('created_at', args.date_from);
    }
    if (args.date_to) {
      const dateTo = new Date(args.date_to);
      dateTo.setHours(23, 59, 59, 999);
      query = query.lte('created_at', dateTo.toISOString());
    }

    const limit = Math.min(Math.max(1, args.limit || 100), 500);
    query = query.limit(limit).order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("[API Analyze Tool] Supabase error:", error);
      return JSON.stringify({ error: `Supabase query failed: ${error.message}` });
    }

    console.log(`[API Analyze Tool] Retrieved ${data?.length || 0} messages from Supabase.`);
    if (data && data.length > 0) {
      return JSON.stringify(data.map(msg => ({ 
        role: msg.role, 
        content: msg.content, 
        created_at: msg.created_at,
        assistant_id: msg.assistant_id
      })));
    } else {
      return JSON.stringify({ message: "No relevant messages found matching the criteria." });
    }
  } catch (e: any) {
    console.error("[API Analyze Tool] Error in executeGetChatMessagesFromDb:", e);
    return JSON.stringify({ error: `Error executing tool: ${e.message}` });
  }
}

// --- Modified waitForRunCompletion to handle tool calls ---
async function waitForRunCompletion(
  openaiClient: OpenAI,
  threadId: string,
  runId: string,
  maxAttempts = 25, // Reducido para ajustarse a maxDuration de 60s (25*2s = 50s)
  delay = 2000      // delay de 2s
): Promise<OpenAI.Beta.Threads.Runs.Run> {
  let run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
  let attempts = 0;

  while (attempts < maxAttempts) {
    console.log(
      `[API Analyze] Waiting for OpenAI run (${threadId}/${runId}). Attempt ${attempts + 1}. Status: ${run.status}`
    );

    if (["queued", "in_progress", "cancelling"].includes(run.status)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
    } else if (run.status === "requires_action") {
      if (run.required_action?.type === "submit_tool_outputs") {
        const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[] = [];

        for (const toolCall of toolCalls) {
          console.log(`[API Analyze] Run requires tool call: ${toolCall.function.name}, ID: ${toolCall.id}`);
          let output: string;
          if (toolCall.function.name === "get_chat_messages_from_db") {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              output = await executeGetChatMessagesFromDb(args);
            } catch (parseError: any) {
              console.error(`[API Analyze] Error parsing arguments for ${toolCall.function.name}:`, parseError);
              output = JSON.stringify({ error: `Error parsing arguments: ${parseError.message}` });
            }
          } else {
            console.warn(`[API Analyze] Unknown tool call requested: ${toolCall.function.name}`);
            output = JSON.stringify({ error: `Tool ${toolCall.function.name} is not implemented.` });
          }
          toolOutputs.push({ tool_call_id: toolCall.id, output: output });
        }

        if (toolOutputs.length > 0) {
          console.log("[API Analyze] Submitting tool outputs:", JSON.stringify(toolOutputs, null, 2).substring(0, 500) + "...");
          try {
            run = await openaiClient.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: toolOutputs,
            });
          } catch (submitError: any) {
             console.error("[API Analyze] Error submitting tool outputs:", submitError);
          }
        } else {
          console.warn("[API Analyze] Required action was to submit tool outputs, but no tool outputs were generated.");
        }
      } else {
        console.error("[API Analyze] Unknown required_action type:", run.required_action?.type);
        throw new Error(`Unknown required_action type: ${run.required_action?.type}`);
      }
    } else if (["completed", "failed", "cancelled", "expired"].includes(run.status)) {
      break;
    }
    attempts++;
  }
  console.log(`[API Analyze] OpenAI run ${runId} finished Polling. Final Status: ${run.status}`);
  return run;
}

// --- API POST Handler ---
export async function POST(req: NextRequest) {
  console.log("[API Analyze] Received POST request /api/analyze");
  
  // Asegurarse de que todas las respuestas sean JSON válido
  if (!openai) {
    console.error("[API Analyze] OpenAI client not initialized");
    return NextResponse.json({ error: "OpenAI client not initialized." }, { status: 500 });
  }

  try {
    // Extraer y validar los datos de la solicitud
    let body, userQuery;
    try {
      body = await req.json();
      userQuery = body.query;
      console.log(`[API Analyze] Received data: userQuery=${userQuery ? userQuery.substring(0, 100) + "..." : "N/A"}`);
    } catch (parseError) {
      console.error("[API Analyze] Error parsing request JSON:", parseError);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    if (typeof userQuery !== "string" || !userQuery.trim()) {
      return NextResponse.json({ error: "La consulta (query) es requerida." }, { status: 400 });
    }

    // Crear un nuevo thread para el análisis
    let thread;
    try {
      thread = await openai.beta.threads.create();
      console.log("[API Analyze] New OpenAI thread created:", thread.id);
    } catch (threadError: any) {
      console.error("[API Analyze] Failed to create thread:", threadError);
      return NextResponse.json({
        error: "Error creating analysis thread", 
        details: threadError.message || "Unknown error"
      }, { status: 500 });
    }

    // Añadir el mensaje del usuario al thread
    try {
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userQuery,
      });
      console.log(`[API Analyze] User query added to thread ${thread.id}.`);
    } catch (messageError: any) {
      console.error(`[API Analyze] Failed to add message to thread ${thread.id}:`, messageError);
      return NextResponse.json({
        error: "Error adding message to thread", 
        details: messageError.message || "Unknown error"
      }, { status: 500 });
    }

    // Crear y ejecutar un run con el asistente de análisis
    let run;
    try {
      run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: ANALYSIS_ASSISTANT_ID,
      });
      console.log(`[API Analyze] Run ${run.id} created for thread ${thread.id} with assistant ${ANALYSIS_ASSISTANT_ID}`);
    } catch (runError: any) {
      console.error(`[API Analyze] Failed to create run for thread ${thread.id}:`, runError);
      return NextResponse.json({
        error: "Error creating assistant run", 
        details: runError.message || "Unknown error"
      }, { status: 500 });
    }

    // Esperar a que se complete el run
    let completedRun;
    try {
      completedRun = await waitForRunCompletion(openai, thread.id, run.id);
    } catch (waitError: any) {
      console.error(`[API Analyze] Error waiting for run completion:`, waitError);
      return NextResponse.json({
        error: "Error waiting for assistant response", 
        details: waitError.message || "Unknown error"
      }, { status: 500 });
    }

    // Verificar el estado del run completado
    if (completedRun.status !== "completed") {
      console.error(
        `[API Analyze] Run ${run.id} not completed. Status: ${completedRun.status}. Error:`,
        completedRun.last_error
      );
      const errorMsg = completedRun.last_error?.message || `Assistant execution failed or incomplete (${completedRun.status}).`;
      return NextResponse.json({ error: errorMsg, details: completedRun.last_error || "No error details available" }, { status: 500 });
    }
    console.log(`[API Analyze] Run ${run.id} completed successfully.`);

    // Obtener los mensajes del asistente
    let messagesPage;
    try {
      messagesPage = await openai.beta.threads.messages.list(thread.id, { order: "desc", limit: 5 });
    } catch (listError: any) {
      console.error(`[API Analyze] Failed to list messages for thread ${thread.id}:`, listError);
      return NextResponse.json({
        error: "Error retrieving assistant messages", 
        details: listError.message || "Unknown error"
      }, { status: 500 });
    }
    
    const assistantMessages = messagesPage.data.filter(msg => msg.role === 'assistant');
    
    // Extraer y devolver el análisis
    let analysisReport = "No se encontró una respuesta de análisis del asistente.";
    if (assistantMessages.length > 0) {
      if (assistantMessages[0].content && assistantMessages[0].content.length > 0) {
        const content = assistantMessages[0].content[0];
        if (content.type === 'text') {
          analysisReport = content.text.value;
        } else {
          console.warn("[API Analyze] Last assistant message was not text type:", content.type);
        }
      } else {
        console.warn("[API Analyze] Assistant message has empty content");
      }
    } else {
      console.warn(`[API Analyze] No assistant messages found for thread ${thread.id}`);
    }
    
    console.log(`[API Analyze] Analysis Report for thread ${thread.id}: ${analysisReport.substring(0, 200)}...`);
    return NextResponse.json({ analysis: analysisReport, threadId: thread.id });

  } catch (error: any) {
    // Capturar y registrar cualquier error no manejado
    console.error("[API Analyze] Unhandled error in POST /api/analyze:", error);
    return NextResponse.json({ 
      error: "Internal server error during analysis", 
      details: error.message || "Unknown error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

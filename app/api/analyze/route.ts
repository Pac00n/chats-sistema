import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = "nodejs";
export const maxDuration = 180; // Aumentamos la duración máxima por si las llamadas a herramientas y el análisis tardan más

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
      // Simple ILIKE search for keywords in content. Adjust if your Supabase setup is different.
      // This assumes 'content' is a text column.
      // For multiple keywords, consider splitting args.keywords and chaining .or() conditions.
      query = query.ilike('content', `%${args.keywords}%`);
    }
    if (args.date_from) {
      query = query.gte('created_at', args.date_from);
    }
    if (args.date_to) {
      // If date_to is just a date, you might want to set it to end of day for inclusive search
      const dateTo = new Date(args.date_to);
      dateTo.setHours(23, 59, 59, 999);
      query = query.lte('created_at', dateTo.toISOString());
    }

    const limit = Math.min(Math.max(1, args.limit || 100), 500); // Default 100, min 1, max 500
    query = query.limit(limit).order('created_at', { ascending: false }); // Get latest messages first

    const { data, error } = await query;

    if (error) {
      console.error("[API Analyze Tool] Supabase error:", error);
      return JSON.stringify({ error: `Supabase query failed: ${error.message}` });
    }

    console.log(`[API Analyze Tool] Retrieved ${data?.length || 0} messages from Supabase.`);
    if (data && data.length > 0) {
      // Consider summarizing if data is too large, or just return a subset of fields
      return JSON.stringify(data.map(msg => ({ 
        role: msg.role, 
        content: msg.content, 
        created_at: msg.created_at,
        assistant_id: msg.assistant_id // Include assistant_id for context
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
  maxAttempts = 60, // Increased attempts due to potential tool calls
  delay = 3000      // Increased delay
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
             // Potentially retry or handle error. For now, we'll let the loop continue and re-fetch run status.
          }
        } else {
          console.warn("[API Analyze] Required action was to submit tool outputs, but no tool outputs were generated.");
          // This case should ideally not happen if toolCalls were present.
        }
      } else {
        console.error("[API Analyze] Unknown required_action type:", run.required_action?.type);
        throw new Error(`Unknown required_action type: ${run.required_action?.type}`);
      }
    } else if (["completed", "failed", "cancelled", "expired"].includes(run.status)) {
      break; // Exit loop if run is in a terminal state
    }
    attempts++;
  }
  console.log(`[API Analyze] OpenAI run ${runId} finished Polling. Final Status: ${run.status}`);
  return run;
}

// --- API POST Handler ---
export async function POST(req: NextRequest) {
  console.log("[API Analyze] Received POST request /api/analyze");
  if (!openai) {
    return NextResponse.json({ error: "OpenAI client not initialized." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const userQuery = body.query;
    console.log(`[API Analyze] Received data: userQuery=${userQuery ? userQuery.substring(0, 100) + "..." : "N/A"}`);

    if (typeof userQuery !== "string" || !userQuery.trim()) {
      return NextResponse.json({ error: "La consulta (query) es requerida." }, { status: 400 });
    }

    const thread = await openai.beta.threads.create();
    console.log("[API Analyze] New OpenAI thread created:", thread.id);

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userQuery,
    });
    console.log(`[API Analyze] User query added to thread ${thread.id}.`);

    let run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ANALYSIS_ASSISTANT_ID,
    });
    console.log(`[API Analyze] Run ${run.id} created for thread ${thread.id} with assistant ${ANALYSIS_ASSISTANT_ID}`);

    const completedRun = await waitForRunCompletion(openai, thread.id, run.id);

    if (completedRun.status !== "completed") {
      console.error(
        `[API Analyze] Run ${run.id} not completed. Status: ${completedRun.status}. Error:`,
        completedRun.last_error
      );
      const errorMsg = completedRun.last_error?.message || `Assistant execution failed or incomplete (${completedRun.status}).`;
      return NextResponse.json({ error: errorMsg, details: completedRun.last_error }, { status: 500 });
    }
    console.log(`[API Analyze] Run ${run.id} completed successfully.`);

    const messagesPage = await openai.beta.threads.messages.list(thread.id, { order: "desc", limit: 5 });
    const assistantMessages = messagesPage.data.filter(msg => msg.role === 'assistant');
    
    let analysisReport = "No se encontró una respuesta de análisis del asistente.";
    if (assistantMessages.length > 0 && assistantMessages[0].content[0]?.type === 'text') {
      analysisReport = assistantMessages[0].content[0].text.value;
    } else if (assistantMessages.length > 0) {
      console.warn("[API Analyze] Last assistant message was not text:", assistantMessages[0]);
    }
    
    console.log(`[API Analyze] Analysis Report for thread ${thread.id}: ${analysisReport.substring(0, 200)}...`);
    return NextResponse.json({ analysis: analysisReport, threadId: thread.id });

  } catch (error: any) {
    console.error("[API Analyze] Unhandled error in POST /api/analyze:", error);
    return NextResponse.json({ error: "Internal server error during analysis", details: error.message }, { status: 500 });
  }
}

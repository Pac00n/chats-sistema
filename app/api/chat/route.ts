import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAssistantById } from "@/lib/assistants";
import { Buffer } from "buffer";
import { createClient } from '@supabase/supabase-js';

export const runtime = "nodejs";
export const maxDuration = 60;

// --- OpenAI Client (robust initialization) ---
let openai: OpenAI | null = null;
const openAIApiKey = process.env.OPENAI_API_KEY;

if (openAIApiKey && openAIApiKey.trim() !== "") {
  try {
    openai = new OpenAI({ apiKey: openAIApiKey });
    console.log("[API Chat] OpenAI client initialized successfully.");
  } catch (e) {
    console.error("[API Chat] Failed to initialize OpenAI client:", e);
  }
} else {
  console.warn("[API Chat] OPENAI_API_KEY is not configured. OpenAI assistants will not work.");
}
// --- End OpenAI Client ---

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log("[API Chat] Supabase client initialized successfully.");
  } catch(e) {
    console.error("[API Chat] Failed to initialize Supabase client:", e);
  }
} else {
  console.warn("[API Chat] Supabase URL or Service Role Key is not configured. Database operations will not work.");
}
// --- End Supabase Client ---

const waitForRunCompletion = async (
  openaiClient: OpenAI, // Assumed to be non-null when called
  threadId: string,
  runId: string,
  maxAttempts = 45,
  delay = 2000
): Promise<OpenAI.Beta.Threads.Runs.Run> => {
  let run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
  let attempts = 0;
  while (["queued", "in_progress", "cancelling"].includes(run.status) && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempts++;
    console.log(
      `[API Chat] Waiting for OpenAI run (${threadId}/${runId}). Attempt ${attempts}. Status: ${run.status}`
    );
    try {
      run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
    } catch (error) {
      console.error(
        `[API Chat] Error retrieving OpenAI run status ${runId} (attempt ${attempts}):`,
        error
      );
    }
  }
  console.log(`[API Chat] OpenAI run ${runId} finished with status: ${run.status}`);
  return run;
};

export async function POST(req: NextRequest) {
  console.log("[API Chat] Received POST request /api/chat");
  try {
    if (!openai) {
      console.error(
        "[API Chat] Attempt to use API but OpenAI client is not initialized (API Key issue?)."
      );
      return NextResponse.json(
        { error: "Incomplete server configuration for OpenAI assistants (API Key)." },
        { status: 500 }
      );
    }
    if (!supabase) {
        console.error(
            "[API Chat] Attempt to use Database but Supabase client is not initialized."
        );
    }

    const body = await req.json();
    console.log("[API Chat] Full request body received:", JSON.stringify(body, null, 2));

    const { assistantId, message, imageBase64, threadId: existingThreadId, employeeToken } = body;
    
    console.log(
      `[API Chat] Received data (destructured): assistantId=${assistantId}, message=${message ? message.substring(0, 30) + "..." : "N/A"}, imageBase64=${imageBase64 ? "Present" : "Absent"}, threadId=${existingThreadId}, employeeToken=${employeeToken}`
    );

    if (typeof assistantId !== "string" || !assistantId)
      return NextResponse.json({ error: "assistantId is required" }, { status: 400 });
    if (
      (typeof message !== "string" || !message.trim()) &&
      (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image"))
    )
      return NextResponse.json({ error: "Valid text or image is required" }, { status: 400 });
    if (existingThreadId !== undefined && typeof existingThreadId !== "string" && existingThreadId !== null)
      return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });

    const assistantConfig = getAssistantById(assistantId);
    if (!assistantConfig || !assistantConfig.assistant_id) {
      const errorMsg = !assistantConfig
        ? "Assistant not found"
        : `Invalid configuration (${assistantId}): missing OpenAI assistant_id.`;
      console.error(`[API Chat] Invalid assistant configuration: ${errorMsg}`);
      return NextResponse.json({ error: errorMsg }, { status: !assistantConfig ? 404 : 500 });
    }
    const openaiAssistantId = assistantConfig.assistant_id;
    console.log(`[API Chat] Using OpenAI assistant_id: ${openaiAssistantId}`);

    let currentThreadId = existingThreadId;
    if (!currentThreadId) {
      try {
        const thread = await openai.beta.threads.create();
        currentThreadId = thread.id;
        console.log("[API Chat] New OpenAI thread created:", currentThreadId);
      } catch (threadError) {
        console.error("[API Chat] Error creating OpenAI thread:", threadError);
        return NextResponse.json(
          { error: "Could not create conversation with OpenAI assistant" },
          { status: 500 }
        );
      }
    } else {
      console.log("[API Chat] Using existing OpenAI thread:", currentThreadId);
    }
    if (!currentThreadId) {
      console.error("[API Chat] Thread ID is null after creation/verification.");
      return NextResponse.json({ error: "Internal error managing conversation ID" }, { status: 500 });
    }

    let fileId: string | null = null;
    if (typeof imageBase64 === "string" && imageBase64.startsWith("data:image")) {
      try {
        const base64Data = imageBase64.split(";base64,").pop();
        if (!base64Data) throw new Error("Invalid base64 format for image");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const mimeType = imageBase64.substring("data:".length, imageBase64.indexOf(";base64"));
        const fileName = `image.${mimeType.split("/")[1] || "bin"}`;
        console.log(`[API Chat] Uploading image ${fileName} (${mimeType}) to OpenAI...`);

        const fileObject = await openai.files.create({
          file: new File([imageBuffer], fileName, { type: mimeType }),
          purpose: "vision",
        });
        fileId = fileObject.id;
        console.log(`[API Chat] Image uploaded successfully. File ID: ${fileId}`);
      } catch (uploadError) {
        console.error("[API Chat] Error uploading image to OpenAI:", uploadError);
        return NextResponse.json({ error: "Error processing attached image" }, { status: 500 });
      }
    }

    const messageContentList: OpenAI.Beta.Threads.Messages.MessageCreateParams.Content[] = [];
    if (typeof message === "string" && message.trim()) {
      messageContentList.push({ type: "text", text: message });
    }
    if (fileId) {
      messageContentList.push({ type: "image_file", image_file: { file_id: fileId } });
    }
    if (messageContentList.length === 0) {
      console.warn(
        "[API Chat] No content to send (neither valid text nor processed image)."
      );
      messageContentList.push({ type: "text", text: "(Attempt to send empty message or with failed image)" });
    }

    let openAIUserMessageId: string | undefined;
    try {
      const createdUserMessage = await openai.beta.threads.messages.create(currentThreadId, {
        role: "user",
        content: messageContentList,
      });
      openAIUserMessageId = createdUserMessage.id;
      console.log(`[API Chat] Message added to thread ${currentThreadId}. Parts: ${messageContentList.length}, OpenAI Message ID: ${openAIUserMessageId}`);

      if (supabase && messageContentList.length > 0) {
        const userMessageData = {
          thread_id: currentThreadId,
          message_openai_id: openAIUserMessageId,
          role: 'user',
          content: message, 
          assistant_id: assistantConfig.id, 
          employee_token: employeeToken, 
          image_file_id: fileId,
          created_at: new Date().toISOString(), // Explicitly set created_at
        };
        const { error: userMessageError } = await supabase
          .from('chat_messages') 
          .insert([userMessageData]);

        if (userMessageError) {
          console.error('[Supabase] Error saving user message:', userMessageError);
        } else {
          console.log('[Supabase] User message saved successfully.');
        }
      }

    } catch (msgError) {
      console.error(`[API Chat] Error adding message to thread ${currentThreadId}:`, msgError);
      return NextResponse.json(
        { error: "Could not send message to OpenAI assistant" },
        { status: 500 }
      );
    }

    let run;
    try {
      run = await openai.beta.threads.runs.create(currentThreadId, { assistant_id: openaiAssistantId });
      console.log(`[API Chat] Run ${run.id} created for thread ${currentThreadId} with assistant ${openaiAssistantId}`);
    } catch (runCreateError) {
      console.error(`[API Chat] Error starting run for assistant ${openaiAssistantId}:`, runCreateError);
      return NextResponse.json(
        { error: "Could not start processing with OpenAI assistant" },
        { status: 500 }
      );
    }

    const completedRun = await waitForRunCompletion(openai, currentThreadId, run.id);

    if (completedRun.status !== "completed") {
      console.error(
        `[API Chat] Run ${run.id} not completed. Final status: ${completedRun.status}. Last error:`,
        completedRun.last_error
      );
      const errorMsg =
        completedRun.last_error?.message || `OpenAI assistant execution failed or incomplete (${completedRun.status}).`;
      const errorCode = completedRun.last_error?.code ? ` (Code: ${completedRun.last_error.code})` : "";
      return NextResponse.json({ error: `${errorMsg}${errorCode}`, details: completedRun.last_error }, { status: 500 });
    }
    console.log(`[API Chat] Run ${run.id} completed.`);

    let assistantReply = "No valid text response found from the assistant.";
    let openAIAssistantMessageId: string | undefined;

    try {
      const threadMessages = await openai.beta.threads.messages.list(currentThreadId, { order: "asc" });
      if (!threadMessages.data) throw new Error("No messages found in the conversation");
      const assistantResponses = threadMessages.data.filter((msg) => msg.role === "assistant" && msg.run_id === run.id);
      if (assistantResponses.length === 0)
        throw new Error("The assistant did not generate a response for this run.");
      const lastAssistantMessage = assistantResponses[assistantResponses.length - 1];
      openAIAssistantMessageId = lastAssistantMessage.id;

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
      if (!foundText)
        console.warn(
          `[API Chat] Assistant message ${openAIAssistantMessageId} did not contain valid text part or message not found.`
        );
      
      if (supabase && assistantReply) {
        const assistantMessageData = {
            thread_id: currentThreadId,
            message_openai_id: openAIAssistantMessageId,
            role: 'assistant',
            content: assistantReply,
            assistant_id: assistantConfig.id, 
            employee_token: employeeToken,
            created_at: new Date().toISOString(), // Explicitly set created_at
        };
        const { error: assistantMessageError } = await supabase
            .from('chat_messages') 
            .insert([assistantMessageData]);

        if (assistantMessageError) {
            console.error('[Supabase] Error saving assistant reply:', assistantMessageError);
        } else {
            console.log('[Supabase] Assistant reply saved successfully.');
        }
      }

    } catch (listMsgError) {
      console.error(`[API Chat] Error listing messages from thread ${currentThreadId}:`, listMsgError);
      const errorDetail = listMsgError instanceof Error ? listMsgError.message : "Unknown error";
      return NextResponse.json(
        {
          error: "Could not get final response from OpenAI assistant",
          details: errorDetail,
          ...(currentThreadId && { threadId: currentThreadId }),
        },
        { status: 500 }
      );
    }

    console.log(
      `[API Chat] Assistant Response (${assistantId}) for thread ${currentThreadId}:`,
      assistantReply.substring(0, 100) + "..."
    );
    return NextResponse.json({ reply: assistantReply, threadId: currentThreadId });
  } catch (error) {
    console.error("[API Chat] Unhandled general error in POST /api/chat:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server.";
    const details = process.env.NODE_ENV === "development" ? errorMessage : "Error processing your request.";
    return NextResponse.json({ error: "Internal server error", details: details }, { status: 500 });
  }
}

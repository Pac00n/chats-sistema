import { type NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAssistantById } from "@/lib/assistants";
import { Buffer } from "buffer";
import { createClient } from '@supabase/supabase-js';

export const runtime = "nodejs";
export const maxDuration = 300;

let openai: OpenAI | null = null;
const openAIApiKey = process.env.OPENAI_API_KEY;
if (openAIApiKey && openAIApiKey.trim() !== "") {
  try {
    openai = new OpenAI({ apiKey: openAIApiKey });
    // console.log("[API Chat] OpenAI client initialized successfully.");
  } catch (e) {
    console.error("[API Chat] Failed to initialize OpenAI client:", e);
  }
} else {
  // console.warn("[API Chat] OPENAI_API_KEY is not configured.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    // console.log("[API Chat] Supabase client initialized successfully.");
  } catch(e) {
    console.error("[API Chat] Failed to initialize Supabase client:", e);
  }
} else {
  // console.warn("[API Chat] Supabase URL or Service Role Key is not configured.");
}

export async function POST(req: NextRequest) {
  // console.log("[API Chat] Received POST request /api/chat for streaming.");
  if (!openai) {
    return NextResponse.json({ error: "OpenAI client not initialized." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { assistantId, message, imageBase64, threadId: existingThreadId, employeeToken } = body;

    // console.log(
    //   `[API Chat] Request Data: assistantId=${assistantId}, message=${message ? message.substring(0, 30) + "..." : "N/A"}, imageBase64=${imageBase64 ? "Present" : "Absent"}, threadId=${existingThreadId}, employeeToken=${employeeToken}`
    // );

    if (typeof assistantId !== "string" || !assistantId) {
      return NextResponse.json({ error: "assistantId is required" }, { status: 400 });
    }
    if (
      (typeof message !== "string" || !message.trim()) &&
      (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image"))
    ) {
      return NextResponse.json({ error: "Valid text or image is required" }, { status: 400 });
    }
    
    const assistantConfig = getAssistantById(assistantId);
    if (!assistantConfig || !assistantConfig.assistant_id) {
      const errorMsg = !assistantConfig ? "Assistant not found" : `Invalid configuration (${assistantId}): missing OpenAI assistant_id.`;
      // console.error(`[API Chat] Invalid assistant configuration: ${errorMsg}`);
      return NextResponse.json({ error: errorMsg }, { status: !assistantConfig ? 404 : 500 });
    }
    const openaiAssistantId = assistantConfig.assistant_id;

    let currentThreadId = existingThreadId;
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create();
      currentThreadId = thread.id;
      // console.log("[API Chat] New OpenAI thread created:", currentThreadId);
    } else {
      // console.log("[API Chat] Using existing OpenAI thread:", currentThreadId);
    }
    if (!currentThreadId) {
      // console.error("[API Chat] Thread ID is null after creation/verification attempt.");
      return NextResponse.json({ error: "Internal error managing conversation ID" }, { status: 500 });
    }

    let fileId: string | null = null;
    if (typeof imageBase64 === "string" && imageBase64.startsWith("data:image")) {
      const base64Data = imageBase64.split(";base64,").pop();
      if (!base64Data) throw new Error("Invalid base64 format for image");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const mimeType = imageBase64.substring("data:".length, imageBase64.indexOf(";base64"));
      const fileName = `image.${mimeType.split("/")[1] || "bin"}`;
      const fileObject = await openai.files.create({
        file: new File([imageBuffer], fileName, { type: mimeType }),
        purpose: "vision",
      });
      fileId = fileObject.id;
      // console.log(`[API Chat] Image uploaded successfully. File ID: ${fileId}`);
    }

    const messageContentList: OpenAI.Beta.Threads.Messages.MessageCreateParams.Content[] = [];
    if (typeof message === "string" && message.trim()) {
      messageContentList.push({ type: "text", text: message });
    }
    if (fileId) {
      messageContentList.push({ type: "image_file", image_file: { file_id: fileId } });
    }
    if (messageContentList.length === 0) {
      return NextResponse.json({ error: "Cannot send an empty message." }, { status: 400 });
    }

    const createdUserMessage = await openai.beta.threads.messages.create(currentThreadId, {
      role: "user",
      content: messageContentList,
    });
    // console.log(`[API Chat] User message added to thread ${currentThreadId}. OpenAI Message ID: ${createdUserMessage.id}`);

    if (supabase) {
      const userMessageData = {
        thread_id: currentThreadId, message_openai_id: createdUserMessage.id, role: 'user',
        content: message || (fileId ? "[Image Sent]" : "[Empty Message]"),
        assistant_id: assistantConfig.id, employee_token: employeeToken, image_file_id: fileId,
        created_at: new Date().toISOString(),
      };
      const { error: userMessageError } = await supabase.from('chat_messages').insert([userMessageData]);
      // if (userMessageError) console.error('[Supabase] Error saving user message:', userMessageError);
      // else console.log('[Supabase] User message saved successfully.');
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const runStream = openai!.beta.threads.runs.stream(currentThreadId!, {
            assistant_id: openaiAssistantId,
          });

          for await (const event of runStream) {
            const payload = { type: event.event, data: event.data, threadId: currentThreadId };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));

            if (event.event === 'thread.message.completed') {
              if (supabase) {
                const assistantMessage = event.data;
                let assistantReplyContent = "";
                if (assistantMessage.content) {
                  for (const contentPart of assistantMessage.content) {
                    if (contentPart.type === 'text') {
                      assistantReplyContent += contentPart.text.value + "
";
                    }
                  }
                }
                assistantReplyContent = assistantReplyContent.trim();
                const assistantMessageData = {
                  thread_id: currentThreadId, message_openai_id: assistantMessage.id, role: 'assistant',
                  content: assistantReplyContent || "[No text content in assistant message]",
                  assistant_id: assistantConfig.id, employee_token: employeeToken,
                  created_at: new Date().toISOString(),
                };
                const { error: assistantMessageError } = await supabase.from('chat_messages').insert([assistantMessageData]);
                // if (assistantMessageError) console.error('[Supabase] Error saving assistant reply:', assistantMessageError);
                // else console.log('[Supabase] Assistant reply saved successfully via stream event.');
              }
            }
            if (event.event === 'thread.run.completed' || event.event === 'thread.run.failed' || event.event === 'thread.run.cancelled' || event.event === 'thread.run.expired') {
              break;
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stream.ended", data: { reason: "Run finished"}, threadId: currentThreadId })}

`));
          controller.close();
        } catch (streamError: any) {
          // console.error("[API Chat Stream] Error:", streamError);
          try {
            const errorPayload = { type: "error", data: { message: "Stream error", details: streamError.message }, threadId: currentThreadId };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorPayload)}

`));
          } catch (enqueueError) { 
            // console.error("[API Chat] Failed to enqueue stream error event:", enqueueError); 
          }
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  } catch (error: any) {
    // console.error("[API Chat Main] Error:", error);
    return NextResponse.json({ error: "Internal server error", details: error.message || "An unknown error occurred." }, { status: 500 });
  }
}

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
  } catch (e) {
    console.error("[API Chat] Failed to initialize OpenAI client:", e);
  }
} else {
  console.warn("[API Chat] OPENAI_API_KEY is not configured.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  } catch(e) {
    console.error("[API Chat] Failed to initialize Supabase client:", e);
  }
} else {
  console.warn("[API Chat] Supabase URL or Service Role Key is not configured.");
}

export async function POST(req: NextRequest) {
  if (!openai) {
    return NextResponse.json({ error: "OpenAI client not initialized." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { assistantId, message, imageBase64, threadId: existingThreadId, employeeToken } = body;

    const assistantConfig = getAssistantById(assistantId);
    if (!assistantConfig || !assistantConfig.assistant_id) {
      return NextResponse.json({ error: "Assistant not found or invalid configuration." }, { status: 404 });
    }
    const openaiAssistantId = assistantConfig.assistant_id;

    let currentThreadId = existingThreadId;
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create();
      currentThreadId = thread.id;
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

    const createdUserMessage = await openai.beta.threads.messages.create(currentThreadId!, {
      role: "user",
      content: messageContentList,
    });

    if (supabase) {
      const userMessageData = {
        thread_id: currentThreadId,
        message_openai_id: createdUserMessage.id,
        role: 'user',
        content: message || "[Image Sent]",
        assistant_id: assistantConfig.id,
        employee_token: employeeToken,
        image_file_id: fileId,
        created_at: new Date().toISOString(),
      };
      await supabase.from('chat_messages').insert([userMessageData]);
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
                  thread_id: currentThreadId,
                  message_openai_id: assistantMessage.id,
                  role: 'assistant',
                  content: assistantReplyContent || "[No text content in assistant message]",
                  assistant_id: assistantConfig.id,
                  employee_token: employeeToken,
                  created_at: new Date().toISOString(),
                };
                await supabase.from('chat_messages').insert([assistantMessageData]);
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
          console.error("[API Chat Stream] Error:", streamError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", data: { message: "Stream error", details: streamError.message }, threadId: currentThreadId })}

`));
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  } catch (error: any) {
    console.error("[API Chat Main] Error:", error);
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}

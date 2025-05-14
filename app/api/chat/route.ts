import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getAssistantById } from "@/lib/assistants"
import { Buffer } from "buffer"

export const runtime = "nodejs"
export const maxDuration = 60

// --- OpenAI Client (robust initialization) ---
let openai: OpenAI | null = null
const openAIApiKey = process.env.OPENAI_API_KEY

if (openAIApiKey && openAIApiKey.trim() !== "") {
  try {
    openai = new OpenAI({ apiKey: openAIApiKey })
    console.log("[API Chat] OpenAI client initialized successfully.")
  } catch (e) {
    console.error("[API Chat] Failed to initialize OpenAI client:", e)
    // openai will remain null. The POST handler will check for this.
  }
} else {
  console.warn("[API Chat] OPENAI_API_KEY is not configured. OpenAI assistants will not work.")
}
// --- End OpenAI Client ---

const waitForRunCompletion = async (
  openaiClient: OpenAI, // Assumed to be non-null when called
  threadId: string,
  runId: string,
  maxAttempts = 45,
  delay = 2000,
): Promise<OpenAI.Beta.Threads.Runs.Run> => {
  let run = await openaiClient.beta.threads.runs.retrieve(threadId, runId)
  let attempts = 0
  while (["queued", "in_progress", "cancelling"].includes(run.status) && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    attempts++
    console.log(`[API Chat] Waiting for OpenAI run (${threadId}/${runId}). Attempt ${attempts}. Status: ${run.status}`)
    try {
      run = await openaiClient.beta.threads.runs.retrieve(threadId, runId)
    } catch (error) {
      console.error(`[API Chat] Error retrieving OpenAI run status ${runId} (attempt ${attempts}):`, error)
      // If there's an error retrieving, it could be a network issue or OpenAI issue.
      // We continue to retry, the loop will eventually end due to maxAttempts.
    }
  }
  console.log(`[API Chat] OpenAI run ${runId} finished with status: ${run.status}`)
  return run
}

export async function POST(req: NextRequest) {
  console.log("[API Chat] Received POST request /api/chat")
  try {
    // Check if the OpenAI client is available BEFORE doing anything else
    if (!openai) {
      console.error("[API Chat] Attempt to use API but OpenAI client is not initialized (API Key issue?).")
      return NextResponse.json(
        { error: "Incomplete server configuration for OpenAI assistants (API Key)." },
        { status: 500 },
      )
    }

    const body = await req.json()
    const { assistantId, message, imageBase64, threadId: existingThreadId } = body
    console.log(
      `[API Chat] Received data: assistantId=${assistantId}, message=${message ? message.substring(0, 30) + "..." : "N/A"}, imageBase64=${imageBase64 ? "Present" : "Absent"}, threadId=${existingThreadId}`,
    )

    // --- Input Validations ---
    if (typeof assistantId !== "string" || !assistantId)
      return NextResponse.json({ error: "assistantId is required" }, { status: 400 })
    if (
      (typeof message !== "string" || !message.trim()) &&
      (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image"))
    )
      return NextResponse.json({ error: "Valid text or image is required" }, { status: 400 })
    if (existingThreadId !== undefined && typeof existingThreadId !== "string" && existingThreadId !== null)
      return NextResponse.json({ error: "Invalid threadId" }, { status: 400 })
    // --- End Validations ---

    const assistantConfig = getAssistantById(assistantId)
    if (!assistantConfig || !assistantConfig.assistant_id) {
      const errorMsg = !assistantConfig
        ? "Assistant not found"
        : `Invalid configuration (${assistantId}): missing OpenAI assistant_id.`
      console.error(`[API Chat] Invalid assistant configuration: ${errorMsg}`)
      return NextResponse.json({ error: errorMsg }, { status: !assistantConfig ? 404 : 500 })
    }
    const openaiAssistantId = assistantConfig.assistant_id
    console.log(`[API Chat] Using OpenAI assistant_id: ${openaiAssistantId}`)

    // --- Thread Management ---
    let currentThreadId = existingThreadId
    if (!currentThreadId) {
      try {
        const thread = await openai.beta.threads.create()
        currentThreadId = thread.id
        console.log("[API Chat] New OpenAI thread created:", currentThreadId)
      } catch (threadError) {
        console.error("[API Chat] Error creating OpenAI thread:", threadError)
        return NextResponse.json({ error: "Could not create conversation with OpenAI assistant" }, { status: 500 })
      }
    } else {
      console.log("[API Chat] Using existing OpenAI thread:", currentThreadId)
    }
    if (!currentThreadId) {
      console.error("[API Chat] Thread ID is null after creation/verification.")
      return NextResponse.json({ error: "Internal error managing conversation ID" }, { status: 500 })
    }
    // --- End Thread Management ---

    // --- Image Upload (if exists) ---
    let fileId: string | null = null
    if (typeof imageBase64 === "string" && imageBase64.startsWith("data:image")) {
      try {
        const base64Data = imageBase64.split(";base64,").pop()
        if (!base64Data) throw new Error("Invalid base64 format for image")
        const imageBuffer = Buffer.from(base64Data, "base64")
        const mimeType = imageBase64.substring("data:".length, imageBase64.indexOf(";base64"))
        const fileName = `image.${mimeType.split("/")[1] || "bin"}`
        console.log(`[API Chat] Uploading image ${fileName} (${mimeType}) to OpenAI...`)

        const fileObject = await openai.files.create({
          file: new File([imageBuffer], fileName, { type: mimeType }),
          purpose: "vision",
        })
        fileId = fileObject.id
        console.log(`[API Chat] Image uploaded successfully. File ID: ${fileId}`)
      } catch (uploadError) {
        console.error("[API Chat] Error uploading image to OpenAI:", uploadError)
        return NextResponse.json({ error: "Error processing attached image" }, { status: 500 })
      }
    }
    // --- End Image Upload ---

    // --- Add Message ---
    const messageContent: OpenAI.Beta.Threads.Messages.MessageCreateParams.Content[] = []
    if (typeof message === "string" && message.trim()) {
      messageContent.push({ type: "text", text: message })
    }
    if (fileId) {
      messageContent.push({ type: "image_file", image_file: { file_id: fileId } })
    }
    if (messageContent.length === 0) {
      console.warn("[API Chat] No content to send (neither valid text nor processed image).")
      messageContent.push({ type: "text", text: "(Attempt to send empty message or with failed image)" })
    }

    try {
      await openai.beta.threads.messages.create(currentThreadId, {
        role: "user",
        content: messageContent,
      })
      console.log(`[API Chat] Message added to thread ${currentThreadId}. Parts: ${messageContent.length}`)
    } catch (msgError) {
      console.error(`[API Chat] Error adding message to thread ${currentThreadId}:`, msgError)
      return NextResponse.json({ error: "Could not send message to OpenAI assistant" }, { status: 500 })
    }
    // --- End Add Message ---

    // --- Create and Wait for Run ---
    let run
    try {
      run = await openai.beta.threads.runs.create(currentThreadId, { assistant_id: openaiAssistantId })
      console.log(`[API Chat] Run ${run.id} created for thread ${currentThreadId} with assistant ${openaiAssistantId}`)
    } catch (runCreateError) {
      console.error(`[API Chat] Error starting run for assistant ${openaiAssistantId}:`, runCreateError)
      return NextResponse.json({ error: "Could not start processing with OpenAI assistant" }, { status: 500 })
    }

    const completedRun = await waitForRunCompletion(openai, currentThreadId, run.id)

    if (completedRun.status !== "completed") {
      console.error(
        `[API Chat] Run ${run.id} not completed. Final status: ${completedRun.status}. Last error:`,
        completedRun.last_error,
      )
      if (completedRun.status === "requires_action")
        return NextResponse.json(
          { error: "The assistant requires additional actions (not implemented)" },
          { status: 501 },
        )
      if (["queued", "in_progress", "cancelling", "failed"].includes(completedRun.status)) {
        // Try to cancel if in an active state, or if it failed and we want to make sure
        if (["queued", "in_progress"].includes(completedRun.status)) {
          try {
            await openai.beta.threads.runs.cancel(currentThreadId, run.id)
          } catch (_) {}
        }
      }
      const errorMsg =
        completedRun.last_error?.message || `OpenAI assistant execution failed or incomplete (${completedRun.status}).`
      const errorCode = completedRun.last_error?.code ? ` (Code: ${completedRun.last_error.code})` : ""
      return NextResponse.json({ error: `${errorMsg}${errorCode}`, details: completedRun.last_error }, { status: 500 })
    }
    console.log(`[API Chat] Run ${run.id} completed.`)
    // --- End Create and Wait for Run ---

    // --- Retrieve Response ---
    let assistantReply = "No valid text response found from the assistant."
    try {
      const threadMessages = await openai.beta.threads.messages.list(currentThreadId, { order: "asc" })
      if (!threadMessages.data) throw new Error("No messages found in the conversation")
      const assistantResponses = threadMessages.data.filter((msg) => msg.role === "assistant" && msg.run_id === run.id)
      if (assistantResponses.length === 0) throw new Error("The assistant did not generate a response for this run.")
      const lastAssistantMessage = assistantResponses[assistantResponses.length - 1]
      let foundText = false
      if (lastAssistantMessage.content?.length > 0) {
        for (const contentPart of lastAssistantMessage.content) {
          if (contentPart.type === "text" && contentPart.text?.value) {
            assistantReply = contentPart.text.value
            foundText = true
            break
          }
        }
      }
      if (!foundText)
        console.warn(
          `[API Chat] Assistant message ${lastAssistantMessage?.id} did not contain valid text part or message not found.`,
        )
    } catch (listMsgError) {
      console.error(`[API Chat] Error listing messages from thread ${currentThreadId}:`, listMsgError)
      const errorDetail = listMsgError instanceof Error ? listMsgError.message : "Unknown error"
      return NextResponse.json(
        {
          error: "Could not get final response from OpenAI assistant",
          details: errorDetail,
          ...(currentThreadId && { threadId: currentThreadId }),
        },
        { status: 500 },
      )
    }
    // --- End Retrieve Response ---

    console.log(
      `[API Chat] Assistant Response (${assistantId}) for thread ${currentThreadId}:`,
      assistantReply.substring(0, 100) + "...",
    )
    return NextResponse.json({ reply: assistantReply, threadId: currentThreadId })
  } catch (error) {
    // General error not specifically caught above
    console.error("[API Chat] Unhandled general error in POST /api/chat:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server."
    // Avoid sensitive error details in production if not a development error
    const details = process.env.NODE_ENV === "development" ? errorMessage : "Error processing your request."
    return NextResponse.json({ error: "Internal server error", details: details }, { status: 500 })
  }
}

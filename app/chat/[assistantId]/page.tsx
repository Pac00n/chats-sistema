"use client"

import type React from "react"
import { useState, useEffect, useRef, Suspense } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAssistantById } from "@/lib/assistants"
import { ArrowLeft, Send, Loader2, Paperclip, X, RefreshCw, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

// Type definition
// type Message = {
//   id: string
//   role: "user" | "assistant"
//   content: string
//   imageBase64?: string | null
//   timestamp: Date
// }

// Helper function to format assistant messages
// const formatAssistantMessage = (content: string): string => {
//   const citationRegex = /【.*?】/g
//   return content.replace(citationRegex, "").trim()
// }

// function ChatPageContent() {
  // const params = useParams()
  // const router = useRouter()
  // const searchParams = useSearchParams()
  // const assistantId = params.assistantId as string
  // const assistant = getAssistantById(assistantId)
  // const employeeToken = searchParams.get("employeeToken")

  // // LOG PARA DEPURAR EL VALOR DE employeeToken AL RENDERIZAR/ACTUALIZAR
  // console.log("[ChatPageContent] employeeToken from URL params:", employeeToken); 

  // const [messages, setMessages] = useState<Message[]>([])
  // const [input, setInput] = useState("")
  // const [imageBase64, setImageBase64] = useState<string | null>(null)
  // const [isLoading, setIsLoading] = useState(false)
  // const [threadId, setThreadId] = useState<string | null>(null)
  // const [error, setError] = useState<string | null>(null)
  // const messagesEndRef = useRef<HTMLDivElement>(null)
  // const fileInputRef = useRef<HTMLInputElement>(null)
  // const [scrollY, setScrollY] = useState(0)

  // useEffect(() => {
  //   const handleScroll = () => setScrollY(window.scrollY)
  //   window.addEventListener("scroll", handleScroll, { passive: true })
  //   return () => window.removeEventListener("scroll", handleScroll)
  // }, [])

  // useEffect(() => {
  //   if (!employeeToken) return;
  //   try {
  //     const storedThreadId = localStorage.getItem(`threadId_${assistantId}_${employeeToken}`)
  //     if (storedThreadId) {
  //       setThreadId(storedThreadId)
  //       const storedMessages = localStorage.getItem(`messages_${assistantId}_${employeeToken}`)
  //       if (storedMessages) {
  //         try {
  //           const parsedMessages = JSON.parse(storedMessages)
  //           const messagesWithDates = parsedMessages.map((msg: any) => ({
  //             ...msg,
  //             timestamp: new Date(msg.timestamp),
  //           }))
  //           setMessages(messagesWithDates)
  //         } catch (e) {
  //           console.error("Error loading previous messages:", e)
  //           showWelcomeMessage()
  //         }
  //       } else {
  //         showWelcomeMessage()
  //       }
  //     } else {
  //       showWelcomeMessage()
  //     }
  //   } catch (e) {
  //     console.error("Error initializing chat:", e)
  //     showWelcomeMessage()
  //   }
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [assistantId, employeeToken])

  // const showWelcomeMessage = () => {
  //   if (assistant) {
  //     setMessages([
  //       {
  //         id: "welcome",
  //         role: "assistant",
  //         content: "Cuando quieras, empezamos a hablar sobre cómo podemos potenciarte con IA.",
  //         timestamp: new Date(),
  //       },
  //     ])
  //   }
  // }

  // useEffect(() => {
  //   if (!employeeToken) return;
  //   if (messages.length > 0 && threadId) {
  //     try {
  //       localStorage.setItem(`messages_${assistantId}_${employeeToken}`, JSON.stringify(messages))
  //     } catch (e) {
  //       console.error("Error saving messages to localStorage:", e)
  //     }
  //   }
  // }, [messages, assistantId, threadId, employeeToken])

  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  // }, [messages])

  // const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0]
  //   if (file) {
  //     const reader = new FileReader()
  //     reader.onloadend = () => setImageBase64(reader.result as string)
  //     reader.readAsDataURL(file)
  //   }
  //   if (event.target) event.target.value = ""
  // }

  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();

  //   console.log("[ChatPage] handleSubmit: employeeToken value at start of function:", employeeToken);
  //   console.log("[ChatPage] handleSubmit: input value:", input);
  //   console.log("[ChatPage] handleSubmit: imageBase64 present:", !!imageBase64);
  //   console.log("[ChatPage] handleSubmit: isLoading state:", isLoading);

  //   if ((!input.trim() && !imageBase64) || isLoading || !employeeToken) {
  //     console.warn("[ChatPage] handleSubmit: Submission prevented due to guard condition.");
  //     if (!input.trim() && !imageBase64) {
  //       console.warn("[ChatPage] Reason: Input empty AND no image.");
  //     }
  //     if (isLoading) {
  //       console.warn("[ChatPage] Reason: isLoading is true.");
  //     }
  //     if (!employeeToken) {
  //       console.warn("[ChatPage] Reason: employeeToken is falsy.");
  //       setError("No se pudo enviar el mensaje. Falta el token de empleado. Por favor, recarga la página usando el enlace correcto.");
  //     }
  //     return;
  //   }

  //   console.log("[ChatPage] handleSubmit: Guard condition passed. Proceeding with submission.");

  //   setError(null);
  //   const userMessage: Message = {
  //     id: Date.now().toString(),
  //     role: "user",
  //     content: input,
  //     imageBase64,
  //     timestamp: new Date(),
  //   };

  //   setMessages((prev) => [...prev, userMessage]);
  //   const currentInput = input;
  //   const currentImageBase64 = imageBase64;
  //   setInput("");
  //   setImageBase64(null);
  //   setIsLoading(true);

  //   const payload = {
  //     assistantId: assistant?.id,
  //     message: currentInput,
  //     imageBase64: currentImageBase64,
  //     threadId,
  //     employeeToken,
  //   };
  //   console.log("[ChatPage] handleSubmit: Sending payload to /api/chat:", payload);

  //   try {
  //     const endpoint = "/api/chat";
  //     const response = await fetch(endpoint, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify(payload),
  //     });

  //     const data = await response.json();

  //     if (!response.ok) {
  //       console.error("Server error:", data.error, data.details);
  //       setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
  //       throw new Error(data.error || "Error in server response");
  //     }

  //     if (data.threadId && !threadId) {
  //       setThreadId(data.threadId);
  //       try {
  //         localStorage.setItem(`threadId_${assistantId}_${employeeToken}`, data.threadId);
  //       } catch (e) {
  //         console.error("Error saving threadId to localStorage:", e);
  //       }
  //     }

  //     const assistantMessage: Message = {
  //       id: Date.now().toString(),
  //       role: "assistant",
  //       content: data.reply,
  //       timestamp: new Date(),
  //     };
  //     setMessages((prev) => [...prev, assistantMessage]);
  //   } catch (err) {
  //     const error = err as Error;
  //     setError(error.message);
  //     console.error("Error in conversation:", error);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // const formatTime = (date: Date) => {
  //   try {
  //     return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  //   } catch (e) {
  //     console.error("Error formatting time:", e)
  //     return ""
  //   }
  // }

  // const startNewConversation = () => {
  //   if (!employeeToken) return;
  //   try {
  //     localStorage.removeItem(`threadId_${assistantId}_${employeeToken}`)
  //     localStorage.removeItem(`messages_${assistantId}_${employeeToken}`)
  //   } catch (e) {
  //     console.error("Error removing data from localStorage:", e)
  //   }
  //   setThreadId(null)
  //   setError(null)
  //   setInput("")
  //   setImageBase64(null)
  //   showWelcomeMessage()
  // }

  // if (!employeeToken) {
  //   return (
  //     <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-slate-800 p-4">
  //       <Card className="w-full max-w-md bg-white border-red-500 text-slate-800 shadow-lg">
  //         <CardContent className="pt-6 text-center">
  //           <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
  //           <h2 className="text-2xl font-bold mb-2 text-red-600">Acceso No Autorizado</h2>
  //           <p className="text-slate-600 mb-6">Se requiere un token de empleado válido para acceder a esta página. Por favor, utiliza el enlace proporcionado.</p>
  //           <Button asChild className="bg-sistema-primary hover:bg-sistema-primary-dark text-white">
  //             <Link href="/">Volver a la página principal</Link>
  //           </Button>
  //         </CardContent>
  //       </Card>
  //     </div>
  //   );
  // }

  // if (!assistant) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen bg-slate-100">
  //       <Card className="w-full max-w-md bg-white border-slate-200 text-slate-800 relative z-10 shadow-md">
  //         <CardContent className="pt-6 text-center">
  //           <div className="flex justify-center mb-6">
  //             <Image src="/images/logo.png" alt="SISTEMA INGENIERÍA" width={180} height={60} className="h-auto" />
  //           </div>
  //           <h2 className="text-2xl font-bold mb-4">Asistente No Encontrado</h2>
  //           <p className="text-slate-600 mb-6">El asistente que buscas no existe o no está disponible.</p>
  //           <Button asChild className="bg-sistema-primary hover:bg-sistema-primary-dark text-white">
  //             <Link href="/">Ver Todos los Asistentes</Link>
  //           </Button>
  //         </CardContent>
  //       </Card>
  //     </div>
  //   )
  // }

  // return (
  //   <div className="flex flex-col h-screen bg-slate-100 text-slate-800 relative">
  //     {/* ... (resto de la UI del chat comentada) ... */}
  //   </div>
  // );
// }

// Export a new default component that wraps ChatPageContent with Suspense
export default function ChatPage() {
  console.log("[ChatPage] Component ChatPage (wrapper with Suspense) is rendering."); // NUEVO LOG
  // return (
  //   <Suspense fallback={<div>Cargando...</div>}> 
  //     {/* <ChatPageContent /> */}
  //   </Suspense>
  // );
  return <div>Test - ChatPage está renderizando</div>; // Renderiza algo simple
}

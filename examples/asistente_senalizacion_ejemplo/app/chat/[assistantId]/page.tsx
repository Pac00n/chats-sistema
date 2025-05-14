"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getAssistantById } from "@/lib/assistants"
import { ArrowLeft, Send, Loader2, Paperclip, X } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

// Type definition (sin cambios)
type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  imageBase64?: string | null
  timestamp: Date
}

// Helper function to format assistant messages (UPDATED REGEX)
const formatAssistantMessage = (content: string): string => {
  // Regex to match any characters inside 【 and 】
  const citationRegex = /\【.*?\】/g;
  return content.replace(citationRegex, '').trim(); // Remove pattern and trim whitespace
};

export default function ChatPage() {
  const params = useParams()
  const assistantId = params.assistantId as string
  const assistant = getAssistantById(assistantId)

  // Hooks de estado (sin cambios)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lógica para la rotación del fondo (sin cambios)
  const [rotation, setRotation] = useState(0)
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset
      setRotation(scrollY * 0.2) 
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // useEffect para cargar estado (sin cambios)
  useEffect(() => {
    try {
      const storedThreadId = localStorage.getItem(`threadId_${assistantId}`)
      if (storedThreadId) {
        setThreadId(storedThreadId)
        const storedMessages = localStorage.getItem(`messages_${assistantId}`)
        if (storedMessages) {
          try {
            const parsedMessages = JSON.parse(storedMessages)
            const messagesWithDates = parsedMessages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
            setMessages(messagesWithDates)
          } catch (e) {
            console.error("Error al cargar mensajes anteriores:", e)
            showWelcomeMessage()
          }
        } else {
          showWelcomeMessage()
        }
      } else {
        showWelcomeMessage()
      }
    } catch (e) {
      console.error("Error al inicializar el chat:", e)
      showWelcomeMessage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId]) 

  // Función showWelcomeMessage (sin cambios)
  const showWelcomeMessage = () => {
    if (assistant) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `¡Hola! Soy ${assistant.name}. ¿En qué puedo ayudarte hoy?`,
          timestamp: new Date(),
        },
      ])
    }
  }

  // useEffect para guardar mensajes (sin cambios)
  useEffect(() => {
    if (messages.length > 0 && threadId) {
      try {
        localStorage.setItem(`messages_${assistantId}`, JSON.stringify(messages))
      } catch (e) {
        console.error("Error al guardar mensajes en localStorage:", e)
      }
    }
  }, [messages, assistantId, threadId])

  // useEffect para scroll (sin cambios)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // handleFileChange (sin cambios)
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageBase64(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    if (event.target) {
        event.target.value = ''
    }
  }

  // handleSubmit (sin cambios)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !imageBase64) || isLoading) return
    setError(null)
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      imageBase64: imageBase64,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    const currentInput = input
    const currentImageBase64 = imageBase64
    setInput("")
    setImageBase64(null)
    setIsLoading(true)
    try {
      const endpoint = "/api/chat"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          message: currentInput,
          imageBase64: currentImageBase64,
          threadId,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        console.error("Error del servidor:", data.error, data.details)
        setMessages((prev) => prev.filter(msg => msg.id !== userMessage.id));
        throw new Error(data.error || "Error en la respuesta del servidor")
      }
      if (data.threadId && !threadId) {
        setThreadId(data.threadId)
        try {
          localStorage.setItem(`threadId_${assistantId}`, data.threadId)
        } catch (e) {
          console.error("Error al guardar threadId en localStorage:", e)
        }
      }
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.reply, // Guardar el contenido original
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
        const error = err as Error;
        setError(error.message);
        console.error("Error en la conversación:", error);
    } finally {
      setIsLoading(false)
    }
  }

  // formatTime (sin cambios)
  const formatTime = (date: Date) => {
    try {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch (e) {
      console.error("Error al formatear la hora:", e)
      return ""
    }
  }

  // startNewConversation (sin cambios)
  const startNewConversation = () => {
    try {
      localStorage.removeItem(`threadId_${assistantId}`)
      localStorage.removeItem(`messages_${assistantId}`)
    } catch (e) {
      console.error("Error al eliminar datos de localStorage:", e)
    }
    setThreadId(null)
    setError(null)
    setInput("")
    setImageBase64(null)
    showWelcomeMessage()
  }

  // Vista Asistente no encontrado (sin cambios)
  if (!assistant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950">
        <Card className="w-full max-w-md bg-neutral-900 border-neutral-700 text-white relative z-10">
          <CardHeader>
            <CardTitle className="text-center text-white">Asistente no encontrado</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-300">
            <p>El asistente que buscas no existe o no está disponible.</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link href="/assistants">Ver todos los asistentes</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white relative">
       {/* Fondo giratorio (sin cambios) */}
      <div 
        className="fixed inset-0 flex justify-center items-center z-0 pointer-events-none" 
        style={{filter:'blur(12px)', opacity:0.15}} 
      >
        <div className="relative" style={{ width: '500px', height: '500px' }}>
          <Image
            src="/LogosNuevos/logo_orbia_sin_texto.png"
            alt="Logo Orbia Sin Texto Background"
            fill
            priority
            className="object-contain"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.1s linear',
            }}
          />
        </div>
      </div>

      {/* Contenido principal del chat con z-index mayor */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header eliminado */}

        {/* Error Banner (sin cambios) */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 p-4 fixed top-0 left-0 right-0 z-40 mx-auto max-w-3xl mt-4"> 
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  Error: {error}. Por favor, intenta de nuevo o contacta con soporte si el problema persiste.
                </p>
              </div>
              <button onClick={() => setError(null)} className="ml-auto -mx-1.5 -my-1.5 bg-red-100 text-red-500 rounded-lg focus:ring-2 focus:ring-red-400 p-1.5 hover:bg-red-200 inline-flex h-8 w-8" aria-label="Dismiss">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages (modificado para formatear mensajes de asistente) */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${error ? 'pt-20' : 'pt-6'} pb-40`}>
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message, index) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} ${index === 0 && !error ? 'mt-4' : ''}`}>
                <div className={`flex max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Iconos (sin cambios) */}
                  {message.role === "user" ? (
                    <div className="h-8 w-8 ml-3 bg-emerald-600 text-white flex items-center justify-center rounded-full font-semibold flex-shrink-0">
                      U
                    </div>
                  ) : (
                    <div className={`h-8 w-8 mr-3 ${assistant.bgColor} text-white flex items-center justify-center rounded-full font-semibold flex-shrink-0`}> 
                      {assistant?.name.charAt(0)}
                    </div>
                  )}
                  {/* Burbuja */}
                  <div 
                    className={`rounded-lg shadow-sm transition-all relative ${message.role === "user" 
                      ? "bg-blue-600 text-white" 
                      : "bg-neutral-800 text-gray-200 border border-neutral-700"}`}
                  >
                    {/* Imagen (sin cambios) */}
                    {message.role === 'user' && message.imageBase64 && (
                      <div className="p-2 border-b border-blue-500"> 
                        <Image 
                          src={message.imageBase64} 
                          alt="Imagen adjunta" 
                          width={200}
                          height={150}
                          className="rounded-md object-cover" 
                        />
                      </div>
                    )}
                    {/* Contenido del mensaje (formateado si es del asistente) */}
                    {message.content && (
                      <div className="p-3">
                        <div className="whitespace-pre-wrap">
                          {message.role === 'assistant' 
                            ? formatAssistantMessage(message.content) 
                            : message.content}
                        </div>
                      </div>
                    )}
                    {/* Timestamp (sin cambios) */}
                    <div className={`text-xs px-3 pb-2 ${message.role === "user" ? "text-blue-200" : "text-gray-400"} ${message.content ? 'mt-1' : ''}`}> 
                      {formatTime(message.timestamp)}
                    </div>
                    {/* Efecto bienvenida (sin cambios) */}
                    {message.id === "welcome" && message.role === 'assistant' && (
                        <div className={`absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-400 animate-ping ${message.content ? '' : 'hidden'}`}></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* Indicador de carga (sin cambios) */}
            {isLoading && (
              <div className="flex justify-start mt-4">
                <div className="flex items-center">
                  <div className={`h-8 w-8 mr-3 ${assistant.bgColor} text-white flex items-center justify-center rounded-full font-semibold flex-shrink-0`}> 
                      {assistant?.name.charAt(0)}
                    </div>
                  <div className="rounded-lg p-3 bg-neutral-800 border border-neutral-700 flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area (sin cambios) */}
        <div className="bg-neutral-900 border-t border-neutral-800 p-4 sm:p-6 sticky bottom-0 z-40 transition-all duration-200 ease-in-out">
          <div className="max-w-3xl mx-auto">
            {/* Botones Volver y Nueva Conversación */}
            <div className="flex justify-between items-center mb-4 px-1">
              <Link href="/assistants" className="flex items-center gap-2 hover:opacity-80 transition-opacity text-sm text-gray-300 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                <span>Volver</span>
              </Link>
              <Button 
                onClick={startNewConversation}
                variant="outline"
                size="sm"
                className="border-neutral-700 text-black hover:bg-neutral-800 hover:text-white text-sm"
              >
                Nueva conversación
              </Button>
            </div>

            {/* Preview de imagen seleccionada */}
            {imageBase64 && (
              <div className="relative mb-2 p-2 border border-neutral-700 rounded-md max-w-xs">
                <Image src={imageBase64} alt="Preview" width={80} height={60} className="rounded object-cover" />
                <button 
                  onClick={() => setImageBase64(null)} 
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700"
                  aria-label="Quitar imagen"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            
            {/* Formulario principal */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Button 
                type="button" 
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()} 
                className="border-neutral-700 text-gray-400 hover:text-white hover:bg-neutral-800"
                disabled={isLoading}
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
                disabled={isLoading}
              />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu mensaje o adjunta una imagen..."
                disabled={isLoading}
                className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:ring-offset-neutral-900"
              />
              <Button 
                type="submit" 
                disabled={isLoading || (!input.trim() && !imageBase64)}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            
            {/* Texto inferior */}
            <div className="mt-2 text-xs text-gray-400 text-center">
              {isLoading ? 'Procesando...' : 'Tus conversaciones se guardan para mejorar la experiencia.'}
            </div>
          </div>
        </div>
      </div> 
    </div>
  )
}

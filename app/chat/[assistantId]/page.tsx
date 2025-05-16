"use client";

import type React from "react";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAssistantById } from "@/lib/assistants";
import { ArrowLeft, Send, Loader2, Paperclip, X, RefreshCw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

// Type definition
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageBase64?: string | null;
  timestamp: Date;
  isStreaming?: boolean;
};

const formatAssistantMessage = (content: string): string => {
  const citationRegex = /【.*?】/g;
  return content.replace(citationRegex, "").trim();
};

function ChatPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assistantId = params.assistantId as string;
  const assistant = getAssistantById(assistantId);
  const employeeTokenFromUrl = searchParams.get("employeeToken");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const streamControllerRef = useRef<AbortController | null>(null);
  const employeeToken = useRef<string | null>(null);

  useEffect(() => {
    employeeToken.current = employeeTokenFromUrl;
  }, [employeeTokenFromUrl]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const showWelcomeMessage = useCallback(() => {
    if (assistant) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Cuando quieras, empezamos a hablar sobre cómo podemos potenciarte con IA.",
          timestamp: new Date(),
        },
      ]);
    }
  }, [assistant]);

  useEffect(() => {
    if (!employeeToken.current) {
      const potentialToken = localStorage.getItem("lastKnownEmployeeToken");
      if(potentialToken) employeeToken.current = potentialToken;
      else {
        showWelcomeMessage(); 
        return;
      }
    }
    if (employeeTokenFromUrl && localStorage.getItem("lastKnownEmployeeToken") !== employeeTokenFromUrl) {
        localStorage.setItem("lastKnownEmployeeToken", employeeTokenFromUrl);
    }
    try {
      const storedThreadId = localStorage.getItem(`threadId_${assistantId}_${employeeToken.current}`);
      if (storedThreadId) {
        setCurrentThreadId(storedThreadId);
        const storedMessages = localStorage.getItem(`messages_${assistantId}_${employeeToken.current}`);
        if (storedMessages) {
          try {
            const parsedMessages = JSON.parse(storedMessages);
            const messagesWithDates = parsedMessages.map((msg: any) => ({ ...msg, timestamp: new Date(msg.timestamp), isStreaming: false }));
            setMessages(messagesWithDates);
          } catch (e) { showWelcomeMessage(); }
        } else { showWelcomeMessage(); }
      } else { showWelcomeMessage(); }
    } catch (e) { showWelcomeMessage(); }
  }, [assistantId, showWelcomeMessage, employeeTokenFromUrl]);

  useEffect(() => {
    if (!employeeToken.current) return;
    const messagesToSave = messages.filter(msg => msg.role !== 'assistant' || !msg.isStreaming);
    if (messagesToSave.length > 0 && currentThreadId && messagesToSave[0]?.id !== 'welcome') {
      try {
        localStorage.setItem(`messages_${assistantId}_${employeeToken.current}`, JSON.stringify(messagesToSave));
      } catch (e) { console.error("Error saving messages:", e); }
    }
  }, [messages, assistantId, currentThreadId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImageBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (event.target) event.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !imageBase64) || isLoading || !employeeToken.current) {
      if (!employeeToken.current) setError("Token de empleado no encontrado. Recarga con el enlace correcto.");
      return;
    }
    setError(null); setIsLoading(true);
    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: input, imageBase64, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input, currentImageBase64 = imageBase64;
    setInput(""); setImageBase64(null);
    if (streamControllerRef.current) streamControllerRef.current.abort();
    streamControllerRef.current = new AbortController();
    const signal = streamControllerRef.current.signal;
    let assistantMessagePlaceholderId: string | null = null, accumulatedContent = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: assistant?.id, message: currentInput, imageBase64: currentImageBase64, threadId: currentThreadId, employeeToken: employeeToken.current }),
        signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Error del servidor." }));
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      if (!response.body) throw new Error("Respuesta sin cuerpo.");
      const reader = response.body.getReader(), decoder = new TextDecoder("utf-8");
      let buffer = "";
      assistantMessagePlaceholderId = `assistant-stream-${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantMessagePlaceholderId!, role: "assistant", content: "", timestamp: new Date(), isStreaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let eolIndex;
        while ((eolIndex = buffer.indexOf('

')) !== -1) { // THIS IS THE CRITICAL LINE
          const line = buffer.substring(0, eolIndex).trim();
          buffer = buffer.substring(eolIndex + 2);
          if (line.startsWith('data:')) {
            const jsonData = line.substring(5).trim();
            try {
              const event = JSON.parse(jsonData);
              if (event.threadId && event.threadId !== currentThreadId) {
                setCurrentThreadId(event.threadId);
                if(employeeToken.current) localStorage.setItem(`threadId_${assistantId}_${employeeToken.current}`, event.threadId);
              }
              switch (event.type) {
                case 'thread.message.delta':
                  if (event.data.delta.content && event.data.delta.content[0].type === 'text') {
                    accumulatedContent += event.data.delta.content[0].text.value;
                    setMessages(prev => prev.map(msg => msg.id === assistantMessagePlaceholderId ? { ...msg, content: accumulatedContent, isStreaming: true } : msg));
                  }
                  break;
                case 'thread.message.completed':
                  setMessages(prev => prev.map(msg => msg.id === assistantMessagePlaceholderId ? { ...msg, content: accumulatedContent, isStreaming: false, id: event.data.id } : msg));
                  assistantMessagePlaceholderId = null; accumulatedContent = "";
                  break;
                case 'thread.run.completed': setIsLoading(false); break;
                case 'thread.run.failed': case 'thread.run.cancelled': case 'thread.run.expired':
                  setError(event.data.last_error?.message || `Asistente finalizó: ${event.type}`);
                  setIsLoading(false);
                  if (assistantMessagePlaceholderId) setMessages(prev => prev.filter(msg => msg.id !== assistantMessagePlaceholderId));
                  break;
                case 'error':
                  setError(event.data.details || event.data.message || "Error de stream.");
                  setIsLoading(false);
                  if (assistantMessagePlaceholderId) setMessages(prev => prev.filter(msg => msg.id !== assistantMessagePlaceholderId));
                  break;
                case 'stream.ended':
                  setIsLoading(false);
                  if (assistantMessagePlaceholderId) setMessages(prev => prev.map(msg => msg.id === assistantMessagePlaceholderId && msg.isStreaming ? { ...msg, isStreaming: false } : msg));
                  break;
              }
            } catch (e) { console.error("Error parseando JSON:", e, jsonData); }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || "Error de conexión.");
      if (assistantMessagePlaceholderId) setMessages(prev => prev.filter(msg => msg.id !== assistantMessagePlaceholderId));
      if (err.name !== 'AbortError') { setMessages(prev => prev.filter(msg => msg.id !== userMessage.id)); setInput(currentInput); setImageBase64(currentImageBase64); }
    } finally {
      if (!(signal.aborted && isLoading)) setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    try { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  };

  const startNewConversation = () => {
    if (!employeeToken.current) return;
    if (streamControllerRef.current) streamControllerRef.current.abort();
    try {
      localStorage.removeItem(`threadId_${assistantId}_${employeeToken.current}`);
      localStorage.removeItem(`messages_${assistantId}_${employeeToken.current}`);
    } catch (e) { console.error("Error borrando localStorage:", e); }
    setCurrentThreadId(null); setError(null); setInput(""); setImageBase64(null); setIsLoading(false); showWelcomeMessage();
  };

  if (!employeeToken.current && !employeeTokenFromUrl) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-slate-800 p-4">
        <Card className="w-full max-w-md bg-white border-red-500 text-slate-800 shadow-lg">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-red-600">Acceso No Autorizado</h2>
            <p className="text-slate-600 mb-6">Se requiere un token de empleado válido. Utiliza el enlace proporcionado.</p>
            <Button asChild className="bg-sistema-primary hover:bg-sistema-primary-dark text-white"><Link href="/">Volver</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!assistant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <Card className="w-full max-w-md"><CardContent className="pt-6 text-center"><Image src="/images/logo.png" alt="SISTEMA" width={180} height={60} /><h2 className="text-2xl font-bold my-4">Asistente No Encontrado</h2><Button asChild><Link href="/">Ver Asistentes</Link></Button></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-800 relative">
      <div className="fixed inset-0 flex justify-center items-center z-0 pointer-events-none" style={{ filter: "blur(80px)", opacity: 0.1 }}>
        <div className="w-96 h-96 rounded-full bg-gradient-to-br from-sistema-primary to-sistema-secondary" style={{ transform: `translate(${scrollY * 0.05}px, ${scrollY * -0.05}px) rotate(${scrollY * 0.1}deg)`, transition: "transform 0.1s ease-out" }}></div>
      </div>
      <header className="bg-white border-b border-slate-200 py-2 px-4 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {!employeeTokenFromUrl ? (<Link href="/" className="flex items-center gap-2"><ArrowLeft className="h-4 w-4" /><Image src="/images/logo.png" alt="SISTEMA" width={120} height={40} /></Link>) : (<div className="flex items-center gap-2"><Image src="/images/logo.png" alt="SISTEMA" width={120} height={40} /></div>)}
          {assistant && (<div className="flex items-center gap-2"><div className={`h-8 w-8 ${assistant.bgColor} flex items-center justify-center rounded-full font-semibold shadow-md`}>{assistant.name.charAt(0)}</div><div><h2 className="font-medium">{assistant.name}</h2><p className="text-xs text-slate-500">{assistant.role}</p></div></div>)}
        </div>
      </header>
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
        <AnimatePresence>
          {error && (<motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-red-500/20 border-l-4 border-red-500 p-4 fixed top-16 left-0 right-0 z-40 mx-auto max-w-3xl mt-4 backdrop-blur-sm"><div className="flex"><div className="ml-3"><p className="text-sm text-red-800">Error: {error}</p></div><button onClick={() => setError(null)} className="ml-auto"><X className="h-5 w-5" /></button></div></motion.div>)}
        </AnimatePresence>
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${error ? "pt-20" : "pt-6"} pb-40`}>
          <div className="max-w-3xl mx-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div key={message.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} ${index === 0 && !error ? "mt-4" : ""}`}>
                  <div className={`flex max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {message.role === "user" ? (<div className="h-8 w-8 ml-3 bg-slate-800 text-slate-100 flex items-center justify-center rounded-full font-semibold shrink-0 shadow-md">U</div>) : (<div className={`h-8 w-8 mr-3 ${assistant.bgColor} flex items-center justify-center rounded-full font-semibold shrink-0 shadow-md`}>{assistant?.name.charAt(0)}</div>)}
                    <div className={`rounded-lg shadow-md transition-all relative ${message.role === "user" ? "bg-sistema-primary text-white" : "bg-white text-slate-800 border border-slate-200"}`}>
                      {message.role === "user" && message.imageBase64 && (<div className="p-2 border-b border-sistema-primary-dark/30"><Image src={message.imageBase64 || "/placeholder.svg"} alt="Imagen" width={200} height={150} className="rounded-md" /></div>)}
                      {(message.content || message.isStreaming) && (<div className="p-3"><div className="whitespace-pre-wrap">{message.role === "assistant" ? (<div className="prose prose-slate prose-sm max-w-none"><ReactMarkdown>{message.isStreaming && !message.content.trim() ? "..." : formatAssistantMessage(message.content)}</ReactMarkdown></div>) : (message.content)}</div></div>)}
                      <div className={`text-xs px-3 pb-2 ${message.role === "user" ? "text-white/70" : "text-slate-500"} ${(message.content || message.isStreaming) ? "mt-1" : ""}`}>{formatTime(message.timestamp)}</div>
                      {message.id === "welcome" && <div className={`absolute -top-1 -right-1 h-2 w-2 rounded-full bg-sistema-primary animate-ping ${message.content ? "" : "hidden"}`}></div>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && !messages.some(m => m.role === 'assistant' && m.isStreaming) && (<motion.div className="flex justify-start mt-4"><div className="flex items-center"><div className={`h-8 w-8 mr-3 ${assistant.bgColor} flex items-center justify-center rounded-full font-semibold shrink-0 shadow-md`}>{assistant?.name.charAt(0)}</div><div className="rounded-lg p-3 bg-white border flex items-center shadow-md"><Loader2 className="h-4 w-4 animate-spin text-sistema-primary" /><span className="ml-2 text-sm text-slate-600">Conectando...</span></div></div></motion.div>)}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <div className="bg-white border-t p-4 sm:p-6 sticky bottom-0 z-40 shadow-lg">
          <div className="max-w-3xl mx-auto">
            <div className="flex justify-end mb-4"><Button onClick={startNewConversation} variant="outline" size="sm" className="text-sm"><RefreshCw className="h-3 w-3 mr-2" />Nueva conversación</Button></div>
            <AnimatePresence>
              {imageBase64 && (<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative mb-2 p-2 border rounded-md max-w-xs bg-slate-50"><Image src={imageBase64 || "/placeholder.svg"} alt="Preview" width={80} height={60} className="rounded" /><button onClick={() => setImageBase64(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X size={14} /></button></motion.div>)}
            </AnimatePresence>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isLoading}><Paperclip className="h-5 w-5" /></Button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" disabled={isLoading} />
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe tu mensaje..." disabled={isLoading} className="flex-1"/>
              <Button type="submit" disabled={isLoading || (!input.trim() && !imageBase64)} className="rounded-lg"><Send className="h-4 w-4" /></Button>
            </form>
            <div className="mt-2 text-xs text-slate-500 text-center">{isLoading ? "Procesando..." : "Conversaciones guardadas."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-xl">Cargando...</div>}> 
      <ChatPageContent />
    </Suspense>
  );
}

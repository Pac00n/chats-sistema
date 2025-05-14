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

// DESCOMENTA Y SIMPLIFICA ChatPageContent
function ChatPageContent() {
  const searchParams = useSearchParams();
  const employeeToken = searchParams.get("employeeToken");

  console.log("[ChatPageContent-Minimal] employeeToken from URL params:", employeeToken);

  // También puedes añadir el assistantId para que la UI tenga más sentido si quieres
  const params = useParams();
  const assistantId = params.assistantId as string;
  const assistant = getAssistantById(assistantId);


  if (!employeeToken) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-slate-800 p-4">
         <Card className="w-full max-w-md bg-white border-red-500 text-slate-800 shadow-lg">
           <CardContent className="pt-6 text-center">
             <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
             <h2 className="text-2xl font-bold mb-2 text-red-600">Acceso No Autorizado</h2>
             <p className="text-slate-600 mb-6">Error: Falta el token de empleado en la URL. Por favor, utiliza el enlace proporcionado.</p>
            <Button asChild className="bg-sistema-primary hover:bg-sistema-primary-dark text-white">
              <Link href="/">Volver a la página principal</Link>
            </Button>
           </CardContent>
         </Card>
       </div>
    );
  }

  // Simula la UI básica del chat si el token existe
  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-800 relative">
        <header className="bg-white border-b border-slate-200 py-2 px-4 shadow-sm sticky top-0 z-20">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <ArrowLeft className="h-4 w-4 text-slate-600" />
                    <Image src="/images/logo.png" alt="SISTEMA INGENIERÍA" width={120} height={40} className="h-8 w-auto" />
                </Link>
                {assistant && (
                    <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 ${assistant.bgColor} text-white flex items-center justify-center rounded-full font-semibold shadow-md`}>
                            {assistant.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="font-medium text-slate-800">{assistant.name}</h2>
                            <p className="text-xs text-slate-500">{assistant.role}</p>
                        </div>
                    </div>
                )}
            </div>
        </header>
        <div className="p-4">
            <h1 className="text-xl font-bold">ChatPageContent está renderizando (versión mínima)</h1>
            <p>Assistant ID: {assistantId}</p>
            <p>Employee Token: {employeeToken}</p>
            <p className="mt-4">Aquí iría la interfaz de chat completa...</p>
        </div>
    </div>
  );
}

export default function ChatPage() {
  console.log("[ChatPage] Component ChatPage (wrapper with Suspense) is rendering.");
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-xl font-semibold">Cargando (Suspense fallback)...</div>}> 
      <ChatPageContent />
    </Suspense>
  );
}

"use client"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, Suspense } from "react" 
import { useSearchParams } from 'next/navigation'
import { assistantGroups, type Assistant } from "@/lib/assistants"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Copy, AlertTriangle, Loader2 } from "lucide-react" 
import { motion } from "framer-motion"
import ReactMarkdown from 'react-markdown'; // Added for Markdown rendering

// Leer el token de administrador desde las variables de entorno
const ADMIN_TOKEN_FROM_ENV = process.env.NEXT_PUBLIC_ADMIN_SECRET_TOKEN;

function HomePageContent() {
  const searchParams = useSearchParams();
  const adminTokenFromUrl = searchParams.get("adminToken");

  const [copiedAssistantId, setCopiedAssistantId] = useState<string | null>(null);
  const [analysisQuery, setAnalysisQuery] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  if (adminTokenFromUrl !== ADMIN_TOKEN_FROM_ENV) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4 bg-slate-100">
        <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-red-600 mb-3">Acceso Restringido</h1>
        <p className="text-slate-700 text-lg max-w-md">
          No tienes permiso para acceder a esta página. Si eres administrador, asegúrate de que la URL incluya el token de acceso correcto (<code>?adminToken=TU_TOKEN</code>).
        </p>
      </div>
    );
  }

  const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const handleCopyLink = async (assistant: Assistant) => {
    console.log("[HomePage] handleCopyLink triggered for assistant ID:", assistant.id, "Name:", assistant.name);
    const employeeToken = generateUUID();
    const chatUrl = `/chat/${assistant.id}?employeeToken=${employeeToken}`;
    const fullUrl = `${window.location.origin}${chatUrl}`;
    console.log("[HomePage] Generated URL to copy:", fullUrl);
    try {
      await navigator.clipboard.writeText(fullUrl);
      alert(`Enlace copiado al portapapeles (para ${assistant.name}):
${fullUrl}`); 
      setCopiedAssistantId(assistant.id);
      setTimeout(() => {
        setCopiedAssistantId(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard: ", err);
      alert(`Error al copiar el enlace para ${assistant.name}. Inténtalo manualmente:
${fullUrl}`);
    }
  };

  const handleAnalysisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analysisQuery.trim()) {
      setAnalysisError("La consulta de análisis no puede estar vacía.");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);
    console.log("[HomePage] Submitting analysis query:", analysisQuery);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: analysisQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[HomePage] Analysis API error:", data);
        throw new Error(data.error || "Error en la respuesta del servidor de análisis.");
      }
      console.log("[HomePage] Analysis API success:", data);
      setAnalysisResult(data.analysis || "No se obtuvo un resultado de análisis claro.");
    } catch (err: any) {
      console.error("[HomePage] Failed to submit analysis query:", err);
      setAnalysisError(err.message || "Ocurrió un error al procesar el análisis.");
      setAnalysisResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800">
      <div className="container mx-auto px-4 py-8">
        <motion.div className="text-center mb-8">
             <div className="flex justify-center mb-4">
               <Image src="/images/logo.png" alt="SISTEMA INGENIERÍA" width={240} height={80} className="h-auto" priority />
             </div>
             <h1 className="text-3xl font-bold mb-4 text-sistema-dark">Asistentes Virtuales (Admin)</h1>
             <p className="text-lg text-slate-600 max-w-2xl mx-auto">
               Selecciona un asistente para iniciar una conversación o copia un enlace único para un empleado.
             </p>
        </motion.div>

        {assistantGroups.map((group, groupIndex) => (
          <div key={group.title} className="mb-10">
            <motion.h2 className="text-xl font-semibold mb-4 text-sistema-dark border-b border-sistema-primary pb-2">
              {group.title}
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.assistants.map((assistant, index) => {
                return (
                  <motion.div
                    key={assistant.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 + groupIndex * 0.2 }}
                    className="flex flex-col bg-white border border-slate-200 rounded-lg shadow-md overflow-hidden group hover:border-sistema-primary transition-all duration-300 hover:shadow-lg hover:shadow-sistema-primary/10"
                  >
                    <Link href={`/chat/${assistant.id}`} className="block flex-grow cursor-pointer">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-sistema-primary/5 to-sistema-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <CardHeader className={`${assistant.bgColor} text-white min-h-[80px]`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-xl">{assistant.name}</CardTitle>
                              <CardDescription className="text-white/80 text-sm">{assistant.role}</CardDescription>
                            </div>
                            <assistant.iconType className="h-6 w-6 flex-shrink-0" />
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 relative z-10">
                          <div className="mb-3">
                            <h3 className="text-lg font-semibold text-slate-800">{assistant.name}</h3>
                            <p className="text-sm text-slate-500">{assistant.role}</p>
                          </div>
                          <p className="text-sm text-slate-600">{assistant.description}</p>
                        </CardContent>
                      </div>
                    </Link>
                    <div className="p-4 border-t border-slate-200 text-center">
                      <Button
                        onClick={(e) => {
                          handleCopyLink(assistant);
                        }}
                        variant="outline"
                        size="sm"
                        className="border-sistema-primary text-sistema-primary hover:bg-sistema-primary/10 hover:text-sistema-primary-dark transition-colors"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {copiedAssistantId === assistant.id ? "¡Enlace Copiado!" : "Copiar Enlace Empleado"}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: assistantGroups.length * 0.1 + 0.2 }}
          className="mt-12 p-6 bg-white rounded-lg shadow-md border border-slate-200"
        >
          <h2 className="text-2xl font-semibold mb-4 text-sistema-dark border-b border-sistema-primary pb-2">Análisis de Conversaciones</h2>
          <form onSubmit={handleAnalysisSubmit}>
            <div className="mb-4">
              <label htmlFor="analysisQuery" className="block text-sm font-medium text-slate-700 mb-1">Tu pregunta para el análisis:</label>
              <Textarea
                id="analysisQuery"
                value={analysisQuery}
                onChange={(e) => setAnalysisQuery(e.target.value)}
                placeholder="Ej: ¿Cuáles fueron los temas más comunes para el asistente 'paco-delineante-bim'? Limita la búsqueda a 50 mensajes."
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-sistema-primary focus:border-sistema-primary min-h-[100px]"
                rows={4}
              />
            </div>
            <Button type="submit" disabled={isAnalyzing} className="bg-sistema-secondary hover:bg-sistema-secondary-dark text-white">
              {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isAnalyzing ? "Analizando..." : "Realizar Análisis"}
            </Button>
          </form>

          {analysisError && (
            <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
              <p className="font-semibold">Error en el Análisis:</p>
              <p>{analysisError}</p>
            </div>
          )}

          {analysisResult && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-2 text-slate-700">Resultado del Análisis:</h3>
              <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none p-4 bg-slate-50 border border-slate-200 rounded-md overflow-x-auto">
                <ReactMarkdown>{analysisResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-xl font-semibold">Cargando página de inicio...</div>}> 
      <HomePageContent />
    </Suspense>
  );
}

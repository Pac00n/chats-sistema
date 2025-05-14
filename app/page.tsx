"use client"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, Suspense } from "react" 
import { useSearchParams, useRouter } from 'next/navigation'
import { assistantGroups, type Assistant } from "@/lib/assistants"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, AlertTriangle } from "lucide-react" 
import { motion } from "framer-motion"

// Leer el token de administrador desde las variables de entorno
const ADMIN_TOKEN_FROM_ENV = process.env.NEXT_PUBLIC_ADMIN_SECRET_TOKEN;

function HomePageContent() {
  const searchParams = useSearchParams();
  // const router = useRouter(); // No se usa para redirección por ahora, solo muestra mensaje
  const adminTokenFromUrl = searchParams.get("adminToken");

  // Log para depuración
  // console.log("[HomePageContent] adminTokenFromUrl:", adminTokenFromUrl);
  // console.log("[HomePageContent] ADMIN_TOKEN_FROM_ENV:", ADMIN_TOKEN_FROM_ENV);

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

  // Si el token es correcto, renderiza el contenido normal de la página de inicio
  const [copiedAssistantId, setCopiedAssistantId] = useState<string | null>(null);

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
      console.log("[HomePage] URL copied. Current copiedAssistantId BEFORE set:", copiedAssistantId, "Attempting to set to:", assistant.id);
      setCopiedAssistantId(assistant.id);
      setTimeout(() => {
        console.log(`[HomePage] Resetting copiedAssistantId (which was ${assistant.id} when timeout was set) to null after timeout.`);
        setCopiedAssistantId(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard: ", err);
      alert(`Error al copiar el enlace para ${assistant.name}. Inténtalo manualmente:
${fullUrl}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800">
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex justify-center mb-4">
            <Image
              src="/images/logo.png"
              alt="SISTEMA INGENIERÍA"
              width={240}
              height={80}
              className="h-auto"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold mb-4 text-sistema-dark">Asistentes Virtuales (Admin)</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Selecciona un asistente para iniciar una conversación o copia un enlace único para un empleado.
          </p>
        </motion.div>

        {assistantGroups.map((group, groupIndex) => (
          <div key={group.title} className="mb-10">
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: groupIndex * 0.1 }}
              className="text-xl font-semibold mb-4 text-sistema-dark border-b border-sistema-primary pb-2"
            >
              {group.title}
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.assistants.map((assistant, index) => {
                console.log(`[HomePage] Rendering Card for: ${assistant.name} (ID: ${assistant.id}), Href for Link: /chat/${assistant.id}`);
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
                          console.log(`[HomePage] Botón Copiar CLICADO para: ${assistant.name} (ID: ${assistant.id})`);
                          if (assistant.id === "eduardo-ceo") {
                            console.log("[HomePage] ES EL BOTÓN DEL CEO!");
                          }
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

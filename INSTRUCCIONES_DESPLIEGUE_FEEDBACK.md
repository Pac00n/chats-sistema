# Instrucciones para Despliegue y Feedback con Empleados (1 Semana)

Esta guía te ayudará a configurar tu aplicación Next.js desplegada en Vercel para una fase de feedback de una semana con tus empleados, utilizando un sistema de aislamiento de chats por tokens y protección general del sitio.

## 1. Despliegue en Vercel

1.  Asegúrate de que tu proyecto esté conectado a un repositorio Git (GitHub, GitLab, Bitbucket).
2.  Ve a [Vercel](https://vercel.com/) e importa tu proyecto Git.
3.  Durante el proceso de configuración del proyecto en Vercel (o después, en la configuración del proyecto):
    *   **Configura las Variables de Entorno:**
        *   Ve a `Settings > Environment Variables`.
        *   Añade tu `OPENAI_API_KEY` con su valor correspondiente. Asegúrate de que el nombre de la variable sea exactamente `OPENAI_API_KEY`.
    *   **Build & Development Settings:** Usualmente Vercel detecta Next.js automáticamente. El comando de build suele ser `pnpm build` (o `npm run build` / `yarn build` si cambiaste de gestor) y el de desarrollo `pnpm dev`.
4.  Despliega tu proyecto. Vercel te proporcionará una URL pública (ej: `tu-proyecto.vercel.app`).

## 2. Protección General del Sitio en Vercel

Para asegurar que solo tú y tus empleados puedan acceder al sitio desplegado durante la fase de feedback:

1.  En tu dashboard de Vercel, selecciona tu proyecto.
2.  Ve a `Settings > Advanced`.
3.  Busca la sección de **Password Protection**.
4.  Habilita la protección por contraseña.
5.  Establece una contraseña segura que compartirás con tus empleados.
6.  Guarda los cambios.

Ahora, cualquiera que intente acceder a `tu-proyecto.vercel.app` deberá ingresar esta contraseña.

## 3. Generación de Tokens Únicos para Empleados

Para aislar las conversaciones de chat de cada empleado:

1.  **Genera un UUID (Token Único) para cada empleado.** Puedes usar un generador online como [uuidgenerator.net](https://www.uuidgenerator.net/).
    *   *Ejemplo Empleado A:* `e4f2b6c8-9b3c-4b1e-8b0a-0e1f2c3d4e5f`
    *   *Ejemplo Empleado B:* `a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6`

2.  **Prepara los enlaces de chat personalizados:**
    La estructura es: `https://tu-proyecto.vercel.app/chat/[ID_DEL_ASISTENTE]?employeeToken=[TOKEN_DEL_EMPLEADO]`

    *Sustituye `[ID_DEL_ASISTENTE]` por el ID del asistente con el que quieres que chatee (ej: `yurena-administrativa`, `laura-ingeniera-civil`).*

    *   *Ejemplo para Empleado A (con Yurena):*
        `https://tu-proyecto.vercel.app/chat/yurena-administrativa?employeeToken=e4f2b6c8-9b3c-4b1e-8b0a-0e1f2c3d4e5f`
    *   *Ejemplo para Empleado B (con Laura):*
        `https://tu-proyecto.vercel.app/chat/laura-ingeniera-civil?employeeToken=a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6`

## 4. Implementación del Sistema de `employeeToken` (Código)

Estos son los cambios que hemos discutido para `app/chat/[assistantId]/page.tsx` (frontend) y `app/api/chat/route.ts` (backend) para manejar el `employeeToken`. Asegúrate de que estos cambios estén aplicados y desplegados en Vercel.

*   **Frontend (`page.tsx`):** Leerá el `employeeToken` de la URL, validará su presencia, lo usará para segmentar el almacenamiento en `localStorage` y lo enviará al backend.
*   **Backend (`route.ts`):** Recibirá el `employeeToken` (principalmente para un futuro almacenamiento centralizado, si decides implementarlo con Supabase más adelante).

## 5. Comunicación con los Empleados

1.  **Comparte la contraseña general** del sitio Vercel con tus empleados.
2.  **Envía a cada empleado su(s) enlace(s) de chat personalizados** que contienen su `employeeToken` único.
3.  Explícales que sus conversaciones son individuales con ese enlace y que están participando en una fase de feedback.
4.  Indícales cómo y dónde prefieres que te den su feedback sobre la herramienta.

## Consideraciones Adicionales para el Futuro (Post-Feedback)

*   **Autenticación Robusta:** Para una solución a largo plazo, considera implementar un sistema de autenticación completo (ej: Supabase Auth) en lugar de la protección por contraseña general de Vercel y los tokens en URL.
*   **Almacenamiento Centralizado de Conversaciones:** Si quieres analizar las conversaciones con otra IA, necesitarás guardar los mensajes en una base de datos centralizada (ej: Supabase Database), asociando cada mensaje con el `employeeToken` o un ID de usuario autenticado.
*   **Privacidad y Consentimiento:** Si almacenas conversaciones centralmente, refuerza las políticas de privacidad y asegúrate de tener el consentimiento claro de los empleados.

---
*Nota: Los cambios de código para el sistema `employeeToken` deben ser implementados antes de que los empleados usen los enlaces.*
#!/bin/bash

# Ignorar los errores de pnpm-lock.yaml y usar --no-frozen-lockfile
echo "🔧 Instalando dependencias con --no-frozen-lockfile..."
pnpm install --no-frozen-lockfile || { echo "❌ Falló la instalación de dependencias"; exit 1; }

# Construir el proyecto
echo "🏗️ Construyendo el proyecto..."
pnpm build || { echo "❌ Falló la construcción"; exit 1; }

echo "✅ Build completado con éxito"

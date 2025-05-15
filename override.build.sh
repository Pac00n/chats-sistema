#!/bin/bash
echo "🏗️ Construyendo el proyecto con pnpm run build..."
pnpm run build || { echo "❌ Falló la construcción (pnpm run build)"; exit 1; }
echo "✅ Build invocado con éxito"
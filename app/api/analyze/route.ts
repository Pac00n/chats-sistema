import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query;

    if (!query) {
      return NextResponse.json({ error: 'La consulta (query) es requerida' }, { status: 400 });
    }

    console.log('[API Analyze] Received query:', query);

    // AQUÍ VA TU LÓGICA DE ANÁLISIS
    // Ejemplo: conectar a base de datos, llamar a OpenAI, etc.
    // Por ahora, solo devolvemos un mensaje de ejemplo
    const analysisResultFromBackend = `Análisis para la consulta: "${query}". El resultado del análisis aparecerá aquí.`;

    return NextResponse.json({ analysis: analysisResultFromBackend });

  } catch (error) {
    console.error('[API Analyze] Error processing request:', error);
    let errorMessage = 'Error desconocido en el servidor de análisis.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Opcional: Puedes añadir un manejador GET si quieres que /api/analyze responda a GETs
// export async function GET(request: Request) {
//   return NextResponse.json({ message: 'Este es el endpoint de análisis. Usa POST para enviar una consulta.' });
// }

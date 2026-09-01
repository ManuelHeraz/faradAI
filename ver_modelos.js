require('dotenv').config();

async function listarModelos() {
    console.log("Consultando modelos disponibles...");
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const req = await fetch(url);
        const data = await req.json();

        // Si no existe 'models', imprimimos toda la respuesta para ver el error real
        if (!data.models) {
            console.log("Respuesta de la API:", JSON.stringify(data, null, 2));
            return;
        }

        console.log("Modelos disponibles:");
        data.models.forEach(m => console.log(`- ${m.name} (Soporta: ${m.supportedGenerationMethods.join(', ')})`));
    } catch (error) {
        console.error("Error de red o ejecución:", error);
    }
}

listarModelos();
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listarModelos() {
    console.log("Consultando modelos disponibles...");
    try {
        // Obtenemos un modelo base temporal solo para autenticar la petición de lista
        const req = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await req.json();
        console.log("Modelos disponibles:");
        data.models.forEach(m => console.log(`- ${m.name} (${m.description})`));
    } catch (error) {
        console.error("Error al obtener la lista:", error);
    }
}

listarModelos();
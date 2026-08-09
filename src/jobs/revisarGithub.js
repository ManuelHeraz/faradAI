const cron = require('node-cron');
const model = require('../config/gemini');

const repositoriosGitHub = [
    { nombre: "Salmon", repo: "COMBINE-lab/salmon" },
    { nombre: "fastp", repo: "OpenGene/fastp" },
    { nombre: "FastQC", repo: "s-andrews/FastQC" },
    { nombre: "SRA-Tools (fastq-dump)", repo: "ncbi/sra-tools" },
    { nombre: "DESeq2", repo: "mikelove/DESeq2" },
    { nombre: "STAR", repo: "alexdobin/STAR" },
    { nombre: "HISAT2", repo: "DaehwanKimLab/hisat2" }
];

// Envolvemos la inicialización
function iniciarCronGithub(client) {
    
async function revisarActualizacionesGitHub(channelId) {
    if (channelId.includes("AQUI")) {
        console.log(`[AVISO] El canal de actualizaciones de software no está configurado.`);
        return;
    }

    const canal = await client.channels.fetch(channelId).catch(() => null);
    if (!canal) return console.error('No se encontró el canal de actualizaciones de software.');

    // Iteramos por cada herramienta de nuestro diccionario
    for (const herramienta of repositoriosGitHub) {
        const url = `https://api.github.com/repos/${herramienta.repo}/releases/latest`;

        try {
            // GitHub exige un User-Agent en las peticiones a su API
            const respuesta = await fetch(url, {
                headers: { 'User-Agent': 'FaradAI-Bioinfo-Bot' }
            });

            if (!respuesta.ok) continue; // Si no hay releases o falla la petición, saltamos

            const data = await respuesta.json();
            const version = data.tag_name;
            const notasRelease = data.body || "No se publicaron notas de la versión.";
            const link = data.html_url;

            // Lógica de tiempo: ¿Salió en los últimos 7 días?
            const fechaPublicacion = new Date(data.published_at);
            const hoy = new Date();
            const diasDiferencia = (hoy - fechaPublicacion) / (1000 * 60 * 60 * 24);

            if (diasDiferencia > 7) {
                // La versión es vieja, no hacemos spam
                continue;
            }

            // Si llegamos aquí, ES UNA ACTUALIZACIÓN NUEVA. Se la pasamos a Gemini.
            const promptEvaluacion = `
            Actúa como un arquitecto bioinformático. Acaba de salir la versión ${version} de la herramienta ${herramienta.nombre}.
            Toma las notas de la versión adjuntas y genera un reporte estructurado y técnico en español (regla 80/20) para un investigador.
            Estructura estrictamente así:
            **Resumen Ejecutivo:** (Explica en 2 líneas qué cambió globalmente).
            **Nuevos Beneficios:** (Destaca mejoras de rendimiento, uso de memoria, o parámetros útiles para RNA-Seq).
            **Riesgos (Breaking Changes):** (Advierte si cambiaron funciones o parámetros que podrían romper scripts antiguos. Si no hay, di "Sin riesgos aparentes").
            
            Notas de la versión originales:
            ${notasRelease.substring(0, 3000)} // Limitamos a 3000 caracteres para no ahogar los tokens
            `;

            const result = await model.generateContent(promptEvaluacion);
            const analisisIA = await result.response.text();

            const mensajeDiscord = `🚀 **Actualización Detectada: ${herramienta.nombre} (${version})**\n**Enlace:** ${link}\n\n${analisisIA}\n──────────────────────────`;

            // Manejo de fragmentación (chunks) por si el resumen es largo
            if (mensajeDiscord.length > 2000) {
                const chunks = mensajeDiscord.match(/[\s\S]{1,1950}(?!\S)/g) || [mensajeDiscord];
                for (const chunk of chunks) {
                    await canal.send(chunk);
                }
            } else {
                await canal.send(mensajeDiscord);
            }

        } catch (error) {
            console.error(`Error al revisar GitHub para ${herramienta.nombre}:`, error);
        }
    }
}

    cron.schedule('0 9 * * 1', () => {
        console.log('Iniciando escaneo semanal de repositorios de GitHub...');
        revisarActualizacionesGitHub('1529729016896950383'); 
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });
}

module.exports = iniciarCronGithub;
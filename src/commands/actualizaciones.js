const model = require('../config/gemini');

// Array de repositorios a monitorear
const repositoriosGitHub = [
    { nombre: "Salmon", repo: "COMBINE-lab/salmon" },
    { nombre: "fastp", repo: "OpenGene/fastp" },
    { nombre: "FastQC", repo: "s-andrews/FastQC" },
    { nombre: "SRA-Tools", repo: "ncbi/sra-tools" },
    { nombre: "DESeq2", repo: "mikelove/DESeq2" },
    { nombre: "STAR", repo: "alexdobin/STAR" },
    { nombre: "HISAT2", repo: "DaehwanKimLab/hisat2" }
];

module.exports = {
    data: {
        name: 'actualizaciones',
        description: 'Revisa el estado de las herramientas bioinformáticas.',
        options: [
            {
                name: 'herramienta',
                type: 3, // STRING
                description: 'Selecciona una herramienta para ver el detalle de su último parche',
                required: false,
                choices: [
                    { name: 'Salmon', value: 'Salmon' },
                    { name: 'fastp', value: 'fastp' },
                    { name: 'FastQC', value: 'FastQC' },
                    { name: 'SRA-Tools', value: 'SRA-Tools' },
                    { name: 'DESeq2', value: 'DESeq2' },
                    { name: 'STAR', value: 'STAR' },
                    { name: 'HISAT2', value: 'HISAT2' }
                ]
            }
        ]
    },
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const herramientaSeleccionada = interaction.options.getString('herramienta');

            // MODO 1: Escaneo Rápido (Sin seleccionar herramienta)
            if (!herramientaSeleccionada) {
                let actualizadas = [];
                
                for (const h of repositoriosGitHub) {
                    try {
                        const req = await fetch(`https://api.github.com/repos/${h.repo}/releases/latest`, {
                            headers: { 'User-Agent': 'FaradAI-Bioinfo-Bot' }
                        });
                        if (!req.ok) continue;
                        
                        const data = await req.json();
                        const dias = (new Date() - new Date(data.published_at)) / (1000 * 60 * 60 * 24);
                        
                        if (dias <= 7) actualizadas.push(h.nombre);
                    } catch (e) {
                        console.error(`Error al revisar ${h.nombre}:`, e);
                    }
                }

                if (actualizadas.length > 0) {
                    await interaction.editReply(`🔔 **Actualizaciones detectadas (últimos 7 días):** ${actualizadas.join(', ')}.\nUsa \`/actualizaciones herramienta:[Nombre]\` para ver los detalles.`);
                } else {
                    await interaction.editReply('✅ Todo tu ecosistema está al día. No hay actualizaciones en la última semana.');
                }
                return; 
            }

            // MODO 2: Detalle con Gemini (Herramienta seleccionada del menú)
            const herramienta = repositoriosGitHub.find(x => x.nombre === herramientaSeleccionada);
            
            const req = await fetch(`https://api.github.com/repos/${herramienta.repo}/releases/latest`, {
                headers: { 'User-Agent': 'FaradAI-Bioinfo-Bot' }
            });

            if (!req.ok) {
                return interaction.editReply(`No pude obtener los datos de ${herramienta.nombre}. Es posible que el repositorio no tenga releases públicos habilitados.`);
            }

            const data = await req.json();
            const version = data.tag_name;
            const notasRelease = data.body || "Sin notas.";
            const link = data.html_url;

            const promptEvaluacion = `
            Actúa como un arquitecto bioinformático. Acaba de salir la versión ${version} de la herramienta ${herramienta.nombre}.
            Genera un reporte estructurado y técnico en español (regla 80/20) para un investigador.
            Estructura estrictamente así:
            **Resumen Ejecutivo:** (Qué cambió globalmente).
            **Nuevos Beneficios:** (Mejoras de rendimiento o parámetros útiles para RNA-Seq).
            **Riesgos (Breaking Changes):** (Advierte si cambiaron funciones. Si no hay, di "Sin riesgos aparentes").
            
            Notas de la versión originales:
            ${notasRelease.substring(0, 3000)}
            `;

            const result = await model.generateContent(promptEvaluacion);
            const analisisIA = result.response.text();

            const mensajeDiscord = `🚀 **Reporte de Versión: ${herramienta.nombre} (${version})**\n**Enlace:** ${link}\n\n${analisisIA}`;

            if (mensajeDiscord.length > 2000) {
                const chunks = mensajeDiscord.match(/[\s\S]{1,1950}(?!\S)/g) || [mensajeDiscord];
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp(chunks[i]);
                }
            } else {
                await interaction.editReply(mensajeDiscord);
            }

        } catch (error) {
            console.error('Error en /actualizaciones detalle:', error);
            if (interaction.deferred) {
                await interaction.editReply('Ocurrió un error al consultar GitHub o procesar con Gemini.');
            }
        }
    }
};
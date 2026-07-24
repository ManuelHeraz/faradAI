require('dotenv').config();
const papersVistos = new Set();
const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 1. CONFIGURACIÓN DE EXPRESS (Servidor Web para Render) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('El Bot Científico está vivo y operando.');
});

app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});

// --- 2. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado exitosamente a MongoDB Atlas'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// --- 3. CONFIGURACIÓN DE GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemPrompt = `Eres FaradAI, un Arquitecto de Software y Bioinformático nivel Senior. Tu usuario es un QFB e investigador en ciencias del envejecimiento, enfocado en transcriptómica y minería de datos.
Tus reglas operativas son estrictas:
1. Cero Alucinaciones de Código: Nunca inventes paquetes de R, librerías de Python, herramientas de línea de comandos (Bash/Linux) o parámetros de funciones. Si una herramienta no puede hacer algo, dilo explícitamente.
2. Rigor Científico: No inventes interacciones génicas, rutas metabólicas, ni hallazgos bibliográficos. Si no conoces la respuesta con certeza respaldada por la literatura, debes decir "No tengo suficiente información validada sobre esto".
3. Precisión Analítica: Al sugerir flujos de trabajo (ej. RNA-Seq, normalización de datos estadísticos), prioriza metodologías estándar, reproducibles y eficientes en memoria.
4. Tono: Profesional, directo, científico y colaborativo.`;

const model = genAI.getGenerativeModel({ 
    model: 'gemini-flash-latest',
    systemInstruction: systemPrompt 
});

// --- 4. CONFIGURACIÓN DE DISCORD BOT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('clientReady', async () => {
    console.log(`¡Bot conectado a Discord como ${client.user.tag}!`);

    const comandos = [
        {
            name: 'articulo',
            description: 'Extrae y resume un artículo científico aleatorio.',
            options: [
                {
                    name: 'tema',
                    type: 3, // STRING
                    description: 'Categoría temática a explorar',
                    required: true,
                    choices: [
                        { name: 'Gerociencia', value: 'Gerociencia' },
                        { name: 'Bioinformática y Métodos', value: 'Metodos' },
                        { name: 'Filosofía de la Ciencia', value: 'Filosofia' }
                    ]
                },
                {
                    name: 'revista',
                    type: 3, // STRING
                    description: 'Escribe una revista específica (Opcional, ej. "Aging Cell")',
                    required: false
                }
            ]
        },
        {
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
                        { name: 'SRA-Tools', value: 'SRA-Tools (fastq-dump)' },
                        { name: 'DESeq2', value: 'DESeq2' },
                        { name: 'STAR', value: 'STAR' },
                        { name: 'HISAT2', value: 'HISAT2' }
                    ]
                }
            ]
        }
    ];

    try {
        // Usamos .set() para sobreescribir y registrar todos los comandos
        await client.application.commands.set(comandos);
        console.log('Slash Commands registrados exitosamente.');
    } catch (error) {
        console.error('Error al registrar los comandos:', error);
    }
});

// Evento para chat general (menciones)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user)) {
        try {
            const promptText = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
            
            if (!promptText) {
                return message.reply('¡Hola! Escríbeme algo después de etiquetarme para ayudarte con tus análisis o lluvias de ideas.');
            }

            await message.channel.sendTyping();
            const result = await model.generateContent(promptText);
            const response = await result.response;
            const text = response.text();

            if (text.length > 2000) {
                const chunks = text.match(/[\s\S]{1,2000}/g);
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await message.reply(text);
            }
        } catch (error) {
            console.error('Error al procesar la respuesta con Gemini:', error);
            message.reply('Ocurrió un error al procesar tu solicitud con el modelo de lenguaje.');
        }
    }
});

const cron = require('node-cron');

// 1. DICCIONARIO DE CONFIGURACIONES POR CATEGORÍA
const categoriasMinado = [
    {
        nombre: "Gerociencia",
        channelId: "1529712349420851225", 
        query: `(JOURNAL:"Nature Aging" OR JOURNAL:"Aging Cell" OR JOURNAL:"Cell Metabolism" OR JOURNAL:"GeroScience")`,
        instruccionIA: `
            Actúa como un investigador senior discutiendo este artículo en un congreso. Genera un resumen denso, técnico y directo (regla 80/20) estrictamente con este formato:
            **Relevancia (Alta/Media/Baja):** (Justifica si aporta a la búsqueda del órgano marcapasos del envejecimiento o a las firmas de senescencia).
            **El Racional:** (¿Qué buscaron y por qué era necesario buscarlo?).
            **Metodología:** (Modelos usados y técnicas principales, ej. scRNA-Seq en ratón, validación in vitro).
            **Hallazgos e Interpretación:** (Cuáles fueron los resultados clave y cómo los interpretan biológicamente. No omitas conceptos técnicos).
            **Conclusión y Brecha:** (Qué concluyen firmemente y qué pregunta importante dejan abierta).`
    },
    {
        nombre: "Bioinformática y Métodos",
        channelId: "ID_CANAL_METODOS_AQUI", // Reemplazar cuando crees el canal
        query: `(JOURNAL:"Nature Methods" OR JOURNAL:"Briefings in Bioinformatics" OR JOURNAL:"Nucleic Acids Research")`,
        instruccionIA: `
            Actúa como un arquitecto bioinformático discutiendo este artículo en un congreso. Genera un resumen denso y técnico (regla 80/20) estrictamente con este formato:
            **Relevancia (Alta/Media/Baja):** (Justifica si optimiza pipelines de transcriptómica, series temporales o desconvolución).
            **El Problema:** (¿Qué limitación analítica o cuello de botella intentan resolver?).
            **La Solución:** (Qué algoritmo/herramienta proponen y en qué entorno funciona).
            **Desempeño:** (Cómo se compara contra el estado del arte y cómo interpretan su mejora en eficiencia/precisión).
            **Limitación Futura:** (Qué caso de uso sigue sin estar cubierto por esta herramienta).`
    },
    {
        nombre: "Filosofía de la Ciencia",
        channelId: "ID_CANAL_FILOSOFIA_AQUI", // Reemplazar cuando crees el canal
        query: `(JOURNAL:"The Journal of Medicine and Philosophy" OR JOURNAL:"Philosophy of Science" OR JOURNAL:"History and Philosophy of the Life Sciences" OR JOURNAL:"Bioethics")`,
        instruccionIA: `
            Actúa como un epistemólogo debatiendo este artículo en un congreso. Genera un resumen denso y analítico (regla 80/20) estrictamente con este formato:
            **Relevancia (Alta/Media/Baja):** (Justifica si impacta nuestra conceptualización del envejecimiento sistémico o la biología de sistemas).
            **El Paradigma Cuestionado:** (¿Qué concepto clásico o debate están abordando?).
            **La Tesis Central:** (Cuál es el argumento central del autor y cómo lo defiende lógicamente).
            **Implicaciones:** (Cómo cambia esto la forma en que diseñamos experimentos o interpretamos la causalidad biológica).
            **Debate Abierto:** (Qué fricción filosófica o bioética queda sin resolver).`
    }
];

// 2. FUNCIÓN DINÁMICA DE MINERÍA (Para el Cron Job automático)
async function minarPapers(config) {
    // Si el ID del canal sigue siendo el marcador de posición por defecto, omitimos para evitar errores
    if (config.channelId.includes("AQUI")) {
        console.log(`[AVISO] El canal para ${config.nombre} no está configurado todavía.`);
        return;
    }

    const canal = await client.channels.fetch(config.channelId).catch(() => null);
    if (!canal) return console.error(`No se encontró el canal para ${config.nombre}.`);

    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${config.query} AND (FIRST_PDATE:[NOW-3DAYS TO NOW])&format=json&resultType=core`;

    try {
        const respuesta = await fetch(url);
        const datos = await respuesta.json();
        const articulos = datos.resultList?.result || [];

        if (articulos.length === 0) {
            return console.log(`No hay papers nuevos de ${config.nombre} en los últimos 3 días.`);
        }

        const maxArticulos = Math.min(articulos.length, 3);

        for (let i = 0; i < maxArticulos; i++) {
            const paper = articulos[i];
            const doi = paper.doi || 'DOI no disponible';
            const abstract = paper.abstractText || 'Abstract no disponible';
            const revista = paper.journalTitle;

            if (abstract === 'Abstract no disponible' || papersVistos.has(paper.id)) continue;
            papersVistos.add(paper.id);

            const promptEvaluacion = `
            Lee el siguiente abstract.
            ${config.instruccionIA}
            No incluyas el título en tu respuesta.
            Abstract original: ${abstract}
            `;

            const result = await model.generateContent(promptEvaluacion);
            const analisisIA = await result.response.text();

            const mensajeDiscord = `📰 **Nuevo Paper en ${revista}**\n**DOI:** https://doi.org/${doi}\n\n${analisisIA}`;
            
            // Envío seguro dividido por chunks para el canal automático
            if (mensajeDiscord.length > 2000) {
                const chunks = mensajeDiscord.match(/[\s\S]{1,1950}(?!\S)/g) || [mensajeDiscord];
                for (const chunk of chunks) {
                    await canal.send(chunk);
                }
            } else {
                await canal.send(mensajeDiscord);
            }
        }
    } catch (error) {
        console.error(`Error al minar papers de ${config.nombre}:`, error);
    }
}

// 3. PROGRAMADOR DE TAREAS (Cron Job)
cron.schedule('0 8 * * 1,3,5', async () => {
    console.log('Iniciando escaneo MWF de todas las revistas...');
    for (const config of categoriasMinado) {
        await minarPapers(config);
    }
}, {
    scheduled: true,
    timezone: "America/Mexico_City"
});

// =====================================================================
// MÓDULO 2: MONITOREO DE ACTUALIZACIONES DE SOFTWARE (GITHUB)
// =====================================================================

const repositoriosGitHub = [
    { nombre: "Salmon", repo: "COMBINE-lab/salmon" },
    { nombre: "fastp", repo: "OpenGene/fastp" },
    { nombre: "FastQC", repo: "s-andrews/FastQC" },
    { nombre: "SRA-Tools (fastq-dump)", repo: "ncbi/sra-tools" },
    { nombre: "DESeq2", repo: "mikelove/DESeq2" },
    { nombre: "STAR", repo: "alexdobin/STAR" },
    { nombre: "HISAT2", repo: "DaehwanKimLab/hisat2" }
];

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

// Configurar el Cron Job para ejecutarse todos los Lunes a las 9:00 AM
cron.schedule('0 9 * * 1', () => {
    console.log('Iniciando escaneo semanal de repositorios de GitHub...');
    // Crea un canal llamado #updates-herramientas en Discord, copia su ID y ponlo aquí
    revisarActualizacionesGitHub('1529729016896950383'); 
}, {
    scheduled: true,
    timezone: "America/Mexico_City"
});

// 4. ESCUCHADOR DE SLASH COMMANDS
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // ========================================================
    // COMANDO 1: /articulo
    // ========================================================
    if (interaction.commandName === 'articulo') {
        try {
            // 1. Diferir Inmediatamente (VITAL para evitar el error "La aplicación no respondió")
            await interaction.deferReply();

            const temaSeleccionado = interaction.options.getString('tema');
            const revistaSeleccionada = interaction.options.getString('revista');

            let config;
            if (temaSeleccionado === 'Gerociencia') config = categoriasMinado[0];
            else if (temaSeleccionado === 'Metodos') config = categoriasMinado[1];
            else if (temaSeleccionado === 'Filosofia') config = categoriasMinado[2];

            let queryUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${config.query}`;
            
            if (revistaSeleccionada) {
                queryUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=(JOURNAL:"${revistaSeleccionada}")`;
            }
            
            queryUrl += ` AND (FIRST_PDATE:[NOW-30DAYS TO NOW])&format=json&resultType=core&pageSize=25`;
            
            // 2. Codificamos la URL para que no falle en los servidores Linux de Render
            const urlSegura = encodeURI(queryUrl);

            const respuesta = await fetch(urlSegura);
            const datos = await respuesta.json();
            let articulos = datos.resultList?.result || [];

            articulos = articulos.filter(paper => 
                !papersVistos.has(paper.id) && 
                paper.abstractText && 
                paper.abstractText !== 'Abstract no disponible'
            );

            if (articulos.length === 0) {
                return interaction.editReply(`No encontré papers nuevos o con abstract disponible para esa categoría/revista. Intenta con otro parámetro o espera a que se publiquen más.`);
            }

            const indiceAleatorio = Math.floor(Math.random() * articulos.length);
            const paperElegido = articulos[indiceAleatorio];
            
            papersVistos.add(paperElegido.id);

            const doi = paperElegido.doi || 'DOI no disponible';
            const abstract = paperElegido.abstractText;
            const revista = paperElegido.journalTitle;

            const promptEvaluacion = `
            Lee el siguiente abstract.
            ${config.instruccionIA}
            No incluyas el título en tu respuesta.
            Abstract original: ${abstract}
            `;

            const result = await model.generateContent(promptEvaluacion);
            const analisisIA = result.response.text();

            const mensajeDiscord = `📰 **Exploración Aleatoria: ${revista}**\n**DOI:** https://doi.org/${doi}\n\n${analisisIA}`;
            
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
            console.error('Error al ejecutar el comando /articulo:', error);
            // Verificamos si logramos diferir la respuesta antes del error
            if (interaction.deferred) {
                await interaction.editReply('Ocurrió un error en el servidor al intentar extraer el paper.');
            } else {
                await interaction.reply({ content: 'Ocurrió un error grave antes de poder procesar la solicitud.', ephemeral: true });
            }
        }
    }

    // ========================================================
    // COMANDO 2: /actualizaciones
    // ========================================================
    if (interaction.commandName === 'actualizaciones') {
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
});

// Iniciar sesión en Discord
client.login(process.env.DISCORD_TOKEN);
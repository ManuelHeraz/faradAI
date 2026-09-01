const cron = require('node-cron');
const model = require('../config/gemini');
const { papersVistos } = require('../config/shared');

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
        channelId: "1529712349420851226", 
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
        channelId: "1529712349420851227", 
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

function iniciarCronPapers(client) {
    
    async function minarPapers(config) {
        if (config.channelId.includes("AQUI")) {
            console.log(`[AVISO] El canal para ${config.nombre} no está configurado todavía.`);
            return;
        }

        const canal = await client.channels.fetch(config.channelId).catch(() => null);
        if (!canal) return console.error(`No se encontró el canal para ${config.nombre}.`);

        const url = encodeURI(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${config.query} AND (FIRST_PDATE:[NOW-3DAYS TO NOW])&format=json&resultType=core`);

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
                const analisisIA = result.response.text();

                const mensajeDiscord = `📰 **Nuevo Paper en ${revista}**\n**DOI:** https://doi.org/${doi}\n\n${analisisIA}`;
                
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

    cron.schedule('0 8 * * 1,3,5', async () => {
        console.log('Iniciando escaneo MWF de todas las revistas...');
        for (const config of categoriasMinado) {
            await minarPapers(config);
        }
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });
}

module.exports = iniciarCronPapers;
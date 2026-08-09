const model = require('../config/gemini');
const { papersVistos } = require('../config/shared');

// El diccionario local para el comando
const categoriasMinado = [
    {
        nombre: "Gerociencia",
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

module.exports = {
    data: {
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
    
    async execute(interaction) {
        try {
            // 1. Diferir Inmediatamente
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
            if (interaction.deferred) {
                await interaction.editReply('Ocurrió un error en el servidor al intentar extraer el paper.');
            } else {
                await interaction.reply({ content: 'Ocurrió un error grave antes de poder procesar la solicitud.', ephemeral: true });
            }
        }
    }
};
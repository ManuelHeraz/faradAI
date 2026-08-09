const model = require('../config/gemini');

module.exports = {
    data: {
        name: 'radar',
        description: 'Nowcasting de 60 minutos. Ventanas de escape y recomendaciones de vestimenta.',
        options: [
            {
                name: 'codigo_postal',
                type: 3, // STRING
                description: 'Código postal (Ej. 14370 para la zona de Cinvestav Sur)',
                required: true
            }
        ]
    },
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const cp = interaction.options.getString('codigo_postal');
            const apiKey = process.env.TOMORROW_API_KEY;

            if (!apiKey) {
                return interaction.editReply('❌ Falta la llave TOMORROW_API_KEY en el archivo .env');
            }

            // Llamada a la API de Tomorrow.io
            const url = `https://api.tomorrow.io/v4/weather/forecast?location=${cp}%20Mexico&timesteps=1m&units=metric&apikey=${apiKey}`;
            
            const respuesta = await fetch(url);
            if (!respuesta.ok) {
                return interaction.editReply('❌ No pude acceder al radar Doppler de Tomorrow.io. Verifica el código postal o tu API Key.');
            }

            const data = await respuesta.json();
            const minutely = data.timelines?.minutely;

            if (!minutely || minutely.length === 0) {
                return interaction.editReply('❌ El radar no reporta datos minuto a minuto para esta ubicación en este momento.');
            }

            // 1. EXTRAER CONDICIONES BASE (Del minuto cero)
            const condicionesActuales = minutely[0].values;
            const temp = condicionesActuales.temperature || 0;
            const feelsLike = condicionesActuales.temperatureApparent || temp;
            const uv = condicionesActuales.uvIndex || 0;
            const cloudCover = condicionesActuales.cloudCover || 0;
            const wind = (condicionesActuales.windSpeed || 0) * 3.6; // Convertimos m/s a km/h

            let reporteCrudo = `Radar Doppler hiperlocal (60 min) - Sector ${cp}\n`;
            reporteCrudo += `[CONDICIONES BASE] Temp: ${temp.toFixed(1)}°C (Sensación: ${feelsLike.toFixed(1)}°C) | Índice UV: ${uv} | Nubes: ${cloudCover}% | Viento: ${wind.toFixed(1)} km/h\n\n`;
            reporteCrudo += `--- RASTREO DE PRECIPITACIÓN ---\n`;

            // 2. CONDENSAR LA TELEMETRÍA DE LLUVIA (En bloques de 5 min)
            let lluviaDetectada = false;

            for (let i = 0; i < minutely.length; i += 5) {
                const bloque = minutely.slice(i, i + 5);
                
                // Promedio de lluvia en el bloque
                const promedioLluvia = bloque.reduce((acc, curr) => acc + (curr.values.precipitationIntensity || 0), 0) / bloque.length;
                
                const fecha = new Date(bloque[0].time);
                // Convertimos la hora UTC a hora local de CDMX
                const horaLocal = fecha.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
                
                reporteCrudo += `[${horaLocal}] Lluvia: ${promedioLluvia.toFixed(2)} mm/h\n`;
                
                if (promedioLluvia > 0) lluviaDetectada = true;
            }

            // 3. EL CEREBRO DEL RADAR (El Prompt con lógica de vestimenta y ventanas)
            const promptRadar = `
            Eres FaradAI, analizando el radar Doppler hiperlocal para los próximos 60 minutos.
            El usuario está intentando trasladarse. Tu objetivo es encontrar "ventanas de escape" de lluvia y emitir recomendaciones tácticas de vestimenta basadas en el clima general.
            
            REGLAS DE RECOMENDACIÓN (Aplica solo las necesarias):
            - Si UV >= 6: Recomienda gorra, gafas y bloqueador solar.
            - Si Sensación térmica > 26°C: Ropa ligera y llevar agua para el traslado.
            - Si Sensación térmica < 15°C: Ropa abrigadora / chamarra.
            - Si Viento > 25 km/h: Advertir que usar paraguas será difícil, mejor impermeable.
            
            REGLAS DE LLUVIA (Ventanas de escape):
            - 0.00 mm/h = Ventana ideal. Seguro para salir sin ropa de lluvia.
            - 0.1 a 2.5 mm/h = Llovizna. Ventana viable, requiere paraguas o rompevientos impermeable.
            - > 2.5 mm/h = Lluvia fuerte. Requiere botas de lluvia, impermeable completo y paraguas. Sugerir resguardarse.
            
            INSTRUCCIÓN FINAL:
            ${!lluviaDetectada 
                ? "No hay lluvia en los próximos 60 minutos. Confírmale que el radar está limpio para moverse y enfócate únicamente en darle las recomendaciones de vestimenta/protección por el sol, temperatura o viento." 
                : "Se detectó lluvia. Identifica y menciona explícitamente los horarios de las 'ventanas de escape' (donde baje a 0 o llovizna muy ligera). Luego, dale las recomendaciones completas de vestimenta y accesorios (botas, paraguas, ropa) tomando en cuenta también el sol/calor de las 'condiciones base'."
            }

            Sé directo, útil y estructurado. Nada de saludos robóticos ni datos técnicos aburridos.

            TELEMETRÍA CRUDA:
            ${reporteCrudo}
            `;

            // 4. GENERAR EL INFORME CON GEMINI
            const result = await model.generateContent(promptRadar);
            const analisisRadar = result.response.text();

            const mensajeDiscord = `🛰️ **Radar de Escape (60 min) - Sector ${cp}**\n\n${analisisRadar}`;

            await interaction.editReply(mensajeDiscord);

        } catch (error) {
            console.error('Error en el comando /radar:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ Falló la conexión con el satélite Doppler.');
            }
        }
    }
};
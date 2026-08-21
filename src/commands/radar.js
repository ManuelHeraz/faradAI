const model = require('../config/gemini');

module.exports = {
    data: {
        name: 'radar',
        description: 'Nowcasting de 60 minutos. Ventanas de escape y recomendaciones de vestimenta.',
        options: [
            {
                name: 'ubicacion',
                type: 3, // STRING
                description: 'Coordenadas (Ej: 19.28,-99.13) o Código Postal',
                required: true
            }
        ]
    },
    
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const ubicacion = interaction.options.getString('ubicacion');
            const apiKey = process.env.TOMORROW_API_KEY;

            if (!apiKey) {
                return interaction.editReply('❌ Falta la llave TOMORROW_API_KEY en el archivo .env');
            }

            // LÓGICA DE GEOLOCALIZACIÓN: Si tiene una coma, asumimos que son coordenadas exactas.
            // Si no tiene coma, asumimos que es CP y forzamos "CDMX, Mexico" para evitar que la API se pierda.
            let queryLocation = ubicacion;
            if (!ubicacion.includes(',')) {
                queryLocation = `${ubicacion}, CDMX, Mexico`;
            }

            // Codificamos la URL para evitar errores con espacios o comas
            const url = `https://api.tomorrow.io/v4/weather/forecast?location=${encodeURIComponent(queryLocation)}&timesteps=1m&units=metric&apikey=${apiKey}`;
            
            const respuesta = await fetch(url);
            if (!respuesta.ok) {
                return interaction.editReply('❌ No pude acceder al radar Doppler. Verifica las coordenadas o tu API Key.');
            }

            const data = await respuesta.json();
            const minutely = data.timelines?.minutely;

            if (!minutely || minutely.length === 0) {
                return interaction.editReply('❌ El radar no reporta datos minuto a minuto para esta ubicación.');
            }

            // 1. EXTRAER CONDICIONES BASE
            const condicionesActuales = minutely[0].values;
            const temp = condicionesActuales.temperature || 0;
            const feelsLike = condicionesActuales.temperatureApparent || temp;
            const uv = condicionesActuales.uvIndex || 0;
            const cloudCover = condicionesActuales.cloudCover || 0;
            const wind = (condicionesActuales.windSpeed || 0) * 3.6; 

            // Extraemos la probabilidad de precipitación (para detectar nubes de tormenta antes de que llueva)
            const precipProb = condicionesActuales.precipitationProbability || 0;

            let reporteCrudo = `Radar Doppler hiperlocal (60 min) - Coordenadas/Sector: ${ubicacion}\n`;
            reporteCrudo += `[CONDICIONES BASE] Temp: ${temp.toFixed(1)}°C (Sensación: ${feelsLike.toFixed(1)}°C) | UV: ${uv} | Nubes: ${cloudCover}% | Viento: ${wind.toFixed(1)} km/h | Probabilidad de tormenta/lluvia actual: ${precipProb}%\n\n`;
            reporteCrudo += `--- RASTREO DE PRECIPITACIÓN (Intensidad en mm/h) ---\n`;

            // 2. CONDENSAR LA TELEMETRÍA DE LLUVIA
            let lluviaDetectada = false;

            for (let i = 0; i < minutely.length; i += 5) {
                const bloque = minutely.slice(i, i + 5);
                const promedioLluvia = bloque.reduce((acc, curr) => acc + (curr.values.precipitationIntensity || 0), 0) / bloque.length;
                
                const fecha = new Date(bloque[0].time);
                const horaLocal = fecha.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
                
                reporteCrudo += `[${horaLocal}] Lluvia: ${promedioLluvia.toFixed(2)} mm/h\n`;
                if (promedioLluvia > 0) lluviaDetectada = true;
            }

            // 3. EL CEREBRO DEL RADAR
            const promptRadar = `
            Eres FaradAI, analizando el radar Doppler hiperlocal para los próximos 60 minutos.
            El usuario está intentando trasladarse o salir de su edificio. Tu objetivo es encontrar "ventanas de escape" de lluvia y emitir recomendaciones tácticas de vestimenta.
            
            REGLAS DE RECOMENDACIÓN (Aplica solo las necesarias):
            - Si UV >= 6: Recomienda gorra, gafas y bloqueador solar.
            - Si Sensación térmica > 26°C: Ropa ligera y llevar agua.
            - Si Sensación térmica < 15°C: Ropa abrigadora.
            - Si Viento > 25 km/h: Sugerir impermeable en vez de paraguas.
            - Si Probabilidad de tormenta/lluvia actual > 40% y la lluvia marca 0.00: Advierte que hay nubes convectivas formándose y que los truenos son un indicador de tormenta inminente, incluso si el radar aún no marca agua.
            
            REGLAS DE LLUVIA (Ventanas de escape):
            - 0.00 mm/h = Ventana ideal.
            - 0.1 a 2.5 mm/h = Llovizna. Ventana viable, requiere paraguas.
            - > 2.5 mm/h = Lluvia fuerte. Requiere botas, impermeable y paraguas. Sugerir resguardarse.
            
            INSTRUCCIÓN FINAL:
            ${!lluviaDetectada 
                ? "Si la probabilidad de tormenta es alta pero la lluvia marca 0, advierte sobre el posible retraso del radar. Si ambos son 0, confírmale que está libre de lluvia y dale recomendaciones de vestimenta base." 
                : "Identifica los horarios de las 'ventanas de escape'. Luego, dale las recomendaciones de vestimenta y accesorios tomando en cuenta las condiciones base."
            }

            TELEMETRÍA CRUDA:
            ${reporteCrudo}
            `;

            // 4. GENERAR EL INFORME CON GEMINI (Con sistema de reintentos anti-503)
            let result;
            let reintentos = 0;
            const maxReintentos = 3;

            while (reintentos < maxReintentos) {
                try {
                    result = await model.generateContent(promptRadar);
                    break; // Si responde bien, rompemos el bucle y continuamos
                } catch (errorGemini) {
                    // Si el error es 503 (saturación) y aún nos quedan intentos
                    if (errorGemini.status === 503 && reintentos < maxReintentos - 1) {
                        reintentos++;
                        console.log(`[Alerta] Servidores de Gemini saturados (503). Reintentando en 3 segundos... (Intento ${reintentos}/${maxReintentos})`);
                        // Hacemos que el bot "duerma" 3 segundos antes de volver a intentar
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        // Si es otro tipo de error grave o se acabaron los intentos, lanzamos el error al catch principal
                        throw errorGemini;
                    }
                }
            }

            const analisisRadar = result.response.text();

            const mensajeDiscord = `🛰️ **Radar de Escape (60 min)**\n\n${analisisRadar}`;
            await interaction.editReply(mensajeDiscord);

        } catch (error) {
            console.error('Error en el comando /radar:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ Falló la conexión con el satélite Doppler.');
            }
        }
    }
};
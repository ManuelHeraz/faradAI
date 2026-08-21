const model = require('../config/gemini');

module.exports = {
    data: {
        name: 'clima',
        description: 'Reporte meteorológico integral para la toma de decisiones diarias.',
        options: [
            {
                name: 'modalidad',
                type: 3, // STRING
                description: 'Elige la ventana de tiempo para la telemetría.',
                required: true,
                choices: [
                    { name: 'Radar Inmediato (Próximas 12 horas)', value: 'realtime' },
                    { name: 'Pronóstico Estratégico (Próximas 48 horas)', value: 'forecast' }
                ]
            },
            {
                name: 'codigo_postal',
                type: 3, // STRING
                description: 'Código postal (Ej. 16038)',
                required: true
            }
        ]
    },
    
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const modalidad = interaction.options.getString('modalidad');
            const cp = interaction.options.getString('codigo_postal');
            const apiKey = process.env.WEATHER_API_KEY;
            
            const url = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${cp}, Mexico&days=3&aqi=no&alerts=yes&lang=es`;
            
            const respuesta = await fetch(url);
            if (!respuesta.ok) {
                return interaction.editReply('❌ No pude establecer conexión con la telemetría meteorológica. Verifica el código postal.');
            }
            
            const weatherData = await respuesta.json();

            // 1. CONDENSAR LA TELEMETRÍA
            let reporteCrudo = `Ubicación detectada: ${weatherData.location.name}, ${weatherData.location.region}\n`;
            reporteCrudo += `Condiciones Actuales: Temp ${weatherData.current.temp_c}°C (Sensación: ${weatherData.current.feelslike_c}°C), ${weatherData.current.condition.text}. Lluvia: ${weatherData.current.precip_mm} mm/h. Viento: ${weatherData.current.wind_kph} kph. Índice UV: ${weatherData.current.uv}.\n\n`;

            const horasAAnalizar = modalidad === 'realtime' ? 12 : 48;
            let horasContadas = 0;
            const horaActualEpoch = weatherData.location.localtime_epoch;

            reporteCrudo += `--- TELEMETRÍA DE LAS PRÓXIMAS ${horasAAnalizar} HORAS ---\n`;
            
            for (const dia of weatherData.forecast.forecastday) {
                for (const hora of dia.hour) {
                    if (hora.time_epoch >= horaActualEpoch && horasContadas < horasAAnalizar) {
                        reporteCrudo += `[${hora.time.split(' ')[1]}] Temp: ${hora.temp_c}°C (Sensación: ${hora.feelslike_c}°C) | Lluvia: ${hora.precip_mm} mm/h | Viento: ${hora.wind_kph} kph | UV: ${hora.uv}\n`;
                        horasContadas++;
                    }
                }
            }

            // 2. EL CEREBRO DEL ASISTENTE
            let instruccionEstrategica = "";
            if (modalidad === 'realtime') {
                instruccionEstrategica = `
                El usuario necesita un "Nowcast" práctico. Analiza la telemetría hora por hora.
                Dale recomendaciones directas: si debe esperar a que pase la lluvia o baje el sol extremo para salir, si basta con un paraguas, si el sol/calor hará que el traslado sea sofocante, o si es una ventana de tiempo fresca y segura para salir a pasear a Gala.`;
            } else {
                instruccionEstrategica = `
                El usuario necesita el pronóstico estratégico de 48 horas para planificar sus días.
                Destaca las temperaturas máximas (y su sensación térmica) y mínimas con sus horarios exactos de aparición.
                Menciona si hay ventanas de tormentas, mucho sol (UV alto) o viento pesado para que el usuario planifique sus traslados rumbo a Cinvestav Sede Sur o cualquier actividad prolongada en el exterior.`;
            }

            const promptClima = `
            Eres FaradAI, el asistente meteorológico personal y altamente analítico del usuario. Has recibido la siguiente telemetría meteorológica cruda del radar.
            Tu objetivo es procesarla y darle un reporte directo, claro y orientado a la toma de decisiones diarias.
            
            Reglas para tus recomendaciones:
            - Lluvia 0.1 a 2.5 mm/h = Llovizna ligera. Bastará con rompevientos o paraguas.
            - Lluvia > 2.5 mm/h = Lluvia moderada a fuerte. Requiere paraguas, calzado impermeable y precaución.
            - Índice UV 6 a 10+ = Sol intenso/extremo. Recomienda usar bloqueador, gafas, o advertir que el traslado se sentirá pesado por el sol directo.
            - Sensación Térmica > 28°C = Traslado caluroso y sofocante.
            - Viento > 25 kph = Viento moderado a fuerte, menciónalo si es relevante.

            ${instruccionEstrategica}

            Mantén un tono profesional, útil y conversacional. No incluyas información técnica excesiva, ve al punto.
            
            TELEMETRÍA CRUDA:
            ${reporteCrudo}
            `;

            // 3. GENERAR EL INFORME CON GEMINI (Blindado con sistema de reintentos)
            let result;
            let reintentos = 0;
            const maxReintentos = 3;

            while (reintentos < maxReintentos) {
                try {
                    result = await model.generateContent(promptClima);
                    break; // Si hay éxito, rompemos el bucle
                } catch (errorGemini) {
                    if (errorGemini.status === 503 && reintentos < maxReintentos - 1) {
                        reintentos++;
                        console.log(`[Alerta] Servidores de Gemini saturados (503). Reintentando en 3 segundos... (Intento ${reintentos}/${maxReintentos})`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        throw errorGemini; // Lanza el error al catch principal si es otro código o se acabaron los intentos
                    }
                }
            }

            const analisisClima = result.response.text();

            const mensajeDiscord = `☁️ **Reporte Meteorológico - Sector ${cp}**\n\n${analisisClima}`;

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
            console.error('Error en el comando /clima:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ No se pudo procesar la telemetría del clima o los servidores de IA no respondieron.');
            }
        }
    }
};
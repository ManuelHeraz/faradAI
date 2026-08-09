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
            
            // Usamos "CP, Mexico" para asegurar que WeatherAPI no se confunda con otros países
            const url = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${cp}, Mexico&days=3&aqi=no&alerts=yes&lang=es`;
            
            const respuesta = await fetch(url);
            if (!respuesta.ok) {
                return interaction.editReply('❌ No pude establecer conexión con la telemetría meteorológica. Verifica el código postal.');
            }
            
            const weatherData = await respuesta.json();

            // 1. CONDENSAR LA TELEMETRÍA (Para no ahogar a Gemini con datos inútiles)
            let reporteCrudo = `Ubicación detectada: ${weatherData.location.name}, ${weatherData.location.region}\n`;
            reporteCrudo += `Condiciones Actuales: ${weatherData.current.temp_c}°C, ${weatherData.current.condition.text}. Lluvia: ${weatherData.current.precip_mm} mm/h. Viento: ${weatherData.current.wind_kph} kph.\n\n`;

            const horasAAnalizar = modalidad === 'realtime' ? 12 : 48;
            let horasContadas = 0;
            const horaActualEpoch = weatherData.location.localtime_epoch;

            reporteCrudo += `--- TELEMETRÍA DE LAS PRÓXIMAS ${horasAAnalizar} HORAS ---\n`;
            
            // Extraemos solo el futuro de los arrays de días
            for (const dia of weatherData.forecast.forecastday) {
                for (const hora of dia.hour) {
                    if (hora.time_epoch >= horaActualEpoch && horasContadas < horasAAnalizar) {
                        reporteCrudo += `[${hora.time.split(' ')[1]}] Temp: ${hora.temp_c}°C | Lluvia: ${hora.precip_mm} mm/h (Prob: ${hora.chance_of_rain}%) | Truenos: Prob ${hora.chance_of_snow}%\n`;
                        horasContadas++;
                    }
                }
            }

            // 2. EL CEREBRO DEL ASISTENTE (El Prompt adaptado a decisiones diarias)
            let instruccionEstrategica = "";
            if (modalidad === 'realtime') {
                instruccionEstrategica = `
                El usuario necesita un "Nowcast" práctico. Analiza la telemetría hora por hora.
                Si está lloviendo o va a llover, dime exactamente en qué horas, si aligerará y cuándo parará.
                Dale recomendaciones directas: si debe esperar a que pase la lluvia para salir, si basta con un paraguas, si necesita calzado impermeable, o si es una ventana de tiempo segura para salir a pasear.`;
            } else {
                instruccionEstrategica = `
                El usuario necesita el pronóstico estratégico de 48 horas para planificar sus días.
                Destaca las temperaturas máximas y mínimas con sus horarios exactos de aparición.
                Menciona si hay ventanas de tormentas eléctricas o lluvias sostenidas, mucho sol o nublado para que el usuario planifique sus traslados rumbo a cualquier actividad prolongada en el exterior.`;
            }

            const promptClima = `
            Eres FaradAI, el asistente meteorológico personal y altamente analítico del usuario. Has recibido la siguiente telemetría meteorológica cruda del radar.
            Tu objetivo es procesarla y darle un reporte directo, claro y orientado a la toma de decisiones diarias.
            
            Reglas de intensidad de lluvia para tus recomendaciones:
            - 0 mm/h = Despejado o nublado sin precipitaciones.
            - 0.1 a 2.5 mm/h = Llovizna ligera. Bastará con un rompevientos o paraguas.
            - 2.6 a 10 mm/h = Lluvia moderada a fuerte. Requiere paraguas, botas/calzado para lluvia y precaución.
            - Más de 10 mm/h = Tormenta o aguacero pesado. Sugiere fuertemente retrasar salidas y resguardarse.

            ${instruccionEstrategica}

            Mantén un tono profesional, útil y conversacional.
            
            TELEMETRÍA CRUDA:
            ${reporteCrudo}
            `;

            // 3. GENERAR EL INFORME CON GEMINI
            const result = await model.generateContent(promptClima);
            const analisisClima = result.response.text();

            const mensajeDiscord = `☁️ **Reporte Meteorológico - Sector ${cp}**\n\n${analisisClima}`;

            // Partimos el mensaje si es muy largo
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
                await interaction.editReply('❌ No se pudo procesar la telemetría del clima en este momento.');
            }
        }
    }
};
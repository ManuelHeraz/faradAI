const model = require('../config/gemini');

module.exports = async (message, client) => {
    // Si el mensaje es de un bot, no le respondemos directamente (evita bucles infinitos)
    if (message.author.bot) return;

    // Si el mensaje menciona a FaradAI
    if (message.mentions.has(client.user)) {
        try {
            // Limpiamos la mención del texto del usuario
            const promptText = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
            
            if (!promptText) {
                return message.reply('¡Hola! Escríbeme algo después de etiquetarme para ayudarte con tus análisis o lluvias de ideas.');
            }

            await message.channel.sendTyping();
            
            // ==========================================
            // NUEVO: SISTEMA DE MEMORIA A CORTO PLAZO
            // ==========================================
            
            // 1. Extraemos los últimos 6 mensajes del canal (el tuyo + 5 anteriores)
            const historial = await message.channel.messages.fetch({ limit: 6 });
            
            // 2. Discord los entrega del más nuevo al más viejo, los volteamos cronológicamente
            const mensajesOrdenados = Array.from(historial.values()).reverse();
            
            // 3. Construimos el "Guion" para Gemini
            let contextoConversacion = "Aquí tienes el historial reciente de este canal de Discord para darte contexto. Úsalo si el usuario te pregunta sobre algo que se acaba de decir:\n\n";
            
            mensajesOrdenados.forEach(msg => {
                // Etiquetamos quién dijo qué
                const autor = msg.author.id === client.user.id ? 'FaradAI' : 'Usuario';
                
                // Limpiamos los tags de Discord para que Gemini lea limpio
                const textoLimpio = msg.content
                    .replace(`<@!${client.user.id}>`, '@FaradAI')
                    .replace(`<@${client.user.id}>`, '@FaradAI');
                
                contextoConversacion += `**${autor}:** ${textoLimpio}\n`;
            });

            // 4. Añadimos la instrucción final
            contextoConversacion += `\nInstrucción actual del usuario: ${promptText}`;

            // ==========================================
            
            // Mandamos el historial completo a Gemini
            const result = await model.generateContent(contextoConversacion);
            const text = result.response.text();

            // Partimos el mensaje si supera el límite de caracteres de Discord
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
};
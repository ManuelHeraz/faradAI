require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express'); // <-- Importamos Express

// Importamos la infraestructura
const connectDB = require('./src/config/mongo');
const iniciarCronPapers = require('./src/jobs/minarPapers');
const iniciarCronGithub = require('./src/jobs/revisarGithub');
const handleMessageCreate = require('./src/events/messageCreate');

// Encendemos la Base de datos
connectDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- LECTOR DE COMANDOS ---
client.commands = new Collection();
const comandosParaRegistrar = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    comandosParaRegistrar.push(command.data);
}

// --- EVENTOS DEL BOT ---
client.once('clientReady', async () => {
    console.log(`¡Bot conectado como ${client.user.tag}!`);
    await client.application.commands.set(comandosParaRegistrar);
    console.log('Slash Commands registrados exitosamente.');
    
    iniciarCronPapers(client);
    iniciarCronGithub(client);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        const replyPayload = { content: 'Ocurrió un error.', ephemeral: true };
        interaction.deferred || interaction.replied ? await interaction.editReply('Ocurrió un error.') : await interaction.reply(replyPayload);
    }
});

client.on('messageCreate', async (message) => {
    await handleMessageCreate(message, client);
});

// --- SERVIDOR WEBHOOK PARA EL CLÚSTER (EXPRESS) ---
const app = express();
app.use(express.json());

app.post('/api/cluster-alert', async (req, res) => {
    const { status, filename, errorCode, message } = req.body;

    const channelId = '1529729159964786778'; 
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.error("No se encontró el canal de Discord. Verifica el ID.");
        return res.status(500).send("Error de canal");
    }

    // TU ID DE USUARIO DE DISCORD (reemplaza los números por los tuyos)
    const miUserId = '694234188119015597'; 

    if (status === 'success') {
        // AQUÍ AGREGAMOS LA ETIQUETA <@...> AL INICIO DEL MENSAJE
        channel.send(`<@${miUserId}> ✅ **Pipeline Finalizado (Xiuhcoatl)**\nSe ejecutó correctamente. Output generado: \`${filename}\``);
    } else if (status === 'error') {
        channel.send(`<@${miUserId}> ❌ **Error Crítico en Xiuhcoatl**\nEl proceso \`${filename}\` falló.\n**Exit Code:** \`${errorCode}\`\n**Detalle:** ${message}`);
    }

    res.sendStatus(200);
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Webhook de FaradAI escuchando alertas del clúster en el puerto ${PORT} abierto al exterior`);
});

// Iniciar sesión en Discord
client.login(process.env.DISCORD_TOKEN);
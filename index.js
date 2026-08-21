require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

// Importamos la infraestructura
const connectDB = require('./src/config/mongo');
const iniciarCronPapers = require('./src/jobs/minarPapers');
const iniciarCronGithub = require('./src/jobs/revisarGithub');

// Importamos nuestro evento de chat
const handleMessageCreate = require('./src/events/messageCreate');

// Encendemos los motores (Base de datos y Servidor Web)
connectDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- LECTOR DE COMANDOS (Command Handler) ---
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
    
    // Registramos los comandos dinámicamente en Discord
    await client.application.commands.set(comandosParaRegistrar);
    console.log('Slash Commands registrados exitosamente.');
    
    // Iniciamos los Cron Jobs
    iniciarCronPapers(client);
    iniciarCronGithub(client);
});

// Enrutador de Slash Commands (/articulo, /actualizaciones)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Ocurrió un error al ejecutar este comando.');
        } else {
            await interaction.reply({ content: 'Ocurrió un error.', ephemeral: true });
        }
    }
});

// Evento de Chat (Cuando etiquetas al bot)
client.on('messageCreate', async (message) => {
    await handleMessageCreate(message, client);
});

// Iniciar sesión
client.login(process.env.DISCORD_TOKEN);
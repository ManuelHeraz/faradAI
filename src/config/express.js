const express = require('express');

function startServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    app.get('/', (req, res) => {
        res.status(200).send('El Bot Científico está vivo y operando.');
    });

    app.listen(PORT, () => {
        console.log(`Servidor Express corriendo en el puerto ${PORT}`);
    });
}

module.exports = startServer;
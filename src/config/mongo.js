const mongoose = require('mongoose');

function connectDB() {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('Conectado exitosamente a MongoDB Atlas'))
        .catch(err => console.error('Error al conectar a MongoDB:', err));
}

module.exports = connectDB;
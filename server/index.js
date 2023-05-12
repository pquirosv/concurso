const express = require('express');
const morgan = require('morgan');
const app = express();

const { mongoose } = require('./database');

// Settings 
app.set('port', process.env.PORT || 3000);

// Middlewares
app.use(morgan('tiny')); //'Combined' para log largo
app.use(express.json());

// Routes
app.use('/api',require('./routes/preguntas.routes'));

// Starting the server
app.listen(app.get('port'), () => {
	console.log('Server en ' + app.get('port') + '...');
});
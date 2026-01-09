const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const app = express();

const { mongoose } = require('./database');

// Settings 
app.set('port', process.env.PORT || 3000);

// Middlewares
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:8080'],
  })
);

app.use(morgan('tiny')); //'Combined' para log largo
app.use(express.json());

// Routes
app.use('/api',require('./routes/preguntas.routes'));

// Starting the server
app.listen(app.get('port'), () => {
	console.log('Server en ' + app.get('port') + '...');
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const cdrRoutes = require('./routes/cdrRoutes');
const sdrRoutes = require('./routes/sdrRoutes');
const socialProfilerRoutes = require('./routes/socialProfilerRoutes');
const { createTables } = require('./config/database');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/cdr', cdrRoutes);
app.use('/api/sdr', sdrRoutes);
app.use('/api/profiler', socialProfilerRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'CDR Analysis API is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!', 
        details: err.message 
    });
});

// Initialize database tables
createTables();

module.exports = app;
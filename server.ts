import express from 'express';
import cors from 'cors';
import { connectToDatabase, sql } from './db';
import { createServer as createViteServer } from 'vite';

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(cors());
    app.use(express.json());

    // API Routes
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.get('/api/test-db', async (req, res) => {
        try {
            const pool = await connectToDatabase();
            const result = await pool.request().query('SELECT 1 as result');
            res.json({ 
                status: 'success', 
                message: 'Successfully connected to Azure SQL Database', 
                data: result.recordset 
            });
        } catch (err: any) {
            res.status(500).json({ 
                status: 'error', 
                message: 'Failed to connect to database', 
                error: err.message 
            });
        }
    });

    // Vite integration for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        // Serve static files in production
        app.use(express.static('dist'));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
});

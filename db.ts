import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || '', 
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Use this if you're on Windows Azure
        trustServerCertificate: true // Change to true for local dev / self-signed certs
    }
};

export async function connectToDatabase() {
    try {
        const pool = await sql.connect(config);
        console.log('Connected to Azure SQL Database');
        return pool;
    } catch (err) {
        console.error('Database connection failed: ', err);
        throw err;
    }
}

export { sql };

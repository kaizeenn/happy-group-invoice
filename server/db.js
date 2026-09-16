import mysql from 'mysql2/promise';
import 'dotenv/config';

const config = {
  host: process.env.DB_HOST || 'mysql',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'happy_invoice',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'happy_invoice',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z'
};

export const pool = mysql.createPool(config);
export async function query(sql, values = []) { const [rows] = await pool.execute(sql, values); return rows; }

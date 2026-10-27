const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

/**
 * Executes a SQL query against the MySQL database.
 * @param {string} query - The SQL query to execute.
 * @param {Array} params - Optional array of parameters for prepared statements.
 * @returns {Promise<Array>} - The results of the query.
 */
async function executeQuery(query, params = []) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

module.exports = {
    executeQuery
};

#!/usr/bin/env node
/**
 * lacuerda-server.js — Servidor puente local para importar desde la UI de Library
 *
 * Uso: node tools/lacuerda-server.js
 * Escucha en http://localhost:7373
 *
 * Endpoints:
 *   GET  /status   → { ok: true }  (la UI lo usa para detectar si está corriendo)
 *   POST /import   → { running: true }  (lanza el scraper, progreso vía SSE)
 *   GET  /progress → SSE stream con las líneas de salida del scraper
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 7373;
const IMPORT_SCRIPT = path.join(__dirname, 'lacuerda-import.js');
const PROJECT_ROOT = path.join(__dirname, '..');

let sseClients = [];
let importRunning = false;

function broadcast(line) {
    const data = `data: ${JSON.stringify(line)}\n\n`;
    sseClients.forEach(res => res.write(data));
}

function broadcastDone(summary) {
    const data = `data: ${JSON.stringify({ done: true, summary })}\n\n`;
    sseClients.forEach(res => {
        res.write(data);
        res.end();
    });
    sseClients = [];
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
    cors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, running: importRunning }));
        return;
    }

    if (req.method === 'GET' && req.url === '/progress') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write(': connected\n\n');
        sseClients.push(res);
        req.on('close', () => {
            sseClients = sseClients.filter(c => c !== res);
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/import') {
        if (importRunning) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ya hay una importación en curso' }));
            return;
        }

        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            let params;
            try { params = JSON.parse(body); } catch { params = {}; }

            const { artist, displayName, artistId } = params;
            if (!artist) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Falta el parámetro artist' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ running: true }));

            const args = ['--artist', artist];
            if (displayName) args.push('--display-name', displayName);
            if (artistId) args.push('--artist-id', artistId);

            importRunning = true;
            broadcast({ type: 'start', artist });

            const proc = spawn('node', [IMPORT_SCRIPT, ...args], { cwd: PROJECT_ROOT });

            proc.stdout.on('data', chunk => {
                const lines = chunk.toString().split('\n').filter(l => l.trim());
                lines.forEach(line => broadcast({ type: 'line', text: line }));
            });

            proc.stderr.on('data', chunk => {
                broadcast({ type: 'error', text: chunk.toString() });
            });

            proc.on('close', code => {
                importRunning = false;
                broadcastDone({ exitCode: code });
                console.log(`[lacuerda-server] Importación finalizada (exit ${code})`);
            });
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🎵 lacuerda-server corriendo en http://localhost:${PORT}`);
    console.log(`   Mantén esta terminal abierta mientras usas la Library.\n`);
});

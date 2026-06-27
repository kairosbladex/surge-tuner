#!/usr/bin/env node
'use strict';

const http = require('http');

const {
  PROTOCOL_VERSION,
  buildAgentCard,
  createTaskFromSendMessageRequest,
  createTaskStore
} = require('./a2a-agent');

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1024 * 1024;
const A2A_JSON = 'application/a2a+json; charset=utf-8';

function createA2AServer(options = {}) {
  const taskStore = options.taskStore || createTaskStore();
  const allowLocalFiles = Boolean(options.allowLocalFiles);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, getRequestBaseUrl(req));

      if (!isSupportedVersion(req, url)) {
        return sendJson(res, 400, {
          error: {
            code: 'VERSION_NOT_SUPPORTED',
            message: `A2A-Version must be ${PROTOCOL_VERSION}`
          }
        });
      }

      if (req.method === 'GET' && (url.pathname === '/.well-known/agent-card.json' || url.pathname === '/agent-card.json')) {
        return sendJson(res, 200, buildAgentCard(getPublicBaseUrl(req, options)));
      }

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/tasks') {
        return sendJson(res, 200, {
          tasks: taskStore.list(),
          nextPageToken: ''
        });
      }

      const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
      if (req.method === 'GET' && taskMatch) {
        const task = taskStore.get(decodeURIComponent(taskMatch[1]));
        if (!task) {
          return sendJson(res, 404, {
            error: {
              code: 'TASK_NOT_FOUND',
              message: 'Task not found'
            }
          });
        }
        return sendJson(res, 200, { task });
      }

      if (req.method === 'POST' && url.pathname === '/message:send') {
        const body = await readJsonBody(req);
        const task = await createTaskFromSendMessageRequest(body, { allowLocalFiles });
        taskStore.save(task);
        return sendJson(res, 200, { task });
      }

      if (req.method === 'POST' && (url.pathname === '/message:stream' || /\/tasks\/[^/]+:subscribe$/.test(url.pathname))) {
        return sendJson(res, 501, {
          error: {
            code: 'UNSUPPORTED_OPERATION',
            message: 'Streaming is not supported by this A2A MVP. Use /message:send and /tasks/{id}.'
          }
        });
      }

      return sendJson(res, 404, {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found'
        }
      });
    } catch (error) {
      const status = error.statusCode || 500;
      return sendJson(res, status, {
        error: {
          code: status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_ARGUMENT',
          message: error.message
        }
      });
    }
  });
}

function getRequestBaseUrl(req) {
  const host = req.headers.host || `127.0.0.1:${DEFAULT_PORT}`;
  return `http://${host}`;
}

function getPublicBaseUrl(req, options = {}) {
  if (options.baseUrl) return String(options.baseUrl).replace(/\/+$/, '');
  if (process.env.A2A_BASE_URL) return process.env.A2A_BASE_URL.replace(/\/+$/, '');
  return getRequestBaseUrl(req);
}

function isSupportedVersion(req, url) {
  const version = req.headers['a2a-version'] || url.searchParams.get('A2A-Version');
  return !version || version === PROTOCOL_VERSION;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Request body is too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        const error = new Error('Request body must be JSON');
        error.statusCode = 400;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (parseError) {
        const error = new Error(`Invalid JSON payload: ${parseError.message}`);
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', A2A_JSON);
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const port = Number(process.env.PORT || process.env.A2A_PORT || DEFAULT_PORT);
  const server = createA2AServer({
    baseUrl: process.env.A2A_BASE_URL,
    allowLocalFiles: process.env.A2A_ALLOW_LOCAL_FILES === '1'
  });

  server.listen(port, () => {
    process.stdout.write(`Surge Tuner A2A server listening on http://127.0.0.1:${port}\n`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  createA2AServer,
  readJsonBody
};

#!/usr/bin/env node
'use strict';

/**
 * a2a-server.js — A2A HTTP+JSON & HTTP+SSE server with multi-skill support.
 *
 * Fully implements A2A 1.0 protocol:
 *   - GET  /.well-known/agent-card.json  — Agent discovery
 *   - POST /message:send                  — Submit task (sync)
 *   - POST /message:stream                — Submit task with SSE response
 *   - GET  /tasks/:id                     — Poll task result
 *   - GET  /tasks/:id:subscribe           — Subscribe to in-process task updates via SSE
 *   - POST /tasks/:id:cancel              — Cancel a running task
 *   - GET  /tasks                         — List all tasks
 *   - GET  /healthz                       — Health check
 *   - GET  /docs                          — Documentation redirect
 */

const http = require('http');
const path = require('path');

const { PROTOCOL_VERSION, buildAgentCard, createTaskFromSendMessageRequest, registerSkills } = require('./a2a-agent');
const { TaskStore, SkillRouter } = require('./a2a-task-manager');
const { UserPreferenceStore } = require('./user-preference-store');

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1024 * 1024;
const A2A_JSON = 'application/a2a+json; charset=utf-8';
const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

// ── Server Factory ──────────────────────────────────────────────────────────────

function createA2AServer(options = {}) {
  const taskStore = options.taskStore || new TaskStore();
  const skillRouter = options.skillRouter || new SkillRouter();
  const preferenceStore = options.preferenceStore || new UserPreferenceStore();
  const allowLocalFiles = Boolean(options.allowLocalFiles);
  const baseUrl = options.baseUrl || process.env.A2A_BASE_URL || '';

  // Register all skills
  registerSkills(skillRouter, taskStore, preferenceStore);

  // Periodic cleanup every 30 minutes
  const cleanupInterval = setInterval(() => taskStore.cleanup(), 30 * 60 * 1000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, getRequestBaseUrl(req));

      // Version check (POST endpoints require A2A-Version header)
      if ((req.method === 'POST') && !isSupportedVersion(req, url)) {
        return sendJson(res, 400, {
          error: { code: 'VERSION_NOT_SUPPORTED', message: `A2A-Version must be ${PROTOCOL_VERSION}` }
        });
      }

      // ── Routes ──────────────────────────────────────────────────────────

      // GET /.well-known/agent-card.json
      if (req.method === 'GET' && (url.pathname === '/.well-known/agent-card.json' || url.pathname === '/agent-card.json')) {
        return sendJson(res, 200, buildAgentCard(getPublicBaseUrl(req, options)));
      }

      // GET /healthz
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true, version: PROTOCOL_VERSION, skills: skillRouter.listSkills() });
      }

      // GET /docs
      if (req.method === 'GET' && url.pathname === '/docs') {
        res.statusCode = 302;
        res.setHeader('location', 'https://github.com/kairosbladex/surge-tuner/blob/main/docs/a2a.md');
        res.end();
        return;
      }

      // GET /tasks
      if (req.method === 'GET' && url.pathname === '/tasks') {
        const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50'), 100);
        const tasks = taskStore.listTasks().slice(0, pageSize);
        return sendJson(res, 200, { tasks, nextPageToken: tasks.length === pageSize ? 'more' : '' });
      }

      // GET /tasks/:id
      const taskGetMatch = url.pathname.match(/^\/tasks\/([^/:]+)$/);
      if (req.method === 'GET' && taskGetMatch) {
        const task = taskStore.getTask(decodeURIComponent(taskGetMatch[1]));
        if (!task) return sendJson(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
        return sendJson(res, 200, { task });
      }

      // GET /tasks/:id:subscribe (in-process SSE task events)
      const subscribeMatch = url.pathname.match(/^\/tasks\/([^/]+):subscribe$/);
      if (req.method === 'GET' && subscribeMatch) {
        const taskId = decodeURIComponent(subscribeMatch[1]);
        const task = taskStore.getTask(taskId);
        if (!task) return sendJson(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });

        // If already terminal, send immediately and close
        if (['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED'].includes(task.status.state)) {
          res.statusCode = 200;
          res.setHeader('content-type', SSE_CONTENT_TYPE);
          res.setHeader('cache-control', 'no-cache');
          res.setHeader('connection', 'keep-alive');
          res.write(`event: task\ndata: ${JSON.stringify({ task })}\n\n`);
          res.end();
          return;
        }

        // Subscribe for live updates
        res.statusCode = 200;
        res.setHeader('content-type', SSE_CONTENT_TYPE);
        res.setHeader('cache-control', 'no-cache');
        res.setHeader('connection', 'keep-alive');
        res.write(`event: connected\ndata: {"taskId":"${taskId}"}\n\n`);

        // Send current state immediately
        res.write(`event: task\ndata: ${JSON.stringify({ task })}\n\n`);

        const unsubscribe = taskStore.subscribe(taskId, {
          write: (data) => {
            try { res.write(data); } catch (_) { unsubscribe(); }
          },
          end: () => {
            try { res.end(); } catch (_) { /* ignore */ }
          }
        });

        req.on('close', () => unsubscribe());
        req.on('error', () => unsubscribe());
        return;
      }

      // POST /tasks/:id:cancel
      const cancelMatch = url.pathname.match(/^\/tasks\/([^/]+):cancel$/);
      if (req.method === 'POST' && cancelMatch) {
        const taskId = decodeURIComponent(cancelMatch[1]);
        const task = taskStore.getTask(taskId);
        if (!task) return sendJson(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });

        const canceled = taskStore.cancelTask(taskId);
        return sendJson(res, 200, { task: canceled });
      }

      // POST /message:send (sync)
      if (req.method === 'POST' && url.pathname === '/message:send') {
        const body = await readJsonBody(req);
        const result = await createTaskFromSendMessageRequest(body, taskStore, skillRouter, {
          allowLocalFiles,
          preferenceStore,
          baseUrl: getPublicBaseUrl(req, options)
        });
        return sendJson(res, 200, result);
      }

      // POST /message:stream (SSE streaming)
      if (req.method === 'POST' && url.pathname === '/message:stream') {
        const body = await readJsonBody(req);

        // Set up SSE response
        res.statusCode = 200;
        res.setHeader('content-type', SSE_CONTENT_TYPE);
        res.setHeader('cache-control', 'no-cache');
        res.setHeader('connection', 'keep-alive');

        try {
          const result = await createTaskFromSendMessageRequest(body, taskStore, skillRouter, {
            allowLocalFiles,
            preferenceStore,
            baseUrl: getPublicBaseUrl(req, options)
          });

          // Stream the task updates
          const taskId = result.task.id;
          res.write(`event: taskCreated\ndata: ${JSON.stringify(result)}\n\n`);

          const task = taskStore.getTask(taskId);
          if (task) {
            res.write(`event: task\ndata: ${JSON.stringify({ task })}\n\n`);
          }

          // Subscribe for further updates
          if (task && !['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED'].includes(task.status.state)) {
            const unsubscribe = taskStore.subscribe(taskId, {
              write: (data) => {
                try { res.write(data); } catch (_) { unsubscribe(); }
              },
              end: () => {
                try { res.end(); } catch (_) { /* ignore */ }
              }
            });
            req.on('close', () => unsubscribe());
            req.on('error', () => unsubscribe());
          } else {
            res.end();
          }
        } catch (error) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        }
        return;
      }

      // 404
      return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
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

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

// ── Main ────────────────────────────────────────────────────────────────────────

function main() {
  const port = Number(process.env.PORT || process.env.A2A_PORT || DEFAULT_PORT);
  const server = createA2AServer({
    baseUrl: process.env.A2A_BASE_URL,
    allowLocalFiles: process.env.A2A_ALLOW_LOCAL_FILES === '1'
  });

  server.listen(port, () => {
    process.stdout.write(`Proxy Tuner A2A server listening on http://127.0.0.1:${port}\n`);
    process.stdout.write(`Agent Card: http://127.0.0.1:${port}/.well-known/agent-card.json\n`);
    process.stdout.write(`Skills: generate-surge-profile, generate-loon-profile, generate-quantumultx-profile, generate-clash-profile, convert-config, install-adblock, manage-preferences, parse-proxies\n`);
    process.stdout.write(`Protocol: HTTP+JSON (message:send) + local HTTP+SSE streams (message:stream, tasks/:id:subscribe)\n`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { createA2AServer, readJsonBody };

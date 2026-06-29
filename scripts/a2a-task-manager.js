'use strict';

/**
 * a2a-task-manager.js — Advanced task lifecycle management for A2A protocol.
 *
 * Supports:
 *   - Task creation with streaming (SSE)
 *   - In-process SSE subscriptions via /tasks/{id}:subscribe
 *   - Task cancellation
 *   - Progress reporting
 *   - Multi-skill task routing
 */

const crypto = require('crypto');

// ── Task States (A2A 1.0) ───────────────────────────────────────────────────────

const TASK_STATE = {
  SUBMITTED: 'TASK_STATE_SUBMITTED',
  WORKING: 'TASK_STATE_WORKING',
  INPUT_REQUIRED: 'TASK_STATE_INPUT_REQUIRED',
  COMPLETED: 'TASK_STATE_COMPLETED',
  FAILED: 'TASK_STATE_FAILED',
  CANCELED: 'TASK_STATE_CANCELED'
};

// ── Task Store with Streaming Support ───────────────────────────────────────────

class TaskStore {
  constructor() {
    this._tasks = new Map();
    this._subscribers = new Map(); // taskId → Set<SSEResponse>
  }

  createTask(skillId, contextId) {
    const task = {
      id: crypto.randomUUID(),
      contextId: contextId || crypto.randomUUID(),
      skillId,
      status: {
        state: TASK_STATE.SUBMITTED,
        timestamp: new Date().toISOString(),
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'Task created.' }]
        }
      },
      artifacts: [],
      history: [],
      createdAt: new Date().toISOString()
    };
    this._tasks.set(task.id, task);
    return task;
  }

  getTask(id) {
    return this._tasks.get(id) || null;
  }

  listTasks() {
    return Array.from(this._tasks.values()).sort((a, b) => {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  updateTask(id, updates) {
    const task = this._tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    if (updates.status) {
      task.status = {
        ...task.status,
        ...updates.status,
        timestamp: new Date().toISOString()
      };
    }
    if (updates.artifacts) {
      task.artifacts = updates.artifacts;
    }
    if (updates.history) {
      task.history = updates.history;
    }

    this._tasks.set(id, task);

    // Notify subscribers
    this._notifySubscribers(id, task);

    return task;
  }

  appendHistory(id, message) {
    const task = this._tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (!Array.isArray(task.history)) task.history = [];
    task.history.push(message);
    this._tasks.set(id, task);
  }

  addProgress(id, progressText) {
    return this.updateTask(id, {
      status: {
        state: TASK_STATE.WORKING,
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: progressText }]
        }
      }
    });
  }

  cancelTask(id) {
    const task = this._tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if ([TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.CANCELED].includes(task.status.state)) {
      return task; // Already terminal
    }
    return this.updateTask(id, {
      status: {
        state: TASK_STATE.CANCELED,
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'Task canceled by user.' }]
        }
      }
    });
  }

  // ── SSE Subscriptions ─────────────────────────────────────────────────────

  subscribe(taskId, sseResponse) {
    if (!this._subscribers.has(taskId)) {
      this._subscribers.set(taskId, new Set());
    }
    this._subscribers.get(taskId).add(sseResponse);

    // Return unsubscribe function
    return () => {
      const subs = this._subscribers.get(taskId);
      if (subs) {
        subs.delete(sseResponse);
        if (subs.size === 0) this._subscribers.delete(taskId);
      }
    };
  }

  _notifySubscribers(taskId, task) {
    const subs = this._subscribers.get(taskId);
    if (!subs || subs.size === 0) return;

    const event = `data: ${JSON.stringify({ task })}\n\n`;
    for (const sse of subs) {
      try {
        sse.write(event);
        // If terminal state, close the stream
        if ([TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.CANCELED].includes(task.status.state)) {
          sse.end();
          subs.delete(sse);
        }
      } catch (error) {
        subs.delete(sse);
      }
    }
    if (subs.size === 0) this._subscribers.delete(taskId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  cleanup(maxAgeMs = 3600000) {
    const now = Date.now();
    for (const [id, task] of this._tasks) {
      const age = now - new Date(task.createdAt).getTime();
      if (age > maxAgeMs && [TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.CANCELED].includes(task.status.state)) {
        this._tasks.delete(id);
        this._subscribers.delete(id);
      }
    }
  }
}

// ── Skill Router ────────────────────────────────────────────────────────────────

class SkillRouter {
  constructor() {
    this._skills = new Map();
  }

  register(skillId, handler) {
    this._skills.set(skillId, handler);
  }

  getSkill(skillId) {
    return this._skills.get(skillId) || null;
  }

  listSkills() {
    return Array.from(this._skills.keys());
  }

  async execute(skillId, task, input, options = {}) {
    const handler = this._skills.get(skillId);
    if (!handler) {
      throw new Error(`Unknown skill: ${skillId}`);
    }
    return handler(task, input, options);
  }
}

// ── Create default task store ───────────────────────────────────────────────────

function createTaskStore() {
  return new TaskStore();
}

function createSkillRouter() {
  return new SkillRouter();
}

module.exports = {
  TASK_STATE,
  TaskStore,
  SkillRouter,
  createTaskStore,
  createSkillRouter
};

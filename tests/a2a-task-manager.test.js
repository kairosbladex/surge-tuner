'use strict';

/**
 * Tests for a2a-task-manager (TaskStore, SkillRouter).
 * TDD: Write tests first, then run against implementations.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { TASK_STATE, TaskStore, SkillRouter } = require('../scripts/a2a-task-manager');

// ── TaskStore ──────────────────────────────────────────────────────────────────

test('TaskStore creates task with SUBMITTED state', () => {
  const store = new TaskStore();
  const task = store.createTask('test-skill', 'ctx-1');

  assert.ok(task.id);
  assert.equal(task.skillId, 'test-skill');
  assert.equal(task.status.state, TASK_STATE.SUBMITTED);
  assert.ok(task.createdAt);
});

test('TaskStore getTask returns null for unknown', () => {
  const store = new TaskStore();
  assert.equal(store.getTask('nonexistent'), null);
});

test('TaskStore getTask returns created task', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');
  const retrieved = store.getTask(task.id);
  assert.equal(retrieved.id, task.id);
});

test('TaskStore updateTask changes status', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');

  store.updateTask(task.id, {
    status: { state: TASK_STATE.COMPLETED, message: { role: 'ROLE_AGENT', parts: [{ text: 'Done' }] } }
  });

  const updated = store.getTask(task.id);
  assert.equal(updated.status.state, TASK_STATE.COMPLETED);
});

test('TaskStore addProgress sets WORKING state', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');

  store.addProgress(task.id, 'Working on it...');
  const updated = store.getTask(task.id);
  assert.equal(updated.status.state, TASK_STATE.WORKING);
});

test('TaskStore cancelTask cancels a WORKING task', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');

  store.cancelTask(task.id);
  const updated = store.getTask(task.id);
  assert.equal(updated.status.state, TASK_STATE.CANCELED);
});

test('TaskStore cancelTask returns unchanged for completed tasks', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');

  store.updateTask(task.id, { status: { state: TASK_STATE.COMPLETED } });
  const result = store.cancelTask(task.id);
  assert.equal(result.status.state, TASK_STATE.COMPLETED);
});

test('TaskStore listTasks returns tasks in order', () => {
  const store = new TaskStore();
  const t1 = store.createTask('a', 'ctx');
  const t2 = store.createTask('b', 'ctx');

  const tasks = store.listTasks();
  assert.equal(tasks.length, 2);
  // Both task IDs should be in the list
  const ids = tasks.map((t) => t.id);
  assert.ok(ids.includes(t1.id));
  assert.ok(ids.includes(t2.id));
});

test('TaskStore cleanup removes old completed tasks', () => {
  const store = new TaskStore();
  const task = store.createTask('test', 'ctx');

  // Manually set old createdAt
  const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  store._tasks.get(task.id).createdAt = oldDate;
  store.updateTask(task.id, { status: { state: TASK_STATE.COMPLETED } });

  store.cleanup(60 * 60 * 1000); // Cleanup tasks older than 1 hour
  assert.equal(store.getTask(task.id), null);
});

test('TaskStore subscribe notifies on update', () => {
  const store = new TaskStore();
  const task = store.createTask('notify-test', 'ctx');
  let notified = false;

  const fakeSSE = {
    write: (data) => { notified = true; },
    end: () => {}
  };

  store.subscribe(task.id, fakeSSE);
  store.updateTask(task.id, { status: { state: TASK_STATE.WORKING } });

  assert.ok(notified);
});

// ── SkillRouter ────────────────────────────────────────────────────────────────

test('SkillRouter register and execute works', async () => {
  const router = new SkillRouter();

  router.register('echo', async (task, input) => {
    return { state: TASK_STATE.COMPLETED, message: `Echo: ${input.text}`, artifacts: [] };
  });

  const task = { id: 't1', contextId: 'ctx' };
  const result = await router.execute('echo', task, { text: 'hello' });

  assert.equal(result.state, TASK_STATE.COMPLETED);
  assert.equal(result.message, 'Echo: hello');
});

test('SkillRouter getSkill returns null for unknown', () => {
  const router = new SkillRouter();
  assert.equal(router.getSkill('nonexistent'), null);
});

test('SkillRouter listSkills returns registered skill IDs', () => {
  const router = new SkillRouter();
  router.register('a', async () => {});
  router.register('b', async () => {});

  const skills = router.listSkills();
  assert.ok(skills.includes('a'));
  assert.ok(skills.includes('b'));
});

test('SkillRouter execute throws for unknown skill', async () => {
  const router = new SkillRouter();
  await assert.rejects(
    () => router.execute('unknown', {}, {}),
    /Unknown skill/
  );
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createA2AServer } = require('../scripts/a2a-server');

async function withServer(fn) {
  const server = createA2AServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    error.message = `${error.message}\nBody:\n${text}`;
    throw error;
  }
}

test('A2A agent card advertises the Surge generation skill', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
      headers: { 'A2A-Version': '1.0' }
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.name, 'Surge Tuner Agent');
    assert.equal(body.supportedInterfaces[0].protocolBinding, 'HTTP+JSON');
    assert.equal(body.supportedInterfaces[0].protocolVersion, '1.0');
    assert.equal(body.capabilities.streaming, false);
    assert.equal(body.skills[0].id, 'generate-surge-profile');
  });
});

test('A2A message:send generates a Surge profile artifact and stores the task', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message:send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/a2a+json',
        'A2A-Version': '1.0'
      },
      body: JSON.stringify({
        message: {
          messageId: 'msg-1',
          role: 'ROLE_USER',
          parts: [
            {
              data: {
                address: 'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
                services: ['Telegram'],
                adBlock: false,
                profileName: 'hk.conf'
              }
            }
          ]
        }
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(body.task.artifacts[0].name, 'hk.conf');
    assert.match(body.task.artifacts[0].parts[0].text, /\[Proxy\]\n香港-HK-01 = trojan/);
    assert.match(body.task.artifacts[0].parts[0].text, /RULE-SET,.*Telegram\.list,Telegram/);
    assert.equal(body.task.artifacts[1].parts[0].data.inputSummary.proxyCount, 1);

    const taskResponse = await fetch(`${baseUrl}/tasks/${body.task.id}`, {
      headers: { 'A2A-Version': '1.0' }
    });
    const taskBody = await readJson(taskResponse);
    assert.equal(taskResponse.status, 200);
    assert.equal(taskBody.task.id, body.task.id);
  });
});

test('A2A message:send reports generator failures as failed tasks', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message:send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/a2a+json',
        'A2A-Version': '1.0'
      },
      body: JSON.stringify({
        message: {
          messageId: 'msg-2',
          role: 'ROLE_USER',
          parts: [
            {
              data: {
                subscriptions: [{ name: 'AirportA', url: 'https://example.com/sub' }],
                services: ['NotARealService']
              }
            }
          ]
        }
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_FAILED');
    assert.match(body.task.status.message.parts[0].text, /Unknown service: NotARealService/);
    assert.equal(body.task.artifacts[0].parts[0].data.ok, false);
  });
});

test('A2A message:send asks for input when message has no generator request', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message:send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/a2a+json',
        'A2A-Version': '1.0'
      },
      body: JSON.stringify({
        message: {
          messageId: 'msg-3',
          role: 'ROLE_USER',
          parts: [{ text: '帮我生成一个配置' }]
        }
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_INPUT_REQUIRED');
  });
});

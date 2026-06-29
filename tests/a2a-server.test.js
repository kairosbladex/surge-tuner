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
    assert.equal(body.name, 'Proxy Tuner Agent');
    assert.equal(body.supportedInterfaces[0].protocolBinding, 'HTTP+JSON');
    assert.equal(body.supportedInterfaces[0].protocolVersion, '1.0');
    assert.equal(body.capabilities.streaming, true);
    assert.equal(body.capabilities.pushNotifications, false);
    assert.equal(body.skills.length, 8);
    assert.equal(body.skills[0].id, 'generate-surge-profile');
  });
});

async function postA2A(baseUrl, data, path = '/message:send') {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/a2a+json',
      'A2A-Version': '1.0'
    },
    body: JSON.stringify({
      message: {
        messageId: `msg-${Math.random().toString(16).slice(2)}`,
        role: 'ROLE_USER',
        parts: [{ data }]
      }
    })
  });
  return { response, body: await readJson(response) };
}

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

test('A2A message:send generates all supported platform profiles', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      ['surge', 'surge-profile', /\[Proxy\]/],
      ['loon', 'loon-profile', /\[Proxy\]/],
      ['quantumultx', 'quantumultx-profile', /\[server_local\]/],
      ['clash', 'clash-profile', /proxies:/]
    ];

    for (const [platform, artifactId, pattern] of cases) {
      const { response, body } = await postA2A(baseUrl, {
        address: `trojan://secret@${platform}.example.com:443?sni=${platform}.example.com#美国-US-01`,
        services: ['Telegram'],
        platform,
        adBlock: false
      });

      assert.equal(response.status, 200);
      assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
      assert.equal(body.task.artifacts[0].artifactId, artifactId);
      assert.match(body.task.artifacts[0].parts[0].text, pattern);
    }
  });
});

test('A2A message:send supports convert-config skill', async () => {
  await withServer(async (baseUrl) => {
    const source = [
      '[General]',
      'loglevel = notify',
      '',
      '[Proxy]',
      '美国-US-01 = trojan, us.example.com, 443, password=secret, tls=true',
      '',
      '[Proxy Group]',
      '兜底分流 = select, 美国-US-01',
      '',
      '[Rule]',
      'FINAL,兜底分流'
    ].join('\n');

    const { response, body } = await postA2A(baseUrl, {
      skillId: 'convert-config',
      config: source,
      from: 'surge',
      to: 'clash'
    });

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(body.task.artifacts[0].artifactId, 'converted-config');
    assert.match(body.task.artifacts[0].parts[0].text, /mode: Rule/);
    assert.equal(body.task.artifacts[1].parts[0].data.ok, true);
    assert.equal(body.task.artifacts[1].parts[0].data.from, 'surge');
    assert.equal(body.task.artifacts[1].parts[0].data.to, 'clash');
  });
});

test('A2A message:send supports install-adblock skill', async () => {
  await withServer(async (baseUrl) => {
    const { response, body } = await postA2A(baseUrl, {
      skillId: 'install-adblock',
      platform: 'surge',
      action: 'generate',
      customDomains: ['*.example-ad.com'],
      useOnlineRules: false
    });

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(body.task.artifacts[0].artifactId, 'adblock-config');
    assert.match(body.task.artifacts[0].parts[0].text, /\[MITM\]/);
    assert.match(body.task.artifacts[0].parts[0].text, /example-ad\.com/);
  });
});

test('A2A message:send supports manage-preferences skill with isolated store', async () => {
  const { UserPreferenceStore } = require('../scripts/user-preference-store');
  const preferenceStore = new UserPreferenceStore('/tmp/proxy-tuner-a2a-test-prefs.json');
  const server = createA2AServer({ preferenceStore });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const { response, body } = await postA2A(baseUrl, {
      skillId: 'manage-preferences',
      action: 'set',
      preferredPlatform: 'clash',
      commonServices: ['Telegram']
    });

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(body.task.artifacts[0].parts[0].data.ok, true);
    assert.equal(body.task.artifacts[0].parts[0].data.preferences.preferredPlatform, 'clash');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('A2A message:send supports parse-proxies skill', async () => {
  await withServer(async (baseUrl) => {
    const { response, body } = await postA2A(baseUrl, {
      skillId: 'parse-proxies',
      address: 'trojan://secret@parse.example.com:443?sni=parse.example.com#美国-US-01'
    });

    assert.equal(response.status, 200);
    assert.equal(body.task.status.state, 'TASK_STATE_COMPLETED');
    assert.equal(body.task.artifacts[0].artifactId, 'parsed-proxies');
    assert.equal(body.task.artifacts[0].parts[0].data.count, 1);
    assert.equal(body.task.artifacts[0].parts[0].data.proxies[0].name, '美国-US-01');
  });
});

test('A2A message:stream returns SSE task events', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message:stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/a2a+json',
        'A2A-Version': '1.0'
      },
      body: JSON.stringify({
        message: {
          parts: [{
            data: {
              address: 'trojan://secret@stream.example.com:443?sni=stream.example.com#香港-HK-01',
              services: ['Telegram'],
              platform: 'surge',
              adBlock: false
            }
          }]
        }
      })
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(text, /event: taskCreated/);
    assert.match(text, /TASK_STATE_COMPLETED/);
  });
});

test('A2A task subscribe returns terminal task event', async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postA2A(baseUrl, {
      address: 'trojan://secret@subscribe.example.com:443?sni=subscribe.example.com#香港-HK-01',
      services: ['Telegram'],
      platform: 'surge',
      adBlock: false
    });

    const response = await fetch(`${baseUrl}/tasks/${body.task.id}:subscribe`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: task/);
    assert.match(text, /TASK_STATE_COMPLETED/);
  });
});

test('A2A task cancel can cancel an input-required task', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message:send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/a2a+json',
        'A2A-Version': '1.0'
      },
      body: JSON.stringify({
        message: {
          parts: [{ text: '帮我生成一个配置' }]
        }
      })
    });
    const body = await readJson(response);
    assert.equal(body.task.status.state, 'TASK_STATE_INPUT_REQUIRED');

    const cancelResponse = await fetch(`${baseUrl}/tasks/${body.task.id}:cancel`, {
      method: 'POST',
      headers: { 'A2A-Version': '1.0' }
    });
    const cancelBody = await readJson(cancelResponse);

    assert.equal(cancelResponse.status, 200);
    assert.equal(cancelBody.task.status.state, 'TASK_STATE_CANCELED');
  });
});

test('A2A local file inputs are rejected by default', async () => {
  await withServer(async (baseUrl) => {
    const addressFile = await postA2A(baseUrl, {
      skillId: 'parse-proxies',
      addressFile: 'tests/fixtures/sample-subscription.txt'
    });
    assert.equal(addressFile.response.status, 200);
    assert.equal(addressFile.body.task.status.state, 'TASK_STATE_FAILED');
    assert.match(addressFile.body.task.status.message.parts[0].text, /A2A_ALLOW_LOCAL_FILES=1/);

    const generatorAddressFile = await postA2A(baseUrl, {
      skillId: 'generate-surge-profile',
      addressFile: 'tests/fixtures/sample-subscription.txt',
      services: ['Telegram']
    });
    assert.equal(generatorAddressFile.response.status, 200);
    assert.equal(generatorAddressFile.body.task.status.state, 'TASK_STATE_FAILED');
    assert.match(generatorAddressFile.body.task.status.message.parts[0].text, /A2A_ALLOW_LOCAL_FILES=1/);

    const configPath = await postA2A(baseUrl, {
      skillId: 'convert-config',
      configPath: 'configs/stable-only.conf',
      from: 'auto',
      to: 'clash'
    });
    assert.equal(configPath.response.status, 200);
    assert.equal(configPath.body.task.status.state, 'TASK_STATE_FAILED');
    assert.match(configPath.body.task.status.message.parts[0].text, /A2A_ALLOW_LOCAL_FILES=1/);
  });
});

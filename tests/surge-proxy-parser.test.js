'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { loadProxySource, parseProxyAddress, parseProxyContent } = require('../scripts/surge-proxy-parser');

function b64(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/=+$/, '');
}

test('parser converts trojan URI to a Surge proxy line', () => {
  const proxy = parseProxyAddress('trojan://secret@example.com:443?sni=sni.example.com#美国-US-01');

  assert.equal(proxy.name, '美国-US-01');
  assert.equal(proxy.type, 'trojan');
  assert.equal(proxy.host, 'example.com');
  assert.equal(proxy.port, 443);
  assert.equal(proxy.line, '美国-US-01 = trojan, example.com, 443, password=secret, tls=true, sni=sni.example.com, udp-relay=true');
});

test('parser converts SIP002 shadowsocks URI to a Surge proxy line', () => {
  const proxy = parseProxyAddress(`ss://${b64('chacha20-ietf-poly1305:secret')}@hk.example.com:8388#香港-HK-01`);

  assert.equal(proxy.name, '香港-HK-01');
  assert.equal(proxy.line, '香港-HK-01 = ss, hk.example.com, 8388, encrypt-method=chacha20-ietf-poly1305, password=secret, udp-relay=true');
});

test('parser decodes base64 subscription content and deduplicates names', () => {
  const lines = [
    'trojan://a@example.com:443#美国-US-01',
    'trojan://b@example.org:443#美国-US-01'
  ].join('\n');
  const proxies = parseProxyContent(b64(lines));

  assert.equal(proxies.length, 2);
  assert.equal(proxies[0].name, '美国-US-01');
  assert.equal(proxies[1].name, '美国-US-01 2');
});

test('parser converts vmess URI to a Surge proxy line', () => {
  const payload = {
    ps: '日本-JP-01',
    add: 'jp.example.com',
    port: '443',
    id: '00000000-0000-0000-0000-000000000000',
    net: 'ws',
    host: 'cdn.example.com',
    path: '/ws',
    tls: 'tls',
    sni: 'jp.example.com'
  };
  const proxy = parseProxyAddress(`vmess://${b64(JSON.stringify(payload))}`);

  assert.equal(proxy.name, '日本-JP-01');
  assert.match(proxy.line, /日本-JP-01 = vmess, jp\.example\.com, 443/);
  assert.match(proxy.line, /username=00000000-0000-0000-0000-000000000000/);
  assert.match(proxy.line, /ws=true/);
  assert.match(proxy.line, /vmess-aead=true/);
});

test('parser loads and parses an HTTP subscription URL', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => 'trojan://secret@sg.example.com:443?sni=sg.example.com#新加坡-SG-01\n'
  });

  try {
    const proxies = await loadProxySource({ address: 'https://example.com/sub' });
    assert.equal(proxies.length, 1);
    assert.equal(proxies[0].name, '新加坡-SG-01');
  } finally {
    global.fetch = originalFetch;
  }
});

test('parser uses a generic user-agent so airports return node lists instead of managed configs', async () => {
  const originalFetch = global.fetch;
  const capturedHeaders = [];
  global.fetch = async (url, options = {}) => {
    capturedHeaders.push(options.headers || {});
    return {
      ok: true,
      status: 200,
      text: async () => 'trojan://secret@hk.example.com:443#HK-01\n'
    };
  };

  try {
    await loadProxySource({ address: 'https://example.com/sub' });
    const ua = capturedHeaders[0]['user-agent'] || '';
    // 不能用 surge-tuner 或 surge 之类的 UA，否则机场会返回 #!MANAGED-CONFIG 托管配置头
    assert.ok(!/surge/i.test(ua), `UA 不应包含 surge，实际: ${ua}`);
  } finally {
    global.fetch = originalFetch;
  }
});

test('parser reports a friendly error when airport returns a Surge managed-config header', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '#!MANAGED-CONFIG https://example.com/api/v1/client/subscribe?token=xxx\n[General]\nipv6 = false\n'
  });

  try {
    await assert.rejects(
      loadProxySource({ address: 'https://example.com/sub' }),
      /MANAGED-CONFIG|托管配置|节点列表/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('parser loads multiple addresses from address array', async () => {
  const proxies = await loadProxySource({
    addresses: [
      'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
      'trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01'
    ]
  });

  assert.equal(proxies.length, 2);
  assert.equal(proxies[0].name, '香港-HK-01');
  assert.equal(proxies[1].name, '美国-US-01');
});

test('parser loads multiple addresses from multiline address text', async () => {
  const proxies = await loadProxySource({
    address: [
      'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
      'trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01'
    ].join('\n')
  });

  assert.equal(proxies.length, 2);
});

test('parser decodes URL-encoded subscription content from airports that percent-encode the whole body', () => {
  // 部分机场订阅会把整段节点列表做 URL-encode，导致 `trojan://` 变成 `trojan%3A%2F%2F`，
  // 节点名里的中文也是 %XX 转义。解析器必须能识别这种格式。
  const raw = [
    'trojan%3A%2F%2Fsecret%40hk.example.com%3A443%3Fsni%3Dhk.example.com%23%E9%A6%99%E6%B8%AF-HK-01',
    'trojan%3A%2F%2Fsecret%40us.example.com%3A443%3Fsni%3Dus.example.com%23%E7%BE%8E%E5%9B%BD-US-01'
  ].join('%0A');
  const proxies = parseProxyContent(raw);

  assert.equal(proxies.length, 2);
  assert.equal(proxies[0].name, '香港-HK-01');
  assert.equal(proxies[0].host, 'hk.example.com');
  assert.equal(proxies[0].port, 443);
  assert.equal(proxies[1].name, '美国-US-01');
});

test('parser decodes URL-encoded content with CRLF separators (%0D%0A)', () => {
  const raw = [
    'trojan%3A%2F%2Fsecret%40hk.example.com%3A443%23HK-01',
    'trojan%3A%2F%2Fsecret%40us.example.com%3A443%23US-01'
  ].join('%0D%0A');
  const proxies = parseProxyContent(raw);

  assert.equal(proxies.length, 2);
  assert.equal(proxies[0].name, 'HK-01');
  assert.equal(proxies[1].name, 'US-01');
});

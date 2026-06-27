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

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { candidateNames, prepareCatalogForServices } = require('../scripts/rule-discovery');

function writeTempCatalog(raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-catalog-'));
  const catalogPath = path.join(dir, 'service-catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(raw, null, 2), 'utf8');
  return { dir, catalogPath, cachePath: path.join(dir, 'cache.json') };
}

test('rule discovery candidateNames includes common GitHub directory forms', () => {
  assert.deepEqual(candidateNames('notion ai'), ['notion ai', 'notionai', 'Notionai', 'NOTIONAI']);
});

test('prepareCatalogForServices uses local catalog before network discovery', async () => {
  let fetchCalled = false;
  const { catalogPath, cachePath } = writeTempCatalog({
    Telegram: {
      aliases: ['telegram'],
      group: 'Telegram',
      rules: ['Telegram/Telegram.list'],
      policies: ['香港节点', 'All']
    }
  });

  const result = await prepareCatalogForServices(['Telegram'], {
    catalogPath,
    cachePath,
    discoverRules: true,
    fetchImpl: async () => { fetchCalled = true; }
  });

  assert.equal(fetchCalled, false);
  assert.equal(result.catalog.aliases.get('telegram').group, 'Telegram');
});

test('prepareCatalogForServices discovers missing service and writes cache', async () => {
  const { catalogPath, cachePath } = writeTempCatalog({});
  const result = await prepareCatalogForServices(['Notion'], {
    catalogPath,
    cachePath,
    discoverRules: true,
    fetchImpl: async (url) => {
      assert.match(url, /Notion$/);
      return {
        ok: true,
        status: 200,
        json: async () => [
          { type: 'file', name: 'Notion.list', html_url: 'https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Surge/Notion/Notion.list' }
        ]
      };
    }
  });

  assert.equal(result.discovered.length, 1);
  assert.equal(result.catalog.aliases.get('notion').group, 'Notion');
  assert.ok(fs.readFileSync(cachePath, 'utf8').includes('Notion/Notion.list'));
});

test('prepareCatalogForServices returns actionable error when discovery misses', async () => {
  const { catalogPath, cachePath } = writeTempCatalog({});
  await assert.rejects(
    () => prepareCatalogForServices(['MissingApp'], {
      catalogPath,
      cachePath,
      discoverRules: true,
      fetchImpl: async () => ({ ok: false, status: 404 })
    }),
    /Unknown service "MissingApp"/
  );
});

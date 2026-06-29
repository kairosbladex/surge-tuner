'use strict';

/**
 * a2a-agent.js — Core A2A agent with multi-skill support.
 *
 * Provides:
 *   - Agent Card with multiple skills
 *   - Skill routing for generate, convert, adblock, preferences
 *   - Task creation from A2A messages
 *   - Input extraction and materialization
 */

const crypto = require('crypto');
const path = require('path');

const pkg = require('../package.json');
const { generateSurgeConfig, validateGeneratedConfig } = require('./surge-config-generator');
const { generateLoonConfig } = require('./loon-config-generator');
const { generateQuantumultXConfig } = require('./quantumultx-config-generator');
const { generateClashConfig } = require('./clash-config-generator');
const { convertConfig, detectPlatform } = require('./cross-platform-converter');
const { generateSurgeModule, generateLoonAdblockConfig, generateClashRuleProviders, generateQXAdblockConfig, integrateAdblockIntoConfig } = require('./adblock-installer');
const { UserPreferenceStore } = require('./user-preference-store');
const { loadProxySource } = require('./surge-proxy-parser');
const { TASK_STATE, TaskStore, SkillRouter } = require('./a2a-task-manager');
const { applyServicePreset } = require('./generator-common');
const { prepareCatalogForServices } = require('./rule-discovery');
const { createAdblockArtifact, createAdblockInstructionArtifact } = require('./adblock-artifacts');

const PROTOCOL_VERSION = '1.0';
const DEFAULT_PROFILE_NAME = 'proxy-profile.conf';
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Agent Card ──────────────────────────────────────────────────────────────────

function buildAgentCard(baseUrl) {
  const serviceUrl = String(baseUrl || '').replace(/\/+$/, '');

  return {
    name: 'Proxy Tuner Agent',
    description: 'Multi-platform proxy configuration generator, cross-platform converter, ad-block installer, and preference-aware assistant for Surge, Loon, Quantumult X, and Clash.',
    url: serviceUrl || undefined,
    supportedInterfaces: [
      {
        url: serviceUrl,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: PROTOCOL_VERSION
      },
      {
        url: serviceUrl ? `${serviceUrl}/sse` : undefined,
        protocolBinding: 'HTTP+SSE',
        protocolVersion: PROTOCOL_VERSION
      }
    ],
    provider: {
      organization: 'surge-tuner workspace'
    },
    version: pkg.version,
    documentationUrl: serviceUrl ? `${serviceUrl}/docs` : undefined,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: true
    },
    securitySchemes: {},
    security: [],
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: [
      {
        id: 'generate-surge-profile',
        name: 'Generate Surge Profile',
        description: 'Create a validated Surge for iOS profile from proxy subscriptions, single proxy URIs, parsed proxy objects, services, custom rules, and optional ad blocking.',
        tags: ['surge', 'proxy', 'configuration', 'adblock', 'ios'],
        examples: [
          '{"addresses":["trojan://secret@example.com:443?sni=example.com#US-01"],"preset":"common","adBlock":true}',
          '{"subscriptions":[{"name":"AirportA","url":"https://example.com/sub?token=***"}],"services":["Telegram","YouTube"]}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'generate-loon-profile',
        name: 'Generate Loon Profile',
        description: 'Create a validated Loon proxy configuration from proxy subscriptions, URIs, services, and ad blocking.',
        tags: ['loon', 'proxy', 'configuration', 'adblock', 'ios'],
        examples: [
          '{"address":"trojan://secret@example.com:443#US-01","services":["Telegram","ChatGPT"],"adBlock":true,"platform":"loon"}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'generate-quantumultx-profile',
        name: 'Generate Quantumult X Profile',
        description: 'Create a validated Quantumult X proxy configuration from proxy subscriptions, URIs, services, and ad blocking.',
        tags: ['quantumultx', 'proxy', 'configuration', 'adblock', 'ios'],
        examples: [
          '{"address":"trojan://secret@example.com:443#US-01","services":["Telegram"],"adBlock":true,"platform":"quantumultx"}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'generate-clash-profile',
        name: 'Generate Clash Profile',
        description: 'Create a validated Clash/Stash YAML proxy configuration from proxy subscriptions, URIs, services, and ad blocking.',
        tags: ['clash', 'stash', 'proxy', 'configuration', 'adblock'],
        examples: [
          '{"address":"trojan://secret@example.com:443#US-01","services":["Telegram"],"adBlock":true,"platform":"clash"}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'convert-config',
        name: 'Convert Config Between Platforms',
        description: 'Convert proxy configuration files between Surge, Loon, Quantumult X, and Clash formats.',
        tags: ['convert', 'surge', 'loon', 'quantumultx', 'clash', 'cross-platform'],
        examples: [
          '{"config":"...surge config text...","from":"surge","to":"clash"}',
          '{"configPath":"tests/fixtures/source.conf","from":"auto","to":"loon"}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'install-adblock',
        name: 'Install Ad-Block Plugin',
        description: 'Generate and install ad-blocking modules, rule-sets, and scripts for any supported platform. Supports custom ad domains, online rule sources, and kelee.one integration.',
        tags: ['adblock', 'privacy', 'plugin', 'surge', 'loon', 'quantumultx', 'clash'],
        examples: [
          '{"platform":"surge","action":"generate","customDomains":["*.example-ad.com"],"useOnlineRules":true}',
          '{"platform":"loon","action":"integrate","config":"...existing config...","customDomains":["*.spam.com"]}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'manage-preferences',
        name: 'Manage User Preferences',
        description: 'Read, update, and apply user preferences for proxy configuration generation, including preferred platform, common services, ad-block level, custom domains, and routing rules.',
        tags: ['preferences', 'user', 'settings', 'persistence'],
        examples: [
          '{"action":"get"}',
          '{"action":"set","preferredPlatform":"clash","adBlockLevel":"full"}',
          '{"action":"build","address":"trojan://...","services":["Telegram","YouTube"]}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      },
      {
        id: 'parse-proxies',
        name: 'Parse Proxy Sources',
        description: 'Parse proxy URIs, subscription URLs, or subscription files and return structured proxy objects with protocol, host, port, and name.',
        tags: ['parse', 'proxy', 'subscription', 'uri'],
        examples: [
          '{"address":"trojan://secret@example.com:443?sni=example.com#US-01"}',
          '{"address":"https://example.com/sub?token=***"}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      }
    ]
  };
}

// ── Skill Handlers ──────────────────────────────────────────────────────────────

function registerSkills(router, taskStore, preferenceStore) {
  // Generate Surge Profile
  router.register('generate-surge-profile', async (task, input, options) => {
    const ctx = options.ctx || {};
    const pref = ctx.prefs || {};

    taskStore.addProgress(task.id, 'Parsing proxy source...');
    const proxies = await maybeLoadProxies(input, options);
    const genInput = applyServicePreset({
      subscriptions: input.subscriptions || pref.subscriptions || [],
      proxies: proxies || input.proxies || [],
      services: input.services || pref.commonServices || [],
      adBlock: input.adBlock ?? (pref.adBlockLevel !== 'none'),
      finalPolicy: input.finalPolicy || pref.finalPolicy || '兜底分流',
      rules: input.rules || [],
      preset: input.preset
    });

    taskStore.addProgress(task.id, `Generating Surge config (${(genInput.proxies || []).length} proxies)...`);
    const catalogResult = await prepareCatalogForServices(genInput.services, {
      discoverRules: Boolean(input.discoverRules),
      platform: 'surge',
      fetchImpl: options.fetchImpl,
      cachePath: options.ruleDiscoveryCachePath
    });
    const config = generateSurgeConfig(genInput, { ...options, catalog: catalogResult.catalog });

    const profileName = input.profileName || DEFAULT_PROFILE_NAME;
    taskStore.addProgress(task.id, 'Validating generated config...');

    const validation = validateGeneratedConfig(config, path.join('configs', 'generated', profileName), {
      strict: Boolean(input.strict)
    });
    const warnings = validation.issues.filter((i) => i.severity === 'warning');

    return {
      state: TASK_STATE.COMPLETED,
      message: warnings.length > 0
        ? `Generated ${profileName} with ${warnings.length} validation warning(s).`
        : `Generated validated Surge profile ${profileName}.`,
      artifacts: [
        {
          artifactId: 'surge-profile',
          name: profileName,
          description: 'Validated Surge for iOS profile.',
          parts: [{ text: config, metadata: { filename: profileName, mimeType: 'text/plain' } }]
        },
        {
          artifactId: 'generation-result',
          name: 'generation-result.json',
          description: 'Machine-readable generation summary.',
          parts: [{
            data: {
              ok: true,
              platform: 'surge',
              profileName,
              warnings,
              discoveries: catalogResult.discovered,
              inputSummary: summarizeInput(genInput),
              outputBytes: Buffer.byteLength(config, 'utf8')
            }
          }]
        }
      ].concat(adblockArtifactsForA2A('surge', genInput, input))
    };
  });

  // Generate Loon Profile
  router.register('generate-loon-profile', async (task, input, options) => {
    const ctx = options.ctx || {};
    const pref = ctx.prefs || {};

    taskStore.addProgress(task.id, 'Parsing proxy source...');
    const proxies = await maybeLoadProxies(input, options);
    const genInput = applyServicePreset({
      subscriptions: input.subscriptions || pref.subscriptions || [],
      proxies: proxies || input.proxies || [],
      services: input.services || pref.commonServices || [],
      adBlock: input.adBlock ?? (pref.adBlockLevel !== 'none'),
      finalPolicy: input.finalPolicy || pref.finalPolicy || '兜底分流',
      rules: input.rules || [],
      preset: input.preset
    });

    taskStore.addProgress(task.id, 'Generating Loon config...');
    const catalogResult = await prepareCatalogForServices(genInput.services, {
      discoverRules: Boolean(input.discoverRules),
      platform: 'loon',
      fetchImpl: options.fetchImpl,
      cachePath: options.ruleDiscoveryCachePath
    });
    const config = generateLoonConfig(genInput, { ...options, catalog: catalogResult.catalog });
    const profileName = input.profileName || 'loon-profile.conf';

    return {
      state: TASK_STATE.COMPLETED,
      message: `Generated Loon profile ${profileName}.`,
      artifacts: [
        {
          artifactId: 'loon-profile',
          name: profileName,
          description: 'Generated Loon proxy configuration.',
          parts: [{ text: config, metadata: { filename: profileName, mimeType: 'text/plain' } }]
        },
        {
          artifactId: 'generation-result',
          name: 'generation-result.json',
          parts: [{ data: { ok: true, platform: 'loon', profileName, discoveries: catalogResult.discovered, outputBytes: Buffer.byteLength(config, 'utf8') } }]
        }
      ].concat(adblockArtifactsForA2A('loon', genInput, input))
    };
  });

  // Generate QX Profile
  router.register('generate-quantumultx-profile', async (task, input, options) => {
    const ctx = options.ctx || {};
    const pref = ctx.prefs || {};

    taskStore.addProgress(task.id, 'Parsing proxy source...');
    const proxies = await maybeLoadProxies(input, options);
    const genInput = applyServicePreset({
      subscriptions: input.subscriptions || pref.subscriptions || [],
      proxies: proxies || input.proxies || [],
      services: input.services || pref.commonServices || [],
      adBlock: input.adBlock ?? (pref.adBlockLevel !== 'none'),
      finalPolicy: input.finalPolicy || pref.finalPolicy || '兜底分流',
      preset: input.preset
    });

    taskStore.addProgress(task.id, 'Generating Quantumult X config...');
    const catalogResult = await prepareCatalogForServices(genInput.services, {
      discoverRules: Boolean(input.discoverRules),
      platform: 'quantumultx',
      fetchImpl: options.fetchImpl,
      cachePath: options.ruleDiscoveryCachePath
    });
    const config = generateQuantumultXConfig(genInput, { ...options, catalog: catalogResult.catalog });
    const profileName = input.profileName || 'qx-profile.conf';

    return {
      state: TASK_STATE.COMPLETED,
      message: `Generated Quantumult X profile ${profileName}.`,
      artifacts: [
        {
          artifactId: 'quantumultx-profile',
          name: profileName,
          description: 'Generated Quantumult X configuration.',
          parts: [{ text: config, metadata: { filename: profileName, mimeType: 'text/plain' } }]
        },
        {
          artifactId: 'generation-result',
          name: 'generation-result.json',
          parts: [{ data: { ok: true, platform: 'quantumultx', profileName, discoveries: catalogResult.discovered, outputBytes: Buffer.byteLength(config, 'utf8') } }]
        }
      ].concat(adblockArtifactsForA2A('quantumultx', genInput, input))
    };
  });

  // Generate Clash Profile
  router.register('generate-clash-profile', async (task, input, options) => {
    const ctx = options.ctx || {};
    const pref = ctx.prefs || {};

    taskStore.addProgress(task.id, 'Parsing proxy source...');
    const proxies = await maybeLoadProxies(input, options);
    const genInput = applyServicePreset({
      subscriptions: input.subscriptions || pref.subscriptions || [],
      proxies: proxies || input.proxies || [],
      services: input.services || pref.commonServices || [],
      adBlock: input.adBlock ?? (pref.adBlockLevel !== 'none'),
      finalPolicy: input.finalPolicy || pref.finalPolicy || '兜底分流',
      preset: input.preset
    });

    taskStore.addProgress(task.id, 'Generating Clash YAML config...');
    const catalogResult = await prepareCatalogForServices(genInput.services, {
      discoverRules: Boolean(input.discoverRules),
      platform: 'clash',
      fetchImpl: options.fetchImpl,
      cachePath: options.ruleDiscoveryCachePath
    });
    const config = generateClashConfig(genInput, { ...options, catalog: catalogResult.catalog });
    const profileName = input.profileName || 'clash-profile.yaml';

    return {
      state: TASK_STATE.COMPLETED,
      message: `Generated Clash profile ${profileName}.`,
      artifacts: [
        {
          artifactId: 'clash-profile',
          name: profileName,
          description: 'Generated Clash YAML configuration.',
          parts: [{ text: config, metadata: { filename: profileName, mimeType: 'application/x-yaml' } }]
        },
        {
          artifactId: 'generation-result',
          name: 'generation-result.json',
          parts: [{ data: { ok: true, platform: 'clash', profileName, discoveries: catalogResult.discovered, outputBytes: Buffer.byteLength(config, 'utf8') } }]
        }
      ].concat(adblockArtifactsForA2A('clash', genInput, input))
    };
  });

  // Convert Config
  router.register('convert-config', async (task, input, options) => {
    taskStore.addProgress(task.id, 'Reading source config...');

    let configText = input.config;
    if (!configText && input.configPath) {
      if (!options.allowLocalFiles) {
        throw new Error('configPath requires A2A_ALLOW_LOCAL_FILES=1');
      }
      const fs = require('fs');
      configText = fs.readFileSync(path.resolve(REPO_ROOT, input.configPath), 'utf8');
    }
    if (!configText) throw new Error('config or configPath is required');

    const from = input.from === 'auto' ? detectPlatform(configText) : (input.from || 'surge');
    const to = input.to || 'clash';

    taskStore.addProgress(task.id, `Converting from ${from} to ${to}...`);
    const result = convertConfig(configText, from, to);
    const outputName = input.outputName || `converted.${to}.${to === 'clash' ? 'yaml' : 'conf'}`;

    return {
      state: TASK_STATE.COMPLETED,
      message: `Converted config from ${from} to ${to}.`,
      artifacts: [
        {
          artifactId: 'converted-config',
          name: outputName,
          description: `Converted ${from} → ${to} configuration.`,
          parts: [{ text: result, metadata: { filename: outputName, mimeType: 'text/plain' } }]
        },
        {
          artifactId: 'conversion-result',
          name: 'conversion-result.json',
          parts: [{ data: { ok: true, from, to, outputBytes: Buffer.byteLength(result, 'utf8') } }]
        }
      ]
    };
  });

  // Install AdBlock
  router.register('install-adblock', async (task, input, options) => {
    const platform = input.platform || 'surge';
    const action = input.action || 'generate';
    const customDomains = input.customDomains || [];
    const useOnlineRules = input.useOnlineRules !== false;

    taskStore.addProgress(task.id, `Generating ad-block config for ${platform}...`);

    let output;
    let outputName;

    if (action === 'generate') {
      if (platform === 'surge') {
        output = generateSurgeModule({
          name: input.name || 'Custom-Ad-Block',
          desc: input.desc || 'Custom ad-block module',
          customDomains,
          useOnlineRules,
          onlineSources: input.onlineSources,
          extraScripts: input.extraScripts
        });
        outputName = input.outputName || 'custom-adblock.sgmodule';
      } else if (platform === 'loon') {
        output = generateLoonAdblockConfig({ customDomains, useOnlineRules, onlineSources: input.onlineSources });
        outputName = input.outputName || 'loon-adblock.conf';
      } else if (platform === 'quantumultx') {
        output = generateQXAdblockConfig({ customDomains, useOnlineRules, onlineSources: input.onlineSources });
        outputName = input.outputName || 'qx-adblock.conf';
      } else if (platform === 'clash') {
        output = generateClashRuleProviders({ customDomains, useOnlineRules, onlineSources: input.onlineSources });
        outputName = input.outputName || 'clash-adblock.yaml';
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
    } else if (action === 'integrate') {
      const configText = input.config;
      if (!configText) throw new Error('config is required for integrate action');
      output = integrateAdblockIntoConfig(configText, platform, { customDomains, useOnlineRules, onlineSources: input.onlineSources });
      outputName = input.outputName || `enhanced-${platform}.conf`;
    } else {
      throw new Error(`Unknown action: ${action}. Use generate or integrate.`);
    }

    return {
      state: TASK_STATE.COMPLETED,
      message: `Ad-block ${action === 'generate' ? 'module' : 'integration'} generated for ${platform}.`,
      artifacts: [
        {
          artifactId: 'adblock-config',
          name: outputName,
          description: `${platform} ad-block configuration.`,
          parts: [{ text: output, metadata: { filename: outputName, mimeType: 'text/plain' } }]
        },
        {
          artifactId: 'adblock-result',
          name: 'adblock-result.json',
          parts: [{ data: { ok: true, platform, action, outputBytes: Buffer.byteLength(output, 'utf8') } }]
        }
      ]
    };
  });

  // Manage Preferences
  router.register('manage-preferences', async (task, input) => {
    const store = preferenceStore;
    const action = input.action || 'get';

    let data;
    switch (action) {
      case 'get':
        data = store.getAll();
        break;
      case 'set': {
        const updates = {};
        for (const key of Object.keys(input)) {
          if (key !== 'action' && key !== 'skillId' && key !== 'messageId') {
            updates[key] = input[key];
          }
        }
        store.set(updates);
        data = { ok: true, updated: updates, preferences: store.getAll() };
        break;
      }
      case 'addDomain':
        if (!input.domain) throw new Error('domain is required');
        data = { ok: store.addAdDomain(input.domain), domain: input.domain };
        break;
      case 'removeDomain':
        if (!input.domain) throw new Error('domain is required');
        data = { ok: store.removeAdDomain(input.domain), domain: input.domain };
        break;
      case 'setPlatform':
        if (!input.platform) throw new Error('platform is required');
        data = { ok: store.setPlatform(input.platform), platform: input.platform };
        break;
      case 'setAdLevel':
        if (!input.level) throw new Error('level is required');
        data = { ok: store.setAdBlockLevel(input.level), level: input.level };
        break;
      case 'build': {
        // Build a generator input from preferences + overrides
        const genInput = store.buildGeneratorInput(input);
        data = { ok: true, input: genInput, preferences: store.getAll() };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}. Use get, set, addDomain, removeDomain, setPlatform, setAdLevel, or build.`);
    }

    return {
      state: TASK_STATE.COMPLETED,
      message: `Preferences action "${action}" completed.`,
      artifacts: [
        {
          artifactId: 'preferences-result',
          name: 'preferences-result.json',
          description: 'User preferences operation result.',
          parts: [{ data }]
        }
      ]
    };
  });

  // Parse Proxies
  router.register('parse-proxies', async (task, input, options) => {
    if (!input.address && !input.addressFile && !input.addresses) {
      throw new Error('address, addresses, or addressFile is required');
    }
    if (input.addressFile && !options.allowLocalFiles) {
      throw new Error('addressFile requires A2A_ALLOW_LOCAL_FILES=1');
    }

    taskStore.addProgress(task.id, 'Parsing proxy source...');
    const proxies = await loadProxySource({
      address: input.address,
      addresses: input.addresses,
      addressFile: input.addressFile || null
    });

    return {
      state: TASK_STATE.COMPLETED,
      message: `Parsed ${proxies.length} proxy(ies).`,
      artifacts: [
        {
          artifactId: 'parsed-proxies',
          name: 'parsed-proxies.json',
          description: 'Structured proxy objects.',
          parts: [{
            data: {
              ok: true,
              count: proxies.length,
              proxies: proxies.map((p) => ({
                name: p.name,
                type: p.type,
                host: p.host,
                port: p.port
              }))
            }
          }]
        }
      ]
    };
  });
}

// ── Task Creation ───────────────────────────────────────────────────────────────

async function createTaskFromSendMessageRequest(request, taskStore, skillRouter, options = {}) {
  const now = new Date().toISOString();
  const contextId = request.contextId || (request.message && request.message.contextId) || crypto.randomUUID();
  const history = request.message ? [request.message] : [];

  try {
    const agentInput = await extractGenerationInput(request.message, options);
    if (!agentInput) {
      return buildTaskResponse(taskStore, null, contextId, TASK_STATE.INPUT_REQUIRED, now, history,
        'Send a JSON input with address, subscriptions, services, etc. to generate a configuration.');
    }

    // Determine skill
    const skillId = agentInput.skillId || determineSkill(agentInput);
    if (!skillId) {
      return buildTaskResponse(taskStore, null, contextId, TASK_STATE.INPUT_REQUIRED, now, history,
        'Could not determine which skill to invoke. Specify platform (surge/loon/quantumultx/clash) or skill explicitly.');
    }

    const handler = skillRouter.getSkill(skillId);
    if (!handler) {
      return buildTaskResponse(taskStore, null, contextId, TASK_STATE.FAILED, now, history,
        `Unknown skill: ${skillId}. Available skills: ${skillRouter.listSkills().join(', ')}`);
    }

    // Create task and execute
    const task = taskStore.createTask(skillId, contextId);
    task.history = history;
    taskStore.updateTask(task.id, { status: { state: TASK_STATE.WORKING, message: { role: 'ROLE_AGENT', parts: [{ text: `Starting skill: ${skillId}...` }] } } });

    // Load user preferences
    const preferenceStore = options.preferenceStore || new (require('./user-preference-store').UserPreferenceStore)();
    const ctx = { prefs: preferenceStore.getAll() };

    try {
      const result = await handler(task, agentInput, { ...options, ctx, taskStore, preferenceStore });
      taskStore.updateTask(task.id, {
        status: {
          state: result.state,
          message: { role: 'ROLE_AGENT', parts: [{ text: result.message }] }
        },
        artifacts: result.artifacts
      });
    } catch (error) {
      taskStore.updateTask(task.id, {
        status: {
          state: TASK_STATE.FAILED,
          message: { role: 'ROLE_AGENT', parts: [{ text: error.message }] }
        },
        artifacts: [
          {
            artifactId: 'error',
            name: 'error.json',
            description: 'Execution error.',
            parts: [{ data: { ok: false, error: error.message } }]
          }
        ]
      });
    }

    return { task: taskStore.getTask(task.id) };
  } catch (error) {
    return buildTaskResponse(taskStore, null, contextId, TASK_STATE.FAILED, now, history, error.message);
  }
}

function buildTaskResponse(taskStore, id, contextId, state, timestamp, history, messageText, artifacts = []) {
  const task = {
    id: id || crypto.randomUUID(),
    contextId,
    status: { state, timestamp, message: { role: 'ROLE_AGENT', parts: [{ text: messageText }] } },
    artifacts,
    history
  };
  // Use _tasks map directly if it's a TaskStore instance
  if (taskStore && taskStore._tasks) {
    taskStore._tasks.set(task.id, task);
  } else if (taskStore && typeof taskStore.save === 'function') {
    taskStore.save(task);
  }
  return { task };
}

// ── Skill Detection ─────────────────────────────────────────────────────────────

function determineSkill(input) {
  // Explicit skillId wins
  if (input.skillId) return input.skillId;

  // Platform-based routing
  const platform = (input.platform || '').toLowerCase();

  // If it's a conversion request
  if (input.from || input.to || input.configPath || (input.config && input.from)) {
    return 'convert-config';
  }

  // If it's an adblock request
  if (input.action === 'integrate' || input.action === 'generate' || input.customDomains || input.useOnlineRules !== undefined) {
    if (input.action === 'integrate' || input.action === 'generate') {
      return 'install-adblock';
    }
  }

  // If it's a preferences request
  if (input.action === 'get' || input.action === 'set' || input.action === 'setPlatform' ||
      input.action === 'setAdLevel' || input.action === 'build' || input.action === 'addDomain' ||
      input.action === 'removeDomain') {
    return 'manage-preferences';
  }

  // If only parsing is requested
  if ((input.address || input.addresses) && !input.services && !input.subscriptions && !input.preset) {
    return 'parse-proxies';
  }

  // Generate profile for the specified platform
  switch (platform) {
    case 'loon': return 'generate-loon-profile';
    case 'quantumultx':
    case 'qx': return 'generate-quantumultx-profile';
    case 'clash':
    case 'stash': return 'generate-clash-profile';
    case 'surge':
    default: return 'generate-surge-profile';
  }
}

// ── Input Extraction ───────────────────────────────────────────────────────────

async function extractGenerationInput(message, options = {}) {
  if (!message || !Array.isArray(message.parts)) {
    throw new Error('message.parts must be an array');
  }

  const candidates = [];
  const textParts = [];

  for (const part of message.parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.data && typeof part.data === 'object' && !Array.isArray(part.data)) {
      candidates.push(part.data);
    }
    if (typeof part.text === 'string' && part.text.trim()) {
      textParts.push(part.text.trim());
      const parsed = tryParseJson(part.text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        candidates.push(parsed);
      }
    }
  }

  const source = candidates.length > 0 ? normalizeEnvelope(candidates[0]) : null;
  if (source) return source;

  const text = textParts.join('\n').trim();
  if (text) {
    if (looksLikeProxySource(text)) {
      return { address: text };
    }
  }

  return null;
}

function normalizeEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value.input || value.surgeConfigRequest || value.request || value;
}

function tryParseJson(value) {
  try { return JSON.parse(value); } catch (_) { return null; }
}

function looksLikeProxySource(value) {
  return /^(https?:\/\/|ss:\/\/|trojan:\/\/|vmess:\/\/|hy2:\/\/|hysteria2:\/\/|tuic:\/\/)/i.test(value);
}

async function maybeLoadProxies(input, options) {
  if (input.proxies) return null; // Already have proxies
  if (input.address || input.addresses || input.addressFile) {
    if (input.addressFile && !options.allowLocalFiles) {
      throw new Error('addressFile requires A2A_ALLOW_LOCAL_FILES=1');
    }
    return loadProxySource({
      address: input.address,
      addresses: input.addresses,
      addressFile: input.addressFile || null
    });
  }
  return null;
}

function adblockArtifactsForA2A(platform, genInput, input) {
  if (!genInput.adBlock) return [];
  const artifact = createAdblockArtifact(platform, {
    customDomains: input.customDomains,
    useOnlineRules: input.useOnlineRules,
    onlineSources: input.onlineSources,
    outputName: input.adblockOutputName
  });
  const guide = createAdblockInstructionArtifact(platform);
  return [
    {
      artifactId: artifact.artifactId,
      name: artifact.name,
      description: artifact.description,
      parts: [{ text: artifact.text, metadata: { filename: artifact.name, mimeType: artifact.mimeType } }]
    },
    {
      artifactId: guide.artifactId,
      name: guide.name,
      description: guide.description,
      parts: [{ text: guide.text, metadata: { filename: guide.name, mimeType: guide.mimeType } }]
    }
  ];
}

function summarizeInput(input) {
  const subs = Array.isArray(input.subscriptions) ? input.subscriptions.map((s) => ({ name: s.name })) : [];
  const proxies = Array.isArray(input.proxies) ? input.proxies.map((p) => ({ name: p.name, type: p.type })) : [];
  return {
    subscriptionCount: subs.length,
    subscriptions: subs,
    proxyCount: proxies.length,
    proxies,
    services: Array.isArray(input.services) ? input.services : [],
    adBlock: input.adBlock === true,
    finalPolicy: input.finalPolicy || '兜底分流'
  };
}

function cleanProfileName(value) {
  const name = String(value || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME;
  return name.replace(/[\/\\\r\n]/g, '-');
}

module.exports = {
  PROTOCOL_VERSION,
  buildAgentCard,
  createTaskFromSendMessageRequest,
  extractGenerationInput,
  registerSkills,
  determineSkill
};

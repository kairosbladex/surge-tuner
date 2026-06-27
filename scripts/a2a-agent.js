'use strict';

const crypto = require('crypto');
const path = require('path');

const pkg = require('../package.json');
const { generateSurgeConfig, validateGeneratedConfig } = require('./surge-config-generator');
const { loadProxySource } = require('./surge-proxy-parser');

const PROTOCOL_VERSION = '1.0';
const DEFAULT_PROFILE_NAME = 'surge-profile.conf';

function createTaskStore() {
  const tasks = new Map();

  return {
    save(task) {
      tasks.set(task.id, task);
      return task;
    },
    get(id) {
      return tasks.get(id) || null;
    },
    list() {
      return Array.from(tasks.values()).sort((left, right) => {
        const leftTime = left.status && left.status.timestamp ? left.status.timestamp : '';
        const rightTime = right.status && right.status.timestamp ? right.status.timestamp : '';
        return rightTime.localeCompare(leftTime);
      });
    }
  };
}

function buildAgentCard(baseUrl) {
  const serviceUrl = String(baseUrl || '').replace(/\/+$/, '');

  return {
    name: 'Surge Tuner Agent',
    description: 'Generates and validates Surge for iOS proxy profiles from subscriptions, proxy URIs, and structured service selections.',
    supportedInterfaces: [
      {
        url: serviceUrl,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: PROTOCOL_VERSION
      }
    ],
    provider: {
      organization: 'Local surge-tuner workspace'
    },
    version: pkg.version,
    documentationUrl: serviceUrl ? `${serviceUrl}/docs/a2a` : undefined,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false
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
          '{"address":"trojan://secret@example.com:443?sni=example.com#US-01","services":["Telegram","ChatGPT"],"adBlock":true}',
          '{"subscriptions":[{"name":"AirportA","url":"https://example.com/sub?token=***"}],"services":["Telegram","YouTube"]}'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json', 'text/plain']
      }
    ]
  };
}

async function createTaskFromSendMessageRequest(request, options = {}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const contextId = request.contextId || request.message && request.message.contextId || crypto.randomUUID();
  const history = request.message ? [request.message] : [];

  try {
    const agentInput = await extractGenerationInput(request.message, {
      allowLocalFiles: Boolean(options.allowLocalFiles)
    });

    if (!agentInput) {
      return buildTask({
        id,
        contextId,
        state: 'TASK_STATE_INPUT_REQUIRED',
        timestamp: now,
        history,
        messageText: 'Send a JSON input with address, subscriptions, or proxies to generate a Surge profile.'
      });
    }

    const config = generateSurgeConfig(agentInput.input);
    const validation = validateGeneratedConfig(config, agentInput.outputPath || path.join('configs', 'generated', DEFAULT_PROFILE_NAME), {
      strict: Boolean(agentInput.strict)
    });
    const warnings = validation.issues.filter((issue) => issue.severity === 'warning');
    const profileName = cleanProfileName(agentInput.profileName || DEFAULT_PROFILE_NAME);

    return buildTask({
      id,
      contextId,
      state: 'TASK_STATE_COMPLETED',
      timestamp: now,
      history,
      messageText: warnings.length > 0
        ? `Generated ${profileName} with ${warnings.length} validation warning(s).`
        : `Generated validated Surge profile ${profileName}.`,
      artifacts: [
        {
          artifactId: 'surge-profile',
          name: profileName,
          description: 'Validated Surge for iOS profile.',
          parts: [
            {
              text: config,
              metadata: {
                filename: profileName,
                mimeType: 'text/plain'
              }
            }
          ]
        },
        {
          artifactId: 'generation-result',
          name: 'generation-result.json',
          description: 'Machine-readable generation summary for calling agents.',
          parts: [
            {
              data: {
                ok: true,
                profileName,
                warnings,
                inputSummary: summarizeInput(agentInput.input),
                outputBytes: Buffer.byteLength(config, 'utf8')
              }
            }
          ]
        }
      ]
    });
  } catch (error) {
    return buildTask({
      id,
      contextId,
      state: 'TASK_STATE_FAILED',
      timestamp: now,
      history,
      messageText: error.message,
      artifacts: [
        {
          artifactId: 'generation-error',
          name: 'generation-error.json',
          description: 'Generation failure details.',
          parts: [
            {
              data: {
                ok: false,
                error: error.message
              }
            }
          ]
        }
      ]
    });
  }
}

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
  if (source) {
    return materializeInput(source, options);
  }

  const text = textParts.join('\n').trim();
  if (text && looksLikeProxySource(text)) {
    return materializeInput({ address: text }, options);
  }

  return null;
}

async function materializeInput(source, options = {}) {
  const input = pickGeneratorFields(source);

  if (source.address || source.addressFile) {
    if (source.addressFile && !options.allowLocalFiles) {
      throw new Error('addressFile is disabled for the A2A server; send address, subscriptions, or proxies instead');
    }

    input.proxies = await loadProxySource({
      address: source.address,
      addressFile: source.addressFile || null
    });
  }

  if (!input.subscriptions && !input.proxies && !source.address && !source.addressFile) {
    return null;
  }

  return {
    input,
    strict: Boolean(source.strict),
    profileName: source.profileName || source.outputName,
    outputPath: source.outputPath
  };
}

function normalizeEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value.input || value.surgeConfigRequest || value.request || value;
}

function pickGeneratorFields(source) {
  const input = {};
  for (const key of ['subscriptions', 'proxies', 'regions', 'services', 'adBlock', 'finalPolicy', 'rules']) {
    if (source[key] !== undefined) {
      input[key] = source[key];
    }
  }
  return input;
}

function buildTask({ id, contextId, state, timestamp, history, messageText, artifacts = [] }) {
  return {
    id,
    contextId,
    status: {
      state,
      timestamp,
      message: {
        role: 'ROLE_AGENT',
        parts: [{ text: messageText }]
      }
    },
    artifacts,
    history
  };
}

function summarizeInput(input) {
  const subscriptions = Array.isArray(input.subscriptions)
    ? input.subscriptions.map((sub) => ({ name: sub.name }))
    : [];
  const proxies = Array.isArray(input.proxies)
    ? input.proxies.map((proxy) => ({ name: proxy.name, type: proxy.type || '' }))
    : [];

  return {
    subscriptionCount: subscriptions.length,
    subscriptions,
    proxyCount: proxies.length,
    proxies,
    services: Array.isArray(input.services) ? input.services : [],
    adBlock: input.adBlock === true || Boolean(input.adBlock && input.adBlock.enabled),
    finalPolicy: input.finalPolicy || '兜底分流'
  };
}

function cleanProfileName(value) {
  const name = String(value || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME;
  return name.replace(/[\/\\\r\n]/g, '-');
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function looksLikeProxySource(value) {
  return /^(https?:\/\/|ss:\/\/|trojan:\/\/|vmess:\/\/|hy2:\/\/|hysteria2:\/\/|tuic:\/\/)/i.test(value);
}

module.exports = {
  PROTOCOL_VERSION,
  createTaskStore,
  buildAgentCard,
  createTaskFromSendMessageRequest,
  extractGenerationInput
};

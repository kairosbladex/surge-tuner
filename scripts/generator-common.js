'use strict';

const fs = require('fs');
const path = require('path');

const COMMON_PRESET_SERVICES = [
  'Telegram',
  'YouTube',
  'GitHub',
  'ChatGPT',
  'Google',
  'Twitter',
  'Instagram'
];

function splitList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function applyServicePreset(input = {}) {
  const preset = String(input.preset || '').toLowerCase();
  const services = Array.isArray(input.services) ? input.services.filter(Boolean) : [];
  if (services.length > 0) return { ...input, services };
  if (preset === 'common') return { ...input, services: [...COMMON_PRESET_SERVICES] };
  return { ...input, services };
}

function readAddressesArgument(value, cwd = process.cwd()) {
  if (!value) return [];
  const raw = String(value);
  const filePath = path.resolve(cwd, raw);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return parseAddressList(fs.readFileSync(filePath, 'utf8'));
  }
  return parseAddressList(raw);
}

function parseAddressList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseAddressList(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.addresses)) {
      return parseAddressList(parsed.addresses);
    }
  } catch (_) {
    // Not JSON; treat it as plain text.
  }

  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildProxySourceOptions(args = {}, cwd = process.cwd()) {
  return {
    address: args.address || null,
    addresses: args.addresses ? readAddressesArgument(args.addresses, cwd) : args.addresses,
    addressFile: args.addressFile ? path.resolve(cwd, args.addressFile) : null
  };
}

function normalizeGeneratorInput(input = {}) {
  return applyServicePreset({
    ...input,
    addresses: Array.isArray(input.addresses) ? input.addresses : parseAddressList(input.addresses || [])
  });
}

module.exports = {
  COMMON_PRESET_SERVICES,
  splitList,
  applyServicePreset,
  readAddressesArgument,
  parseAddressList,
  buildProxySourceOptions,
  normalizeGeneratorInput
};

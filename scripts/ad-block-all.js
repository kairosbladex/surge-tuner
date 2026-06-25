// ============================================================
// Surge Script — 全能广告拦截 (All-in-One)
// 类型: http-response
// 合并移除开屏广告 + 应用内广告 + 弹窗广告
// 需 MITM 解密，requires-body = true
// 匹配: ^https?://.*
// ============================================================

// === 配置 ===
const CONFIG = {
  debug: false,  // 设为 true 可在日志中查看处理详情
};

// === 广告字段黑名单 ===
const AD_FIELDS = new Set([
  'splash_ad', 'splashAd', 'splash_ad_info', 'splashInfo',
  'open_ad', 'openAd', 'launch_ad', 'launchAd',
  'startup_ad', 'startupAd',
  'ad_info', 'adInfo', 'ad_data', 'adData',
  'ad_list', 'adList', 'ad_content', 'adContent',
  'advertise', 'advertisement', 'advertising',
  'ads', 'ad', 'advert', 'advertisement_info',
  'promotion', 'sponsor', 'marketing',
  'banner', 'interstitial', 'reward', 'rewarded',
  'popup', 'pop_up', 'popover', 'modal',
  'placement', 'adunit', 'adslot',
  'commercial', 'commercials',
  'float_window', 'floatWindow',
  'recommend_ads', 'feed_ads',
  'ad_config', 'adConfig', 'ad_configuration',
  'ad_strategy', 'adStrategy',
  'ad_source', 'adSource',
  'ad_type', 'adType',
  'ad_trace', 'adTrace',
  'show_ad', 'showAd',
  'show_popup', 'showPopup',
  'show_guide', 'showGuide',
  'show_reddot', 'showReddot',
  'guide_ad', 'guideAd',
  'newer_guide', 'newerGuide',
  'update_guide', 'updateGuide',
  'rate_popup', 'rateDialog',
  'subscribe_guide',
]);

// === URL 模式匹配（决定是否处理）===
function shouldProcess(url) {
  const patterns = [
    // 广告相关
    /\/ads?\//i, /\/advert/i, /\/promot/i, /\/sponsor/i,
    /\/splash/i, /\/launch/i, /\/startup/i,
    /\/banner/i, /\/interstitial/i, /\/reward/i,
    /\/popup/i, /\/modal/i, /\/popover/i,
    /\/feed/i, /\/recommend/i,
    /\/marketing/i, /\/commercial/i,
    /\/float/i, /\/floatad/i,
    // 广告配置
    /\/ad_config/i, /\/placement/i,
    /\/booklet/i, /\/notice/i,
    // 通用 API
    /\/api\/(v\d+\/)?(ad|ads|advert|splash|banner|promot)/i,
    // 特定 SDK
    /pangle/i, /pangolin/i, /gdt/i, /qq\.com.*ad/i,
    /bytedance.*ad/i, /byteoversea.*ad/i,
    // 广告关键词在路径中
    /\/(get|load|fetch|request)(Ad|Ads|Advert)/i,
    /get(Ad|Splash|Banner|Popup)Config/i,
  ];
  return patterns.some(p => p.test(url));
}

// === JSON 深度清洗 ===
function clean(obj, depth = 0) {
  if (depth > 20) return obj;
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    const result = [];
    for (const item of obj) {
      // 跳过广告项
      if (item && typeof item === 'object' && isAdObject(item)) continue;

      const cleaned = clean(item, depth + 1);
      if (cleaned !== undefined && cleaned !== null) {
        result.push(cleaned);
      }
    }
    return result;
  }

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    // 跳过广告字段
    if (AD_FIELDS.has(key)) {
      log(`跳过广告字段: ${key}`);
      continue;
    }

    // 检查 key 是否匹配广告模式
    if (/^(show_)?(ad|ads|advert|splash|banner|popup|modal|float|promot)/i.test(key)) {
      log(`跳过广告 key: ${key}`);
      continue;
    }

    if (val && typeof val === 'object') {
      result[key] = clean(val, depth + 1);
    } else {
      // 过滤掉明显的广告 URL 值
      if (typeof val === 'string') {
        const adUrlPatterns = [/^https?:\/\/.*(ads|advert|splash|banner|popup|promot)/i];
        if (adUrlPatterns.some(p => p.test(val))) continue;
      }
      result[key] = val;
    }
  }
  return result;
}

// === 判断对象是否为广告项 ===
function isAdObject(obj) {
  if (!obj || typeof obj !== 'object') return false;

  const signals = [
    'is_ad', 'isAd', 'isAdvertisement',
    'ad_type', 'adType', 'creative_type',
    'ad_id', 'adId', 'placement_id',
    'interaction_type', 'ad_source',
    'click_url', 'deeplink_url',
    'download_url', 'ad_url',
    'ad_mark', 'adMark',
    'render_type', 'template_id',
    'ad_sdk', 'adSdk',
  ];

  return signals.some(s => s in obj);
}

// === 日志 ===
function log(msg) {
  if (CONFIG.debug) {
    console.log(`[Ad-Block] ${msg}`);
  }
}

// === HTML 清洗 ===
function cleanHTML(body) {
  return body
    // 移除广告 iframe
    .replace(/<iframe[^>]*(?:ads|advert|doubleclick|googlesyndication)[^>]*>[\s\S]*?<\/iframe>/gi, '')
    // 移除广告 div
    .replace(/<div[^>]*(?:id|class)=["'][^"']*(?:ads|advert|banner|popup|modal|overlay|float)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    // 移除广告脚本
    .replace(/<script[^>]*src=["'][^"']*(?:ads|advert|doubleclick|googlesyndication|google-analytics)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
    // 移除 adsbygoogle
    .replace(/<ins[^>]*class=["']adsbygoogle["'][^>]*>[\s\S]*?<\/ins>/gi, '')
    // 移除 data-ad-* 属性
    .replace(/\s+data-ad-[^=]+="[^"]*"/gi, '');
}

// ============================================================
// 主入口
// ============================================================
try {
  const url = $request.url;
  if (!shouldProcess(url)) {
    $done({});
    return;
  }

  const contentType = ($response.headers['Content-Type'] || $response.headers['content-type'] || '').toLowerCase();
  let body = $response.body;
  if (!body) {
    $done({});
    return;
  }

  if (contentType.includes('json') || contentType.includes('application/json')) {
    // JSON 处理
    let data = JSON.parse(body);
    data = clean(data);
    body = JSON.stringify(data);
    $done({ body });
  } else if (contentType.includes('html')) {
    // HTML 处理
    body = cleanHTML(body);
    $done({ body });
  } else if (contentType.includes('javascript') || contentType.includes('x-javascript')) {
    // JS 处理 — 移除广告注入代码
    body = body
      .replace(/\.(show|load|init|display)(Ad|Ads|Banner|Interstitial|Rewarded|Splash|Popup)\(/gi, '// blocked $1$2(')
      .replace(/new\s+(Ad|Banner|Interstitial|Rewarded|Splash|Popup)(View|Controller)?\(/gi, '// blocked new $1$2(');
    $done({ body });
  } else {
    $done({});
  }
} catch (e) {
  log(`错误: ${e.message}`);
  $done({});
}

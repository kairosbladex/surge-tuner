// ============================================================
// Surge Script — 开屏广告移除
// 类型: http-response
// 需 MITM 解密对应的域名
// 匹配: ^https?://.*
// 参数: requires-body = true
// ============================================================

// 定义开屏广告识别规则
const SPLASH_AD_PATTERNS = [
  // 通用开屏广告接口
  /splash/i,
  /startup/i,
  /launch/i,
  /splash_ad/i,
  /open_ad/i,
  /ad_splash/i,
  /launch_ad/i,
  /startup_ad/i,
  /splashscreen/i,
  // 穿山甲开屏
  /pangolin.*splash/i,
  /pangle.*splash/i,
  // 广点通开屏
  /gdt.*splash/i,
  /qq.*splash/i,
];

// 需要移除的 JSON 字段路径（递归搜索）
const AD_FIELDS = [
  'splash_ad',
  'splash_ad_info',
  'ad_info',
  'open_ad',
  'launch_ad',
  'startup_ad',
  'ad_data',
  'adList',
  'ad_list',
  'splash_list',
  'splashData',
  'advertise',
  'advertisement',
  'ads',
  'ad_content',
  'advertisement_info',
  'adInfo',
  'splashInfo',
  'launchInfo',
  'openAd',
  'splashAd',
];

function shouldProcess(url) {
  return SPLASH_AD_PATTERNS.some(pattern => pattern.test(url));
}

function removeAdFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => removeAdFields(item)).filter(item => {
      // 过滤掉整个广告项
      if (item && typeof item === 'object') {
        for (const field of AD_FIELDS) {
          if (item[field] !== undefined) return false;
        }
      }
      return true;
    });
  }
  const cleaned = {};
  for (const key of Object.keys(obj)) {
    if (AD_FIELDS.includes(key)) {
      // 跳过广告字段 - 替换为 null 或空对象
      if (Array.isArray(obj[key])) {
        cleaned[key] = [];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        cleaned[key] = {};
      } else {
        cleaned[key] = null;
      }
    } else {
      cleaned[key] = removeAdFields(obj[key]);
    }
  }
  return cleaned;
}

function removeSplashAdFromHTML(body) {
  // 移除 HTML 中的开屏广告元素
  let result = body;
  // 移除开屏广告 div
  result = result.replace(/<div[^>]*id=["']splash["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div[^>]*class=["'][^"']*splash[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div[^>]*id=["']launch-ad["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div[^>]*class=["'][^"']*launch-ad[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  return result;
}

// 主逻辑
const url = $request.url;
const contentType = $response.headers['Content-Type'] || $response.headers['content-type'] || '';

if (!shouldProcess(url)) {
  // 如果不匹配任何模式，保持原样
  $done({});
  return;
}

try {
  let body = $response.body;
  if (!body) {
    $done({});
    return;
  }

  if (contentType.includes('json') || url.includes('.json') || url.includes('/api/')) {
    // JSON 响应 — 解析并移除广告字段
    try {
      let data = JSON.parse(body);
      data = removeAdFields(data);
      body = JSON.stringify(data);
      $done({ body });
    } catch (e) {
      // JSON 解析失败，保持原样
      $done({});
    }
  } else if (contentType.includes('html')) {
    // HTML 响应 — 移除广告元素
    body = removeSplashAdFromHTML(body);
    $done({ body });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}

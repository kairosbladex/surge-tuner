// ============================================================
// Surge Script — 应用内广告移除（Banner / 插屏 / 信息流）
// 类型: http-response
// 需 MITM 解密对应的域名
// 匹配: ^https?://.*
// 参数: requires-body = true
// ============================================================

// 广告 API 路径特征
const AD_API_PATTERNS = [
  // SDK 广告接口
  /ads\//i,
  /advert/i,
  /ad_info/i,
  /getAd/i,
  /loadAd/i,
  /requestAd/i,
  /fetchAd/i,
  /adList/i,
  /banner/i,
  /interstitial/i,
  /rewarded/i,
  /feed.*ad/i,
  /ad.*feed/i,
  /promotion/i,
  /recommend.*ad/i,
  /marketing/i,
  /sponsor/i,
  /native.*ad/i,
  /ad.*native/i,
  /ad_config/i,
  /ad_configuration/i,
  /get_ad_config/i,
  /ad_strategy/i,
  /placement/i,
  /adunit/i,
  /adslot/i,
];

function shouldProcess(url) {
  return AD_API_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * 递归清除对象中的广告数据
 * 返回 { cleaned: object, hadAds: boolean }
 */
function cleanAdContent(obj, depth = 0) {
  if (depth > 10) return { cleaned: obj, hadAds: false };
  if (!obj || typeof obj !== 'object') {
    return { cleaned: obj, hadAds: false };
  }

  let hadAds = false;

  if (Array.isArray(obj)) {
    const filtered = [];
    for (const item of obj) {
      if (item && typeof item === 'object') {
        // 判断是否为广告对象
        if (isAdItem(item)) {
          hadAds = true;
          continue; // 跳过整个广告项
        }
        const result = cleanAdContent(item, depth + 1);
        filtered.push(result.cleaned);
        if (result.hadAds) hadAds = true;
      } else {
        filtered.push(item);
      }
    }
    return { cleaned: filtered, hadAds };
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    // 跳过广告相关字段
    if (isAdField(key)) {
      hadAds = true;
      // 替换为空值
      if (Array.isArray(obj[key])) {
        cleaned[key] = [];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        cleaned[key] = {};
      } else {
        cleaned[key] = null;
      }
      continue;
    }

    const val = obj[key];
    if (val && typeof val === 'object') {
      const result = cleanAdContent(val, depth + 1);
      cleaned[key] = result.cleaned;
      if (result.hadAds) hadAds = true;
    } else {
      cleaned[key] = val;
    }
  }

  return { cleaned, hadAds };
}

// 判断一个 key 是否广告相关
function isAdField(key) {
  const adKeyPatterns = [
    /^ad$/i,
    /^ads$/i,
    /^ad_/i,
    /^ads_/i,
    /_ad$/i,
    /_ads$/i,
    /^advert/i,
    /banner/i,
    /interstitial/i,
    /reward/i,
    /splash/i,
    /promotion/i,
    /sponsor/i,
    /marketing/i,
    /placement/i,
    /adunit/i,
    /adslot/i,
    /advertise/i,
    /ed_ads/i,
    /commercial/i,
    /advertisement/i,
    /ad_info/i,
    /ad_list/i,
    /ad_data/i,
    /ad_content/i,
    /ad_config/i,
  ];
  return adKeyPatterns.some(pat => pat.test(key));
}

// 判断一个对象是否为广告项
function isAdItem(obj) {
  if (!obj || typeof obj !== 'object') return false;

  const adSignals = [
    'is_ad', 'isAdvertisement', 'isAd', 'ad_type', 'adType',
    'creative_type', 'ad_id', 'adId', 'placement_id',
    'ad_source', 'adSource', 'ad_tag', 'adTag',
    'ads_type', 'material_id', 'interaction_type',
    'ad_mark', 'adMark',
  ];

  // 检查是否有广告标识字段
  for (const signal of adSignals) {
    if (signal in obj && obj[signal] !== null && obj[signal] !== undefined) {
      return true;
    }
  }

  // 检查是否有广告 SDK 相关字段
  const hasAdUrl = obj.ad_url || obj.landing_url || obj.click_url ||
                   obj.deeplink_url || obj.download_url;

  // 检查是否有广告展示相关的字段组合
  const hasAdContent = (obj.title || obj.description) &&
                       (obj.image_url || obj.icon_url || obj.video_url);

  if (hasAdUrl && hasAdContent) return true;

  return false;
}

// === 主逻辑 ===
const url = $request.url;
const contentType = $response.headers['Content-Type'] || $response.headers['content-type'] || '';

if (!shouldProcess(url)) {
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
    try {
      let data = JSON.parse(body);
      const result = cleanAdContent(data);
      if (result.hadAds) {
        body = JSON.stringify(result.cleaned);
        $done({ body });
      } else {
        $done({});
      }
    } catch (e) {
      $done({});
    }
  } else if (contentType.includes('html') || contentType.includes('javascript')) {
    // 移除 HTML/JS 中的广告注入代码
    let result = body;
    result = result.replace(/<ins[^>]*class=["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi, '');
    result = result.replace(/<div[^>]*id=["'][^"']*ad_[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
    result = result.replace(/<script[^>]*src=["'][^"']*(ads|advert|doubleclick|googlesyndication)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '');
    $done({ body: result });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}

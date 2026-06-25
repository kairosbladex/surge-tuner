// ============================================================
// Surge Script — 弹窗/浮层广告移除
// 类型: http-response
// 需 MITM 解密对应的域名
// 匹配: ^https?://.*
// 参数: requires-body = true
// ============================================================

// 弹窗广告特征模式
const POPUP_AD_PATTERNS = [
  /popup/i,
  /pop_up/i,
  /popover/i,
  /modal/i,
  /dialog.*ad/i,
  /float.*ad/i,
  /floating.*ad/i,
  /overlay.*ad/i,
  /sticky.*ad/i,
  /floatad/i,
  /layer.*ad/i,
  /ad.*popup/i,
  /ad.*modal/i,
  /ad.*overlay/i,
  /ad.*float/i,
  /ad.*layer/i,
  /interstitial/i,
  /full.*screen.*ad/i,
  /cover.*ad/i,
  /bottom.*ad/i,
  /top.*ad/i,
  /insert.*ad/i,
  /mid.*ad/i,
  /middle.*ad/i,
  /subscribe.*guide/i,
  /reddot/i,
  /red_dot/i,
  /badge.*ad/i,
  /tip.*ad/i,
  /guide.*ad/i,
  /newer.*guide/i,
  /update.*guide/i,
  /upgrade.*popup/i,
  /rate.*popup/i,
  /score.*popup/i,
  /review.*popup/i,
  /evaluate.*popup/i,
  /feedback.*popup/i,
];

function shouldProcess(url) {
  return POPUP_AD_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * 移除 JSON 中的弹窗广告配置
 */
function removePopupAds(obj, depth = 0) {
  if (depth > 15) return obj;
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj
      .map(item => removePopupAds(item, depth + 1))
      .filter(item => !isPopupAdItem(item));
  }

  const result = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // 检查 key 是否为弹窗广告配置
    if (isPopupAdField(key)) {
      continue; // 跳过
    }

    // 检查值是否为弹窗广告对象
    if (val && typeof val === 'object' && isPopupAdConfig(val)) {
      continue; // 跳过
    }

    if (val && typeof val === 'object') {
      result[key] = removePopupAds(val, depth + 1);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function isPopupAdField(key) {
  const patterns = [
    /^popup/i, /^popover/i, /^modal/i,
    /^interstitial/i, /^float.*ad/i,
    /^guide.*pop/i, /^newer.*guide/i,
    /^update.*(pop|dialog|modal)/i,
    /^rate.*(pop|dialog|modal)/i,
    /^review.*(pop|dialog|modal)/i,
    /^score.*(pop|dialog|modal)/i,
    /^subscribe.*(pop|dialog|modal)/i,
    /^upgrade.*(pop|dialog|modal)/i,
    /^show_ad/i, /^ad_show/i,
    /show_ad_dialog/i, /show_ad_pop/i,
    /ad_popup/i, /ad_dialog/i,
    /dialog_ad/i,
  ];
  return patterns.some(p => p.test(key));
}

function isPopupAdItem(obj) {
  if (!obj || typeof obj !== 'object') return false;
  // 检查是否包含弹窗广告特征
  if (obj.type === 'popup' || obj.type === 'modal' || obj.type === 'interstitial') {
    if (obj.image || obj.url || obj.title || obj.content) return true;
  }
  if (obj.style === 'popup' || obj.style === 'float' || obj.style === 'overlay') {
    return true;
  }
  return false;
}

function isPopupAdConfig(obj) {
  if (!obj || typeof obj !== 'object') return false;
  // 检查是否为弹窗配置对象
  const popupSignals = ['show_type', 'popup_type', 'display_type', 'show_style', 'pop_type'];
  const hasSignal = popupSignals.some(s => s in obj);
  const hasContent = obj.image || obj.icon || obj.title || obj.desc || obj.content;
  return hasSignal && hasContent;
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
      data = removePopupAds(data);
      body = JSON.stringify(data);
      $done({ body });
    } catch (e) {
      $done({});
    }
  } else if (contentType.includes('html')) {
    // 移除 HTML 中的弹窗广告元素
    let result = body;
    // 移除常见弹窗结构
    result = result.replace(/<div[^>]*(?:id|class)=["'][^"']*(?:popup|modal|overlay|float|sticky)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
    // 移除弹窗脚本
    result = result.replace(/<script[^>]*>[\s\S]*?(?:popup|modal|overlay|floatad|interstitial)[\s\S]*?<\/script>/gi, '');
    // 移除 fixed/absolute 定位的广告层（简化版）
    result = result.replace(/<div[^>]*style=["'][^"']*(?:position:\s*fixed|position:\s*absolute)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
    $done({ body: result });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}

// ============================================================
// Surge Script — 隐私追踪拦截
// 类型: http-request / http-response
// 功能: 移除请求/响应中的追踪参数和 header
// ============================================================

// ============================================================
// 第一部分: 请求端 — 移除追踪参数和 Header
// 类型: http-request
// ============================================================

// 需要移除的追踪 query 参数
const TRACKING_PARAMS = [
  // 通用追踪参数
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_cid', 'utm_reader', 'utm_viz_id', 'utm_pubreferrer',
  'utm_cc', 'utm_date', 'utm_visitor_id',
  // 广告点击追踪
  'clickid', 'click_id', 'af_click', 'ad_click',
  'gclid', 'gclsrc', 'dclid', 'fbclid', 'msclkid',
  'twclid', 'igshid', 'mc_cid', 'mc_eid',
  // App 安装归因
  'idfa', 'idfv', 'advertising_id', 'aaid', 'oaid',
  'device_id', 'deviceid', 'udid', 'uuid',
  'gaid', 'google_ad_id', 'adid',
  // 推广追踪
  'from', 'from_id', 'source', 'source_id',
  'campaign', 'campaign_id', 'campaign_name',
  'adgroup', 'adgroup_id', 'adgroup_name',
  'creative', 'creative_id',
  // 国内追踪
  'aid', 'cid', 'sid', 'vid', 'pid',
  'traceid', 'trace_id', 'spm', 'scm',
  'channel', 'ch', 'sub_channel',
  'affiliate', 'ref', 'referrer',
  // 阿里系追踪
  'tracelog', 'traceLog', 'spm_id', 'scm_id',
  'app_id', 'appid', 'appkey',
  // 腾讯系追踪
  'mta_ch', 'mta_os', 'mta_av',
  // 头条系追踪
  'rit', 'ad_id', 'adid',
  // 转化追踪
  'conversion', 'conv_id',
  'redirect', 'redirect_url',
  'return_url', 'callback_url',
  'tracking', 'track',
];

function removeTrackingParams(url) {
  try {
    const urlObj = new URL(url);
    let modified = false;

    for (const param of TRACKING_PARAMS) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.delete(param);
        modified = true;
      }
    }

    if (modified) {
      return urlObj.toString();
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 需要移除的请求 Header
const TRACKING_HEADERS = [
  'x-uidh', 'x-device-id', 'x-udid',
  'x-idfa', 'x-aaid', 'x-oaid',
  'x-advertising-id', 'x-google-ad-id',
  'x-app-version', 'x-client-version',
  'x-channel', 'x-channel-code',
  'x-trace-id', 'x-request-id',
  'x-b3-traceid', 'x-b3-spanid',
  'x-datadog-trace-id', 'x-datadog-parent-id',
  'x-amzn-trace-id',
  'x-appsflyer', 'x-appsflyer-id',
  'x-talkingdata', 'x-talkingdata-id',
  'x-umeng', 'x-umeng-id',
  'x-sensorsdata', 'x-sensorsdata-id',
];

function removeTrackingHeaders(headers) {
  if (!headers) return null;
  const modified = { ...headers };
  let changed = false;

  for (const header of TRACKING_HEADERS) {
    const lower = header.toLowerCase();
    // 查找不区分大小写的 header 名
    for (const key of Object.keys(modified)) {
      if (key.toLowerCase() === lower) {
        delete modified[key];
        changed = true;
        break;
      }
    }
  }

  return changed ? modified : null;
}

// ============================================================
// 主逻辑 — 判断脚本类型执行对应操作
// ============================================================

if (typeof $request !== 'undefined' && typeof $response === 'undefined') {
  // ====== http-request 模式（请求端） ======
  let url = $request.url;
  let headers = $request.headers;

  const newUrl = removeTrackingParams(url);
  const newHeaders = removeTrackingHeaders(headers);

  if (newUrl || newHeaders) {
    $done({
      url: newUrl || url,
      headers: newHeaders || headers,
    });
  } else {
    $done({});
  }

} else if (typeof $request !== 'undefined' && typeof $response !== 'undefined') {
  // ====== http-response 模式（响应端） ======

  // 移除响应头中的追踪信息
  const respHeaders = $response.headers;
  const newRespHeaders = removeTrackingHeaders(respHeaders);

  if (newRespHeaders) {
    $done({ headers: newRespHeaders });
  } else {
    $done({});
  }

} else {
  $done({});
}

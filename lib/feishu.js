const axios = require('axios');
const CONFIG = require('../config');

// 获取飞书 tenant_access_token
let tokenCache = { token: null, expiresAt: 0 };

async function getTenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: CONFIG.FEISHU_APP_ID,
    app_secret: CONFIG.FEISHU_APP_SECRET
  });

  tokenCache.token = res.data.tenant_access_token;
  tokenCache.expiresAt = Date.now() + (res.data.expire - 60) * 1000;
  return tokenCache.token;
}

// 获取表字段列表
async function getFields(baseToken, tableId) {
  const token = await getTenantToken();
  const res = await axios.get(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/fields`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.data.items || [];
}

// 查询记录（带筛选）
// 注意：search 接口无聚合功能，返回原始记录
async function searchRecords(baseToken, tableId, filter, fieldNames, pageSize = 500) {
  const token = await getTenantToken();
  let pageToken = null;
  let allRecords = [];

  do {
    const params = {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {})
    };

    const body = {
      ...(filter ? { filter } : {}),
      ...(fieldNames ? { field_names: fieldNames } : {})
    };

    const res = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/search`,
      body,
      {
        params,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      }
    );

    const data = res.data.data;
    if (data.items) {
      allRecords = allRecords.concat(data.items);
    }
    pageToken = data.has_more ? data.page_token : null;

    // 避免触发频率限制
    if (pageToken) await new Promise(r => setTimeout(r, 200));
  } while (pageToken);

  return allRecords;
}

// 发送飞书消息（文本或卡片）
async function sendMessage(openId, content, msgType = 'interactive') {
  const token = await getTenantToken();
  const body = {
    receive_id: openId,
    msg_type: msgType,
    content: typeof content === 'string' ? content : JSON.stringify(content)
  };

  await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// 构建消息卡片（用于展示带表格的回答）
function buildCardContent(answerText) {
  // 将回答按行拆分，构建飞书消息卡片
  const lines = answerText.trim().split('\n');
  const elements = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 表格行：| xxx | xxx | xxx |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length > 0) {
        elements.push({
          tag: 'div',
          text: { tag: 'lark_md', content: cells.join('  │  ') }
        });
      }
      continue;
    }

    // 分隔线 ---
    if (/^[-]{3,}$/.test(trimmed)) continue;

    // 普通文本
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: trimmed }
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📊 小舆回答' },
      template: 'blue'
    },
    elements: elements.slice(0, 50) // 最多50个元素
  };
}

module.exports = {
  getTenantToken,
  getFields,
  searchRecords,
  sendMessage,
  buildCardContent
};

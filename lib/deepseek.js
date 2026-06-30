const axios = require('axios');
const CONFIG = require('../config');

// 调用 DeepSeek API（兼容 OpenAI 格式）
async function deepseekChat(messages, systemPrompt, options = {}) {
  const { temperature = 0.3, maxTokens = 4096 } = options;

  const body = {
    model: CONFIG.DEEPSEEK_MODEL,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  const res = await axios.post(
    `${CONFIG.DEEPSEEK_BASE_URL}/v1/chat/completions`,
    body,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  return res.data.choices[0].message.content;
}

// 分析用户问题，输出结构化查询计划
async function analyzeIntent(question) {
  const intentPrompt = `你是一个数据分析意图识别器。分析用户的舆情数据查询问题，输出JSON格式的查询计划。

可用的数据源：
- 2026年：有 MONTH 字段(1-12)、WEEK 字段(W1-W52)，一级标签和二级标签是单选，可精确筛选
- 2025年：无 MONTH/WEEK 字段，一级标签和二级标签是文本，需用 contains 匹配
- 2024年：无 MONTH/WEEK 字段，一级标签和二级标签是文本，发布时间也是文本

输出JSON格式，不要带Markdown包裹，只输出纯JSON：
{
  "years": [2026],
  "firstTag": "病理问题" | "品控问题" | null,
  "secondTag": "拉稀/软便" | "呕吐" | null,
  "brand": "诚实一口" | null,
  "source": "抖音" | null,
  "monthRange": { "from": 1, "to": 6 },
  "weekRange": { "from": "W1", "to": "W6" },
  "needSubBreakdown": true,
  "queryType": "trend" | "count" | "detail" | "comparison",
  "filters": { "riskLevel": null, "maintenance": null }
}

用户问题：${question}`;

  const result = await deepseekChat(
    [{ role: 'user', content: intentPrompt }],
    null,
    { temperature: 0.1 }
  );

  // 解析 JSON
  try {
    return JSON.parse(result.trim().replace(/^```json\s*|```$/g, ''));
  } catch {
    // 如果返回不是纯JSON，尝试从中提取JSON
    const match = result.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('无法解析查询计划');
  }
}

// 将原始记录数据转为按月的聚合结果
function aggregateByMonth(records, year) {
  const monthMap = {};
  const tagBreakdown = {};

  for (const r of records) {
    const fields = r.fields || {};

    // 确定月份
    let month = null;
    if (year === 2026 && fields.MONTH) {
      month = parseInt(fields.MONTH);
    } else {
      // 2024/2025年：从发布时间提取月份
      const timeField = fields['发布时间'];
      if (timeField) {
        const m = String(timeField).match(/^\d{4}[-/](\d{1,2})/);
        if (m) month = parseInt(m[1]);
      }
    }
    if (!month || month < 1 || month > 12) continue;

    // 计数
    monthMap[month] = (monthMap[month] || 0) + 1;

    // 二级标签下钻
    const tagField = year === 2026
      ? (Array.isArray(fields['二级标签']) ? fields['二级标签'][0] : fields['二级标签'])
      : fields['二级标签'];

    if (tagField) {
      const tag = String(tagField);
      if (!tagBreakdown[month]) tagBreakdown[month] = {};
      tagBreakdown[month][tag] = (tagBreakdown[month][tag] || 0) + 1;
    }
  }

  // 排序
  const sortedMonths = Object.keys(monthMap).sort((a, b) => a - b);
  const monthlyData = sortedMonths.map(m => ({
    month: parseInt(m),
    count: monthMap[m]
  }));

  // 计算环比
  for (let i = 1; i < monthlyData.length; i++) {
    const prev = monthlyData[i - 1].count;
    const curr = monthlyData[i].count;
    monthlyData[i].change = prev > 0 ? Math.round((curr - prev) / prev * 1000) / 10 : 0;
  }

  // TOP3 标签
  const topTags = {};
  for (const m of Object.keys(tagBreakdown)) {
    const tags = Object.entries(tagBreakdown[m])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    topTags[m] = tags;
  }

  return { monthlyData, topTags, total: Object.values(monthMap).reduce((a, b) => a + b, 0) };
}

// 按品牌/来源网站/二级标签分组统计
function aggregateByField(records, fieldName) {
  const countMap = {};
  for (const r of records) {
    const val = r.fields?.[fieldName];
    const key = Array.isArray(val) ? (val[0] || '未知') : (val || '未知');
    countMap[key] = (countMap[key] || 0) + 1;
  }
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

module.exports = {
  deepseekChat,
  analyzeIntent,
  aggregateByMonth,
  aggregateByField
};

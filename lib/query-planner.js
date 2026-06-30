const CONFIG = require('../config');
const feishu = require('./feishu');
const { deepseekChat, analyzeIntent, aggregateByMonth, aggregateByField } = require('./deepseek');
const { SYSTEM_PROMPT } = require('./prompt');

/**
 * 处理用户消息的主流程
 * @param {string} question - 用户问题
 * @returns {string} 最终回答文本
 */
async function processQuestion(question) {
  try {
    // 第一步：分析意图，生成查询计划
    const plan = await analyzeIntent(question);
    const years = plan.years || [2026];

    // 第二步：执行查询计划
    let allRecords = [];
    const sourceInfo = [];

    for (const year of years) {
      const base = CONFIG.BASES[year];
      if (!base) continue;

      // 构建筛选条件
      const conditions = [];
      const fieldsToFetch = ['发布时间', '二级标签', '品牌', '来源网站', '风险预警', 'MONTH', 'WEEK'];

      if (plan.firstTag) {
        if (base.firstTagIsSelect) {
          conditions.push({
            field_name: '一级标签',
            operator: 'is',
            value: [plan.firstTag]
          });
        } else {
          conditions.push({
            field_name: '一级标签',
            operator: 'contains',
            value: [plan.firstTag]
          });
        }
      }

      if (plan.brand) {
        conditions.push({
          field_name: '品牌',
          operator: 'is',
          value: [plan.brand]
        });
      }

      if (plan.source) {
        conditions.push({
          field_name: '来源网站',
          operator: 'contains',
          value: [plan.source]
        });
      }

      if (plan.filters?.riskLevel) {
        conditions.push({
          field_name: '风险预警',
          operator: 'is',
          value: [plan.filters.riskLevel]
        });
      }

      // 月份筛选（仅2026有MONTH字段）
      if (plan.monthRange && base.hasMonthField) {
        // 2026年直接用 MONTH 字段
        for (let m = plan.monthRange.from; m <= plan.monthRange.to; m++) {
          // search 接口不支持 isGreater，需要在代码中筛
        }
      }

      // 按发布时间范围筛选（2025年datetime，2024年文本）
      if (plan.monthRange && !base.hasMonthField) {
        const yearStr = String(year);
        const fromMonth = String(plan.monthRange.from).padStart(2, '0');
        const toMonth = String(plan.monthRange.to).padStart(2, '0');
        // 2024年发布时间是文本，用contains匹配前缀
        // 2025年是datetime，用contains也可匹配
        // 但search接口不支持时间范围，所以作为文本筛选
      }

      // 构建 filter JSON（search接口的格式）
      const filter = conditions.length > 0
        ? { conjunction: 'and', conditions }
        : undefined;

      // 查询记录
      const records = await feishu.searchRecords(
        base.baseToken,
        base.tableId,
        filter,
        [...new Set(fieldsToFetch)]
      );

      // 如果有月份范围，在代码中过滤
      let filteredRecords = records;
      if (plan.monthRange) {
        filteredRecords = records.filter(r => {
          const fields = r.fields || {};
          let month = null;

          if (year === 2026 && fields.MONTH) {
            month = parseInt(fields.MONTH);
          } else {
            const timeField = fields['发布时间'];
            if (timeField) {
              const m = String(timeField).match(/^\d{4}[-/](\d{1,2})/);
              if (m) month = parseInt(m[1]);
            }
          }

          return month !== null &&
            month >= plan.monthRange.from &&
            month <= plan.monthRange.to;
        });
      }

      allRecords = allRecords.concat(filteredRecords.map(r => ({ ...r, _year: year })));
      sourceInfo.push(`${year}年（${filteredRecords.length}条）`);
    }

    // 第三步：根据查询类型聚合数据
    let aggregatedData = '';
    const year = years[0] || 2026;

    if (plan.queryType === 'trend') {
      const result = aggregateByMonth(allRecords, year);
      const mean = result.monthlyData.length > 0
        ? Math.round(result.total / result.monthlyData.length)
        : 0;

      let trendText = `汇总：共 ${result.total} 条记录。\n\n`;
      trendText += '| MONTH | 数量 | 环比变化 |\n';
      trendText += '|-------|------|----------|\n';
      for (const d of result.monthlyData) {
        const change = d.change !== undefined
          ? (d.change > 0 ? `+${d.change}%` : `${d.change}%`)
          : '-';
        trendText += `| ${d.month}月 | ${d.count} | ${change} |\n`;
      }

      // 异常判断
      if (result.monthlyData.length >= 2) {
        const maxItem = result.monthlyData.reduce((a, b) => a.count > b.count ? a : b);
        if (maxItem.count > mean * 1.5) {
          trendText += `\n异常判断：${maxItem.month}月（${maxItem.count}条）显著高于月均值（${mean}条）的1.5倍，属于异常高峰。\n`;
        }
      }

      // TOP3 下钻
      if (Object.keys(result.topTags).length > 0) {
        trendText += '\n各月TOP3病理问题：\n';
        for (const m of Object.keys(result.topTags).sort()) {
          const tags = result.topTags[m];
          const monthTotal = result.monthlyData.find(d => d.month === parseInt(m))?.count || 0;
          trendText += `- ${m}月（${monthTotal}条）：${tags.map(([t, c]) =>
            `${t}（${c}条，${Math.round(c/monthTotal*100)}%）`
          ).join('、')}\n`;
        }
      }

      aggregatedData = trendText;
    } else if (plan.queryType === 'count') {
      // 按二级标签分组
      const tagDistribution = aggregateByField(allRecords, '二级标签');
      if (tagDistribution.length > 0) {
        const total = tagDistribution.reduce((s, x) => s + x.count, 0);
        let countText = `共 ${total} 条。按二级标签分布：\n\n`;
        countText += '| 二级标签 | 数量 | 占比 |\n|----------|------|------|\n';
        for (const t of tagDistribution) {
          countText += `| ${t.name} | ${t.count} | ${Math.round(t.count/total*100)}% |\n`;
        }
        aggregatedData = countText;
      } else {
        aggregatedData = `共 ${allRecords.length} 条记录。`;
      }
    } else {
      // 明细或其他
      aggregatedData = `共查询到 ${allRecords.length} 条记录。`;
    }

    // 第四步：组装上下文，调用 DeepSeek 生成最终回答
    const contextPrompt = `用户问题：${question}

数据查询结果：
- 查询范围：${sourceInfo.join('、')}
- 查询条件：${plan.firstTag ? `一级标签=${plan.firstTag}` : '无'}
${plan.brand ? `- 品牌=${plan.brand}` : ''}
${plan.monthRange ? `- MONTH范围=${plan.monthRange.from}~${plan.monthRange.to}` : ''}

聚合数据：
${aggregatedData}

请根据以上真实数据，以小舆的身份回答用户问题。注意：
1. 直接引用上面的数据，不要编造
2. 先给结论，再给细节
3. 趋势类回答要包含异常判断和趋势小结
4. 数据不满时如实告知（如2024/2025年数据少、标签为文本可能有偏差）`;

    const finalAnswer = await deepseekChat(
      [{ role: 'user', content: contextPrompt }],
      SYSTEM_PROMPT,
      { temperature: 0.5 }
    );

    return finalAnswer;

  } catch (err) {
    console.error('processQuestion error:', err);
    return `抱歉，查询时出了点问题：${err.message}。请稍后重试，或换个问法试试。`;
  }
}

module.exports = { processQuestion };

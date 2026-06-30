// 飞书多维表格配置
// 部署时通过云函数环境变量配置，避免硬编码
const CONFIG = {
  // 飞书应用凭证
  FEISHU_APP_ID: process.env.FEISHU_APP_ID || '',
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET || '',

  // DeepSeek 配置
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com',

  // 舆情登记表 - 各年 Base 配置
  BASES: {
    2024: {
      baseToken: 'MNIvbOoHEatl1lsheJUcbakXnpv',
      tableId: 'tblvCMuwUsNTNckx',          // 汇总表
      fields: {
        firstTag: '一级标签',                 // 文本
        secondTag: '二级标签',                 // 文本
        publishTime: '发布时间',               // 文本
        brand: '品牌',                        // 单选
        source: '来源网站',                    // 文本
        riskLevel: '风险预警',                 // 单选
        maintenance: '维护情况',               // 单选
        commentStatus: '评论区情况',            // 单选
        reviewStatus: '复查情况',              // 单选
        content: '标题/微博内容',               // 文本
        author: '原文作者',                    // 文本
        link: '原文链接',                      // 文本
        comment: '评论内容',                   // 文本
        commentAuthor: '评论作者',             // 文本
        keywords: '涉及词',                    // 文本
        contentId: '内容编号',                 // 数字
        xhsId: '小红书ID',                    // 文本
        department: '跨部门沟通情况',            // 文本
        thirdParty: '直客/第三方提报及处理情况',   // 多选
        otherNote: '其他备注',                 // 文本
        parentRecord: '父记录'                // 关联
      },
      // 不含 MONTH、WEEK 字段，需通过发布时间文本匹配月份
      hasMonthField: false,
      hasWeekField: false,
      firstTagIsSelect: false,               // 文本字段
      secondTagIsSelect: false               // 文本字段
    },
    2025: {
      baseToken: 'AMfLb6H7DaKVDUs30jjcqHXfnbg',
      tableId: 'tblSvaD4bjXbO9ph',
      fields: {
        firstTag: '一级标签',                 // 文本
        secondTag: '二级标签',                 // 文本
        publishTime: '发布时间',               // datetime
        brand: '品牌',                        // 单选
        source: '来源网站',                    // 文本
        riskLevel: '风险预警',                 // 单选
        maintenance: '维护情况',               // 单选
        commentStatus: '评论区情况',            // 单选
        reviewStatus: '复查情况',              // 单选
        content: '标题/微博内容',               // 文本
        author: '原文作者',                    // 文本
        link: '原文链接',                      // 文本
        comment: '评论内容',                   // 文本
        commentAuthor: '评论作者',             // 文本
        keywords: '涉及词',                    // 文本
        contentId: '内容编号',                 // 数字
        xhsId: '小红书ID',                    // 数字
        department: '跨部门沟通情况',            // 文本
        contentLevel: '内容分级',              // 文本
        remark: '备注'                        // 文本
      },
      hasMonthField: false,
      hasWeekField: false,
      firstTagIsSelect: false,
      secondTagIsSelect: false
    },
    2026: {
      baseToken: 'QM3gb5DIuaf8uosmGjEc6OVWngg',
      tableId: 'tblvodZ63aLWZaea',
      fields: {
        firstTag: '一级标签',                 // 单选
        secondTag: '二级标签',                 // 单选
        publishTime: '发布时间',               // datetime
        brand: '品牌',                        // 单选
        source: '来源网站',                    // 文本
        riskLevel: '风险预警',                 // 单选
        maintenance: '维护情况',               // 单选
        commentStatus: '评论区情况',            // 单选
        reviewStatus: '复查情况',              // 单选
        content: '标题/微博内容',               // 文本
        author: '原文作者',                    // 文本
        link: '原文链接',                      // 文本
        comment: '评论内容',                   // 文本
        commentAuthor: '评论作者',             // 文本
        keywords: '涉及词',                    // 文本
        contentId: '内容编号',                 // 数字
        xhsId: '小红书ID',                    // 数字
        department: '跨部门沟通情况',            // 单选
        contentLevel: '内容分级',              // 文本
        remark: '备注',                       // 文本
        month: 'MONTH',                      // 查找字段
        week: 'WEEK'                         // 文本
      },
      hasMonthField: true,
      hasWeekField: true,
      firstTagIsSelect: true,
      secondTagIsSelect: true
    }
  }
};

module.exports = CONFIG;

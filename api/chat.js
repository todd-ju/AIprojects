// 飞书事件回调入口 - 极速响应
// Vercel Serverless Function

// 延迟加载，让 GET 健康检查更快
let processQuestion, sendMessage, buildCardContent;

async function lazyLoad() {
  if (!processQuestion) {
    const planner = require('../lib/query-planner');
    const feishu = require('../lib/feishu');
    processQuestion = planner.processQuestion;
    sendMessage = feishu.sendMessage;
    buildCardContent = feishu.buildCardContent;
  }
}

// 幂等去重
const processedEvents = new Set();

module.exports = async function handler(req, res) {
  // GET 请求 - 健康检查 & 飞书 URL 验证（Vercel 冷启动也要立即返回）
  if (req.method === 'GET') {
    // 什么都不加载，直接返回
    return res.status(200).type('text/plain').send('OK');
  }

  // 只处理 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // 飞书 URL 验证挑战
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  // 不是事件回调，直接返回
  if (body.type !== 'event_callback' || !body.event) {
    return res.status(200).json({ code: 0 });
  }

  const eventData = body.event;

  // 只处理消息接收事件
  if (eventData.event_type !== 'im.message.receive_v1') {
    return res.status(200).json({ code: 0 });
  }

  // 幂等去重
  const eventId = body.event_id || eventData.event_id || '';
  if (processedEvents.has(eventId)) {
    return res.status(200).json({ code: 0 });
  }
  processedEvents.add(eventId);
  if (processedEvents.size > 100) {
    const iter = processedEvents.values();
    for (let i = 0; i < 50; i++) processedEvents.delete(iter.next().value);
  }

  const message = eventData.message;
  const sender = eventData.sender;
  let cleanText = '';

  try {
    if (message.message_type !== 'text') {
      return res.status(200).json({ code: 0 });
    }
    const content = JSON.parse(message.content);
    const text = content.text || '';
    cleanText = text.replace(/@_user_\S+/g, '').trim();
    if (!cleanText) {
      return res.status(200).json({ code: 0 });
    }
  } catch {
    return res.status(200).json({ code: 0 });
  }

  // 立即返回200给飞书（关键！）
  res.status(200).json({ code: 0 });

  // 异步处理
  setTimeout(async () => {
    try {
      await lazyLoad();
      const answer = await processQuestion(cleanText);
      const card = buildCardContent(answer, cleanText);
      await sendMessage(sender.sender_id.open_id, card, 'interactive');
    } catch (err) {
      console.error('异步处理失败:', err.message);
      try {
        await sendMessage(
          sender.sender_id.open_id,
          { text: `抱歉，出错了：${err.message}` },
          'text'
        );
      } catch {}
    }
  }, 0);
};

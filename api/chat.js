// 飞书事件回调入口 - 极速响应 (<50ms)
// 收到飞书事件后立即返回200，再异步处理
const { processQuestion } = require('../lib/query-planner');
const { sendMessage, buildCardContent } = require('../lib/feishu');

// 用于幂等去重
const processedEvents = new Set();

// 这也是 Warmup 端点，Vercel 会定期调用保持 warm
module.exports = async function handler(req, res) {
  // 设置无超时
  res.setHeader('Connection', 'keep-alive');

  // GET 请求 = warmup 健康检查
  if (req.method === 'GET') {
    return res.status(200).send('OK');
  }

  // 只处理 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // 飞书 URL 验证挑战 - 立即返回
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
  // 防止 Set 无限膨胀，保留最近100条
  if (processedEvents.size > 100) {
    const iter = processedEvents.values();
    for (let i = 0; i < 50; i++) processedEvents.delete(iter.next().value);
  }

  const message = eventData.message;
  const sender = eventData.sender;

  // 只处理文本消息
  if (message.message_type !== 'text') {
    return res.status(200).json({ code: 0 });
  }

  // 解析消息内容
  try {
    const content = JSON.parse(message.content);
    const text = content.text || '';
    const cleanText = text.replace(/@_user_\S+/g, '').trim();

    if (!cleanText) {
      return res.status(200).json({ code: 0 });
    }

    // ★★★ 关键：立即返回200给飞书（<50ms）★★★
    res.status(200).json({ code: 0 });

    // 异步处理（Vercel 在返回后仍会继续执行）
    setTimeout(async () => {
      try {
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

  } catch (err) {
    return res.status(200).json({ code: 0 });
  }
};

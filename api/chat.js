// 根路径入口 - 处理飞书事件回调
// 部署在 Vercel 的 /api/chat.js 路径下，通过 vercel.json 映射到根路径

const { processQuestion } = require('./lib/query-planner');
const { sendMessage, buildCardContent } = require('./lib/feishu');

const processedEvents = new Set();

module.exports = async function handler(req, res) {
  // GET - 健康检查 & 飞书 URL 验证
  if (req.method === 'GET') {
    return res.status(200).type('text/plain').send('OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // 飞书 URL 验证挑战
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  if (body.type !== 'event_callback' || !body.event) {
    return res.status(200).json({ code: 0 });
  }

  const eventData = body.event;
  if (eventData.event_type !== 'im.message.receive_v1') {
    return res.status(200).json({ code: 0 });
  }

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

  // 立即返回200
  res.status(200).json({ code: 0 });

  // 异步处理
  setTimeout(async () => {
    try {
      const answer = await processQuestion(cleanText);
      const card = buildCardContent(answer, cleanText);
      await sendMessage(sender.sender_id.open_id, card, 'interactive');
    } catch (err) {
      console.error('处理失败:', err.message);
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

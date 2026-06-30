const { processQuestion } = require('../lib/query-planner');
const { sendMessage, buildCardContent } = require('../lib/feishu');

// Vercel Serverless Function 入口
module.exports = async function handler(req, res) {
  // 只处理 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};

    // 飞书 URL 验证挑战
    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }

    // 只处理事件回调
    if (body.type !== 'event_callback' || !body.event) {
      return res.json({ code: 0 });
    }

    const eventData = body.event;

    // 只处理消息接收事件
    if (eventData.event_type !== 'im.message.receive_v1') {
      return res.json({ code: 0 });
    }

    const message = eventData.message;
    const sender = eventData.sender;

    // 只处理文本消息
    if (message.message_type !== 'text') {
      return res.json({ code: 0 });
    }

    // 解析消息内容
    const content = JSON.parse(message.content);
    const text = content.text || '';

    // 去掉 @机器人 前缀
    const cleanText = text.replace(/@_user_\S+/g, '').trim();

    if (!cleanText) {
      return res.json({ code: 0 });
    }

    // 先立即返回，避免飞书超时重试
    res.json({ code: 0 });

    // 异步处理问题并回复
    try {
      const answer = await processQuestion(cleanText);
      const card = buildCardContent(answer, cleanText);
      await sendMessage(sender.sender_id.open_id, card, 'interactive');
    } catch (err) {
      console.error('处理消息失败:', err.message);
      try {
        await sendMessage(
          sender.sender_id.open_id,
          { text: `抱歉，处理消息时出了点问题：${err.message}，请稍后重试。` },
          'text'
        );
      } catch {}
    }

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.json({ code: 0 });
  }
};

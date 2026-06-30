// 飞书云函数入口
// 处理 im.message.receive_v1 事件回调

const { processQuestion } = require('./lib/query-planner');
const { sendMessage, buildCardContent } = require('./lib/feishu');

/**
 * 飞书云函数默认导出
 * 事件回调格式：POST /  body: { challenge, event, token, type }
 */
module.exports = async function handler(event, context) {
  try {
    const body = typeof event === 'string' ? JSON.parse(event) : event;

    // 飞书 URL 验证挑战
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // 只处理消息事件
    if (body.type !== 'event_callback' || !body.event) {
      return { code: 0 };
    }

    const eventData = body.event;

    // 只处理 im.message.receive_v1
    if (eventData.event_type !== 'im.message.receive_v1') {
      return { code: 0 };
    }

    const message = eventData.message;
    const sender = eventData.sender;

    // 只处理文本消息
    if (message.message_type !== 'text') {
      return { code: 0 };
    }

    // 解析消息内容
    const content = JSON.parse(message.content);
    const text = content.text || '';

    // 去掉 @机器人 前缀
    const cleanText = text.replace(/@_user_\S+/g, '').trim();

    if (!cleanText) {
      return { code: 0 };
    }

    // 处理问题
    const answer = await processQuestion(cleanText);

    // 构建消息卡片回复
    const card = buildCardContent(answer, cleanText);

    // 发送消息给用户
    await sendMessage(sender.sender_id.open_id, card, 'interactive');

    return { code: 0 };

  } catch (err) {
    console.error('Handler error:', err.message, err.stack);

    // 尝试告知用户出错
    try {
      const body = typeof event === 'string' ? JSON.parse(event) : event;
      const sender = body?.event?.sender;
      if (sender?.sender_id?.open_id) {
        await sendMessage(
          sender.sender_id.open_id,
          { text: `抱歉，处理消息时出了点问题：${err.message}。请稍后重试。` },
          'text'
        );
      }
    } catch {}

    return { code: 0 };
  }
};

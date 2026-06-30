// Vercel Serverless Function - 飞书事件回调
// 注意：所有路径都由 vercel.json rewrites 指向此文件

// 延迟加载模块（避免冷启动时加载过多）
let processQuestion, sendMessage, buildCardContent;
async function loadModules() {
  if (!processQuestion) {
    const planner = require('./lib/query-planner');
    const feishu = require('./lib/feishu');
    processQuestion = planner.processQuestion;
    sendMessage = feishu.sendMessage;
    buildCardContent = feishu.buildCardContent;
  }
}

const processedEvents = new Set();

module.exports = async function handler(req, res) {
  // ===== 健康检查 & 飞书 URL 验证 =====
  if (req.method === 'GET') {
    // 极速返回，不做任何加载
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // ===== POST - 飞书事件回调 =====
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = req.body || {};

  // 飞书 URL 验证挑战
  if (body.type === 'url_verification') {
    res.json({ challenge: body.challenge });
    return;
  }

  // 不是事件回调
  if (body.type !== 'event_callback' || !body.event) {
    res.status(200).json({ code: 0 });
    return;
  }

  const eventData = body.event;
  if (eventData.event_type !== 'im.message.receive_v1') {
    res.status(200).json({ code: 0 });
    return;
  }

  // 幂等去重
  const eventId = body.event_id || eventData.event_id || '';
  if (processedEvents.has(eventId)) {
    res.status(200).json({ code: 0 });
    return;
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
      res.status(200).json({ code: 0 });
      return;
    }
    const content = JSON.parse(message.content);
    const text = content.text || '';
    cleanText = text.replace(/@_user_\S+/g, '').trim();
    if (!cleanText) {
      res.status(200).json({ code: 0 });
      return;
    }
  } catch {
    res.status(200).json({ code: 0 });
    return;
  }

  // ★★★ 立即返回200，再异步处理 ★★★
  res.status(200).json({ code: 0 });

  setTimeout(async () => {
    try {
      await loadModules();
      const answer = await processQuestion(cleanText);
      const card = buildCardContent(answer, cleanText);
      await sendMessage(sender.sender_id.open_id, card, 'interactive');
    } catch (err) {
      console.error('异步处理失败:', err.message);
      try {
        await loadModules();
        await sendMessage(
          sender.sender_id.open_id,
          { text: `抱歉，出错了：${err.message}` },
          'text'
        );
      } catch {}
    }
  }, 0);
};

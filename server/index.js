/**
 * Express 服务器 - 本地开发使用
 */

const express = require('express');
const cors = require('cors');
const { assess } = require('../lib/assess');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/assess', async (req, res) => {
  const { companyName } = req.body;
  if (!companyName || typeof companyName !== 'string') {
    return res.status(400).json({ error: '请输入企业名称' });
  }

  try {
    const result = await assess(companyName);
    res.json(result);
  } catch (err) {
    console.error('评估出错:', err.message);
    res.status(500).json({ error: '评估过程中发生错误，请稍后重试' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Express 服务已启动: http://localhost:${PORT}`);
});

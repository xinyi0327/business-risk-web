/**
 * Netlify Function: 企业风险评估
 * Endpoint: POST /.netlify/functions/assess
 */

const { assess } = require('../../lib/assess');

exports.handler = async (event, context) => {
  // 设置 CORS 头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  // 处理预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '只支持 POST 请求' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: '请求体格式错误' })
    };
  }

  const { companyName } = body;
  if (!companyName || typeof companyName !== 'string') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: '请输入企业名称' })
    };
  }

  try {
    const result = await assess(companyName);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('评估出错:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '评估过程中发生错误，请稍后重试' })
    };
  }
};

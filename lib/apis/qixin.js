/**
 * 启信宝 API 客户端
 * 文档：https://data.qixin.com/
 * 认证方式：AppKey + Secret 签名（具体格式以官方文档为准）
 */

const crypto = require('crypto');
const axios = require('axios');

const QIXIN_APP_KEY = process.env.QIXIN_APP_KEY || '';
const QIXIN_SECRET = process.env.QIXIN_SECRET || '';
// 启信宝 API 基础地址（请根据实际文档调整）
const QIXIN_BASE_URL = process.env.QIXIN_BASE_URL || 'https://api.qixin.com';

function getHeaders() {
  // 启信宝通常使用 appkey + 时间戳 + 签名的方式
  // 签名格式：MD5(appkey + timestamp + secret).toLowerCase()
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr = QIXIN_APP_KEY + timestamp + QIXIN_SECRET;
  const sign = crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
  
  return {
    'appkey': QIXIN_APP_KEY,
    'timestamp': timestamp,
    'sign': sign,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; RiskAssessment/1.0)'
  };
}

/**
 * 企业搜索（模糊搜索）
 * 接口路径可能根据实际文档调整
 */
async function searchCompany(keyword) {
  if (!QIXIN_APP_KEY || !QIXIN_SECRET) return [];
  try {
    // 启信宝搜索接口（路径可能需要根据实际文档调整）
    const url = `${QIXIN_BASE_URL}/api/enterprise/search`;
    const params = { keyword, skip: 0, limit: 10 };
    const response = await axios.get(url, { headers: getHeaders(), params, timeout: 8000 });
    if (response.data && (response.data.code === 0 || response.data.status === '200')) {
      return response.data.data || response.data.result || [];
    }
    return [];
  } catch (err) {
    console.error('[Qixin] 搜索失败:', err.message);
    return [];
  }
}

/**
 * 获取企业详情
 */
async function getCompanyDetail(companyId) {
  if (!QIXIN_APP_KEY || !QIXIN_SECRET || !companyId) return null;
  try {
    const url = `${QIXIN_BASE_URL}/api/enterprise/detail`;
    const params = { companyId };
    const response = await axios.get(url, { headers: getHeaders(), params, timeout: 8000 });
    if (response.data && (response.data.code === 0 || response.data.status === '200')) {
      return response.data.data || response.data.result || null;
    }
    return null;
  } catch (err) {
    console.error('[Qixin] 获取详情失败:', err.message);
    return null;
  }
}

/**
 * 获取企业风险信息（被执行人、失信、诉讼等）
 */
async function getRiskInfo(companyId) {
  if (!QIXIN_APP_KEY || !QIXIN_SECRET || !companyId) {
    return { executions: [], dishonest: [], lawsuits: [] };
  }
  
  const results = { executions: [], dishonest: [], lawsuits: [] };
  
  // 启信宝风险相关接口（路径可能需要根据实际文档调整）
  const endpoints = [
    { key: 'executions', url: '/api/risk/execute', name: '被执行人' },
    { key: 'dishonest', url: '/api/risk/dishonest', name: '失信被执行人' },
    { key: 'lawsuits', url: '/api/risk/lawsuit', name: '诉讼' },
    { key: 'abnormal', url: '/api/risk/abnormal', name: '经营异常' },
  ];
  
  for (const ep of endpoints) {
    try {
      const url = `${QIXIN_BASE_URL}${ep.url}`;
      const params = { companyId };
      const response = await axios.get(url, { headers: getHeaders(), params, timeout: 6000 });
      if (response.data && (response.data.code === 0 || response.data.status === '200')) {
        const data = response.data.data || response.data.result || [];
        results[ep.key] = Array.isArray(data) ? data : [];
      }
    } catch (err) {
      // 接口可能不存在或无权限，忽略
    }
  }
  
  return results;
}

/**
 * 用启信宝数据评估企业风险
 */
async function assessByQixin(companyName, searchLog) {
  if (!QIXIN_APP_KEY || !QIXIN_SECRET) {
    searchLog.push({ 
      step: 'qixin', 
      status: 'skipped', 
      source: '启信宝', 
      message: '未配置 QIXIN_APP_KEY 或 QIXIN_SECRET，跳过启信宝' 
    });
    return null;
  }
  
  searchLog.push({ 
    step: 'qixin', 
    status: 'running', 
    source: '启信宝', 
    message: `正在通过启信宝查询「${companyName}」...` 
  });
  
  // 1. 搜索企业
  const companies = await searchCompany(companyName);
  if (!companies || companies.length === 0) {
    searchLog.push({ 
      step: 'qixin', 
      status: 'no_results', 
      source: '启信宝', 
      message: '启信宝未找到匹配企业' 
    });
    return null;
  }
  
  const target = companies[0];
  const companyId = target.id || target.companyId || target.KeyNo || '';
  searchLog.push({ 
    step: 'qixin', 
    status: 'success', 
    source: '启信宝', 
    message: `启信宝找到企业：${target.name || target.Name || companyName}` 
  });
  
  // 2. 获取详情
  const details = await getCompanyDetail(companyId);
  
  // 3. 获取风险信息
  const riskInfo = await getRiskInfo(companyId);
  
  // 4. 映射为风险项
  const checkedItems = {};
  const riskSummary = [];
  
  // 主体资质风险
  if (details) {
    const status = (details.status || details.Status || '').trim();
    const name = details.name || details.Name || '';
    if (status.includes('注销') || status.includes('吊销')) {
      checkedItems.q2 = true;
      riskSummary.push('工商登记状态非正常（注销/吊销）');
    }
    if (status.includes('经营异常') || (details.abnormal && details.abnormal > 0)) {
      checkedItems.q4 = true;
      riskSummary.push('存在经营异常名录记录');
    }
  }
  
  // 司法风险
  if (riskInfo.executions && riskInfo.executions.length > 0) {
    checkedItems.j3 = true;
    riskSummary.push(`存在${riskInfo.executions.length}条被执行记录`);
  }
  if (riskInfo.dishonest && riskInfo.dishonest.length > 0) {
    checkedItems.j4 = true;
    riskSummary.push(`存在${riskInfo.dishonest.length}条失信记录`);
  }
  if (riskInfo.lawsuits && riskInfo.lawsuits.length > 0) {
    checkedItems.j1 = true;
    riskSummary.push(`存在${riskInfo.lawsuits.length}条诉讼记录`);
  }
  if (riskInfo.abnormal && riskInfo.abnormal.length > 0) {
    checkedItems.q4 = true;
    riskSummary.push(`存在${riskInfo.abnormal.length}条经营异常记录`);
  }
  
  searchLog.push({
    step: 'qixin',
    status: 'success',
    source: '启信宝',
    message: `启信宝评估完成，发现 ${riskSummary.length} 项风险`,
    matches: riskSummary.map(r => ({ keyword: r, desc: r }))
  });
  
  return { 
    checkedItems, 
    riskSummary, 
    source: 'qixin', 
    rawData: { target, details, riskInfo } 
  };
}

module.exports = { searchCompany, getCompanyDetail, getRiskInfo, assessByQixin };

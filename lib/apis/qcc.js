/**
 * 企查查 API 客户端
 * 文档：https://api.qichacha.com
 * 认证方式：动态签名 Token = MD5(AppKey + Timestamp + SecretKey).toUpperCase()
 */

const crypto = require('crypto');
const axios = require('axios');

const QCC_APP_KEY = process.env.QCC_APP_KEY || '';
const QCC_SECRET_KEY = process.env.QCC_SECRET_KEY || '';
const QCC_BASE_URL = 'https://api.qichacha.com';

function generateAuth() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr = QCC_APP_KEY + timestamp + QCC_SECRET_KEY;
  const token = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
  return { token, timestamp };
}

function getHeaders() {
  const { token, timestamp } = generateAuth();
  return {
    'Token': token,
    'Timespan': timestamp,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; RiskAssessment/1.0)'
  };
}

/**
 * 企业模糊搜索
 * @param {string} keyword - 企业名称关键词
 * @returns {Promise<Array>} 企业列表 [{KeyNo, Name, OperName, Status, CreditCode}]
 */
async function searchCompany(keyword) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY) return [];
  try {
    const url = `${QCC_BASE_URL}/FuzzySearch/GetList`;
    const params = { key: QCC_APP_KEY, searchKey: keyword };
    const response = await axios.get(url, { headers: getHeaders(), params, timeout: 8000 });
    if (response.data?.Status === '200' || response.data?.status === '200') {
      return response.data.Result || response.data.result || [];
    }
    return [];
  } catch (err) {
    console.error('[QCC] 搜索失败:', err.message);
    return [];
  }
}

/**
 * 获取企业基本信息
 * @param {string} keyNo - 企业唯一标识（从搜索结果获取）
 */
async function getBasicDetails(keyNo) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY || !keyNo) return null;
  try {
    const url = `${QCC_BASE_URL}/ECIV4/GetBasicDetailsByName`;
    const params = { key: QCC_APP_KEY, searchKey: keyNo };
    const response = await axios.get(url, { headers: getHeaders(), params, timeout: 8000 });
    if (response.data?.Status === '200' || response.data?.status === '200') {
      return response.data.Result || response.data.result || null;
    }
    return null;
  } catch (err) {
    console.error('[QCC] 获取详情失败:', err.message);
    return null;
  }
}

/**
 * 获取企业司法风险信息（被执行人、失信、裁判文书等）
 * 尝试多个司法接口
 */
async function getJudicialRisk(keyNo) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY || !keyNo) return { executions: [], dishonest: [], lawsuits: [] };
  
  const results = { executions: [], dishonest: [], lawsuits: [] };
  
  const endpoints = [
    { key: 'executions', url: '/ECICourt/GetExecuteInfo', name: '被执行人' },
    { key: 'dishonest', url: '/ECICourt/GetDishonest', name: '失信被执行人' },
    { key: 'lawsuits', url: '/ECICourt/GetJudgmentDoc', name: '裁判文书' },
    { key: 'abnormal', url: '/ECIAbnormal/GetAbnormalList', name: '经营异常' },
  ];

  for (const ep of endpoints) {
    try {
      const url = `${QCC_BASE_URL}${ep.url}`;
      const params = { key: QCC_APP_KEY, searchKey: keyNo };
      const response = await axios.get(url, { headers: getHeaders(), params, timeout: 6000 });
      if (response.data?.Status === '200' || response.data?.status === '200') {
        const data = response.data.Result || response.data.result || [];
        results[ep.key] = Array.isArray(data) ? data : [];
      }
    } catch (err) {
      // 接口可能不存在或无权限，忽略
    }
  }

  return results;
}

/**
 * 用企查查数据评估企业风险
 * @param {string} companyName - 企业名称
 * @returns {Promise<{checkedItems: Object, riskSummary: string[], rawData: Object}>}
 */
async function assessByQCC(companyName, searchLog) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY) {
    searchLog.push({ step: 'qcc', status: 'skipped', source: '企查查', message: '未配置 QCC_APP_KEY 或 QCC_SECRET_KEY，跳过企查查' });
    return null;
  }

  searchLog.push({ step: 'qcc', status: 'running', source: '企查查', message: `正在通过企查查查询「${companyName}」...` });

  // 1. 搜索企业
  const companies = await searchCompany(companyName);
  if (!companies || companies.length === 0) {
    searchLog.push({ step: 'qcc', status: 'no_results', source: '企查查', message: '企查查未找到匹配企业' });
    return null;
  }

  const target = companies[0]; // 取第一个匹配结果
  searchLog.push({ step: 'qcc', status: 'success', source: '企查查', message: `企查查找到企业：${target.Name}，经营状态：${target.Status || '未知'}` });

  // 2. 获取详情
  const details = await getBasicDetails(target.KeyNo || target.Name);
  
  // 3. 获取司法风险
  const judicial = await getJudicialRisk(target.KeyNo || target.Name);

  // 4. 映射为风险项
  const checkedItems = {};
  const riskSummary = [];

  // 主体资质风险
  if (details) {
    const status = (details.Status || target.Status || '').trim();
    if (status.includes('注销') || status.includes('吊销')) {
      checkedItems.q2 = true;
      riskSummary.push('工商登记状态非正常（注销/吊销）');
    }
    if (status.includes('经营异常')) {
      checkedItems.q4 = true;
      riskSummary.push('存在经营异常名录记录');
    }
    if (details.AbnormalCount && details.AbnormalCount > 0) {
      checkedItems.q4 = true;
      riskSummary.push('存在经营异常名录记录');
    }
  }

  // 司法风险
  if (judicial.executions && judicial.executions.length > 0) {
    checkedItems.j3 = true;
    riskSummary.push(`存在${judicial.executions.length}条被执行记录`);
  }
  if (judicial.dishonest && judicial.dishonest.length > 0) {
    checkedItems.j4 = true;
    riskSummary.push(`存在${judicial.dishonest.length}条失信记录`);
  }
  if (judicial.lawsuits && judicial.lawsuits.length > 0) {
    checkedItems.j1 = true;
    riskSummary.push(`存在${judicial.lawsuits.length}条诉讼记录`);
  }
  if (judicial.abnormal && judicial.abnormal.length > 0) {
    checkedItems.q4 = true;
    riskSummary.push(`存在${judicial.abnormal.length}条经营异常记录`);
  }

  searchLog.push({
    step: 'qcc', status: 'success', source: '企查查',
    message: `企查查评估完成，发现 ${riskSummary.length} 项风险`,
    matches: riskSummary.map(r => ({ keyword: r, desc: r }))
  });

  return { checkedItems, riskSummary, source: 'qcc', rawData: { target, details, judicial } };
}

module.exports = { searchCompany, getBasicDetails, getJudicialRisk, assessByQCC, generateAuth };

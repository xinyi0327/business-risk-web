/**
 * 企查查 API 客户端 - 2006 合作风险排查
 * 接口文档：https://openapi.qcc.com/dataApi/2006
 * 认证方式：Header Token = MD5(AppKey + Timestamp + SecretKey).toUpperCase()
 */

const crypto = require('crypto');
const axios = require('axios');

const QCC_APP_KEY = process.env.QCC_APP_KEY || '';
const QCC_SECRET_KEY = process.env.QCC_SECRET_KEY || '';
const QCC_BASE_URL = 'https://api.qichacha.com';

/**
 * 生成企查查动态签名认证 Header
 * Token = MD5(AppKey + Timestamp + SecretKey).toUpperCase()
 * Timespan = Unix 时间戳（秒）
 */
function getAuthHeaders() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr = QCC_APP_KEY + timestamp + QCC_SECRET_KEY;
  const token = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
  return {
    'Token': token,
    'Timespan': timestamp,
    'Content-Type': 'application/json',
  };
}

/**
 * 调用 2006 合作风险排查接口
 * @param {string} searchKey - 企业名称或统一社会信用代码
 * @returns {Promise<Object|null>} 返回 Data 对象，或 null
 */
async function callRiskControlScan(searchKey) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY) return null;

  const url = `${QCC_BASE_URL}/RiskControl/Scan`;
  const params = { key: QCC_APP_KEY, searchKey };
  const headers = getAuthHeaders();

  try {
    const response = await axios.get(url, { headers, params, timeout: 15000 });
    const body = response.data;

    // 企查查 2006 接口返回格式：
    // { Status: '200', Message: '...', OrderNumber: '...', Result: { VerifyResult: 1, Data: {...} } }
    if (body.Status === '200' && body.Result && body.Result.Data) {
      return body.Result.Data;
    }
    if (body.Status === '201') {
      // 有效请求但无结果
      return null;
    }
    return null;
  } catch (err) {
    // 401/403 表示认证失败，其他错误记录后返回 null
    if (err.response) {
      throw new Error(`企查查API错误 ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

// ============ 风险项映射规则 ============
// 将企查查 2006 接口返回数据映射为 35 项风险指标（q1~q9, j1~j9, c1~c9, o1~o8）

function mapRiskItems(data) {
  const checked = {};
  const summary = [];

  if (!data) return { checkedItems: checked, riskSummary: summary };

  // ---- 主体资质风险 (q1~q9) ----
  const status = (data.Status || '').trim();

  // q1: 营业执照有效
  // 企查查无直接"营业执照"字段，用登记状态推断：存续/在业 = 有效
  if (status.includes('存续') || status.includes('在业') || status.includes('正常')) {
    // 正常，不勾选 q1（q1 是"营业执照有效"，有效时不算风险）
  } else if (status.includes('注销') || status.includes('吊销') || status.includes('停业')) {
    checked['q1'] = true;
    summary.push('营业执照已注销/吊销');
  }

  // q2: 工商登记状态非正常
  if (status.includes('注销') || status.includes('吊销') || status.includes('停业')) {
    checked['q2'] = true;
    summary.push(`工商登记状态：${status}`);
  }

  // q3: 法定代表人存在异常（企查查无直接字段，暂不映射）
  // q4: 存在经营异常名录记录
  if (data.Exception && data.Exception.TotalCount > 0) {
    checked['q4'] = true;
    summary.push(`存在${data.Exception.TotalCount}条经营异常记录`);
  }

  // q5: 存在严重违法失信名单
  if (data.SeriousIllegal && data.SeriousIllegal.TotalCount > 0) {
    checked['q5'] = true;
    summary.push(`存在${data.SeriousIllegal.TotalCount}条严重违法记录`);
  }

  // q6: 存在股权冻结
  if (data.EquityFreeze && data.EquityFreeze.TotalCount > 0) {
    checked['q6'] = true;
    summary.push(`存在${data.EquityFreeze.TotalCount}条股权冻结记录`);
  }

  // q7: 存在股权出质
  if (data.EquityPledge && data.EquityPledge.TotalCount > 0) {
    checked['q7'] = true;
    summary.push(`存在${data.EquityPledge.TotalCount}条股权出质记录`);
  }

  // q8: 存在动产抵押
  if (data.ChattelMortgage && data.ChattelMortgage.TotalCount > 0) {
    checked['q8'] = true;
    summary.push(`存在${data.ChattelMortgage.TotalCount}条动产抵押记录`);
  }

  // q9: 存在清算信息
  if (data.Liquidation && (data.Liquidation.Leader || (data.Liquidation.Member && data.Liquidation.Member.length > 0))) {
    checked['q9'] = true;
    summary.push('企业存在清算信息');
  }

  // ---- 司法风险 (j1~j9) ----
  // j1: 存在未履行完毕的裁判文书
  if (data.ShiXin && data.ShiXin.TotalCount > 0) {
    checked['j1'] = true;
    summary.push(`存在${data.ShiXin.TotalCount}条失信被执行人记录`);
  }

  // j2: 存在被执行记录
  if (data.ZhiXing && data.ZhiXing.TotalCount > 0) {
    checked['j2'] = true;
    summary.push(`存在${data.ZhiXing.TotalCount}条被执行记录，总金额${data.ZhiXing.TotalAmount || '未知'}`);
  }

  // j3: 存在失信被执行人记录（同 j1，部分清单可能分开）
  if (data.ShiXin && data.ShiXin.TotalCount > 0) {
    checked['j3'] = true;
  }

  // j4: 存在限制高消费令
  if (data.Sumptuary && data.Sumptuary.TotalCount > 0) {
    checked['j4'] = true;
    summary.push(`存在${data.Sumptuary.TotalCount}条限制高消费记录`);
  }

  // j5: 存在破产重整/清算记录
  if (data.Bankruptcy && data.Bankruptcy.TotalCount > 0) {
    checked['j5'] = true;
    summary.push(`存在${data.Bankruptcy.TotalCount}条破产重整记录`);
  }

  // j6: 存在司法拍卖记录
  if (data.JudicialSale && data.JudicialSale.TotalCount > 0) {
    checked['j6'] = true;
    summary.push(`存在${data.JudicialSale.TotalCount}条司法拍卖记录`);
  }

  // j7: 存在行政处罚记录
  if (data.AdminPenalty && data.AdminPenalty.TotalCount > 0) {
    checked['j7'] = true;
    summary.push(`存在${data.AdminPenalty.TotalCount}条行政处罚记录，总金额${data.AdminPenalty.TotalAmount || '未知'}`);
  }

  // j8: 环保处罚记录
  if (data.EnvPunishment && data.EnvPunishment.TotalCount > 0) {
    checked['j8'] = true;
    summary.push(`存在${data.EnvPunishment.TotalCount}条环保处罚记录`);
  }

  // j9: 税收违法/欠税记录
  if ((data.TaxOweNotice && data.TaxOweNotice.TotalCount > 0) ||
      (data.TaxIllegal && data.TaxIllegal.TotalCount > 0)) {
    checked['j9'] = true;
    const taxCount = (data.TaxOweNotice?.TotalCount || 0) + (data.TaxIllegal?.TotalCount || 0);
    summary.push(`存在${taxCount}条税收违法/欠税记录`);
  }

  // ---- 信用风险 (c1~c9) ----
  // （企查查 2006 接口主要覆盖经营/司法风险，信用风险需结合其他维度）
  // c7: 经营异常（已在 q4 处理）
  if (data.Exception && data.Exception.TotalCount > 0) {
    checked['c7'] = true;
  }

  // ---- 经营风险 (o1~o8) ----
  // o1: 企业年报异常（企查查有年报信息，但 2006 接口不含详细年报，暂不映射）
  // o2: 注册资本实缴异常
  const regCapi = parseFloat((data.RegisteredCapital || '0').replace(/[,，]/g, ''));
  const paidCapi = parseFloat((data.PaidUpCapital || '0').replace(/[,，]/g, ''));
  if (regCapi > 0 && paidCapi > 0 && paidCapi < regCapi * 0.3) {
    checked['o2'] = true;
    summary.push('注册资本实缴比例较低（低于30%）');
  }

  // o3: 参保人数为 0 或极少
  const insured = parseInt(data.InsuredCount) || 0;
  if (insured === 0 && status.includes('存续')) {
    checked['o3'] = true;
    summary.push('参保人数为0，可能存在经营异常');
  }

  // o4: 注册地址为虚拟地址（企查查无直接字段，暂不映射）
  // o5: 存在大量变更记录（取前100条，若较多则标记）
  if (data.ChangeList && data.ChangeList.length >= 20) {
    checked['o5'] = true;
    summary.push(`企业变更记录较多（${data.ChangeList.length}条）`);
  }

  // o6: 存在欠税公告
  if (data.TaxOweNotice && data.TaxOweNotice.TotalCount > 0) {
    checked['o6'] = true;
  }

  // o7: 存在公安通告（涉刑案件）
  if (data.PublicSecurityNotice && data.PublicSecurityNotice.TotalCount > 0) {
    checked['o7'] = true;
    summary.push(`存在${data.PublicSecurityNotice.TotalCount}条公安通告记录`);
  }

  // o8: 税务非正常户
  if (data.TaxAbnormal && data.TaxAbnormal.TotalCount > 0) {
    checked['o8'] = true;
    summary.push(`存在${data.TaxAbnormal.TotalCount}条税务非正常户记录`);
  }

  return { checkedItems: checked, riskSummary: summary };
}

/**
 * 主入口：用企查查 2006 接口评估企业风险
 * @param {string} companyName - 企业名称
 * @param {Array} searchLog - 日志数组（由调用方传入）
 * @returns {Promise<{checkedItems, riskSummary, source, rawData} | null>}
 */
async function assessByQCC(companyName, searchLog) {
  if (!QCC_APP_KEY || !QCC_SECRET_KEY) {
    searchLog.push({
      step: 'qcc', status: 'skipped', source: '企查查',
      message: '未配置 QCC_APP_KEY 或 QCC_SECRET_KEY，跳过企查查'
    });
    return null;
  }

  searchLog.push({
    step: 'qcc', status: 'running', source: '企查查（2006合作风险排查）',
    message: `正在通过企查查查询「${companyName}」...`
  });

  try {
    const data = await callRiskControlScan(companyName);
    if (!data) {
      searchLog.push({
        step: 'qcc', status: 'no_results', source: '企查查',
        message: `企查查未找到「${companyName}」的信息（VerifyResult=0）`
      });
      return null;
    }

    // 映射风险项
    const { checkedItems, riskSummary } = mapRiskItems(data);

    // 记录企业基本信息到日志
    const info = [];
    if (data.Name) info.push(`企业名称：${data.Name}`);
    if (data.Status) info.push(`经营状态：${data.Status}`);
    if (data.CreditCode) info.push(`统一社会信用代码：${data.CreditCode}`);
    if (data.OperName) info.push(`法定代表人：${data.OperName}`);
    if (data.ZhiXing?.TotalCount) info.push(`被执行人：${data.ZhiXing.TotalCount}条`);
    if (data.ShiXin?.TotalCount) info.push(`失信被执行：${data.ShiXin.TotalCount}条`);
    if (data.Exception?.TotalCount) info.push(`经营异常：${data.Exception.TotalCount}条`);

    searchLog.push({
      step: 'qcc', status: 'success', source: '企查查（2006合作风险排查）',
      message: `企查查查询成功：${data.Name || companyName}，经营状态：${data.Status || '未知'}`,
      matches: riskSummary.map(r => ({ keyword: r, desc: r })),
      qccRaw: {
        name: data.Name,
        status: data.Status,
        operName: data.OperName,
        creditCode: data.CreditCode,
        zhixingCount: data.ZhiXing?.TotalCount || 0,
        shixinCount: data.ShiXin?.TotalCount || 0,
        exceptionCount: data.Exception?.TotalCount || 0,
        adminPenaltyCount: data.AdminPenalty?.TotalCount || 0,
      }
    });

    return {
      checkedItems,
      riskSummary,
      source: '企查查API（2006合作风险排查）',
      rawData: data
    };
  } catch (err) {
    searchLog.push({
      step: 'qcc', status: 'error', source: '企查查',
      message: `企查查查询失败：${err.message}`,
      error: err.message
    });
    return null;
  }
}

module.exports = { callRiskControlScan, mapRiskItems, assessByQCC, getAuthHeaders };

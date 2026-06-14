/**
 * 商业合作风险评估 - 核心评估引擎
 * 数据源：企查查 API（优先）→ 启信宝 API（备选）
 * 纯 Node.js，不依赖 Express，可在任何环境运行
 */

const axios = require('axios');

// ============ 企查查 / 启信宝 API 客户端 ===========
let qccClient = null;
let qixinClient = null;
try { qccClient = require('./apis/qcc'); } catch (e) {}
try { qixinClient = require('./apis/qixin'); } catch (e) {}

// ============ 35项风险清单（用于前端展示） ===========
const RISK_CHECKLIST = {
  businessQualification: {
    name: '主体资质风险', weight: 20,
    items: [
      { id: 'q1', text: '营业执照是否在有效期内', weight: 3 },
      { id: 'q2', text: '工商登记状态是否正常（非注销/吊销）', weight: 5 },
      { id: 'q3', text: '注册资本是否实缴到位', weight: 3 },
      { id: 'q4', text: '是否存在经营异常名录记录', weight: 3 },
      { id: 'q5', text: '是否被列入严重违法失信企业名单', weight: 5 },
      { id: 'q6', text: '法定代表人是否被限制高消费', weight: 4 },
      { id: 'q7', text: '经营范围是否包含合作业务所需资质', weight: 2 }
    ]
  },
  judicialRisk: {
    name: '司法风险', weight: 25,
    items: [
      { id: 'j1', text: '是否存在作为被告的未决诉讼', weight: 5 },
      { id: 'j2', text: '近3年涉诉案件数量是否过高(>=10件)', weight: 4 },
      { id: 'j3', text: '是否存在被执行信息（执行中）', weight: 5 },
      { id: 'j4', text: '是否被列为失信被执行人', weight: 6 },
      { id: 'j5', text: '是否存在股权冻结记录', weight: 4 },
      { id: 'j6', text: '是否存在破产重整/清算记录', weight: 5 },
      { id: 'j7', text: '是否存在劳动争议纠纷（批量）', weight: 3 }
    ]
  },
  complianceRisk: {
    name: '经营合规风险', weight: 20,
    items: [
      { id: 'c1', text: '是否存在行政处罚记录', weight: 4 },
      { id: 'c2', text: '是否存在税务异常/欠税公告', weight: 5 },
      { id: 'c3', text: '是否存在环保处罚记录', weight: 3 },
      { id: 'c4', text: '是否存在劳动保障处罚', weight: 3 },
      { id: 'c5', text: '是否通过行业必要资质认证', weight: 3 },
      { id: 'c6', text: '是否存在进出口违规记录', weight: 2 }
    ]
  },
  reputationRisk: {
    name: '舆情与声誉风险', weight: 15,
    items: [
      { id: 'r1', text: '是否存在重大负面新闻报道', weight: 4 },
      { id: 'r2', text: '是否存在产品质量/安全问题投诉', weight: 4 },
      { id: 'r3', text: '是否存在消费者集体维权事件', weight: 3 },
      { id: 'r4', text: '社交媒体是否存在持续负面舆情', weight: 2 },
      { id: 'r5', text: '企业及高管是否存在刑事涉案舆情', weight: 4 }
    ]
  },
  financialRisk: {
    name: '财务状况风险', weight: 10,
    items: [
      { id: 'f1', text: '是否存在大额对外担保', weight: 3 },
      { id: 'f2', text: '是否存在资产抵押/质押情况', weight: 2 },
      { id: 'f3', text: '是否存在拖欠货款/工程款纠纷', weight: 3 },
      { id: 'f4', text: '是否涉及重大资产转让/重组', weight: 3 }
    ]
  },
  ipRisk: {
    name: '知识产权风险', weight: 10,
    items: [
      { id: 'i1', text: '是否存在商标侵权纠纷', weight: 3 },
      { id: 'i2', text: '是否存在专利侵权纠纷', weight: 3 },
      { id: 'i3', text: '是否存在著作权纠纷', weight: 2 },
      { id: 'i4', text: '核心商标/专利是否有效存续', weight: 3 }
    ]
  }
};

const RISK_LEVELS = {
  LOW:      { level: '低风险',  color: '#07C160', minScore: 0,  maxScore: 30,  advice: '无明显风险因素，建议推进合作。建议签订标准合作协议，明确双方权利义务即可。', tag: '可合作' },
  MEDIUM:  { level: '中等风险', color: '#FF9800', minScore: 31, maxScore: 55,  advice: '存在一定风险因素，建议在签订合同时增加相应保护条款（如违约责任、担保条款），并对重点关注事项进行进一步核查。', tag: '谨慎合作' },
  HIGH:    { level: '高风险',  color: '#FF5722', minScore: 56, maxScore: 75,  advice: '存在较多风险因素，建议暂缓合作。如确需合作，应要求对方提供担保或第三方保证，并在合同中设置严格违约条款及退出机制。', tag: '建议暂缓' },
  CRITICAL:{ level: '极高风险', color: '#D32F2F', minScore: 76, maxScore: 100, advice: '存在严重风险因素，强烈建议不予合作。可能存在法律纠纷、失信被执行、经营异常等重大问题，合作可能导致连带责任或经济损失。', tag: '不建议合作' }
};

// ============ 调用企查查 API ===========

async function tryQCC(companyName, searchLog) {
  if (!qccClient) {
    searchLog.push({ step: 'qcc', status: 'skipped', source: '企查查', message: '企查查客户端未加载（未配置 API Key）' });
    return null;
  }

  searchLog.push({ step: 'qcc', status: 'running', source: '企查查', message: `正在通过企查查查询「${companyName}」...` });

  try {
    const result = await qccClient.assessByQCC(companyName, searchLog);
    if (result && result.checkedItems) {
      const count = Object.values(result.checkedItems).filter(Boolean).length;
      searchLog.push({ step: 'qcc', status: 'success', source: '企查查', message: `企查查评估完成，发现 ${count} 项风险` });
      return result;
    }
    searchLog.push({ step: 'qcc', status: 'no_results', source: '企查查', message: '企查查未找到匹配企业或无风险数据' });
    return null;
  } catch (err) {
    searchLog.push({ step: 'qcc', status: 'error', source: '企查查', message: `企查查调用失败：${err.message}` });
    return null;
  }
}

// ============ 调用启信宝 API ===========

async function tryQixin(companyName, searchLog) {
  if (!qixinClient) {
    searchLog.push({ step: 'qixin', status: 'skipped', source: '启信宝', message: '启信宝客户端未加载（未配置 API Key）' });
    return null;
  }

  searchLog.push({ step: 'qixin', status: 'running', source: '启信宝', message: `正在通过启信宝查询「${companyName}」...` });

  try {
    const result = await qixinClient.assessByQixin(companyName, searchLog);
    if (result && result.checkedItems) {
      const count = Object.values(result.checkedItems).filter(Boolean).length;
      searchLog.push({ step: 'qixin', status: 'success', source: '启信宝', message: `启信宝评估完成，发现 ${count} 项风险` });
      return result;
    }
    searchLog.push({ step: 'qixin', status: 'no_results', source: '启信宝', message: '启信宝未找到匹配企业或无风险数据' });
    return null;
  } catch (err) {
    searchLog.push({ step: 'qixin', status: 'error', source: '启信宝', message: `启信宝调用失败：${err.message}` });
    return null;
  }
}

// ============ 主评估流程 ===========

async function searchDrivenAssess(companyName) {
  const checkedItems = {};
  const riskSummary = [];
  const searchLog = [];

  // 初始化所有项为 false
  Object.values(RISK_CHECKLIST).forEach(dim => {
    dim.items.forEach(item => { checkedItems[item.id] = false; });
  });

  // 第一优先级：企查查 API
  const qccResult = await tryQCC(companyName, searchLog);
  if (qccResult) {
    Object.assign(checkedItems, qccResult.checkedItems);
    riskSummary.push(...qccResult.riskSummary);
    return { checkedItems, riskSummary, source: 'qcc', searchLog };
  }

  // 第二优先级：启信宝 API
  const qixinResult = await tryQixin(companyName, searchLog);
  if (qixinResult) {
    Object.assign(checkedItems, qixinResult.checkedItems);
    riskSummary.push(...qixinResult.riskSummary);
    return { checkedItems, riskSummary, source: 'qixin', searchLog };
  }

  // 两个 API 都无结果
  searchLog.push({
    step: 'no_data',
    status: 'no_data',
    message: `企查查和启信宝均未找到「${companyName}」的风险数据。请检查企业名称是否正确，或手动填写风险评估。`
  });

  return { checkedItems, riskSummary, source: 'none', searchLog };
}

// ============ 评分计算 ===========

function calculateRiskScore(checkResults) {
  let totalScore = 0;
  let checkedCount = 0;
  const dimensionScores = {};
  const riskItems = [];

  Object.keys(RISK_CHECKLIST).forEach(dimKey => {
    const dim = RISK_CHECKLIST[dimKey];
    let dimScore = 0;
    let dimMaxScore = 0;

    dim.items.forEach(item => {
      dimMaxScore += item.weight;
      if (checkResults[item.id] === true) {
        checkedCount++;
        dimScore += item.weight;
        riskItems.push({
          id: item.id, text: item.text, weight: item.weight,
          dimension: dimKey, dimensionName: dim.name, isRisk: true
        });
      }
    });

    const normalizedScore = dimMaxScore > 0 ? (dimScore / dimMaxScore) * dim.weight : 0;
    dimensionScores[dimKey] = {
      name: dim.name, score: Math.round(normalizedScore * 10) / 10,
      maxScore: dim.weight, riskCount: dim.items.filter(i => checkResults[i.id]).length,
      totalCount: dim.items.length
    };
    totalScore += normalizedScore;
  });

  totalScore = Math.round(totalScore);
  let riskLevel = RISK_LEVELS.LOW;
  if (totalScore >= RISK_LEVELS.CRITICAL.minScore) riskLevel = RISK_LEVELS.CRITICAL;
  else if (totalScore >= RISK_LEVELS.HIGH.minScore) riskLevel = RISK_LEVELS.HIGH;
  else if (totalScore >= RISK_LEVELS.MEDIUM.minScore) riskLevel = RISK_LEVELS.MEDIUM;

  return { totalScore, riskLevel, dimensionScores, riskItems, checkedCount, totalItems: 35 };
}

// ============ 导出主函数 ===========

async function assess(companyName) {
  const { checkedItems, riskSummary, source, searchLog } = await searchDrivenAssess(companyName);
  const riskResult = calculateRiskScore(checkedItems);

  const sourceMap = {
    'qcc': '企查查 API',
    'qixin': '启信宝 API',
    'none': '无数据（两个 API 均未返回结果）'
  };

  return {
    success: true,
    companyName,
    checkedItems,
    riskSummary,
    score: riskResult.totalScore,
    riskLevel: riskResult.riskLevel,
    dimensionScores: riskResult.dimensionScores,
    riskItems: riskResult.riskItems,
    summary: riskResult.riskLevel.advice,
    checkedCount: riskResult.checkedCount,
    totalItems: 35,
    dataSource: sourceMap[source] || '未知',
    searchLog: searchLog || []
  };
}

module.exports = { assess, calculateRiskScore };

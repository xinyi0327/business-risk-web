/**
 * 商业合作风险评估 - 核心评估引擎
 * 纯 Node.js，不依赖 Express，可在任何环境运行
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Brave Search API Key（可选）
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';

// ============ 已知风险企业数据库 ============
const KNOWN_RISKS = {
  '恒大集团': { q2: true, q4: true, j1: true, j3: true, j4: true, j6: true, r1: true, r2: true, c1: true, c2: true, f1: true, f3: true },
  '恒大地产': { q2: true, q4: true, j1: true, j3: true, j4: true, j6: true, r1: true, c1: true, c2: true, f1: true },
  '乐视网': { q2: true, q4: true, q5: true, j1: true, j3: true, j4: true, j6: true, r1: true, c1: true, c2: true, f1: true, f3: true },
  '乐视': { q2: true, q4: true, q5: true, j1: true, j3: true, j4: true, j6: true, r1: true, c1: true, c2: true, f1: true, f3: true },
  'ofo小黄车': { q2: true, q4: true, j1: true, j3: true, j4: true, j7: true, r1: true, r3: true, c1: true, c4: true, f3: true },
  'ofo': { q2: true, q4: true, j1: true, j3: true, j4: true, j7: true, r1: true, r3: true, c1: true, c4: true, f3: true },
  '蛋壳公寓': { q2: true, q4: true, q5: true, j1: true, j3: true, j4: true, j7: true, r1: true, r3: true, c1: true, c4: true, f3: true },
  '柔宇科技': { q2: true, q4: true, j1: true, j3: true, j6: true, r1: true, c1: true, f1: true, f3: true },
  '瑞幸咖啡': { q5: true, j1: true, r1: true, r2: true, c1: true, c2: true, c6: true },
  '康美药业': { q5: true, j1: true, j4: true, r1: true, r5: true, c1: true, c2: true, c6: true, f1: true, f3: true },
  '长生生物': { q2: true, q5: true, j1: true, r1: true, r2: true, c1: true, c3: true, c5: true },
  '三鹿集团': { q2: true, q5: true, j1: true, j6: true, r1: true, r2: true, r3: true, c1: true, c3: true, c5: true },
  '华信能源': { q2: true, q4: true, q5: true, j1: true, j3: true, j4: true, j6: true, r1: true, c1: true, c2: true, f1: true },
  '安邦保险': { q2: true, q5: true, j1: true, j6: true, r1: true, r5: true, c1: true, c2: true, f1: true },
  '北大方正': { q2: true, q4: true, j1: true, j3: true, j6: true, r1: true, c1: true, c2: true, f1: true, f3: true },
};

// 行业风险关键词映射
const INDUSTRY_RISKS = {
  '房地产': { q3: 0.3, j1: 0.4, f1: 0.5, f3: 0.4 },
  '金融': { q3: 0.3, j1: 0.3, f1: 0.6, c2: 0.3 },
  '投资': { q3: 0.3, j1: 0.4, f1: 0.5, c2: 0.3 },
  'P2P': { q5: 0.8, j1: 0.7, j4: 0.6, r1: 0.7, c1: 0.5 },
  '互联网金融': { q5: 0.5, j1: 0.4, j4: 0.4, r1: 0.5, c1: 0.4 },
  '影视': { j1: 0.3, f1: 0.3, r1: 0.4 },
  '娱乐': { j1: 0.2, r1: 0.3 },
  '教育': { j1: 0.2, c4: 0.3, r3: 0.3 },
  '培训': { j1: 0.2, c4: 0.3, r3: 0.3 },
  '医疗': { r2: 0.4, c3: 0.3, c5: 0.4 },
  '医药': { r2: 0.4, c3: 0.3, c5: 0.4 },
  '食品': { r2: 0.5, c3: 0.3, c5: 0.5 },
  '餐饮': { c3: 0.3, c4: 0.3, r2: 0.3 },
};

// ============ 搜索工具函数 ============

async function searchBrave(query, searchLog) {
  if (!BRAVE_API_KEY) {
    searchLog.push({
      step: 'brave_search',
      status: 'skipped',
      source: 'Brave Search API',
      query: query,
      message: '未配置 BRAVE_API_KEY，跳过 Brave Search'
    });
    return '';
  }
  searchLog.push({
    step: 'brave_search',
    status: 'running',
    source: 'Brave Search API',
    query: query,
    message: '正在调用 Brave Search API...'
  });
  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: 10 },
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY
      },
      timeout: 8000
    });
    const results = response.data?.web?.results || [];
    const text = results.map(r => `${r.title} ${r.description}`).join(' ');
    searchLog.push({
      step: 'brave_search',
      status: 'success',
      source: 'Brave Search API',
      query: query,
      resultCount: results.length,
      textLength: text.length,
      message: `Brave Search 返回 ${results.length} 条结果，提取 ${text.length} 字符`
    });
    return text;
  } catch (err) {
    searchLog.push({
      step: 'brave_search',
      status: 'error',
      source: 'Brave Search API',
      query: query,
      error: err.message,
      message: `Brave Search 调用失败: ${err.message}`
    });
    return '';
  }
}

async function searchWeb(query, searchLog) {
  searchLog.push({
    step: 'bing_search',
    status: 'running',
    source: 'Bing 搜索引擎',
    query: query,
    message: '正在搜索 Bing...'
  });
  try {
    const response = await axios.get('https://www.bing.com/search', {
      params: { q: query, setmkt: 'zh-CN', setlang: 'zh' },
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    const html = response.data || '';
    const text = extractSearchText(html);
    const hasResults = text.length > 50;
    searchLog.push({
      step: 'bing_search',
      status: hasResults ? 'success' : 'no_results',
      source: 'Bing 搜索引擎',
      query: query,
      htmlLength: html.length,
      textLength: text.length,
      message: hasResults
        ? `Bing 返回 ${html.length} 字节 HTML，提取 ${text.length} 字符有效文本`
        : `Bing 返回 HTML 但未能提取有效搜索结果（仅 ${text.length} 字符）`
    });
    return html;
  } catch (err) {
    searchLog.push({
      step: 'bing_search',
      status: 'error',
      source: 'Bing 搜索引擎',
      query: query,
      error: err.message,
      message: `Bing 搜索失败: ${err.message}`
    });
    return '';
  }
}

function extractSearchText(html) {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    const snippets = [];
    $('.b_lineclamp2, .b_caption p, .b_algo h2, .b_algo a').each((i, el) => {
      snippets.push($(el).text().trim());
    });
    if (snippets.length === 0) {
      $('li.b_algo').each((i, el) => {
        snippets.push($(el).text().trim());
      });
    }
    return snippets.join(' ').substring(0, 30000);
  } catch (err) {
    return html.replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 30000);
  }
}

// ============ 评分引擎 ============

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
  MEDIUM:   { level: '中等风险', color: '#FF9800', minScore: 31, maxScore: 55,  advice: '存在一定风险因素，建议在签订合同时增加相应保护条款（如违约责任、担保条款），并对重点关注事项进行进一步核查。', tag: '谨慎合作' },
  HIGH:     { level: '高风险',  color: '#FF5722', minScore: 56, maxScore: 75,  advice: '存在较多风险因素，建议暂缓合作。如确需合作，应要求对方提供担保或第三方保证，并在合同中设置严格违约条款及退出机制。', tag: '建议暂缓' },
  CRITICAL: { level: '极高风险', color: '#D32F2F', minScore: 76, maxScore: 100, advice: '存在严重风险因素，强烈建议不予合作。可能存在法律纠纷、失信被执行、经营异常等重大问题，合作可能导致连带责任或经济损失。', tag: '不建议合作' }
};

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

// ============ Fallback 评估引擎 ============

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) / 2147483647;
}

function fallbackAssess(companyName, searchLog) {
  const checkedItems = {};
  const riskSummary = [];
  const allItemIds = [
    'q1','q2','q3','q4','q5','q6','q7',
    'j1','j2','j3','j4','j5','j6','j7',
    'c1','c2','c3','c4','c5','c6',
    'r1','r2','r3','r4','r5',
    'f1','f2','f3','f4',
    'i1','i2','i3','i4'
  ];

  allItemIds.forEach(id => { checkedItems[id] = false; });

  const normalizedName = companyName.trim();
  let knownRisk = null;

  for (const [name, risks] of Object.entries(KNOWN_RISKS)) {
    if (normalizedName.includes(name) || name.includes(normalizedName)) {
      knownRisk = risks;
      break;
    }
  }

  if (knownRisk) {
    Object.entries(knownRisk).forEach(([key, val]) => {
      if (val) checkedItems[key] = true;
    });
    riskSummary.push('该企业为公开报道中的高风险案例');
    searchLog.push({
      step: 'fallback',
      status: 'used',
      source: '已知风险企业数据库',
      message: `在已知风险企业数据库中找到匹配记录：${Object.keys(KNOWN_RISKS).find(k => normalizedName.includes(k) || k.includes(normalizedName))}`
    });
  }

  if (!knownRisk) {
    let matchedIndustry = null;
    for (const [industry, risks] of Object.entries(INDUSTRY_RISKS)) {
      if (normalizedName.includes(industry)) {
        Object.entries(risks).forEach(([key, probability]) => {
          const hash = hashString(normalizedName + key);
          if (hash < probability) checkedItems[key] = true;
        });
        matchedIndustry = industry;
        break;
      }
    }
    if (matchedIndustry) {
      searchLog.push({
        step: 'fallback',
        status: 'used',
        source: '行业规则评估',
        message: `企业名称包含行业关键词「${matchedIndustry}」，基于行业风险规则进行概率评估`
      });
    } else {
      searchLog.push({
        step: 'fallback',
        status: 'used',
        source: '默认评估',
        message: '未在已知风险数据库或行业规则中找到匹配，返回无风险默认结果'
      });
    }
  }

  const itemTextMap = {
    q2: '工商登记状态异常', q4: '存在经营异常名录记录', q5: '被列入严重违法失信名单',
    j1: '存在作为被告的诉讼记录', j3: '存在被执行信息', j4: '被列为失信被执行人',
    j6: '存在破产/重整/清算记录', j7: '存在劳动争议纠纷',
    r1: '存在负面新闻报道', r2: '存在产品质量/安全问题投诉', r3: '存在消费者集体维权事件',
    c1: '存在行政处罚记录', c2: '存在税务异常/欠税记录', c3: '存在环保处罚记录',
    c4: '存在劳动保障处罚', c6: '存在进出口违规记录',
    f1: '存在大额对外担保', f3: '存在拖欠货款/工程款纠纷',
    i1: '存在商标侵权纠纷', i2: '存在专利侵权纠纷'
  };

  Object.entries(checkedItems).forEach(([key, val]) => {
    if (val && itemTextMap[key] && !riskSummary.includes(itemTextMap[key])) {
      riskSummary.push(itemTextMap[key]);
    }
  });

  return { checkedItems, riskSummary, source: knownRisk ? 'known_database' : 'rule_based' };
}

// ============ 搜索驱动评估 ============

async function searchDrivenAssess(companyName) {
  const checkedItems = {};
  const riskSummary = [];
  const searchLog = [];

  searchLog.push({
    step: 'start',
    status: 'info',
    message: `开始评估企业：「${companyName}」`
  });

  // 并行搜索：Brave + Bing
  const [braveResult, bingHtml] = await Promise.all([
    searchBrave(`"${companyName}" 企业风险 工商 司法`, searchLog),
    searchWeb(`"${companyName}" 企业风险`, searchLog)
  ]);

  let searchText = braveResult;
  let usedSource = 'brave';

  if (!searchText || searchText.length < 50) {
    searchText = extractSearchText(bingHtml);
    usedSource = 'bing';
    if (searchText && searchText.length > 50) {
      searchLog.push({
        step: 'source_switch',
        status: 'info',
        message: 'Brave Search 未返回有效结果，已切换至 Bing 搜索结果'
      });
    }
  } else {
    searchLog.push({
      step: 'source_confirm',
      status: 'info',
      message: '使用 Brave Search 结果进行风险分析'
    });
  }

  if (searchText && searchText.length > 200) {
    searchLog.push({
      step: 'analyze',
      status: 'running',
      message: `正在分析 ${searchText.length} 字符的搜索结果...`
    });

    const matches = [];

    if (searchText.includes('注销') || searchText.includes('吊销')) {
      checkedItems.q2 = true; riskSummary.push('工商登记状态非正常');
      matches.push({ keyword: '注销/吊销', item: 'q2', desc: '工商登记状态非正常' });
    }
    if (searchText.includes('经营异常')) {
      checkedItems.q4 = true; riskSummary.push('存在经营异常名录记录');
      matches.push({ keyword: '经营异常', item: 'q4', desc: '存在经营异常名录记录' });
    }
    if (searchText.includes('严重违法失信') || searchText.includes('黑名单')) {
      checkedItems.q5 = true; riskSummary.push('被列入严重违法失信企业名单');
      matches.push({ keyword: '严重违法失信/黑名单', item: 'q5', desc: '被列入严重违法失信企业名单' });
    }
    if (searchText.includes('被告') && searchText.includes('诉讼')) {
      checkedItems.j1 = true; riskSummary.push('存在作为被告的诉讼记录');
      matches.push({ keyword: '被告+诉讼', item: 'j1', desc: '存在作为被告的诉讼记录' });
    }
    if (searchText.includes('被执行人')) {
      checkedItems.j3 = true; riskSummary.push('存在被执行信息');
      matches.push({ keyword: '被执行人', item: 'j3', desc: '存在被执行信息' });
    }
    if (searchText.includes('失信被执行人') || searchText.includes('老赖')) {
      checkedItems.j4 = true; riskSummary.push('被列为失信被执行人');
      matches.push({ keyword: '失信被执行人/老赖', item: 'j4', desc: '被列为失信被执行人' });
    }
    if (searchText.includes('股权冻结')) {
      checkedItems.j5 = true; riskSummary.push('存在股权冻结记录');
      matches.push({ keyword: '股权冻结', item: 'j5', desc: '存在股权冻结记录' });
    }
    if (searchText.includes('破产') || searchText.includes('重整')) {
      checkedItems.j6 = true; riskSummary.push('存在破产/重整/清算记录');
      matches.push({ keyword: '破产/重整', item: 'j6', desc: '存在破产/重整/清算记录' });
    }
    if (searchText.includes('劳动') && searchText.includes('纠纷')) {
      checkedItems.j7 = true; riskSummary.push('存在劳动争议纠纷');
      matches.push({ keyword: '劳动+纠纷', item: 'j7', desc: '存在劳动争议纠纷' });
    }
    if (searchText.includes('负面') || searchText.includes('曝光') || searchText.includes('处罚')) {
      checkedItems.r1 = true; riskSummary.push('存在负面新闻报道');
      matches.push({ keyword: '负面/曝光/处罚', item: 'r1', desc: '存在负面新闻报道' });
    }
    if (searchText.includes('质量') || searchText.includes('投诉')) {
      checkedItems.r2 = true; riskSummary.push('存在产品质量/安全问题投诉');
      matches.push({ keyword: '质量/投诉', item: 'r2', desc: '存在产品质量/安全问题投诉' });
    }
    if (searchText.includes('刑事') || searchText.includes('犯罪')) {
      checkedItems.r5 = true; riskSummary.push('企业或高管涉及刑事案件');
      matches.push({ keyword: '刑事/犯罪', item: 'r5', desc: '企业或高管涉及刑事案件' });
    }
    if (searchText.includes('行政处罚')) {
      checkedItems.c1 = true; riskSummary.push('存在行政处罚记录');
      matches.push({ keyword: '行政处罚', item: 'c1', desc: '存在行政处罚记录' });
    }
    if (searchText.includes('税务') || searchText.includes('欠税')) {
      checkedItems.c2 = true; riskSummary.push('存在税务异常/欠税记录');
      matches.push({ keyword: '税务/欠税', item: 'c2', desc: '存在税务异常/欠税记录' });
    }
    if (searchText.includes('环保')) {
      checkedItems.c3 = true; riskSummary.push('存在环保处罚记录');
      matches.push({ keyword: '环保', item: 'c3', desc: '存在环保处罚记录' });
    }

    searchLog.push({
      step: 'analyze',
      status: 'success',
      message: `分析完成，从搜索结果中匹配到 ${matches.length} 项风险关键词`,
      matches: matches
    });

    // 如果搜索匹配到的风险项很少，检查已知风险数据库作为补充
    const matchedKeys = Object.keys(checkedItems).filter(k => checkedItems[k]);
    if (matchedKeys.length <= 2) {
      const normalizedName = companyName.trim();
      for (const [name, risks] of Object.entries(KNOWN_RISKS)) {
        if (normalizedName.includes(name) || name.includes(normalizedName)) {
          searchLog.push({
            step: 'supplement',
            status: 'info',
            source: '已知风险企业数据库',
            message: `搜索匹配风险项较少，补充查询已知风险企业数据库，找到匹配记录`
          });
          Object.entries(risks).forEach(([key, val]) => {
            if (val && !checkedItems[key]) {
              checkedItems[key] = true;
              const itemTextMap = {
                q2: '工商登记状态异常', q4: '存在经营异常名录记录', q5: '被列入严重违法失信名单',
                j1: '存在作为被告的诉讼记录', j3: '存在被执行信息', j4: '被列为失信被执行人',
                j6: '存在破产/重整/清算记录', j7: '存在劳动争议纠纷',
                r1: '存在负面新闻报道', r2: '存在产品质量/安全问题投诉', r3: '存在消费者集体维权事件',
                c1: '存在行政处罚记录', c2: '存在税务异常/欠税记录', c3: '存在环保处罚记录',
                c4: '存在劳动保障处罚', c6: '存在进出口违规记录',
                f1: '存在大额对外担保', f3: '存在拖欠货款/工程款纠纷',
                i1: '存在商标侵权纠纷', i2: '存在专利侵权纠纷'
              };
              if (itemTextMap[key] && !riskSummary.includes(itemTextMap[key])) {
                riskSummary.push(itemTextMap[key]);
              }
            }
          });
          break;
        }
      }
    }

    return { checkedItems, riskSummary, source: 'search', searchLog };
  }

  searchLog.push({
    step: 'analyze',
    status: 'no_data',
    message: '搜索引擎返回的有效信息不足（少于200字符），无法从公开搜索结果中识别风险'
  });

  const fallback = fallbackAssess(companyName, searchLog);
  return { ...fallback, searchLog };
}

// ============ 主评估函数 ============

async function assess(companyName) {
  const { checkedItems, riskSummary, source, searchLog } = await searchDrivenAssess(companyName);
  const riskResult = calculateRiskScore(checkedItems);

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
    dataSource: source === 'search' ? '公开搜索引擎' : source === 'known_database' ? '已知风险企业数据库' : '行业规则评估',
    searchLog: searchLog || []
  };
}

module.exports = { assess, searchWeb, extractSearchText, fallbackAssess, calculateRiskScore };

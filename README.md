# 商业合作风险评估系统

基于 Node.js + Express 的企业风险自动评估 Web 服务。

## 功能

- **自动企业风险评估**：输入企业名称，系统自动分析并返回风险评分
- **6大维度 × 35项指标**：主体资质 / 司法风险 / 经营合规 / 舆情声誉 / 财务状况 / 知识产权
- **四档风险等级**：低风险(0-30) / 中等风险(31-55) / 高风险(56-75) / 极高风险(76-100)
- **可视化报告**：评分圆环、维度得分、重点关注项、合作建议

## 技术栈

| 层面 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 前端 | 纯 HTML/CSS/JS（单页应用）|
| 搜索 | Brave Search API / Bing HTML（fallback）|
| 评分引擎 | 自定义加权评分算法 |

## API 接口

### POST /api/assess
综合风险评估

```json
// Request
{
  "companyName": "恒大集团"
}

// Response
{
  "success": true,
  "companyName": "恒大集团",
  "score": 72,
  "riskLevel": {
    "level": "高风险",
    "color": "#FF5722",
    "tag": "建议暂缓",
    "advice": "存在较多风险因素，建议暂缓合作..."
  },
  "checkedItems": { "q2": true, "j3": true, ... },
  "riskSummary": ["存在被执行信息", "被列为失信被执行人", ...],
  "dataSource": "已知风险企业数据库"
}
```

### GET /api/health
健康检查

## 部署到 Render.com

### 步骤 1：准备代码

确保项目包含以下文件：
```
business-risk-web/
├── package.json
├── server/
│   └── index.js
├── public/
│   └── index.html
└── README.md
```

### 步骤 2：推送到 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/business-risk-web.git
git push -u origin main
```

### 步骤 3：在 Render.com 创建 Web Service

1. 访问 [render.com](https://render.com) 并登录
2. 点击 **New +** → **Web Service**
3. 选择你的 GitHub 仓库
4. 配置：
   - **Name**: `business-risk-assess`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 点击 **Create Web Service**

### 步骤 4：（可选）配置 Brave Search API

1. 访问 [brave.com/search/api](https://brave.com/search/api/) 注册获取 API Key
2. 在 Render.com 的 **Environment** 中添加：
   - `BRAVE_API_KEY` = 你的 API Key
3. 重新部署

> 如果不配置 Brave Search API，系统会使用内置的已知风险企业数据库 + 行业规则评估作为 fallback。

### 步骤 5：访问

部署完成后，访问 Render 提供的 URL 即可使用。

## 本地开发

```bash
npm install
npm start
```

访问 http://localhost:3000

## 数据来源说明

当前版本使用以下数据来源：

1. **Brave Search API**（可选）：通过环境变量配置，可获取实时搜索结果
2. **已知风险企业数据库**：内置 15+ 家公开报道中的高风险企业数据
3. **行业规则评估**：基于企业名称中的行业关键词进行概率评估

**生产环境建议**：接入天眼查 API 或企查查 API 获取更精准的企业数据。

## 项目结构

```
business-risk-web/
├── package.json           # 依赖和脚本
├── server/
│   └── index.js           # Express 服务器 + 评分引擎 + 评估逻辑
├── public/
│   └── index.html         # 前端单页应用
└── README.md              # 本文档
```

# RAS CRM v3.0 — UX 完整重设计

**日期**：2026-06-13
**状态**：设计稿（待用户审）
**作者**：Claude（与用户协作产出）
**前置**：v1.0 spec (`2026-06-13-ras-crm-webapp-design.md`), v1.0 plan, v2.0 spec/plan (DB 迁移)

---

## 1. 概述

### 1.1 目的

基于用户对 v2.0 的 9 项反馈，重做 4 块：字段映射（根因 bug 修复）、UI 美观、分析/仪表盘深度、字典机制透明化。Schema 加 2 字段、改 1 列名。

### 1.2 范围

**在范围内** (v3.0 重设计):
- 别名表扩展 (5 个新别名) + 销售渠道新字段
- 备注重命名为发票状态 + 入字典
- 折算 RMB 金额新字段
- UI 美观重设计 (CSS refresh)
- 仪表盘扩展 (5→10 卡)
- 商机列表筛选改造 (减 2 加 2) + 金额总计行
- 新增页 (form) 适配新 schema
- 多维分析扩展 (8→12 视图)
- 字段说明页 (字典↔商机透明化)

**不在范围内** (v3.1+):
- 多用户/多设备同步
- Excel 实时双向编辑
- 复杂权限/审批流
- 移动端原生 App

### 1.3 9 项问题对照表

| # | 用户反馈 | v3.0 解法 |
|---|---|---|
| 1 | 页面不够美观 | 整体 CSS refresh: 卡片阴影 / 渐变 / 间距 / 字体 |
| 2 | 仪表盘太简单 | 5 卡 → 10 卡 (含发票状态分布、时间趋势) |
| 3 | 赢率 0% | 加别名"赢单概率" + 加字段销售渠道 + 修正所有 5 个缺失别名 |
| 4 | 筛选字段改造 | 去掉"产品/产品线"加"客户/负责人", 团队页改"字段说明" |
| 5 | 金额总计 | 列表底部加汇总行 (含税 / 折算 RMB / 加权) |
| 6 | 备注拆列 | 实际只 5 个枚举值, 重命名为"发票状态" (内置, 不入字典) |
| 7 | 新增页调整 | form 加 2 字段 (发票状态/折算 RMB), 调整字段顺序 |
| 8 | 多维分析太简单 | 8 视图 → 12 视图 (加客户/产品/状态/趋势 4 维) |
| 9 | 字典对应关系 | 加"字段说明"页 (列表每个字典↔商机字段的对应关系) |

---

## 2. 数据模型 (Schema v3.0)

### 2.1 商机表 (oportunidades) v3.0

```sql
-- 重命名/新增列
-- 旧: team, owner, opp_name, customer, product_line, product, currency, stage,
--     win_rate, amount, amount_net, expected_date, note, lose_reason
-- 新: 全部 14 业务字段 + dict_refs (JSON) + 元字段
CREATE TABLE oportunidades (
  id TEXT PRIMARY KEY,
  -- 业务字段 (15 个)
  team TEXT,                  -- 销售团队 (dict_teams)
  owner TEXT,                 -- 主责销售 (新增为字典 dict_owners)
  customer TEXT,              -- 客户名称 (新增为字典 dict_customers)
  product_line TEXT,          -- 业务线 (dict_product_lines)
  product TEXT,               -- 业务线产品 (dict_products)
  sales_channel TEXT,         -- 销售渠道 (新增字段/字典 dict_sales_channels)
  stage TEXT,                 -- 阶段 (dict_stages)
  invoice_status TEXT,        -- 发票状态 (内置枚举, 不入字典)
  currency TEXT,              -- 币种 (dict_currencies)
  amount_tax_included REAL,   -- 含税金额 (原 M 列)
  amount_rmb_equivalent REAL, -- 折算 RMB 金额 (自动算, 由 amount × exchangeRate 得)
  win_rate REAL,              -- 赢单概率
  expected_date REAL,         -- 预计落单时间
  note TEXT,                  -- 自由文本备注 (跟 invoice_status 分开)
  -- 元字段
  dict_refs TEXT,             -- JSON: 字段来源说明 (新增)
  deleted INTEGER DEFAULT 0,
  parse_error TEXT,
  position INTEGER
);
```

### 2.2 字典表 (v3.0 = 8 张 + 4 新 = 12 张)

```sql
-- 原有 6 张
dict_teams, dict_product_lines, dict_products, dict_stages, dict_currencies, dict_lose_reasons

-- 新增 3 张 (来自 v3.0 schema; 发票状态内置, 不进字典)
dict_owners              -- 主责销售
dict_customers           -- 客户名称
dict_sales_channels      -- 销售渠道
```

### 2.2.1 内置枚举: 发票状态 (5 个, 写死在代码里, 不进字典)

```javascript
// app/core.js
const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
```

- 字典管理 UI 不显示"发票状态" tab (内置, 不能编辑)
- 表单的"发票状态"字段仍然下拉, 但下拉选项是写死的
- 字段说明页标注: "发票状态 (内置, 不可编辑)"

### 2.2.2 内置汇率 (硬编码, v3.0 简化版)

```javascript
// app/core.js
const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };
// 折算 RMB = amount_tax_included × EXCHANGE_RATES_TO_RMB[currency]
```

- v3.0 用硬编码汇率 (汇率会过期, 标 v3.1 加汇率表)
- 导入 xlsx 时, 如果 N 列有值, 直接用; 如果没值, 按 amount × rate 算
- 表单改 amount 或 currency 时, 折算 RMB 自动更新 (前端 onchange)

### 2.3 字段映射 (字典↔商机)

| 商机字段 | 字典表 | 备注 |
|---|---|---|
| `team` | `dict_teams` | 销售团队 |
| `owner` | `dict_owners` | 主责销售 (新) |
| `customer` | `dict_customers` | 客户名称 (新) |
| `product_line` | `dict_product_lines` | 业务线 |
| `product` | `dict_products` | 业务/产品 |
| `sales_channel` | `dict_sales_channels` | 销售渠道 (新) |
| `stage` | `dict_stages` | 阶段 (5 个) |
| `invoice_status` | `dict_invoice_status` | 发票状态 (5 个, 新) |
| `currency` | `dict_currencies` | 币种 (3 个) |

`lose_reason` 仍是多值 (逗号分隔)，不进字典。`note` 是自由文本不进字典。

### 2.4 别名表 (v3.0 扩展)

```javascript
COLUMN_ALIASES = {
  team:           ['销售团队', '团队', 'Team'],
  owner:          ['主责销售', '负责人', '责任人', 'Sales Rep', 'Owner', '销售负责人'],
  customer:       ['客户名称', '客户', '客户公司', 'Customer'],
  productLine:    ['业务线', '产品线', '业务', 'Product Line'],
  product:        ['业务线产品', '业务/产品', '产品', 'Product'],
  salesChannel:   ['销售渠道', 'Sales Channel'],                    // 新
  stage:          ['阶段', 'Stage'],
  invoiceStatus:  ['发票状态', '开票状态', 'Invoice Status'],       // 新 (重命名备注)
  currency:       ['币种', 'Currency'],
  amount:         ['预估合同金额（含税）', '预估合同金额(含税)', '含税金额', '合同金额', 'Amount'],
  amountRmb:      ['预估合同金额（RMB）', '折算RMB金额', 'RMB金额'],  // 新
  winRate:        ['赢单概率', '赢率', 'Win Rate', '胜率'],          // 修: 之前缺 "赢单概率"
  expectedDate:   ['预计落单时间', '预计成交/丢单时间', '成交时间', 'Expected Date'],
  note:           ['自由备注', 'Internal Note', 'Notes']            // 新
};
```

### 2.5 `dict_refs` JSON 字段格式

```javascript
opp.dict_refs = {
  team: '基础业务',           // 值 = dict_teams 里的值
  owner: '张晶晶',
  customer: '智元创新（上海）科技股份有限公司',
  product_line: 'PL1...',
  product: 'P120...',
  sales_channel: '字节跳动',
  stage: 'ST4:赢单(Win)',    // 标准化: 全角冒号"："→半角":"
  invoice_status: '已开票',
  currency: 'RMB'
};
```

**目的**: UI "字段来源" 视图直接显示 `opp.dict_refs` 字段值→字典的对应关系。导入时填充, 编辑时同步更新。

---

## 3. UI 重设计

### 3.1 整体风格 (现代仪表盘)

- **配色**: 主色 #2563eb (蓝), 辅色 #6366f1 (靛), 强调 #10b981 (绿), 警告 #f59e0b (橙)
- **字体**: 系统字体栈 (PingFang SC / Microsoft YaHei)
- **卡片**: 白底 + 微阴影 + 圆角 10px + hover 阴影加深
- **间距**: 8px 基准网格, 卡片内 22px padding
- **表格**: zebra 斑马纹 + 头部浅灰 + hover 高亮
- **按钮**: 主色按钮圆角 + hover 渐变

### 3.2 顶栏 (v3.0)

```
[RAS CRM] [仪表盘][商机][新增][分析][字典][字段说明]    [●已加载] [📥导入][📤导出][💾备份][📂恢复]
```

移除的: 之前的"团队" tab (改为"字段说明")。

### 3.3 仪表盘 (10 卡 + 2 图)

| 卡 | 内容 |
|---|---|
| 商机总数 | count |
| 总含税金额 | 按币种: USD x / SGD y / RMB z |
| 折算 RMB 总额 | sum(amount_rmb_equivalent) |
| 加权金额 | sum(amount × win_rate) 按币种 |
| 赢单率 | st4 / (st4+st5) × 100% |
| 平均赢单周期 | (st4_date - st1_date) 平均天数 |
| 阶段漏斗 | 5 阶段矩形条 |
| 发票状态分布 | 5 状态饼图 (新) |
| TOP 5 团队 | 横向条 |
| TOP 5 客户 | 横向条 (新) |
| 月度趋势 | 近 6 月折线 (新) |
| TOP 5 销售渠道 | 横向条 (新) |

### 3.4 商机列表

**筛选条** (7 个):
- 团队 / 客户 (新) / 负责人 (新) / 阶段 / 币种 / 发票状态 (新) / 搜索框
- ~~产品 / 产品线~~ (移除 — 直接在表格列里看)

**表格列** (12):
- # / 团队 / 负责人 (新) / 商机 / 客户 (新) / 产品 / 阶段 / 发票状态 (新) / 含税 / 折算 RMB (新) / 赢率 / 操作

**汇总行** (新增, 表格底部固定):
```
共 28 条 | 合计: 含税 USD 1,234 / RMB 5,678 / 折算 RMB 12,345 / 加权 RMB 6,789
```

### 3.5 新增/编辑表单

字段顺序:
1. 销售团队 * (下拉, 必填)
2. 客户名称 * (下拉, 必填) — **新: 改为下拉**
3. 负责人 * (下拉, 必填) — **新: 改为下拉**
4. 商机名称 * (输入, 必填)
5. 业务线 * (下拉, 必填)
6. 业务线产品 * (下拉, 必填, 联动业务线)
7. 销售渠道 (下拉, 可选) — **新**
8. 阶段 * (下拉, 必填)
9. 发票状态 (下拉, 可选) — **新**
10. 币种 * (下拉, 必填)
11. 含税金额 * (数字, 必填)
12. 折算 RMB 金额 (数字, 自动算) — **新**: 选中币种后实时计算
13. 赢单概率 (数字, 0-1)
14. 预计落单时间 (Excel 序列号)
15. 自由备注 (多行文本, 可选) — **新**

### 3.6 多维分析 (12 视图)

| # | 视图 | 说明 |
|---|---|---|
| 1 | 阶段漏斗 | 5 阶段漏斗 |
| 2 | 趋势+同比/环比 | 月度折线 |
| 3 | TOP N 排名 | TOP 10 客户/团队/销售 (新) |
| 4 | 帕累托 80/20 | 客户累计贡献 |
| 5 | 阶段转化率 | ST1→ST5 转化 |
| 6 | 丢单原因汇总 | lose_reason 多值 |
| 7 | 多维透视 (客户×产品) | **新**: 客户×产品交叉表 |
| 8 | ST4 vs ST5 对比 | 赢单 vs 丢单 |
| 9 | 客户分析 | **新**: TOP 客户 + 客户阶段分布 |
| 10 | 销售渠道分析 | **新**: 按销售维度分析 |
| 11 | 发票状态分析 | **新**: 状态分布 + 按时段趋势 |
| 12 | 时间维度 | **新**: 落单时间直方图 |

### 3.7 字段说明 (新页面, 替代原"团队" tab)

```
字段说明 — 字典↔商机 对应关系

商机字段      数据类型    字典表                说明
─────────────────────────────────────────────────────────────
team          下拉单选   dict_teams           销售团队
owner         下拉单选   dict_owners          主责销售
customer      下拉单选   dict_customers       客户名称
product_line  下拉单选   dict_product_lines   业务线
product       下拉单选   dict_products        业务/产品
sales_channel 下拉单选   dict_sales_channels  销售渠道
stage         下拉单选   dict_stages          阶段
invoice_status 下拉单选  dict_invoice_status  发票状态
currency      下拉单选   dict_currencies      币种
lose_reason   文本多值   (不入字典)            丢单原因
note          自由文本   (不入字典)            备注
```

### 3.8 字典管理 (现有 6 tab → 9 tab)

| Tab | 字典 |
|---|---|
| 销售团队 | dict_teams |
| 主责销售 | dict_owners (新) |
| 客户名称 | dict_customers (新) |
| 业务线 | dict_product_lines |
| 业务/产品 | dict_products |
| 销售渠道 | dict_sales_channels (新) |
| 阶段 | dict_stages |
| 币种 | dict_currencies |
| 丢单原因 | dict_lose_reasons |

注: 发票状态是内置枚举 (5 个), 不在字典管理里, 在表单里下拉选。

---

## 4. 关键实施细节

### 4.1 字段说明的"看得懂"

字典↔商机映射**对用户透明**, 3 个层次:
1. **UI 字段说明页** (3.7) — 表格列出所有映射
2. **每条商机行 hover** — 显示字段值 + 字典来源 (tooltip)
3. **编辑表单** — 字段标签下面有"来自 dict_xxx"小字

### 4.2 数据迁移 (现有用户)

用户已有的 DB 数据 (从 v2.0 导入) 缺 5 个新字段 (owner, customer, sales_channel, invoice_status, amount_rmb_equivalent)。启动时检测:
- 如果 DB 是空的 → onboarding 引导
- 如果 DB 有数据但缺新字段 → 加默认值 (空字符串 / 0), 字典自动注入新枚举
- 用户可手动补全新字段

### 4.3 测试策略

- 单元测试: db CRUD (增 4 字典测试) + xlsx-io 别名匹配测试 (5 新增)
- 集成测试: xlsx 导入 → DB → 验证字段映射
- 浏览器 headless 验证: 顶栏 / 仪表盘 10 卡 / 列表筛选 / 字段说明
- 用户的 version0529 必须能正确导入 (赢率、负责人、销售渠道都要有值)

### 4.4 已知 v3.0 风险

- "客户"和"负责人"是下拉 (字典) — 数据量大时性能, 加 LIMIT + 搜索
- "折算 RMB 金额" 涉及汇率 — v3.0 不做汇率表, 假设导入时 N 列已是折算后值
- dict_refs JSON 列查询性能 — 只在字段说明页和 hover tooltip 用, 不参与 SQL WHERE

---

## 5. 实施分块

| 块 | 内容 | 估时 |
|---|---|---|
| 1. Schema + 别名扩展 | 加 4 字典表 + 4 字段 + 别名表 + 测试 | 0.5 天 |
| 2. UI 视觉重设计 | styles.css 大改, 顶栏, 列表, 表单, 仪表盘骨架 | 1 天 |
| 3. 仪表盘扩展 | 5→10 卡 + 2 图 (发票状态饼图 + 月度趋势) | 1 天 |
| 4. 多维分析扩展 | 8→12 视图 | 1 天 |
| 5. 字段说明 + 字典管理 | 新页面 + 字典 10 tab | 0.5 天 |
| 6. 测试 + 文档 | 单元 + 集成 + 浏览器验证 + README 更新 | 0.5 天 |
| **合计** | | **4-5 天** |

---

**审稿请求**: 请审阅 4 段设计 (Schema / UI / 字段说明 / 实施分块)。确认后写 spec 文档, 然后 writing-plans。

特别请关注:
- 段 2.2 字典 12 张是否合理 (4 新增是否都需要)
- 段 3.4 商机列表的列 (10 列) 是否合适
- 段 3.5 新增表单的字段顺序
- 段 3.6 12 个分析视图是否覆盖你的需求

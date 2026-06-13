# RAS CRM v3.0.1 — 9 项反馈修复设计

**日期**:2026-06-13
**状态**:设计稿(待用户审)
**作者**:Claude(与用户协作产出)
**前置**:v3.0 spec(`2026-06-13-v3-ux-redesign-design.md`)已实现 — 数据库 schema 已是 v3.0(9 张字典表 + 商机 15 字段),本 spec 修复 UI/UX 层的 9 项遗留问题。

---

## 1. 概述

### 1.1 目的

v3.0 把 schema 升级好了,但 UI 层暴露问题、计算 bug、分析深度不足。本 spec 修复以下 9 项:

| # | 用户反馈 | 优先级 |
|---|---|---|
| 1 | 页面不够美观 | P1 |
| 2 | 仪表盘太简单,分析维度少 | P2 |
| 3 | 商机的赢率都是 0% | **P0 (bug)** |
| 4 | 商机页面筛选,产品/产品线换客户/负责人,团队页去掉 | P1 |
| 5 | 商机页面筛选后,加金额总计 | P1 |
| 6 | xlsx 备注里的内容(发票状态 5 值)需要形成一列,不要叫"备注" | P1 |
| 7 | 新增页面调整 | P2 |
| 8 | 多维分析太简单 | P2 |
| 9 | 字典和商机的对应关系说明看不懂 | P2 |

### 1.2 范围

**在范围内(v3.0.1)**:
- 1 个真 bug(赢率 0%)修复
- 1 个数据丢失 bug(商机名称 导入丢失)修复
- 列表筛选字段改造 + 金额汇总
- 发票状态字段(把现有的 `invoiceStatus` 字段)UI 改名为"发票状态",form 改下拉
- 仪表盘扩展(4 卡→6+ 卡,新增趋势图/业务线占比/销售代表)
- 多维分析 8 视图→12 视图
- 新增/编辑表单调整(去除不含税金额、日期选择器、阶段→赢率建议、客户 combobox)
- 字段说明页重设计
- styles.css 升级

**不在范围内(v3.1+)**:
- 字典新增(不再加新字典表)
- 多用户/多设备同步
- 复杂权限
- 移动端原生 App

### 1.3 几乎不修改 schema

v3.0 schema 已包含本 spec 所需全部字段。**只新增 1 列(`opp_name`),不新增字典表。** 主体改动是 UI/解析/计算层。

例外:为支持 `opp_name` 字段从 xlsx 正确导入,需做轻量 schema 迁移(v1 → v2,加 `opp_name` 列,见 11.1)。

---

## 2. Bug 修复(P0)

### 2.1 赢率 0% — 全角/半角冒号不一致

**根因**:`xlsx-io.js:parseSheet1` 解析时把商机阶段从 `"ST4：赢单(Win)"`(全角冒号)替换为 `"ST4:赢单(Win)"`(半角冒号),但字典 `dict_stages` 的值仍是 `"ST4：赢单(Win)"`(全角)。`computeKpi` 用 `o.stage === stages.find(s => s.startsWith('ST4'))` 严格相等比较 → 永远匹配不到 → ST4=0,ST5=0 → winRate=0。

**修复**:`xlsx-io.js` 解析时对**所有**字段值统一做全角→半角冒号归一化(`：`→`:`)。最小修改,加一个 `normalizeColons` 工具函数,在 `parseSheet1` 和 `parseSheet2Smart` 出口处调用。

**验证**:导入 `RAS CRM（template） (version0529).xlsx` 后,仪表盘"赢单率"应显示 ~96%(54 ST4 / 56 全部)。

### 2.2 商机名称 导入丢失

**根因**:`COLUMN_ALIASES` 没有 `oppName` 键,`parseSheet1` 没读取该列。xlsx 第 3 列"商机名称"被直接丢弃。

**修复**:
1. `COLUMN_ALIASES` 加 `oppName: ['商机名称', '商机', '项目名称', 'Opp Name', 'Opportunity']`
2. `parseSheet1` 读 `colMap.oppName` → `opp.oppName`(注意 `makeOpportunity` 已有 `oppName` 字段)
3. **但 `core.js` 里 `makeOpportunity` 和 `db.js` 里 `rowToOpp` 都没有 `oppName` 字段** — 这是 v3.0 漏掉的。需补:
   - `core.js:makeOpportunity` 加 `oppName: ''`
   - `core.js:validateOpportunity` 把检查 `oppName` 必填的逻辑也补上
   - `db.js` SQL 加 `opp_name TEXT` 列、`rowToOpp` 读此列、`upsertOpp` 写此列
   - **schema migration**:给现有 DB 加 `opp_name` 列(`ALTER TABLE oportunidades ADD COLUMN opp_name TEXT DEFAULT '';`)

**验证**:导入后,每条商机的"商机"列有真实名称(之前是空)。

### 2.3 备注→发票状态 改名(列名/字段名,数据流不变)

**根因**:`invoiceStatus` 字段其实已经收 xlsx 的"备注"列(因 alias 包含"备注")。但 UI 把它当成了"备注",与实际内容(已开票/已回款等)不符。

**修复**(只改 UI/导出列名,不动数据/字典):
- `ui-form.js`:把"备注" textarea 替换为"发票状态"下拉,选项为 `BUILTIN_INVOICE_STATUSES` 5 个值
- `ui-list.js`:列表列名 "备注" → "发票状态",显示时用颜色 chip
- `xlsx-io.js:buildXlsxFromState`:导出列名 "自由备注" → "发票状态"
- **保留** `note` 字段(供内部使用,UI 不暴露)

---

## 3. 商机列表 改造(P1)

### 3.1 筛选字段调整

**原**:`团队 / 产品线 / 产品 / 阶段 / 币种 / 搜索 / 显示已删除`
**改**:`客户 / 负责人 / 阶段 / 币种 / 搜索 / 显示已删除`

`ui-list.js` 改动:
- `filterState` 字段:`teams/productLines/products/stages/currencies` → `customers/owners/stages/currencies`
- `renderFilters` 输出对应改
- `applyFilters` 改用新字段
- 顶部状态标题:"商机列表 (筛选后 / 总数)"

### 3.2 金额总计 行

表格 `<tfoot>` 加一行,左侧"合计",右侧:
```
共 N 条 | 含税:USD x / SGD y / RMB z | 折算 RMB:¥x | 加权:¥y
```

按当前筛选后的 opps 统计。

### 3.3 列表列调整

| 列 | 来源 | 备注 |
|---|---|---|
| # | index | |
| 团队 | `team` | |
| 负责人 | `owner` | |
| 商机 | `oppName` | (新) |
| 客户 | `customer` | (新) |
| 业务线 | `productLine` | (列名从"产品线"改) |
| 产品 | `product` | |
| 阶段 | `stage` | 加颜色 chip |
| 发票状态 | `invoiceStatus` | (列名从"备注"改,加颜色 chip) |
| 币种 | `currency` | (新) |
| 含税金额 | `amountTaxIncluded` | (新) |
| 折算 RMB | `amountRmbEquivalent` | (新) |
| 赢率 | `winRate` | 百分比 |
| 操作 | | 删除按钮 |

---

## 4. 新增/编辑表单(P2)

### 4.1 字段调整

- **新增**:`商机名称 *`(必填,文本) — 修复 2.2
- **删除**:`不含税金额` 字段(数据里没有,会让用户困惑) — 整字段移除
- **客户名称**:从 free-text input 改为 **combobox**(datalist + 手动输入后自动加入 `dict_customers`)
- **负责人**:保持 free-text input(不是 dict 强约束,xlsx 里就是 free)
- **预计落单时间**:input `type="date"` → 后台转 Excel 序列号
- **赢率**:阶段变更时**自动建议**(ST1=0.1,ST2=0.3,ST3=0.5,ST4=1,ST5=0),用户可改
- **发票状态**:5 选 1 下拉(`BUILTIN_INVOICE_STATUSES`)

### 4.2 字段顺序

1. 销售团队 *(下拉)*
2. 商机名称 *(文本)  ←新*
3. 客户名称 *(combobox)*
4. 负责人 *(文本)*
5. 业务线 *(下拉)*
6. 业务/产品 *(下拉,联动业务线)*
7. 销售渠道 *(下拉)*
8. 阶段 *(下拉,选完建议赢率)*
9. 发票状态 *(下拉)  ←从备注改*
10. 币种 *(下拉)*
11. 含税金额 *(数字)*
12. 折算 RMB *(数字,自动算)*
13. 赢率 *(数字 0-1,选阶段时建议)*
14. 预计落单时间 *(date input)*
15. 丢单原因 *(多选,仅 ST5 阶段显示)*

---

## 5. 仪表盘扩展(P2)

### 5.1 新结构

```
[ KPI 卡片 6 个(具体如下) ]
  - 商机总数 / 活跃客户数(去重) / 加权金额(按币种细分) / 赢单数(ST4) / 赢单率 / 平均赢率
[ 阶段漏斗(原) ]                       [ 月度加权趋势柱状图(新) ]
[ 业务线/产品金额占比 横条(新) ]       [ TOP 10 销售代表(新) ]
```

### 5.2 新增可视化

- **月度趋势柱状图**:按 `expectedDate` 聚合到月份,显示加权金额走势(现有分析视图 2 是同类,但仪表盘上更简洁)
- **业务线/产品金额占比**:横条 + 百分比,展示业务线金额占比
- **TOP 10 销售代表**:按 `owner` 聚合,加权金额降序

复用 `computeKpi` / `computeTopN` / `computeTrend` 三个 core 函数。

---

## 6. 多维分析扩展(P2)

现有 8 视图 + 新增 4 视图 = 12 视图。

| # | 视图 | 状态 | 说明 |
|---|---|---|---|
| 1 | 阶段漏斗 | 旧 | 5 阶段漏斗 |
| 2 | 趋势 + 同比/环比 | 旧 | 月度趋势 |
| 3 | TOP N 排名 | 旧 | 团队/客户/产品 |
| 4 | 帕累托 80/20 | 旧 | 客户金额 |
| 5 | 阶段转化率 | 旧 | ST1→ST5 转化 |
| 6 | 丢单原因汇总 | 旧 | lose_reason 统计 |
| 7 | 多维透视 | 改 | **X/Y 轴可配置**(产品/产品线/团队/负责人/客户/阶段/销售渠道/发票状态) × (金额/加权金额/数量) |
| 8 | ST4 vs ST5 对比 | 旧 | 赢单 vs 丢单 |
| 9 | 销售代表业绩表 | **新** | 每行=一负责人,列=商机数/总金额/加权金额/赢单率/平均赢率,按加权金额降序 |
| 10 | 逾期商机预警 | **新** | `today > expectedDate` 且 阶段 ∉ {ST4,ST5} 且 !deleted && !parseError;按金额降序,显示"已逾期 N 天"红标 |
| 11 | 客户集中度 | **新** | 每行=一客户,列=商机数/总金额/加权金额/最近商机时间,按总金额降序 |
| 12 | 发票状态分布 | **新** | 每行=一发票状态,列=数量/总金额,横条可视化 |

`ui-analysis.js` 加 4 个 `viewXxx` 函数,`VIEWS` 数组加 4 项,filter 函数保持共享 `filteredOpps`。

---

## 7. 字段说明页 重设计(P2)

`ui-field-help.js` 重写为左右两栏:

### 7.1 左栏:字段分类总表

```
字段分类
─────────────────────────────────
下拉单选字段 (9):销售团队/主责销售/客户名称/业务线/业务·产品/销售渠道/阶段/币种/丢单原因
内置枚举 (1):发票状态(5 个固定值,代码里改)
自由值字段 (5):含税金额/折算RMB/赢率/预计落单时间/(内部)备注
汇率 (3 个币种 USD/SGD/RMB,代码里改)
```

### 7.2 右栏:4 个 FAQ 卡片

```
Q1: 字典里能加新值吗?
→  可以,在「字典」页选对应字典 + 新增。

Q2: 字典值能改名吗?
→  可以,会自动更新所有引用的商机。

Q3: 字典值能删吗?
→  可以,但被引用的删之前会询问(确认后引用变"未分类")。

Q4: 哪些字段不能改?
→  发票状态 5 个值、汇率。需要改 app/core.js 里 BUILTIN_INVOICE_STATUSES / EXCHANGE_RATES_TO_RMB 常量。
```

保留原 `FIELD_BINDINGS` 表格作为底部"技术参考"。

---

## 8. 样式升级(P1)

参照 `RAS_CRM_对比版.html` 的视觉风格,`styles.css` 升级:

- **配色**:语义色(蓝/绿/紫/橙/青/粉),匹配 KPI 类型
- **KPI 卡片**:hover 抬升、深色边框、icon 角标、大数字、sub 提示
- **表格**:sticky header、zebra stripe、金额右对齐、千分位、阶段颜色 chip
- **空状态**:每个视图加"暂无数据"图标占位
- **响应式**:窄屏(<=900px)单列布局
- **微交互**:按钮 hover、卡片 hover、tab 切换平滑过渡

---

## 9. 实施顺序

| 顺序 | 工作包 | 内容 | 估时 |
|---|---|---|---|
| 1 | WP1 Bug 修复 | 2.1 赢率、2.2 商机名称、2.3 发票状态改名 | 0.5h |
| 2 | WP2 样式升级 | styles.css 整体优化 | 1h |
| 3 | WP3 列表/筛选/总计 | 列表筛选改字段、加汇总、列调整 | 0.5h |
| 4 | WP4 仪表盘 | 仪表盘 4 卡→6+,新 3 个图 | 1h |
| 5 | WP5 多维分析 | 透视改 X/Y + 新 4 视图 | 1h |
| 6 | WP6 新增页面 | 表单字段调整 | 0.5h |
| 7 | WP7 字段说明 | 重设计 | 0.3h |
| **合计** | | | **~5h** |

每个 WP 完成后跑 `node tests/run-all.js` 验证测试不破。新增视图/字段映射相关需补充单元测试。

---

## 10. 测试策略

- **单元测试**:
  - `xlsx-io.test.js`:加用例验证 `oppName` 解析、阶段冒号归一化
  - `db.test.js`:加用例验证 `opp_name` 列的 CRUD
- **回归测试**:`tests/run-all.js`(53 个测试)需全过
- **手动验证**:导入 `RAS CRM（template） (version0529).xlsx` 后:
  - 仪表盘"赢单率"显示 ~96%
  - 列表每行的"商机"列有真实名称
  - 列表"发票状态"列显示颜色 chip
  - 表格底部"合计"行有金额统计
  - 筛选只剩"客户/负责人/阶段/币种"
  - 表单无"不含税金额",有"商机名称"必填,"预计落单时间"是日期选择器
  - 多维分析有 12 个视图
  - 字段说明页有 FAQ 卡片

---

## 11. 风险与注意

### 11.1 数据库迁移 v1 → v2(加 `opp_name`)

`db.js:runMigrations` 改造:
- 当前是 `applyV1Schema()` 一把梭;改成读 `meta.schema_version`,根据版本跑不同 migration
- v1 (无 `opp_name` 列) → v2: `ALTER TABLE oportunidades ADD COLUMN opp_name TEXT DEFAULT '';`
- `setMeta('schema_version', '2')`
- 已存在的 v3.0 DB 也走同样路径(因为它也没 `opp_name`)

### 11.2 其他

- **测试 fixture**:`tests/build-fixture.js` 用的是 version0529.xlsx,可能需要重新生成(因为加了 `opp_name` 列)。
- **不破坏 schema**:不再加新字典表/新列(除 `opp_name`)。所有 UI 改造复用现有 v3.0 schema。
- **样式升级范围**:只改 `styles.css`,不动 HTML 结构(除新功能需要的最小结构变化)。

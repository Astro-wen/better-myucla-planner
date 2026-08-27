# MyUCLA Class Planner 脱敏页面合约

验证日期：2026-08-19。本文只记录实现需要的结构，不包含课程名称、用户标识、凭证或请求内容。

## 页面边界

- Origin：`https://be.my.ucla.edu`
- Path：`/ClassPlanner/ClassPlan.aspx`
- 表单：`#aspnetForm`，`POST` 回同一路径
- 列表：`#ctl00_MainContent_classPlanPanel #panelPlan #div_landing > table`
- 直属课程卡：`:scope > tbody.courseItem`
- 学期选择器：`#ctl00_MainContent_termSessionChooser_TermChooser`
- Plan 字段：`#ctl00_MainContent_planIDField`

课程卡使用 `Class<数字> courseItem itemClass`（首卡另有 `firstClass`），扩展只接受唯一、受限长度的数字课程标识。

每张课程卡是一个 `<tbody>`，固定三行：

1. `td.SubjectAreaName_ClassName` + `td.linkPanelRight[rowspan=2]`
2. 标题下方的单个 `td`
3. 跨两列的 `td[colspan=2]`，内含 `table.coursetable`

注入样式的卡片描边必须按这三行的具体单元格来画，不能假设每行都有两个单元格。

页面自带 Bootstrap 基础样式（`select{width:220px}`、`input{width:206px}`、表单控件固定 height/padding、
`input[type=search]{box-sizing:content-box}`）。注入控件用元素名提高特异性压过这些规则，不用 `!important`。

页面同时提供 `iwe_icon_fonts.css` 图标字体，官方排序箭头用的就是 `icon-circle-arrow-up/down`。
注入控件复用同一套 `icon-*` 类名（`icon-reorder`、`icon-double-angle-up`、`icon-tag`、
`icon-chevron-down`、`icon-ellipsis-horizontal`），以保持与官网一致的观感。

## 排序按钮白名单

每张课程卡只允许：

- 上移：`button.link.moveupClass`，ID 为 `muClass<课程数字>`
- 下移：`button.link.movedownClass`，ID 为 `mdClass<课程数字>`
- 英文 title 和 aria-label 必须与方向精确对应
- inline `onclick` 必须是已验证的 `courseListAction(...)` 格式，并引用同一课程数字
- 按钮必须属于 `#aspnetForm`，且不能自带 `formaction`、`formmethod` 或 `formenctype`

首张卡的上移与末张卡的下移通过 `visibility: hidden` 隐藏。执行前扩展会再次确认目标按钮可见且未禁用。

## 排序命令格式

`courseListAction(...)` 最终只是 `__doPostBack(sourceID, commandContent)`。页面上出现过的
command 形如 `moveupClass|<课程数字>!0`、`movedownClass|<课程数字>!0`、
`colorchange|<课程数字>!<颜色>!0`、`toggleAlternates|<课程数字>!0`，以及
`Remove Class From Plan|<科目>!<课号>!<课程数字>!0` 等。

结尾的 `!0` 出现在**所有**命令上（包括本身没有位置概念的 colorchange），因此它不是"移动几位"的参数。
官网没有"移动到第 N 位"的命令，只有与相邻课程交换。要移动 N 位就必须发生 N 次回发。

## UpdatePanel（2026-08-20 修正）

页面初始化脚本中：

```js
Sys.WebForms.PageRequestManager._initialize('ctl00$scriptManager1', 'aspnetForm',
  ['tctl00$main_wrapper',''], [], [], 90, 'ctl00');
```

`ctl00_main_wrapper` 是注册过的 **UpdatePanel**，整张课程表在它内部。因此
`courseListAction` 触发的排序、改颜色等操作**可能是异步局部回发**：服务器只返回
增量，MS AJAX 直接替换该 panel 的内容，**不触发 `load`、不发生页面导航**。

对实现的硬性要求：

- 注入 UI 必须挂在 panel 之外的稳定节点上观察（本项目观察 `document.body`），
  否则 MutationObserver 会随着旧节点一起失效，插件在一次改颜色后就再也不回来。
- 等待一步排序完成时**不能只等 `load` 事件**，必须轮询 DOM 直到出现预期顺序，
  这样整页导航和局部回发两种形态都能处理。
- 局部回发会用服务器顺序覆盖本地未保存的排序，且**不触发 `beforeunload`**。

## 冲突标记（2026-08-20 修正）

`div.final_exam_info.exam_conflict` 是**布局容器，出现在每一张课程卡上**，不是冲突
状态。以它判断冲突会把 17 门课全部误报为冲突。真实冲突只在 MyUCLA 渲染出显式控件
时存在：`[aria-label='Exam Conflict Info']` / `[title='Exam Conflict Info']`，时间
冲突同理。

## 已验证行为

1. 点击一次原生排序按钮触发表单提交（在 UpdatePanel 下可能表现为局部回发）。
2. 提交后只有目标课程与相邻课程交换。
3. 普通刷新后新顺序仍然存在，因此顺序已由 MyUCLA 保存，不是扩展只改页面显示。
4. 用反方向按钮复原并再次刷新，验证前的顺序已恢复。

## 离屏 frame（2026-08-20 只读验证）

在已登录页面上以只读方式建立一个同源 `ClassPlan.aspx` iframe：

- 未被 X-Frame-Options / CSP 阻止，`contentDocument` 可读；
- frame 内的课程数量、学期、Plan ID 与可见页面完全一致；
- frame 内每张卡都带有通过白名单校验的原生上移/下移按钮。

因此多步排序可以在离屏 frame 内逐步完成，可见页面只在最后刷新一次。
本次验证没有点击任何按钮，也没有改变任何顺序。

## 更新策略

任何必需选择器、按钮属性、课程唯一性、表单路径、学期/Plan 格式或预期完整顺序不匹配时，扩展停止操作并清理待办状态。重新适配官网更新前不得放宽到模糊按钮匹配。

## 冲突标记（2026-08-20 再次修正）

第一次修正（只认 `[aria-label='Exam Conflict Info']`）修过头了：**时间冲突没有任何
class 或 aria-label 标记**，因此会被完全漏掉。

真实结构：冲突信息在 `a.uit-clickover-bottom` 的 `data-content` 里，是一段
MyUCLA 自己写的 popover HTML：

```html
<div class="popover_section_title warning light">Warning: Time Conflicts</div>
<ul class='bulleted_list'><li>DESMA 10</li><li>ENGR 170</li></ul>
```

标题为 `Warning: Time Conflict(s)` 或 `Final Exam Conflict`，`<li>` 就是冲突对手的
课程代号。判定必须按 `data-content` 的文本，不能按 class、aria-label 或图标——
`icon-warning-sign` 同样用在 `Additional Information` 之类的普通提示上。

注意：同一份 plan 内 `tip-*` 这些 id 会重复，不可作为唯一键。

## 周历方块的边框就是选课状态（2026-08-27 只读验证）

`#gridDiv .planneritembox` 的 inline style 里，`border` 的样式区分这门课是**已选上**还是**只在计划里**：

- 已 enroll：`border: double 3px <课程色>`
- 只在 plan 里：`border: solid 1px <课程色>`

在一份 7 门课、20 个方块的真实 plan 上逐个核对，无一例外：四门已选上的课全部是
`double 3px`，三门只在计划里的全部是 `solid 1px`。

同一门课的所有方块颜色一致（`background-color` / `color` / 边框色三个值成套），
因此颜色可以在**周历内部**把同一门课的方块归为一组。但它不能用来对应到下面的
课程卡：卡片上没有任何元素带这个颜色，`.colorswatch` 这个选择器在真实页面上不
存在（返回空集）。

对实现的意义：注入 UI 要表达「已选上 / 还在计划」时，`double` 边框是**页面自己
已经在用的记号**，学生在周历上已经在读它了。不要另发明一套。

样例（脱敏，只保留结构与颜色）：

```html
<div style="background-color: #F9F9EC !important; color: #605F20;
            border: double 3px #CECD6B; top: 48px; left: 0%;
            width: calc(100% - 7px); height: 35px;"
     class="planneritembox smallitem">MGMT 170<br class="hide-small"><span
     class="hide-above-small"> </span>Lec 1<br class="hide-small"><span
     class="hide-above-small"> </span>Entrepreneurs Hall C314</div>
```

方块本身**没有 id，也没有任何 data 属性**，三行文字依次是课程代号、section、地点。

## 课程卡的 section 表（2026-08-27 只读验证）

`tbody.courseItem` 第三行里的 `table.coursetable` 是九列：

```
Change | Section | Status | Info | Days | Time | Location | Units | Instructor
```

`Section` 与 `Location` 两列的写法和周历方块的第二、三行**逐字一致**（`Act 1` /
`Entrepreneurs Hall C314`），而周历方块的课程代号用缩写（`MGMT 170`），
卡片标题用全称（`Management 170`）——**课号部分两边相同，只有学科名不同**。

表格最后一行是 Plan Actions / Enrollment Actions，其中包含 **Enroll 按钮**。任何
注入行为都不得触碰这一行。

## 会话超时：只补在场信号，不做后台心跳

`IWE/js/Timeout.js` 的事实：

- 空闲超时由服务器下发，本次观测为 15 分钟；绝对上限 `maxTimeoutMinutes` 为 239 分钟。
- `$(document).on("mousedown keydown click", ...)` 会在任何一次交互后调用
  `ExtendSession()`（内部 60 秒节流），因此**正在操作的用户不会撞到空闲超时**。
- `if (keepAlive) setInterval(ExtendSession, 2 * 60000, true)` —— 是否常驻心跳由页面决定。
- MyUCLA 自带 `#divFeatureTimeout` / `#divMaxTimeout` 两个警告框。

补充观测（2026-08-20，Class Planner 页）：`keepAlive` 为空字符串，即**本页没有
常驻心跳**，只有交互能续期。而 `Timeout.js` 监听的是 `mousedown keydown click`，
**不含 scroll 与 mousemove**——因此一个正在滚动阅读计划的学生会被判定为"不在"。

本扩展在用户明确要求并知情的前提下实现 **presence-based keep-alive**，边界如下：

- 只由真实输入事件触发：`scroll` `wheel` `mousemove` `keydown` `pointerdown`
  `touchstart`；**没有任何定时器**。
- 必须 `visibilityState === "visible"` 且 `document.hasFocus()`。切走或失焦即停。
- 自身节流 60 秒一次，且调用的是页面自己的 `ExtendSession(false)`（它另有 60 秒节流
  和自己的 CSRF token）。扩展不构造任何请求。
- 有硬上限（默认 60 分钟，可设 30 / 60 / 120 / 不限），超过后彻底停止。
- 默认开启，可在扩展弹窗关闭。

因此人一旦离开，会话仍按原本的时间线过期。

**仍然不做**：后台定时心跳、自动重新登录。绝对上限（约 239 分钟）无法续期，
重新登录需要凭据和 Duo，本项目从不接触这两样。

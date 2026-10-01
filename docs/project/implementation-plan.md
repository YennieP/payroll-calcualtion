# MVP 实施计划

更新日期：2026-10-01

> 本文件先提供中文版，后附英文版。两种语言表达同一份计划；以后更新阶段状态、验收条件或范围时，必须同步更新两部分。若出现歧义，以中文版确认产品意图，以英文版辅助 Agent 和代码协作。

## 当前状态

| 领域         | 状态           | 证据或下一步                                                                                         |
| ------------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| MVP 产品范围 | 已完成         | 已对齐 California 收入规划、50 项目标的信息架构和明确不做项。                                        |
| 视觉方向     | 已完成         | 三栏 Demo、置顶主页、分类页、收入栏和 7 套主题已通过人工验收。                                       |
| 技术架构     | 已完成         | 已确定 React + TypeScript + Vite PWA、Firebase Auth/Firestore、本地优先存储和可替换适配层。          |
| 仓库治理     | 已完成         | 开发约束、Agent 约束、验收 Demo 和旧版概念验证快照均已进入仓库。                                     |
| 产品实现     | Phase 6 已完成 | 邮箱认证、本地计划导入、Firestore 同步、冲突处理和跨设备验证已通过完整本地门禁；下一步进入 Phase 7。 |
| 部署         | 未开始         | 不使用自动 GitHub Actions；GitHub Pages 非 Actions 发布方式和 Firebase 配置尚未进行。                |

## 架构基线

```text
不依赖 GitHub Actions 的静态托管
    │ 静态 HTML、CSS、JavaScript、字体和 PWA 资源
    ▼
React PWA
    ├── domain：规划模型和税务规则
    ├── application：业务命令、派生数据和同步编排
    ├── local adapter：IndexedDB
    └── cloud adapters
          ├── Firebase Authentication
          └── Cloud Firestore
```

应用必须在没有 Firebase 时仍可使用。Firebase 只提供身份和同步能力，不拥有税务引擎或 UI 状态模型。

## Phase 0 — 固化验收基线

状态：已于 2026-09-30 完成。

交付物：

- 将验收 Demo 保存为 `docs/reference/accepted-demo.html`。
- 记录 7 套主题、字体搭配、桌面宽度、响应式行为和主要交互。
- 替换旧 UI 前，保留当前未提交草稿中有价值的税务逻辑和测试。
- 确认 `.gitignore` 覆盖依赖、构建产物、Firebase 本地状态、测试产物和敏感配置。

退出条件：

- 可以直接从仓库文件打开验收视觉基线。
- 产品范围和架构约束已由根目录 `AGENTS.md` 引用。
- 旧草稿中的有用逻辑没有丢失。

## Phase 1 — 建立应用基础工程

状态：已于 2026-09-30 完成。

交付物：

- 初始化 React、TypeScript 和 Vite。
- 启用严格 TypeScript、Lint、格式检查、Vitest 和生产构建脚本。
- 按当前仓库名称 `payroll-calcualtion` 配置 GitHub Pages base path。
- 建立 `development-constraints.md` 规定的高层目录边界。
- 增加统一的本地 `npm run verify:quick` 和 `npm run verify` 核验入口。
- 禁用自动触发的 GitHub Actions，避免消耗共享 CI 免费额度。

退出条件：

- 本地开发服务器可以正常启动。
- 类型检查、Lint、格式检查、测试、生产构建和仓库约束检查通过 `npm run verify`。
- 计划中的适配层之外不存在 Firebase 依赖。

## Phase 2 — 实现领域模型与税务引擎

状态：已于 2026-09-30 完成。

交付物：

- 定义版本化的 `PlanDocument`、分类、目标、税务资料和偏好设置。
- 金额使用整数美分，实体使用稳定 UUID。
- 把现有累进税和收入反推算法迁移成纯 TypeScript 模块。
- 按年份拆分联邦和 California 税务数据。
- 增加数据来源、适用年份和规划代理标识。
- 实现分类小计、置顶小计、总目标和收入结果 selectors。
- 增加数据校验和 schema 迁移基础设施。

退出条件：

- 税级边界、Social Security 上限、Additional Medicare、California mental-health tax、零目标和反推求解测试通过。
- Domain 模块不依赖 React、Firebase 或浏览器全局对象。
- 展示层舍入不会改变原始计算结果。

## Phase 3 — 交付本地优先规划器

状态：已于 2026-09-30 完成。

交付物：

- 实现验收通过的顶栏、导航、中间内容和收入栏。
- 实现置顶主页和分类编辑页。
- 实现分类和目标的新增、编辑、移动、排序、置顶和删除。
- 实现跨分类搜索和渐进式列表展开。
- 实现税务资料和完整税费明细面板。
- 通过 `LocalPlanRepository` 实现 IndexedDB 持久化。
- 增加匿名本地模式和示例数据。

退出条件：

- 没有网络或 Firebase 项目时，完整规划器仍可使用。
- UI 中所有可见的主要控件都有明确且真实的行为。
- 修改任一源数据会立即更新所有相关小计和税务结果。
- 50 项目标测试数据仍然易用且没有越界。

## Phase 4 — 复现主题与字体

状态：已于 2026-10-01 按最终人工验收结果更新。

交付物：

- 将 7 套主题转换为语义化 CSS token。
- 为最终 11 个验收字体家族自托管锁定版本的 WOFF2 文件和许可证。
- 使用完整 Unicode 范围分包，不使用只包含 Demo 文案的删字子集。
- 优先加载当前主题字体，并在浏览器空闲时缓存其他主题字体。
- 使用占满浏览器宽度的响应式三栏；桌面列宽按 `clamp(210px, 18vw, 360px) / minmax(0, 1fr) / clamp(290px, 22vw, 440px)` 变化，900px 以下纵向排列。
- 保留验收通过的顶栏和侧栏局部渐变，并让导航、中间页和收入栏自身覆盖页面，不使用固定 1180px 主体外的纯色或舞台色补边。
- 锁定七主题字体映射；蓝午夜的中英文为 Cormorant Garamond + Zhuque Fangsong，数字独立使用 DM Serif Display。
- 增加字体回退检测和视觉测试样例。

退出条件：

- 7 套主题的视觉结构和字体与验收版本一致。
- 切换主题不会改变业务或计算数据。
- 常用和非常用中文测试文本不会静默回退到其他字体。
- 离线重新打开后仍可使用所有主题。

## Phase 5 — 实现可安装与离线能力

状态：已于 2026-10-01 完成。Manifest、PNG/SVG 安装图标、Service Worker、应用外壳/字体预缓存、IndexedDB 本地存储、受控更新提示、独立显示适配和手机安全区均已接入正式页面。

交付物：

- 增加 Web App Manifest、图标、主题色和 Service Worker。
- 缓存应用外壳和所需字体资源。
- 实现安全的 Service Worker 更新提示和缓存失效机制。
- 适配手机安全区和独立应用显示模式。
- 离线期间只保留最新一份待同步规划文档。

退出条件：

- 支持的桌面和手机浏览器可以安装应用。
- 已安装应用可以离线重新打开。
- 离线时仍能计算税务、浏览和编辑。
- 新版本发布后，用户不会长期停留在过期缓存版本。

## Phase 6 — 增加身份与跨设备同步

状态：已于 2026-10-01 完成。已建立可移植认证接口、持久化设备 ID 和本地优先同步编排，并接入 Firebase Auth/Firestore；生产 Firebase、部署和计费均未启用。

交付物：

- 增加与 Domain 隔离的 Firebase 客户端初始化。
- 实现邮箱密码注册、登录、退出和密码重置。
- 仅在配置和体验仍符合既定范围时增加 Google 登录。
- 通过 `FirebasePlanRepository` 实现 Firestore 规划存储。
- 实现首次登录时导入本地数据，以及新设备从云端下载。
- 对写入做 debounce，并使用事务或等价 revision 检查。
- 实现远端更新、离线重试和明确的冲突解决。
- 退出登录时清除认证用户的私人缓存。
- 实现 JSON 导出、导入和规划删除。

退出条件：

- 同一测试账号可在独立的手机尺寸和桌面尺寸浏览器上下文间同步。
- 离线修改会在恢复网络后同步。
- 旧 revision 不能静默覆盖较新的云端版本。
- 用户无法读取或修改其他用户的规划。

## Phase 7 — 加固质量、安全和性能

交付物：

- 完成单元、集成、Repository 合同、安全规则、端到端、视觉和可访问性测试。
- 使用 Firebase Emulator Suite 测试认证和 Firestore。
- 在桌面和手机宽度检查全部 7 套主题。
- 检查 50 项目标、长中文名称、大额数字和空状态。
- 审计初始 JavaScript、字体加载、Firestore 读写量。
- 确认日志中不包含密钥或私人财务数据。

退出条件：

- 所有自动化质量门禁通过。
- 所有支持宽度都不存在横向溢出、裁切或控件遮挡。
- 在已记录的负载假设下，应用保持在 Firebase Spark 使用模型内。
- 可访问性和键盘关键流程通过人工检查。

## Phase 8 — 发布 MVP

交付物：

- 使用不触发 GitHub Actions 的方式发布静态资源；优先评估 GitHub Pages 的非 Actions 发布路径，不合适时使用 Cloudflare Pages。
- 配置 Firebase 授权域名并部署已评审的 Firestore Rules。
- Firebase 保持 Spark 方案，不绑定计费。
- 在设备可用时，于桌面浏览器、iOS Safari 和 Android Chrome 验证生产 PWA。
- 更新 README 中的启动、税务假设、隐私、备份和部署说明。
- 只有在获得用户明确授权后才 commit 和 push。

退出条件：

- 生产地址可访问并可以安装。
- 生产 Firebase 项目上的跨设备同步正常。
- 离线重新打开和恢复后的同步正常。
- 用户完成最终人工验收。

## 发布验收清单

- [ ] 同一账号的手机端和电脑端数据保持一致。
- [ ] 离线修改能够保留并在恢复网络后同步。
- [ ] revision 冲突可见且可恢复。
- [x] 50 项目标仍然整洁、可操作。
- [x] 置顶、分类、搜索和税务资料流程端到端可用。
- [x] 所有相关输入都会更新收入结果。
- [x] 7 套主题不改变数据并使用预期字体。
- [ ] PWA 可以安装并离线重新打开。
- [ ] Firestore Rules 阻止跨用户访问。
- [x] 税务数据年份和限制清晰可见。
- [ ] 不需要或启用任何付费服务。
- [ ] 测试、构建和人工视觉验收全部通过。

## 计划提交顺序

1. `docs: freeze accepted MVP and project constraints`
2. `chore: scaffold React TypeScript Vite PWA`
3. `feat: add plan domain and tax engine`
4. `feat: implement local-first planner`
5. `feat: reproduce accepted themes and fonts`
6. `feat: add installable offline PWA`
7. `feat: add Firebase authentication`
8. `feat: add Firestore cross-device sync`
9. `test: add security sync and visual coverage`
10. `docs: document deployment privacy and tax assumptions`

## 更新日志

### 2026-10-01 — 完成 Phase 6 身份与跨设备同步

- 增加可移植的 `AuthProvider`、`RemotePlanRepository`、`SyncStateStore`、`DeviceIdentity` 和 `CloudRuntime` 边界；Firebase SDK 仍只位于 adapter，配置为空时正式应用继续完整运行匿名本地模式，部分配置会 fail closed。
- 接入 Firebase 邮箱注册、登录、密码重置、退出和 Firestore 单文档事务写入；稳定设备 ID、云端 revision、待同步 revision 和删除状态分别持久化，不把 Firebase 类型带入 Domain 或 UI。
- 正式 UI 增加账户与同步面板、首次登录本机计划导入选择、同步状态、显式冲突选择、退出并清除此设备私人缓存，以及匿名和登录模式均可用的 JSON 导出、校验导入和整份计划删除。空云端账号的起始模板只存本机，首次编辑前不会自动创建云端文档。
- 本地优先同步覆盖离线编辑、恢复联网后只推送最新计划、事务式 stale-revision 拒绝、远端接受与本地保留恢复路径；写入回声使用 `revision + updatedByDevice + updatedAt` 识别，两个设备产生相同 revision 时仍会保留本机离线版本并显式冲突。应用级假 runtime 覆盖首次导入、新设备下载、退出不删云端和两设备冲突恢复。
- 增加 owner-scoped Firestore Rules，并将 Rules、邮箱认证、桌面/手机独立上下文、跨用户隔离和 stale revision 的 Emulator 测试纳入完整 `npm run verify`；Emulator 固定使用 `demo-worthwhile-local`，不会误连生产项目。
- 当前 `npm run verify:quick` 通过 TypeScript、ESLint、Prettier、15 个测试文件共 61 项测试和 582 个字体资产；`npm audit --omit=dev` 为 0 漏洞。浏览器在 1440、390 和 320px 下复核账户面板与顶栏，均无横向溢出。
- 已安装 Homebrew OpenJDK 21.0.12.1，并增加仓库启动器自动发现 `JAVA_HOME` 或 Homebrew JDK、仅为 Emulator 进程调整 `PATH`；Firebase Emulator Suite 已以 `demo-worthwhile-local` 启动 Auth 9099 和 Firestore 8080。Rules 与 adapter 测试共 2 个文件、3 项测试通过，包括 owner lifecycle、未认证与跨用户拒绝、stale/malformed revision 拒绝、邮箱认证和两个独立 Firebase context。
- 完整 `npm run verify` 已全绿：15 个单元/应用测试文件共 61 项测试、生产构建、架构边界、PWA 产物、两轮离线重开、582 个字体资产和七主题桌面/手机字体审计均通过；真实 Chrome 的 1440×1000 桌面与 390×844 手机独立上下文完成同账号双向同步，并验证手机离线编辑在恢复联网后同步且无横向溢出。`npm audit --omit=dev` 为 0 漏洞；Firebase runtime chunk 的构建体积警告留给 Phase 7 性能审计，不阻断本阶段。
- Phase 6 的全部退出条件已满足。未连接生产 Firebase、未部署、未启用计费，且本轮尚未 commit 或 push。

### 2026-10-01 — 启动 Phase 6 身份与跨设备同步

- Phase 5 已以 commit `a52ac7f` 推送到 `origin/main`，完整本地门禁通过，工作区以干净状态进入 Phase 6。
- 本阶段按“认证端口与设备身份 → 本地优先同步编排 → Firebase 适配器 → owner-scoped Rules 与 Emulator/双上下文验证”的顺序实施。
- Firebase SDK 只能位于 `src/adapters/firebase/` 和最小 bootstrap；应用无 Firebase 配置时必须继续以匿名本地模式完整运行。
- 阶段启动时机器尚未提供 Java Runtime，因此当时把 Emulator 安全规则与跨用户隔离测试列为完成前的阻塞项；随后已安装 OpenJDK 21 并通过全部 Emulator 与跨设备验证。

### 2026-10-01 — 完成 Phase 5 可安装与离线 PWA

- 增加 192px、512px 和 maskable PNG 安装图标，保留 SVG 图标，并补齐 Apple 主屏幕、独立显示和 `viewport-fit=cover` 元数据；Chrome 未报告由应用资源导致的可安装性错误。
- 将 Service Worker 注册收口到 React 生命周期：首次缓存完成、浏览器安装、iOS 添加到主屏幕、新版本可用和注册失败均有轻量提示；每小时在线检查更新，新版本只能在本机修改保存后由用户确认载入。
- 为独立显示模式增加顶部与底部安全区适配，PWA 提示在桌面和手机宽度均避开安全区，不改变已验收的顶栏、三栏信息架构和七主题。
- 修复防抖保存未进入 `saving` 状态的问题，避免 Service Worker 在 IndexedDB 写入期间允许刷新页面。
- 新增真实 Chrome PWA 核验：在线修改后关闭页面，离线重开，继续离线编辑，再次关闭并离线重开；两轮均保留业务数据和重新计算的 California 收入结果，Service Worker 持续控制页面，IndexedDB 始终只有一份最新规划文档。
- 将 PWA 产物和真实离线流程纳入唯一完整本地门禁 `npm run verify`；PWA 单元测试覆盖安装事件、更新回调和保存状态门禁，最终完整门禁通过 TypeScript、ESLint、Prettier、41 个测试、582 个字体资产、生产 PWA、架构边界、PWA 离线 E2E、七主题离线字体和项目文档检查。
- 实体 iOS Safari、Android Chrome 和生产安装仍按 Phase 8 在设备与生产地址可用时人工确认；自动 GitHub Actions 继续禁用，Firebase 仍未连接，也未部署。Phase 5 变更在重新审核和完整本地门禁通过后提交并推送。

### 2026-10-01 — 同步最终字体与全宽响应式布局

- 用真正占满浏览器宽度的三栏网格替代固定 1180px 主体与外部舞台补边；1280px 参考列宽为约 `230 / 760 / 290px`，2000px 为 `360 / 1200 / 440px`，900px 及以下纵向排列。
- 左栏、中栏、右栏、顶栏、内边距、卡片、表格列宽和字号共同参与响应式变化；三栏分别使用多层渐变、光晕与细纹理，不用纯色填充左右空白。
- 按最终人工验收锁定 11 个字体家族和七主题映射；中文与英文在同一主题内保持统一气质，蓝午夜数字单独使用 DM Serif Display。
- 删除 Manrope、IBM Plex Sans SC 和 Noto Serif SC 依赖及生成资产；字体同步现在会先清除过时家族目录，再生成 582 个 WOFF2-only 文件及许可证。
- 浏览器核验改为读取实际字体资产数量，并检查 1280px、1440px、2000px 的全宽三栏、900px 纵向布局、390px 手机无溢出、七主题字体和蓝午夜数字例外。
- 本轮修改尚未 commit、push 或部署；Firebase 仍未连接。

### 2026-09-30 — 修复正式页面与验收 Demo 的字体比例偏差

- 将页面眉题、主题说明、导航金额、导航页脚、统计标签、统计金额和收入大数字恢复为验收 Demo 的字号；桌面年薪恢复为 48px，平板恢复为 39px。
- 将目标名称从额外加粗的 600 恢复为 400，并将目标行垂直间距和来源控件字号恢复为 Demo 数值，避免正式页面显得更小、更拥挤或更粗重。
- 在真实 Chrome 核验中增加 computed-style 断言，固定上述 typography 数值，并覆盖 1440px 桌面、900px 平板和 390px 手机视口。
- 逐一切换 7 套主题后，规划数据保持不变，三个视口均无横向溢出；桌面和手机截图未发现文字遮挡或组件越界。
- 完整 `npm run verify` 通过；本次修复未改变字体家族、主题颜色、税务计算或数据结构，且尚未 commit 或 push。

### 2026-09-30 — 完成 Phase 4 主题与字体复现

- 将 8 个验收字体家族固定到 npm 锁定版本，并生成 415 个 WOFF2-only 自托管文件；每个家族目录均包含 OFL 1.1 许可证，中文字体保留完整 Unicode-range 分包而非 Demo 文案删字子集。
- 为 Fontsource 变量字体建立与验收 CSS 一致的 family alias，保留 Bodoni Moda 和 Cormorant Garamond 的 normal/italic 变量字形、IBM Plex Sans SC 的完整 400/500 文件，以及 Noto Serif SC 的完整 400/500 分包。
- 增加主题字体 manifest、当前主题优先加载、浏览器空闲预热和加载状态标记；字体失败不会被静默当作成功。
- 增加 FontFaceSet 字形命中与 Canvas 栅格差异双重回退检测，并提供 `?font-audit=1` 七主题视觉 fixture，覆盖常用和罕见中文测试文本。
- PWA precache 现包含全部 415 个 WOFF2 文件；真实 Chrome 自动化确认离线重开后字体审计仍通过。
- Chrome 自动化逐一切换 7 套主题，确认房租数据保持不变，并验证 1440px 桌面与 390px 手机视口无横向溢出；人工式截图复核未发现遮挡、越界或不可读配色。
- 完整 `npm run verify` 通过：TypeScript、ESLint、Prettier、35 个测试、字体资产检查、生产 PWA 构建、架构边界、PWA 产物、真实浏览器字体审计和项目文档检查。
- Phase 3 已以 commit `0fffef6` 推送到 `origin/main`；本次 Phase 4 修改尚未 commit 或 push。Firebase 仍未连接，也未部署。

### 2026-09-30 — 完成 Phase 3 本地优先规划器

- 将验收 Demo 的 1180px 桌面骨架正式接入 React，包括顶栏、分类导航、置顶主页、分类编辑页、装饰轨和收入栏，并保留 7 套已确认主题的颜色 token。
- 增加 6 个分类、50 个目标的稳定示例计划；主页仅展示置顶目标，长分类默认展示 6 项并可渐进展开。
- 实现分类和目标的新增、编辑、删除、排序、跨分类移动与置顶，以及跨分类搜索、置顶管理、税务资料和完整税费明细。
- 增加原生 IndexedDB `LocalPlanRepository`、同接口内存实现、250ms 防抖保存、revision 冲突处理和离线状态提示；Firebase 仍未连接。
- 增加 repository contract、领域命令、50 项 fixture 和规划器交互测试；共 7 个测试文件、32 个测试通过。
- 在真实浏览器中复核 1440px 桌面视口、390px 手机视口和 320px 最窄手机视口；修复手机主题面板右侧裁切与窄屏主题按钮无障碍名称缺失。
- 修复 IndexedDB 异步 hydration 后非受控输入仍显示初始值的问题，并增加已保存金额与派生总额一致的回归测试。
- 完整 `npm run verify` 通过：TypeScript、ESLint、Prettier、32 个测试、生产 PWA 构建、架构边界、PWA 产物和项目文档检查。
- 未连接 Firebase、未部署，也未对本次 Phase 3 修改执行 commit 或 push。

### 2026-09-30 — 完成 Phase 1 复核与 Phase 2 领域实现

- 重新运行完整 `npm run verify`，并实际启动开发服务器；`/payroll-calcualtion/` 返回 HTTP 200，确认 Phase 1 的全部退出条件仍成立。
- 将 `PlanDocument` 固定为 schema version 1，使用整数美分、basis points、稳定 UUID，并加入 fail-closed 校验和 version 0 到 version 1 的迁移。
- 将 legacy 累进税、年度工资估算和收入反推迁移为纯 TypeScript；反推器按整数美分返回满足目标的最小税前年薪。
- 将 2026 联邦、2025 California 代理税表和 2026 payroll 假设拆为版本化规则文件，记录官方来源、适用年份、规划年份和 proxy 原因。
- 增加分类小计、置顶小计、总目标、安全余量和收入 projection selectors；所有派生值均不写入 `PlanDocument`。
- 增加 18 个 Domain/Tax 测试，与基础渲染测试合计 19 个；覆盖 Phase 2 的全部退出条件。
- 收紧架构边界脚本的 browser-global 匹配，避免测试描述中的普通单词 `document` 造成误报，同时继续阻止真实 browser-global 访问。
- 完整本地核验通过：TypeScript、ESLint、Prettier、19 个测试、生产 PWA 构建、架构边界、PWA 产物和项目文档检查。
- 未修改验收 UI，未连接 Firebase，未部署、commit 或 push。

### 2026-09-30 — 将远端 CI 改为本地固定核验

- 删除自动触发的 GitHub Actions 工作流，避免消耗用户在其他项目之间共享的免费 CI 额度。
- 增加跨平台 `npm run verify:quick` 和 `npm run verify` 命令。
- 完整核验现在统一执行类型检查、Lint、格式检查、单元测试、生产构建、架构边界、PWA 产物和项目文档检查。
- 项目文档检查会阻止自动 GitHub workflow 文件被意外重新加入。
- Phase 1 改为以本地固定核验通过作为完成条件，不再等待远端 CI。
- 已实际运行 `npm run verify`，全部本地检查通过。
- 未部署、commit 或 push。

### 2026-09-30 — 增加中文版实施计划

- 在文件开头增加与英文内容对应的完整中文版。
- 规定后续范围、阶段状态、验收条件和更新日志必须中英文同步维护。
- 未修改产品代码、Firebase 配置或部署状态。

### 2026-09-30 — 初始化正式仓库骨架

- 将验收通过的独立 Demo 保存到 `docs/reference/accepted-demo.html`。
- 把原有未提交概念验证原样保存到 `docs/reference/legacy-draft/`，在替换根目录入口前使用 SHA-1 校验副本一致。
- 初始化 React 19、TypeScript 5、Vite 8、Vitest、ESLint、Prettier 和 PWA 构建插件。
- 建立 Domain、Application、Port、Adapter、Feature、Component、Style、Firebase、字体和测试目录边界。
- 增加初始的可移植规划与认证接口，但尚未连接 Firebase。
- 增加默认拒绝全部访问的 Firestore Rules 基线。
- 增加 GitHub Actions，覆盖安装、类型检查、Lint、格式检查、测试和生产构建。
- 验证使用 `/payroll-calcualtion/` base path 的本地启动。
- 验证类型检查、Lint、格式检查、1 个基础测试和生产 PWA 构建。
- GitHub Actions 尚未在远端运行，因为尚未获得 commit 或 push 授权。
- `npm install` 报告 0 个已知漏洞。
- 本机默认 npm 缓存存在历史权限问题；若安装遇到 `EPERM`，使用类似 `NPM_CONFIG_CACHE=/private/tmp/payroll-npm-cache` 的任务专用缓存，不修改目录所有权，也不使用 `sudo`。
- 未连接 Firebase 项目，未部署，未 commit，未 push。

### 2026-09-30 — 建立项目治理文档

- 增加仓库级 Agent 指令和项目控制文档。
- 记录已确认的架构、成本限制、完整字体要求和跨设备同步范围。
- 将保存仓库基线标记为下一项可执行任务。
- 未进行产品实现、部署、commit 或 push。

---

# English version

Last updated: 2026-10-01

## Current status

| Area                   | Status           | Evidence or next action                                                                                                                                         |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP product scope      | Complete         | California planning, 50-goal information architecture, and non-goals are agreed.                                                                                |
| Visual direction       | Complete         | Three-column demo, pinned home, category view, income panel, and seven themes passed manual acceptance.                                                         |
| Architecture           | Complete         | React + TypeScript + Vite PWA, Firebase Auth/Firestore, local-first storage, and portable adapters are agreed.                                                  |
| Repository governance  | Complete         | Control documents, accepted demo, and the legacy proof-of-concept snapshot are stored in the repository.                                                        |
| Product implementation | Phase 6 complete | Email identity, local-plan import, Firestore synchronization, conflict handling, and cross-device verification passed the complete local gate; Phase 7 is next. |
| Deployment             | Not started      | Automatic GitHub Actions are disabled; a non-Actions Pages path and Firebase configuration are pending.                                                         |

## Architecture baseline

```text
Static hosting without GitHub Actions
    │ static HTML, CSS, JavaScript, fonts and PWA assets
    ▼
React PWA
    ├── domain: plan and tax rules
    ├── application: commands, selectors and sync orchestration
    ├── local adapter: IndexedDB
    └── cloud adapters
          ├── Firebase Authentication
          └── Cloud Firestore
```

The application must remain usable without Firebase. Firebase adds identity and synchronization; it does not own the tax engine or UI state model.

## Phase 0 — Freeze the accepted baseline

Status: Complete on 2026-09-30.

Deliverables:

- Copy the accepted demo into `docs/reference/accepted-demo.html`.
- Record its seven themes, font mapping, desktop width, responsive behavior, and primary interactions.
- Preserve useful tax logic and tests from the current uncommitted draft before replacing its UI.
- Confirm `.gitignore` covers dependencies, builds, Firebase state, test output, and secrets.

Exit criteria:

- The accepted visual can be opened from a repository file.
- Product scope and architecture constraints are linked from root `AGENTS.md`.
- No useful draft logic is lost.

## Phase 1 — Establish the application foundation

Status: Complete on 2026-09-30.

Deliverables:

- Scaffold React, TypeScript, and Vite.
- Enable strict TypeScript, linting, formatting, Vitest, and production build scripts.
- Configure the GitHub Pages base path for the current repository name `payroll-calcualtion`.
- Add the high-level directory boundaries described in `development-constraints.md`.
- Add unified local `npm run verify:quick` and `npm run verify` entry points.
- Disable automatically triggered GitHub Actions to protect the shared free CI quota.

Exit criteria:

- Local development starts successfully.
- Type checking, linting, formatting, tests, production build, and repository constraints pass through `npm run verify`.
- No Firebase dependency exists outside the planned adapter boundary.

## Phase 2 — Implement the domain and tax engine

Status: Complete on 2026-09-30.

Deliverables:

- Define the versioned `PlanDocument`, categories, goals, tax profile, and preferences.
- Use integer cents and stable UUIDs.
- Migrate the existing progressive-tax and inverse-solver behavior into pure TypeScript modules.
- Separate federal and California rule data by year.
- Add source metadata and planning-proxy labels.
- Implement selectors for category totals, pinned totals, total target, and calculated income.
- Add validation and schema migration infrastructure.

Exit criteria:

- Tax boundary, Social Security cap, Additional Medicare, California mental-health tax, zero target, and inverse-solver tests pass.
- Domain modules run without React, Firebase, or browser globals.
- Display rounding does not alter source calculations.

## Phase 3 — Deliver the local-first planner

Status: Complete on 2026-09-30.

Deliverables:

- Implement the accepted top bar, navigation, central content, and persistent income panel.
- Implement pinned home and category editing screens.
- Implement category and goal create, edit, move, order, pin, and delete flows.
- Implement cross-category search and progressive list reveal.
- Implement tax-profile and tax-breakdown panels.
- Implement IndexedDB persistence through `LocalPlanRepository`.
- Add anonymous local mode and sample data.

Exit criteria:

- The full planner works without a network or Firebase project.
- Every primary control visible in the UI has defined behavior.
- Editing any source input immediately updates all affected totals and tax results.
- The 50-goal fixture remains usable and free of overflow.

## Phase 4 — Reproduce themes and fonts

Status: Updated to the final manual acceptance on 2026-10-01.

Deliverables:

- Convert the seven themes into semantic CSS tokens.
- Self-host pinned WOFF2 files and licenses for the final eleven accepted font families.
- Use complete Unicode-range packages rather than demo-text-only subsets.
- Load active-theme fonts first and cache remaining theme fonts while idle.
- Use a browser-width responsive grid with desktop columns `clamp(210px, 18vw, 360px) / minmax(0, 1fr) / clamp(290px, 22vw, 440px)` and stack the panels below 900px.
- Preserve the accepted local top-bar and side-panel gradients while having the navigation, center, and income panels cover the page themselves; do not add solid or stage-color gutters around a fixed 1180px application.
- Lock the seven-theme font mapping; Blue Midnight uses Cormorant Garamond + Zhuque Fangsong for text and DM Serif Display for numbers.
- Add automatic font-fallback detection and visual fixtures.

Exit criteria:

- All seven themes match the accepted visual structure and typography.
- Theme switching changes no business or calculation data.
- Common and uncommon Chinese test strings render without silent family fallback.
- Themes remain available after an offline restart.

## Phase 5 — Make the application installable and offline-capable

Status: Complete on 2026-10-01. The production application now includes the manifest, PNG/SVG install icons, service worker, app-shell/font precache, IndexedDB local storage, controlled update prompts, standalone display adaptation, and phone safe areas.

Deliverables:

- Add the web app manifest, icons, theme colors, and service worker.
- Cache the application shell and required font packages.
- Implement safe service-worker update notification and cache invalidation.
- Handle phone safe areas and installed display mode.
- Keep offline edits in a single latest pending plan document.

Exit criteria:

- Installation works on supported desktop and mobile browsers.
- The installed application reopens offline.
- Tax calculation, browsing, and editing work offline.
- A new release does not leave users indefinitely on a stale cached build.

## Phase 6 — Add identity and cross-device synchronization

Status: Completed on 2026-10-01. Portable authentication, a persistent device ID, and local-first synchronization orchestration are implemented with Firebase Auth/Firestore adapters. Production Firebase, deployment, and billing remain disabled.

Deliverables:

- Add Firebase client bootstrap isolated from domain code.
- Implement email/password registration, login, logout, and password reset.
- Add Google sign-in only if configuration and UX remain within the agreed scope.
- Implement Firestore plan storage through `FirebasePlanRepository`.
- Implement first-login local import and new-device cloud download.
- Debounce writes and use transactions or equivalent revision checks.
- Implement remote updates, offline retry, and explicit conflict resolution.
- Clear authenticated private cache on sign-out.
- Implement JSON export, import, and plan deletion.

Exit criteria:

- The same test account synchronizes between independent phone-sized and desktop-sized browser contexts.
- Offline edits synchronize after reconnection.
- A stale revision cannot silently overwrite a newer cloud revision.
- One user cannot read or modify another user's plan.

## Phase 7 — Harden quality, security, and performance

Deliverables:

- Complete unit, integration, repository-contract, security-rule, end-to-end, visual, and accessibility tests.
- Use Firebase Emulator Suite for authentication and Firestore tests.
- Test all seven themes at desktop and mobile widths.
- Test 50 goals, long Chinese labels, large dollar values, and empty states.
- Audit initial JavaScript, font loading, Firestore reads, and writes.
- Verify no secrets or private financial data appear in logs.

Exit criteria:

- All automated quality gates pass.
- No supported viewport has horizontal overflow, clipping, or obscured controls.
- The app stays within the planned Spark usage model under the documented load assumptions.
- Accessibility and keyboard-critical flows pass manual inspection.

## Phase 8 — Release the MVP

Deliverables:

- Publish static assets without triggering GitHub Actions; first evaluate a non-Actions GitHub Pages path and use Cloudflare Pages if it is unsuitable.
- Configure Firebase authorized domains and deploy reviewed Firestore rules.
- Keep the Firebase project on Spark with no billing attachment.
- Validate the production PWA on one desktop browser, iOS Safari, and Android Chrome when devices are available.
- Update the README with setup, tax assumptions, privacy, backup, and deployment instructions.
- Commit and push only after explicit user authorization.

Exit criteria:

- The production URL loads and is installable.
- Cross-device synchronization works against the production Firebase project.
- Offline restart and later synchronization work.
- The user completes final manual acceptance.

## Release acceptance checklist

- [ ] Same-account phone and desktop data remain consistent.
- [ ] Offline edits are retained and later synchronized.
- [ ] Revision conflicts are visible and recoverable.
- [x] Fifty goals remain clean and usable.
- [x] Pinned, category, search, and tax-profile flows work end to end.
- [x] Income results update from every relevant input.
- [x] Seven themes preserve data and render their intended fonts.
- [ ] The PWA installs and reopens offline.
- [ ] Firestore rules prevent cross-user access.
- [x] Tax source years and limitations are visible.
- [ ] No paid service is required or enabled.
- [ ] Tests, build, and manual visual acceptance pass.

## Planned commit sequence

1. `docs: freeze accepted MVP and project constraints`
2. `chore: scaffold React TypeScript Vite PWA`
3. `feat: add plan domain and tax engine`
4. `feat: implement local-first planner`
5. `feat: reproduce accepted themes and fonts`
6. `feat: add installable offline PWA`
7. `feat: add Firebase authentication`
8. `feat: add Firestore cross-device sync`
9. `test: add security sync and visual coverage`
10. `docs: document deployment privacy and tax assumptions`

## Update log

### 2026-10-01 — Phase 6 identity and cross-device synchronization completed

- Added portable `AuthProvider`, `RemotePlanRepository`, `SyncStateStore`, `DeviceIdentity`, and `CloudRuntime` boundaries. Firebase SDK use remains adapter-only; the production UI stays fully functional in anonymous local mode when configuration is absent, while partial configuration fails closed.
- Integrated Firebase email registration, sign-in, password reset, sign-out, and transactional single-document Firestore writes. Stable device identity, remote revision, pending revision, and deletion state are persisted without exposing Firebase types to Domain or UI code.
- Added the account and synchronization panel to the accepted UI, including explicit first-login local import, sync status, conflict choices, privacy-safe sign-out cleanup, and JSON export, validated import, and whole-plan deletion for both anonymous and authenticated modes. An empty signed-in account keeps its starting template local and creates no cloud document until the first edit.
- The local-first flow now covers offline edits, latest-only reconnect flush, transactional stale-revision rejection, and both accept-remote and keep-local recovery. Write echoes are identified by `revision + updatedByDevice + updatedAt`, so equal revisions created by separate devices still preserve the offline local version and surface an explicit conflict. Application-level fake-runtime tests cover first import, new-device download, sign-out without cloud deletion, and two-device conflict recovery.
- Added owner-scoped Firestore Rules and wired Rules, email identity, independent desktop/phone contexts, cross-user isolation, and stale-revision Emulator tests into the complete `npm run verify` gate. Emulator commands use `demo-worthwhile-local` to prevent accidental production access.
- `npm run verify:quick` currently passes TypeScript, ESLint, Prettier, 61 tests across 15 files, and 582 font assets; `npm audit --omit=dev` reports zero vulnerabilities. Browser checks at 1440, 390, and 320px found no horizontal overflow in the updated top bar or account panel.
- Homebrew OpenJDK 21.0.12.1 is installed. A repository launcher now discovers `JAVA_HOME` or the Homebrew JDK and adjusts `PATH` only for the Emulator process. Firebase Emulator Suite started against `demo-worthwhile-local` with Auth on 9099 and Firestore on 8080. Three Rules and adapter tests across two files passed, covering the owner lifecycle, unauthenticated and cross-user denial, stale/malformed revision denial, email identity, and two independent Firebase contexts.
- The complete `npm run verify` gate is green: 61 unit/application tests across 15 files, production build, architecture boundaries, PWA artifacts, two offline reopen cycles, 582 font assets, and the seven-theme desktop/mobile font audit all passed. Independent real-Chrome contexts at 1440×1000 desktop and 390×844 phone sizes synchronized the same account in both directions, including an offline phone edit after reconnection, without horizontal overflow. `npm audit --omit=dev` reports zero vulnerabilities. The Firebase runtime chunk-size warning is deferred to the Phase 7 performance audit and does not block this phase.
- Every Phase 6 exit criterion is satisfied. No production Firebase project was connected, nothing was deployed, billing remains disabled, and this work has not yet been committed or pushed.

### 2026-10-01 — Phase 6 identity and cross-device synchronization started

- Phase 5 was pushed to `origin/main` as commit `a52ac7f`; the complete local gate passed and Phase 6 starts from a clean working tree.
- Work proceeds in this order: authentication port and device identity, local-first sync orchestration, Firebase adapters, then owner-scoped Rules with Emulator and two-context verification.
- Firebase SDK use remains limited to `src/adapters/firebase/` and minimal bootstrap code. Without Firebase configuration, the application must continue to run completely in anonymous local mode.
- At phase kickoff the machine had no Java Runtime, so Emulator security-rule and cross-user isolation checks were recorded as completion blockers. OpenJDK 21 was subsequently installed, and every Emulator and cross-device check passed.

### 2026-10-01 — Phase 5 installable offline PWA completed

- Added 192px, 512px, and maskable PNG install icons while retaining the SVG icon, plus Apple home-screen metadata, standalone metadata, and `viewport-fit=cover`; Chrome reports no installability errors caused by application resources.
- Consolidated service-worker registration into a React lifecycle. Lightweight notices now cover initial offline readiness, browser installation, iOS home-screen instructions, available updates, and registration failures. The app checks for updates hourly while online, and a new version can load only after local edits have been saved and the user confirms it.
- Added top and bottom safe-area handling for standalone display and kept PWA notices inside desktop and phone safe areas without changing the accepted top-bar, three-column information architecture, or seven themes.
- Fixed debounced persistence so it enters the `saving` state, preventing service-worker refresh while an IndexedDB write is active.
- Added a real-Chrome PWA check that edits online, closes and reopens offline, edits again offline, then closes and reopens offline a second time. Both cycles retain business data and recalculated California income; the service worker keeps controlling the page and IndexedDB contains exactly one latest plan document.
- Added PWA artifacts and the real offline flow to the authoritative `npm run verify` gate. PWA unit coverage verifies the install event, update callback, and local-save gate; the final full gate passed TypeScript, ESLint, Prettier, 41 tests, 582 font assets, the production PWA, architecture boundaries, PWA offline E2E, seven-theme offline fonts, and project-document checks.
- Physical-device installation on iOS Safari and Android Chrome, plus production installation, remains a Phase 8 manual check when devices and the production URL are available. Automatic GitHub Actions remain disabled; Firebase is still disconnected and nothing was deployed. The Phase 5 change was committed and pushed after re-review and the complete local gate passed.

### 2026-10-01 — Synced final typography and the full-width responsive layout

- Replaced the fixed 1180px application and outer stage gutters with a real browser-width three-column grid; reference columns are approximately `230 / 760 / 290px` at 1280px and `360 / 1200 / 440px` at 2000px, with vertical stacking at 900px and below.
- Navigation, center content, income panel, top bar, padding, cards, table columns, and typography now adapt together. Each panel uses layered gradients, glows, and subtle texture rather than a solid color filling unused outer space.
- Locked eleven font families and the final seven-theme mapping from manual acceptance. Chinese and English typography share a coherent character inside each theme, while Blue Midnight numbers intentionally use DM Serif Display.
- Removed Manrope, IBM Plex Sans SC, and Noto Serif SC dependencies and generated assets. Font synchronization now clears obsolete family directories before producing 582 WOFF2-only files and their licenses.
- Browser checks now derive the expected cache count from generated assets and cover full-width geometry at 1280px, 1440px, and 2000px, the 900px stacked layout, 390px mobile overflow, all seven theme families, and the Blue Midnight number exception.
- These changes remain uncommitted, unpushed, and undeployed; Firebase remains disconnected.

### 2026-09-30 — Corrected production typography to match the accepted demo

- Restored the accepted-demo sizes for page eyebrows, theme descriptions, navigation amounts and footers, summary labels and values, and the income headline; annual income is again 48px on desktop and 39px at tablet widths.
- Returned goal names from the unintended 600 weight to 400 and restored the demo's goal-row spacing and source-control size so the production UI no longer appears smaller, denser, or heavier.
- Added computed-style assertions to the real-Chrome audit and covered 1440px desktop, 900px tablet, and 390px phone viewports.
- After switching through all seven themes, planner data remained unchanged and no horizontal overflow, text obstruction, or component clipping appeared at any checked viewport.
- Full `npm run verify` passed; this correction changed no font family, theme color, tax calculation, or data structure, and remains uncommitted and unpushed.

### 2026-09-30 — Phase 4 themes and fonts reproduced

- Pinned all eight accepted font families through the npm lockfile and generated 415 self-hosted WOFF2-only files; every family directory includes its OFL 1.1 license, and Chinese fonts retain complete Unicode-range packages instead of demo-text-only subsets.
- Added accepted-CSS family aliases for Fontsource variable fonts, retained normal/italic variable faces for Bodoni Moda and Cormorant Garamond, complete 400/500 IBM Plex Sans SC files, and complete 400/500 Noto Serif SC packages.
- Added a theme-font manifest, active-theme-first loading, browser-idle warming, and observable load states; a font failure is never silently reported as success.
- Added dual FontFaceSet glyph matching and Canvas raster-difference fallback detection, plus a seven-theme `?font-audit=1` visual fixture covering common and uncommon Chinese samples.
- The PWA precache now includes all 415 WOFF2 files; real Chrome automation confirms the font audit still passes after an offline restart.
- Chrome automation switches through all seven themes, confirms the rent value remains unchanged, and verifies no horizontal overflow at 1440px desktop and 390px phone viewports; screenshot inspection found no clipping, overlap, or unreadable color treatment.
- Full `npm run verify` passed: TypeScript, ESLint, Prettier, 35 tests, font assets, production PWA build, architecture boundaries, PWA artifacts, real-browser font audit, and project documents.
- Phase 3 was pushed to `origin/main` as commit `0fffef6`; the Phase 4 changes remain uncommitted and unpushed. Firebase remains disconnected and nothing was deployed.

### 2026-09-30 — Phase 3 local-first planner delivered

- Integrated the accepted demo's 1180px desktop skeleton into React, including the top bar, category navigation, pinned home, category editor, decorative rail, and income panel, while retaining color tokens for all seven accepted themes.
- Added a stable sample plan with six categories and fifty goals; the home screen shows only pinned goals, while long categories initially show six items and progressively reveal the remainder.
- Implemented category and goal create, edit, delete, reorder, cross-category move, and pin flows, together with cross-category search, pinned management, tax-profile settings, and a complete tax breakdown.
- Added the native IndexedDB `LocalPlanRepository`, an in-memory implementation of the same port, 250ms debounced saves, revision-conflict handling, and offline-state messaging; Firebase remains disconnected.
- Added repository-contract, domain-command, fifty-goal fixture, and planner-interaction coverage; all 32 tests across seven test files pass.
- Verified real rendering at a 1440px desktop viewport, a 390px phone viewport, and a 320px narrow-phone viewport; fixed right-edge clipping in the mobile theme panel and restored the hidden mobile theme button's accessible name.
- Fixed stale uncontrolled input values after asynchronous IndexedDB hydration and added a regression test that keeps a saved amount consistent with its derived totals.
- Full `npm run verify` passed: TypeScript, ESLint, Prettier, 32 tests, production PWA build, architecture boundaries, PWA artifacts, and project documents.
- Firebase was not connected, no deployment occurred, and the Phase 3 changes were not committed or pushed.

### 2026-09-30 — Phase 1 re-verified and Phase 2 domain delivered

- Re-ran the complete `npm run verify` gate and started the development server; `/payroll-calcualtion/` returned HTTP 200, confirming every Phase 1 exit criterion still holds.
- Fixed `PlanDocument` at schema version 1 with integer cents, basis points, stable UUIDs, fail-closed validation, and a version 0 to version 1 migration.
- Migrated the legacy progressive tax, annual pay estimate, and inverse solver to pure TypeScript; the solver returns the minimum whole cent of gross income that covers the target.
- Split 2026 federal, 2025 California proxy, and 2026 payroll assumptions into versioned rule files with official sources, applicable years, planning years, and a documented proxy reason.
- Added category, pinned, total-goal, safety-buffer, and income-projection selectors; derived values are never persisted in `PlanDocument`.
- Added 18 Domain/Tax tests, for 19 total with the foundation rendering test, covering every Phase 2 exit criterion.
- Tightened browser-global matching in the architecture check so ordinary prose containing `document` does not create a false positive while real browser-global access remains blocked.
- Full local verification passed: TypeScript, ESLint, Prettier, 19 tests, production PWA build, architecture boundaries, PWA artifacts, and project documents.
- The accepted UI was not modified; Firebase remains disconnected, and no deployment, commit, or push was performed.

### 2026-09-30 — Replaced remote CI with fixed local verification

- Removed the automatically triggered GitHub Actions workflow to avoid consuming the user's free CI quota shared across other projects.
- Added cross-platform `npm run verify:quick` and `npm run verify` commands.
- Full verification now runs type checking, linting, formatting, unit tests, production build, architecture-boundary, PWA-artifact, and project-document checks through one entry point.
- The project-document check prevents automatic GitHub workflow files from being reintroduced accidentally.
- Phase 1 now completes through the fixed local verification gate and no longer waits for remote CI.
- `npm run verify` was executed and all local checks passed.
- No deployment, commit, or push was performed.

### 2026-09-30 — Added the Chinese implementation plan

- Added a complete Chinese version before the corresponding English content.
- Required future scope, phase status, exit criteria, and update-log changes to remain synchronized in both languages.
- No product code, Firebase configuration, or deployment state changed.

### 2026-09-30 — Repository foundation initialized

- Copied the accepted standalone demo to `docs/reference/accepted-demo.html`.
- Preserved the original uncommitted proof of concept under `docs/reference/legacy-draft/` and verified the copies by SHA-1 before replacing the root entry files.
- Initialized React 19, TypeScript 5, Vite 8, Vitest, ESLint, Prettier, and the PWA build plugin.
- Added domain, application, port, adapter, feature, component, style, Firebase, font, and test boundaries.
- Added initial portable plan and authentication interfaces without connecting Firebase.
- Added a deny-all Firestore rules baseline.
- Added GitHub Actions checks for install, type checking, linting, formatting, tests, and production build.
- Verified local startup at the configured `/payroll-calcualtion/` base path.
- Verified type checking, linting, formatting, one foundation test, and the production PWA build.
- The GitHub Actions workflow has not run remotely because no commit or push was authorized.
- Confirmed `npm install` reported zero known vulnerabilities.
- The local machine's default npm cache has a historical ownership problem; use a task-specific cache such as `NPM_CONFIG_CACHE=/private/tmp/payroll-npm-cache` instead of changing ownership or using `sudo` if installation fails with `EPERM`.
- No Firebase project was connected, no deployment occurred, and no commit or push was performed.

### 2026-09-30 — Project governance established

- Added repository-level agent instructions and project control documents.
- Recorded the accepted architecture, cost limits, complete-font requirement, and cross-device synchronization scope.
- Marked repository baseline preservation as the next executable task.
- No product implementation, deployment, commit, or push was performed.

# Phase 7 quality, security, performance, and Spark budget

更新日期：2026-10-02

本文件记录 MVP 的固定核验预算。它不是生产监控面板，也不放宽
`development-constraints.md` 中的安全、隐私、成本或视觉约束。

## 1. 浏览器质量矩阵

完整本地门禁必须覆盖：

- 50 个既定目标，并逐分类展开全部目标行。
- 120 字符分类名、120 字符目标名和每月 `$500,000` 的大额显示。
- 无置顶目标、搜索无结果和空分类三种空状态。
- `2000 / 1440 / 1050 / 901 / 900 / 768 / 390 / 320px` 宽度。
- 7 套主题的 WCAG 2 A/AA 与 WCAG 2.1 A/AA 自动扫描。
- 键盘焦点顺序、可见焦点环和键盘主题切换。
- 页面、主要容器和所有可见交互控件都不得横向越界、相互遮挡或产生未管理的横向滚动。

自动扫描不能替代 Phase 8 的实体设备和最终人工验收，但任何自动扫描失败都会阻断本地完整门禁。

## 2. 前端性能预算

生产构建采用以下 fail-closed 上限：

| 资源                    | 未压缩上限 | gzip 上限 | 说明                                                  |
| ----------------------- | ---------- | --------- | ----------------------------------------------------- |
| 匿名模式初始 JavaScript | 325,000 B  | 100,000 B | 不得同步载入 Firebase SDK                             |
| 懒加载 Firebase runtime | 575,000 B  | 175,000 B | 仅完整 Firebase 配置存在时动态载入                    |
| 初始 CSS                | 40,000 B   | 8,500 B   | 包含七主题 token 和响应式布局                         |
| 完整字体库              | 21 MiB     | 不适用    | 11 个家族、582 个 WOFF2；保留完整字符覆盖，不删减家族 |

字体库不再进入 Service Worker 的安装期 precache。当前主题字体先加载，其余字体和 Unicode-range
包在浏览器空闲时按 `public/fonts/asset-manifest.json` 写入
`worthwhile-fonts-<content-digest>` Cache Storage；Service Worker 对字体采用 CacheFirst。摘要由
全部 CSS/WOFF2 的路径与内容生成。只有清单中的全部资源写入并留下 complete marker 后，UI 才能
报告七主题字体完整离线就绪并清理旧版本；失败时保留旧的完整缓存且允许联网重试。这样保留完整
离线字体复现，同时避免首次安装一次性阻塞约 20 MiB 字体下载。服务器不可用且浏览器的 CSS 字体
URL 进入失败状态时，字体加载器会从当前内容版本的 Cache Storage 读取 WOFF2 二进制，并按原样式、
字重和 Unicode range 注册等价 `FontFace`；完整门禁会覆盖 warmup 前断网、失败重试、版本升级、
旧缓存清理，以及关闭本地服务器后重新打开页面的全部测试字形。

生产构建不得输出 source map。Firebase runtime 必须保持独立异步 chunk；若预算需要提高，应先记录原因和真实测量，再修改本文件与门禁。

## 3. 隐私和日志边界

- 生产 `src/` 不允许使用 `console.log`、`console.info`、`console.warn`、`console.error` 或 `console.debug`。
- 浏览器质量测试会使用长分类名、长目标名、大额金额和本机账户键作为哨兵，确认它们未进入浏览器 console。
- 不得加入 analytics、Mixpanel、Segment、Sentry 或其他跟踪依赖，除非用户明确批准并同步更新隐私边界。
- `.env.example` 的四个 Firebase 客户端核心值必须保持为空；真实环境文件仍由 `.gitignore` 排除。
- 完整计划、税务输入、邮箱、密码和身份 token 不得写入应用日志、截图文件名或错误消息。

## 4. Firestore 操作模型

MVP 继续使用 `/plans/{uid}` 的单文档模型。下表是用于容量规划的保守计数，不是账单保证：

| 用户动作                          | 文档读取                         | 文档写入 | 文档删除 |
| --------------------------------- | -------------------------------- | -------- | -------- |
| 一台已登录设备启动并订阅          | 2：一次 `getDoc` + listener 初值 | 0        | 0        |
| 一次成功保存，两台设备同时在线    | 最多 3：事务读取 + 两端 listener | 1        | 0        |
| stale revision 冲突               | 至少 1 次事务读取                | 0        | 0        |
| 删除整份计划并同步两台在线设备    | 最多 3：事务读取 + 两端 listener | 1        | 0        |
| 匿名本地编辑、税务计算、JSON 导出 | 0                                | 0        | 0        |

同步删除不会物理删除 `/plans/{uid}`，而是通过 transaction 写入严格更高 revision 的
`{ kind: "deleted", revision, deletedAt }` tombstone。该持久标记让离线设备恢复后仍能识别删除，
并使删除后重建继续使用更高 revision，避免旧设备静默复活旧计划。Firestore Rules 禁止客户端物理删除。

UI 在本机先保存，并以 250ms debounce 或字段 blur 合并写入。同步层只保留最新 pending plan；同一次本机保存只调用一次远端 transaction push。搜索、页面导航、税务计算和主题面板开关不会写 Firestore。

## 5. Spark 容量假设

2026-10-01 查阅的官方免费额度：

- [Firebase pricing](https://firebase.google.com/pricing/)：Cloud Firestore Standard edition 每日
  50,000 reads、20,000 writes、20,000 deletes，1 GiB stored data、每月 10 GiB egress。
- [Cloud Firestore quotas](https://docs.cloud.google.com/firestore/quotas)：同一免费层额度和单文档
  1 MiB 限制。
- [Firebase Authentication](https://firebase.google.com/docs/auth/)：本 MVP 仅使用邮箱密码认证，不使用
  SMS；Spark 身份规模远高于下述早期 MVP 假设。

早期 MVP 固定负载假设为：

- 最多 100 个日活跃账户。
- 每个账户最多 2 台同时在线设备。
- 每个账户每天最多 100 次已经 debounce/blur 合并后的成功云端保存。
- 每台设备每天启动并建立一次同步订阅。

保守日用量为：

- Reads：保存流量 `100 × 2 × 2 + 100 × 100 × 3 = 30,400`；若 100 个账户同日各同步删除一次，最多再增加约 300 次读取，总计约 30,700，占 50,000 的 61.4%。
- Writes：`100 × 100 + 100 = 10,100`（含上述同日删除 tombstone），占 20,000 的 50.5%。
- Deletes：0；计划删除使用计费为 write 的持久 tombstone，不消耗 Firestore delete 配额。
- Storage：自动测试把 50 项与极端长度规划限制在 128 KiB；100 份上限规划约 12.5 MiB，远低于 1 GiB，且单份远低于 1 MiB。

若预期 DAU、设备数或合并后保存次数超过任一假设，应先重新计算容量、降低写入频率或调整数据访问方式；不得直接绑定计费或升级 Blaze。

## 6. 固定本地核验

开发反馈运行：

```sh
npm run verify:quick
```

Phase 7 里程碑、commit 或发布前运行：

```sh
npm run verify
```

完整门禁必须包含生产 build、静态质量预算、PWA 离线重开、字体缓存、极端内容与可访问性浏览器检查、Firebase Emulator 和跨设备同步。自动 GitHub Actions 继续禁用。

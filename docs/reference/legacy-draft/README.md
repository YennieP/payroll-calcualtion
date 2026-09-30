# California Lifestyle Income Planner

从每月生活目标反推所需税前年薪的轻量网页计算器。界面为中文，税务术语保留英文，金额单位为美元。

## 本地运行

```bash
npm start
```

然后打开 <http://localhost:4173>。

不想启动服务时也可以直接打开 `index.html`，但部分浏览器会限制本地 ES modules，因此推荐使用上面的命令。

## 自动测试

```bash
npm test
```

## 计算范围

- 2026 美国联邦所得税级与标准扣除
- 2026 Social Security、Medicare 与 Additional Medicare Tax
- 2026 California SDI
- 最新官方 2025 California resident income tax schedules，作为 2026 规划代理
- Single、Married filing jointly、Head of household
- 固定月度税前扣除与安全余量

当前版本假设全部收入为 California W-2 工资，采用标准扣除，不计税收抵免、逐项扣除、抚养人、RSU、奖金预扣差异或其他收入。它适合生活规划，不应替代专业税务意见。

## 数据来源

- [IRS tax year 2026 inflation adjustments](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill)
- [IRS Revenue Procedure 2025-32](https://www.irs.gov/irb/2025-45_IRB)
- [Social Security 2026 COLA fact sheet](https://www.ssa.gov/cola/factsheets/2026.html)
- [California EDD contribution rates](https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding)
- [California FTB 2025 tax rate schedules](https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/2025/10.html)

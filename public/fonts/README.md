# Product font assets

Phase 4 vendors pinned WOFF2 files and license texts for the eleven families in the final accepted theme mapping:

| Public family         | Package source                            | Pinned version | Delivery                                 |
| --------------------- | ----------------------------------------- | -------------- | ---------------------------------------- |
| Bodoni Moda           | `@fontsource-variable/bodoni-moda`        | 5.3.0          | normal and italic variable WOFF2 ranges  |
| ZCOOL XiaoWei         | `@fontsource/zcool-xiaowei`               | 5.3.0          | complete 400 Unicode-range WOFF2 package |
| Cormorant Garamond    | `@fontsource-variable/cormorant-garamond` | 5.3.0          | normal and italic variable WOFF2 ranges  |
| Zhuque Fangsong       | `@free-fonts/zhuque-fangsong`             | 1.0.0          | upstream 0.212 complete 400 WOFF2 ranges |
| DM Serif Display      | `@fontsource/dm-serif-display`            | 5.3.0          | complete 400 WOFF2 ranges                |
| Space Grotesk         | `@fontsource-variable/space-grotesk`      | 5.3.0          | complete variable WOFF2 ranges           |
| ZCOOL QingKe HuangYou | `@fontsource/zcool-qingke-huangyou`       | 5.3.0          | complete 400 Unicode-range WOFF2 package |
| Cinzel                | `@fontsource-variable/cinzel`             | 5.3.0          | complete variable WOFF2 ranges           |
| Ma Shan Zheng         | `@fontsource/ma-shan-zheng`               | 5.3.1          | complete 400 Unicode-range WOFF2 package |
| Libre Caslon Display  | `@fontsource/libre-caslon-display`        | 5.3.0          | complete 400 WOFF2 ranges                |
| Long Cang             | `@fontsource/long-cang`                   | 5.3.0          | complete 400 Unicode-range WOFF2 package |

Each family directory includes its OFL 1.1 license. Generated CSS aliases Fontsource variable-family names to the exact names used by the product and removes legacy WOFF fallbacks, so production ships only WOFF2.

Run `npm run fonts:sync` after a deliberate pinned package upgrade, then run `npm run fonts:check`. The sync command removes obsolete generated family directories before rebuilding the accepted manifest, so rejected fonts cannot remain silently bundled.

Do not hand-delete Unicode-range files or create a demo-text-only Chinese subset. The app loads the active theme first, warms remaining families during browser idle time, and precaches the complete font directory for offline theme switching.

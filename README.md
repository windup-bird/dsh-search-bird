# dsh-search-bird（搜索小鸟）

给 DSH 用的轻量网页搜索来源（provider）：**大陆引擎优先直连，海外引擎走可配置的 Clash 代理**，配置在 Web 界面里完成。

不新增模型工具——它挂在 Harness 已有的 `web_search` 后面，替换掉原来那个需要 API Key 的搜索来源。

## 引擎

| 引擎 | 通路 | 说明 |
|---|---|---|
| Bing | 直连 | 走 `cn.bing.com` 的 RSS，最快最稳，主引擎 |
| Baidu | 直连 | 解析自然结果容器，`mu` 属性直接给出真实地址 |
| 360 Search | 直连 | `res-list` + `data-mdurl` |
| Sogou | 直连 | 可用但会较快触发反爬，默认关闭 |
| DuckDuckGo | 代理 | Lite 版，无 JS |
| Google | 代理 | 结构易变、反爬强，默认关闭 |

编程源见下节。

单个引擎失败只降级它自己；全部失败时错误信息会逐条列出原因。

## 编程源（前缀）

普通查询走上面六个网页引擎；给查询加前缀则**只查那一个源**，不会混入网页结果：

| 前缀 | 源 | 查什么 | 默认 |
|---|---|---|---|
| `gh:` | GitHub | 仓库（按名字/描述/主题） | 开 |
| `crate:` | crates.io | Rust crate | 开 |
| `npm:` | npm | JS 包 | 开 |
| `pypi:` | PyPI | **精确**包名（版本/摘要/链接） | 开 |
| `so:` | Stack Overflow | 问题（适合贴报错原文） | 开 |
| `paper:` | arXiv | 论文 | 关（该 API 限流，约 3s/次） |

例：`crate: serde json`、`gh: tokio-rs/tokio`、`so: rust borrow checker`。

另外两种**自动**识别，不需要前缀：查询里出现 `github.com/owner/repo` 链接，或查询本身就是一个 `owner/repo`，直接按 GitHub 仓库查。

不加前缀的查询不受影响，仍然走大陆直连的网页引擎。

插件会往系统提示里加一行说明，让模型知道这些前缀存在；不需要的话删掉 `index.js` 里的 `systemPrompt.section` 那段即可，前缀仍然可用（只是模型不会主动用）。

## 代理策略

| 模式 | 大陆引擎 | 海外引擎 |
|---|---|---|
| `auto`（默认） | 直连，失败才重试代理一次 | 代理可达就走代理，否则直连试一次 |
| `always` | 直连 | 代理 |
| `never` | 直连 | 直连（排障用） |

- 代理地址默认 `http://127.0.0.1:7897`（Clash Verge / mihomo 的 mixed 端口），只支持 HTTP CONNECT，不吞 socks5。
- 每次搜索前做一次 800ms 的 TCP 探测，结果缓存 20s：Clash 没开时不会让每次搜索白等。
- 代理配了但探测不通时，海外引擎直接跳过（不拿一次请求超时去撞墙）；代理通但上游其实不通时，连续失败 2 次会冷却 10 分钟，避免每次搜索都被拖住。
- 改动代理地址或模式会立刻清空冷却状态，修好代理马上恢复。
- 零运行时依赖：`node:http`/`https`/`tls` 自己实现 CONNECT 隧道。

## 配置

Web 界面 → 设置 → 插件 → **轻量搜索**：

- 每个引擎一个开关，附带「大陆直连 / 需代理」标签与最近一次耗时、条数或错误；
- 代理地址（回车或「应用」提交）、海外通路模式；
- 每次返回条数；
- 顶部显示本插件是否已是 `web.searchProvider`。

字段都是 `volatile`，**保存即刻生效，不重启插件**。写入走 Harness 自己的 `configForms` → `settings.mutate`，落在 profile 的配置层里，和手改 YAML 等价。

## 安装

```
plugin_manager install_bundle  →  /home/windupbird/Workspace/dsh-search-bird
```

bundle 的 patch 会插入插件行，并把 `web` 行的 `searchProvider` 指向 `search-bird`（同时保留 `fetchProvider: http`）。

## 自检

```bash
node test/transport.mjs   # 直连 / CONNECT 隧道 / 重定向 / 解压 / 超时
node test/engines.mjs     # 大陆引擎实抓解析 + DDG/Google 结构样本
node test/search.mjs      # 路由策略、融合去重、代理不可用时的降级
node test/verticals.mjs   # 编程源前缀路由 + 每个源的真实请求
```

## 已知限制

- 搜狗对同一出口 IP 的请求较敏感，一段时间后会返回反爬页；默认关闭。
- Google / DuckDuckGo 必须经代理，且依赖目标站当时可达。
- 引擎解析基于正则而非 DOM，站点改版会让对应引擎降级（不影响其它引擎），错误信息保留原始特征便于修。

# Allurx Playground

把小创意做成可以玩的东西。集合首页提供作品入口，每件作品独立运行。

目前收录 **小小海湾（Tiny Bay）**：可以拨水、拖船、调整天气的微缩景观，带环境声音与照片导出。需要支持 [WebGPU](https://developer.mozilla.org/zh-CN/docs/Web/API/WebGPU_API) 的浏览器，并开启硬件加速。

## 本地运行

安装 [.node-version](.node-version) 指定的 Node.js，然后执行：

```sh
npm ci
npm run dev
```

命令会生成作品并自动打开 <http://localhost:4173/>，同时监听 `0.0.0.0`，可通过终端显示的 Network 地址在局域网中访问。进入 `projects/tiny-bay/` 运行 `npm run dev` 会使用同一入口并自动打开小小海湾。

开发预览基于生成产物。修改源码后，在另一个终端运行 `npm run build` 并刷新页面。检查并通过 Cloudflare 本地运行时预览正式产物：

```sh
npm run verify
npm run preview
```

Cloudflare 预览地址为 <http://localhost:4175/>。局域网 HTTP 地址可能不满足 WebGPU 对安全上下文的要求；作品在其他设备上的运行应通过 HTTPS 地址验证。

## 源码与产物

- `index.html`、`src/styles.css`：集合首页及作品入口。
- `projects/tiny-bay/`：小小海湾的源码与单文件构建脚本。
- `public/`：集合首页静态资源、[404 页面](public/404.html)与[响应头配置](public/_headers)。
- `scripts/build.mjs`：汇集集合首页与各作品产物，不依赖仓库外的文件。

小小海湾的脚本、样式和程序化场景资源会内嵌到 `dist/tiny-bay/index.html`。`dist/tiny-bay/tiny-bay.html` 是相同内容的下载副本，只需保留这一个文件。单文件包含全部运行资源，实际运行仍取决于浏览器、GPU 和打开方式的支持。

每个创意放在 `projects/<name>/` 下，使用 npm workspaces 管理自己的源码、依赖和构建。在各自的 `package.json` 中定义 `build` 命令，将可发布内容生成到自身的 `dist/`；根构建统一执行各作品构建，最后汇集产物到站点的 `/<name>/`。作品入口和封面在集合首页维护。

根构建以 [package.json](package.json) 的 `homepage` 为公开基址，根据各作品实际生成的 `index.html` 输出 `robots.txt` 与 `sitemap.xml`，收录集合首页和作品入口；相同内容的下载副本不重复收录。

作品资源使用相对路径，或将构建工具的资源基路径设为对应的 `/<name>/`（例如 [Vite 的 `base`](https://vite.dev/config/shared-options.html#base)）。根构建原样复制作品产物，不改写资源 URL。

后续作品可以使用单个 HTML，也可以携带独立资源，渲染库与框架按作品需要选择。共同检查工具在根工程维护，作品专用依赖放在对应 workspace。集合页不预加载作品的渲染引擎。单独构建小小海湾可执行 `npm run build --workspace=@playground/tiny-bay`。

## 部署

使用 [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)，配置见 [wrangler.jsonc](wrangler.jsonc)。目标域名为 `play.allurx.io`；配置文件不代表该域名已经上线。

发布前完成 `npm run verify`，再按 [Wrangler 部署说明](https://developers.cloudflare.com/workers/wrangler/commands/#deploy) 登录有权限的账户并运行 `npm run deploy`。在线作品使用 `/tiny-bay/` 目录地址，未知路径返回带首页入口的 404 页面。

共同工具配置与 CI 来自 [allurx-build](https://github.com/allurx/allurx-build)，配置入口和命令遵循[共享工程约定](https://github.com/allurx/allurx-build/blob/main/docs/node.md#默认结构与命令)。`@allurx/js-config` 使用已发布的精确版本，工作流固定完整 commit SHA；各作品的源码与构建仍由对应 workspace 维护。凭据、环境与部署配置见[共享部署说明](https://github.com/allurx/allurx-build/blob/main/docs/cloudflare-static-site.md)。

[Renovate 配置](.github/renovate.json)沿用[共享依赖策略](https://github.com/allurx/allurx-build/blob/main/docs/dependency-updates.md)，向 `main` 提出更新 PR。符合策略的常规更新在完整检查通过后自动合并，共享配置与工作流升级保留人工审核；合入 `main` 后由正常 CI 验证并部署该提交的产物。

## 许可证

本项目采用 [Apache License 2.0](LICENSE.txt)。根目录的 `LICENSE.txt` 是许可证的唯一维护源，构建时复制到 `dist/LICENSE.txt`，随网站交付。

小小海湾的在线 HTML 和单文件下载副本还会在源码注释中嵌入完整许可证与版权声明，独立保存和分发该 HTML 时，这些声明仍随文件保留。

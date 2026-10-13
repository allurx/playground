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
- `public/`：集合首页静态资源与响应头配置。
- `scripts/build.mjs`：汇集集合首页与各作品产物，不依赖仓库外的文件。

小小海湾的脚本、样式和程序化场景资源会内嵌到 `dist/tiny-bay/index.html`。`dist/tiny-bay/tiny-bay.html` 是相同内容的下载副本，只需保留这一个文件。单文件包含全部运行资源，实际运行仍取决于浏览器、GPU 和打开方式的支持。

每个创意放在 `projects/<name>/` 下，使用 npm workspaces 管理自己的源码、依赖和构建。在各自的 `package.json` 中定义 `build` 命令，将可发布内容生成到自身的 `dist/`；根构建统一执行各作品构建，最后汇集产物到站点的 `/<name>/`。作品入口和封面在集合首页维护。

作品资源使用相对路径，或将构建工具的资源基路径设为对应的 `/<name>/`（例如 [Vite 的 `base`](https://vite.dev/config/shared-options.html#base)）。根构建原样复制作品产物，不改写资源 URL。

后续作品可以使用单个 HTML，也可以携带独立资源，渲染库与框架按作品需要选择。共同检查工具在根工程维护，作品专用依赖放在对应 workspace。集合页不预加载作品的渲染引擎。单独构建小小海湾可执行 `npm run build --workspace=@playground/tiny-bay`。

## 部署

使用 [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)，配置见 [wrangler.jsonc](wrangler.jsonc)。目标域名为 `play.allurx.io`；配置文件不代表该域名已经上线。

发布前完成 `npm run verify`，再按 [Wrangler 部署说明](https://developers.cloudflare.com/workers/wrangler/commands/#deploy) 登录有权限的账户并运行 `npm run deploy`。在线作品使用 `/tiny-bay/` 目录地址，未知路径返回 404。

开发工具与共享 CI 来自 [Web Foundation](https://github.com/allurx/web-foundation)。接入远端仓库后的凭据、环境与部署配置参考其 [Workers 静态站点工作流](https://github.com/allurx/web-foundation/blob/v1.0.2/.github/workflows/static-site.yml)。

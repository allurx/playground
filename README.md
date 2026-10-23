# Allurx Playground

一些小小的世界。每件作品独立运行，首页只展示作品与入口。

在线体验：[play.allurx.io](https://play.allurx.io)。

- **小小海湾**：可以拨水、拖船、唤鲸、切换天气的极地小岛，支持环境声音和照片导出。需要支持 WebGPU 的浏览器与硬件加速。
- **云上城堡**：漂浮在云海中的蓝顶城堡、村落与瀑布，可以环视、缩放和暂停。需要支持 WebGL 2 的浏览器与硬件加速。

作品页的“版本与下载”通往 [GitHub Releases](https://github.com/allurx/playground/releases)。正式下载附件采用带版本号的单个 HTML，并附 SHA-256 校验清单。

## 本地运行

安装 [.node-version](.node-version) 指定的 Node.js，然后执行：

```sh
npm ci
npm run dev
```

开发预览会构建全部作品的 Web 版，并打开集合首页。它基于生成产物；修改源码后运行 `npm run build:web`，再刷新页面。进入某件作品的目录运行 `npm run dev`，会打开对应作品。

`npm run verify` 执行全仓格式、类型感知 ESLint、各工作区类型检查，以及 Web 和单文件构建。`npm run preview` 使用 Wrangler 读取正式静态资源与响应头配置。根命令和工具版本以 [package.json](package.json) 为准。

WebGPU 需要安全上下文。电脑上的 localhost 与其他设备上的局域网 HTTP 不是相同运行环境；移动设备应通过 HTTPS 验证。

## 工程结构

- `index.html`、`src/styles.css`：静态作品画廊，导航不依赖 JavaScript。
- `projects/<name>/`：独立 npm workspace，包含入口页面、`src/` 源码、Vite 配置，以及分别检查浏览器和 Node 环境的 TypeScript 配置。
- `shared/`：共用图标与基础控件样式；场景、专属素材与交互留在各作品中。
- `build/project-config.ts`：组合共享 Vite 基线、双构建和许可交付规则。
- `public/`：集合封面、[404 页面](public/404.html)、[响应头](public/_headers)与[旧下载地址跳转](public/_redirects)。
- `scripts/build.ts`：按交付类型汇集集合页与作品产物。
- `work/`：任务临时资料，不参与构建或版本控制。

作品使用原生 HTML、CSS 与严格 TypeScript，渲染能力按各自需要选择。共同 ESLint、Prettier、TypeScript 和 Vite 基线来自 `@allurx/js-config`；接入约定见 [allurx-build 的 Node 工程指南](https://github.com/allurx/allurx-build/blob/main/docs/node.md)。

### 新增作品

1. 在 `projects/<name>/` 创建 workspace，沿用已有作品的配置结构。声明自己的专用依赖，提供 `build`、`build:portable`、`type-check` 和 `dev` 命令，并在 Vite 配置中使用 `projectConfig`。
2. 共用控件引入 `shared/controls.css`；作品自行维护场景配色与特有功能。共享 SVG 在构建时内嵌，两种交付均不依赖额外的图标请求。
3. 运行根目录 `npm install` 更新工作区锁文件，在 `index.html` 添加作品入口与简短介绍，封面放入 `public/`。下载入口放在作品页，指向仓库 Releases。
4. 运行 `npm run verify`，并分别验证 Web 和单文件的实际运行。根构建、类型检查与发布打包自动遍历作品，无需逐件复制 CI 或修改聚合清单。

运行资源必须可内嵌，优先从源码导入或通过 CSS `url()` 引用；不要依赖单文件旁的散文件或远程运行资源。[单文件插件的限制](https://github.com/richardtallent/vite-plugin-singlefile#caveats)需要在新增作品时一并核对，导航链接仍可指向集合页和 Releases。

### 双构建

| 命令                     | 作品输出                                    | 根目录汇集结果                |
| ------------------------ | ------------------------------------------- | ----------------------------- |
| `npm run build:web`      | `projects/<name>/dist/web/`                 | `dist/web/<name>/` 与集合首页 |
| `npm run build:portable` | `projects/<name>/dist/portable/<name>.html` | `dist/portable/<name>.html`   |
| `npm run build`          | 两种交付                                    | 两种结果                      |

Web 版使用独立脚本、样式和资源，通过 HTTP 或 HTTPS 访问。单文件版包含运行所需的脚本、样式、图标及许可声明，可以独立保存；实际运行仍取决于浏览器、GPU 和打开方式的支持。单次构建只更新对应交付目录。

根 Web 构建以 `package.json` 的 `homepage` 为公开基址，根据生成的作品入口输出 `robots.txt` 与 `sitemap.xml`。单文件附件不进入站点部署目录，也不重复收录。

## 部署与发布

站点使用 Cloudflare Workers Static Assets，域名与 `dist/web/` 资源目录见 [wrangler.jsonc](wrangler.jsonc)。GitHub Actions 调用 allurx-build 的共享工作流，验证通过后部署同一次构建的 Web 产物；本地 `npm run deploy` 只部署已有产物。

操作与凭据要求见 [allurx-build 静态站点部署指南](https://github.com/allurx/allurx-build/blob/main/docs/cloudflare-static-site.md)。工作流固定完整 commit SHA，配置包使用精确发行版本，二者独立维护。[Renovate 配置](.github/renovate.json)继承[共享依赖策略](https://github.com/allurx/allurx-build/blob/main/docs/dependency-updates.md)。

单文件通过独立的 [Release 工作流](.github/workflows/release.yml)发布。推送稳定 SemVer 形式的 annotated `vMAJOR.MINOR.PATCH` tag 会公开发布各作品 HTML 和 `SHA256SUMS.txt`；tag 对应提交必须已被 `main` 包含。发布前应确认版本、目标提交和发布授权。

本地可以在完整构建后运行 `npm run package:release -- <tag>` 检查附件；将 `<tag>` 替换为计划发布的完整版本标签。该命令只生成 `dist/release/`，不创建 tag 或上传文件。

## 许可证

项目采用 [Apache License 2.0](LICENSE.txt)，根 `LICENSE.txt` 是唯一维护源。Web 构建交付项目许可证与实际运行依赖的第三方声明；单文件构建将相同内容完整嵌入 HTML。云上城堡包含 Three.js 的 MIT 声明。

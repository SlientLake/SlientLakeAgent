# SilentLake Control UI

当前 `ui/` 是 `SlientLake_3.0.0` 的唯一活跃前端工程。

- 主架构：`React + Vite + Tailwind CSS`
- 设计方向：字节系企业后台信息密度与卡片层次
- 活跃入口：`src/main.tsx`
- 活跃页面：`src/react/**`
- 遗留代码：`legacy/`

运行约束：

- 不再从 `legacy/` 中引用任何运行时代码
- 测试、构建、开发均只面向 React 主线
- 如需回溯旧 Lit 控制台，只能在 `legacy/` 查看

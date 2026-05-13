# 代码仓

本目录是 SilentLake 的统一代码资产导航层，用于汇总项目中可被版本控制和工程管理的主要代码入口。

当前映射：

- `apps -> ../apps`
- `assets -> ../assets`
- `extensions -> ../extensions`
- `packages -> ../packages`
- `platform -> ../platform`
- `scripts -> ../scripts`
- `skills -> ../skills`
- `src -> ../src`
- `test -> ../test`
- `ui -> ../ui`

说明：

- 本目录本身是实际存在的目录，满足工程结构要求。
- 通过软链接映射现有代码资产，而不是迁移源码，避免破坏 npm 包、GitHub 仓库和现有脚本路径。
- 若后续发生大版本目录重组，可在本目录下继续扩展分版本代码归档。

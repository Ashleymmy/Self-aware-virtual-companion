# SAVC 统一交互工作台原型（codex-test）

该目录是独立原型，不依赖主项目服务，专用于验证统一工作台交互形态。

## 功能覆盖

1. 三栏布局：
- 左栏：场景模式 + 会话列表
- 中栏：交互 / 执行 / 上下文 / 设置
- 右栏：会话概览、运行统计、渠道分布、快捷动作

2. 场景模式切换：`companion / dev / debug / plan`
3. 对话发送与结构化回复（mock）
4. 工具轨迹时间线（含失败样例）
5. 偏好设置保存（mock 内存）
6. SSE 实时推送（`/__savc/workbench/stream`）

## 启动

```bash
cd tests/codex-test
pnpm install
pnpm dev
```

访问：`http://localhost:5176/workbench/`

## 常见问题

如果报 `Port 5176 is already in use`：

```bash
lsof -tiTCP:5176 -sTCP:LISTEN | xargs -r kill
pnpm dev
```

## API 端点（mock）

- `GET /__savc/workbench/snapshot`
- `GET /__savc/workbench/stream`
- `GET /__savc/workbench/preferences`
- `POST /__savc/workbench/preferences`
- `POST /__savc/workbench/chat`
- `POST /__savc/workbench/mode`

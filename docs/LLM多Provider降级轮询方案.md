# LLM 多 Provider 降级轮询方案

> 版本: 1.1
> 日期: 2026-02-14
> 状态: 已落地（脚本可执行）
> 前置依赖: OpenClaw Gateway 已部署运行

---

## 1. 背景与目标

### 1.1 现状

当前媛媛的 LLM 调用依赖**单一 Provider**（anyrouter），配置如下：

```json
{
  "models": {
    "providers": {
      "anyrouter": {
        "baseUrl": "https://anyrouter.top",
        "api": "anthropic-messages",
        "models": ["claude-opus-4-6", "claude-sonnet-4-5-20250929"]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anyrouter/claude-opus-4-6",
        "fallbacks": ["anyrouter/claude-opus-4-6"]  // ← 与 primary 相同，无实际降级
      }
    }
  }
}
```

**问题：**

| 问题 | 影响 |
|------|------|
| `fallbacks` 与 `primary` 指向同一模型 | 降级链形同虚设，provider 宕机时无任何兜底 |
| 仅注册一个 provider | anyrouter 过载/不可用时，Telegram + Discord 全线瘫痪 |
| 无模型层级降级 | Opus 不可用时不会自动降到 Sonnet，直接报错 |
| 无异构 provider 冗余 | 单点故障风险高 |

**实际故障记录（2026-02-12）：**
- `claude-opus-4-6`：返回 `"invalid claude code request"`
- `claude-sonnet-4-5-20250929`：返回 `"当前模型负载已经达到上限"`
- 结果：Telegram 和 Discord 双渠道同时失联

### 1.2 目标

1. **消除单点故障** — 至少 2 个独立 provider，任一宕机时自动切换
2. **建立模型降级链** — Opus → Sonnet 4.5 → Sonnet 4 → Haiku，逐级降低能力但保持可用
3. **利用 OpenClaw 内置机制** — 不引入自定义代码，完全基于 `openclaw.json` 配置实现
4. **成本可控** — 所有 provider 均使用免费/已有额度的中继服务

---

## 2. Provider 盘点

### 2.1 已有 Provider

| Provider | baseUrl | API 协议 | 可用模型 | 当前状态 |
|----------|---------|----------|---------|---------|
| anyrouter | `https://anyrouter.top` | anthropic-messages | claude-opus-4-6, claude-sonnet-4-5-20250929 | 间歇性过载 |
| wzw | `https://wzw.pp.ua/v1` | anthropic-messages / openai | 见下表 | 已验证可用 |

### 2.2 wzw 可用 Claude 模型（已验证）

| 模型 ID | 等级 | 支持协议 | 后端 |
|---------|------|---------|------|
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 | anthropic, openai | vertex-ai |
| `claude-sonnet-4-5` | Sonnet 4.5 (别名) | anthropic, openai | custom |
| `claude-sonnet-4-20250514` | Sonnet 4 | anthropic, openai | vertex-ai |
| `claude-haiku-4-5-20251001` | Haiku 4.5 | anthropic, openai | aws |
| `claude-3-5-haiku-20241022` | Haiku 3.5 | anthropic, openai | vertex-ai |
| `claude-3-7-sonnet-20250219` | Sonnet 3.7 | anthropic, openai | vertex-ai |

**注意：** wzw 不提供任何 Opus 模型。Opus 级别仅 anyrouter 可用。

### 2.3 Provider 对比

| 维度 | anyrouter | wzw |
|------|-----------|-----|
| Opus 支持 | ✅ 4.6 | ❌ 无 |
| Sonnet 支持 | ✅ 4.5 | ✅ 4.5 + 4.0 + 3.7 |
| Haiku 支持 | ❌ | ✅ 4.5 + 3.5 |
| 稳定性 | 间歇性过载 | 已验证可用 |
| API 协议 | anthropic-messages | anthropic-messages / openai |
| 已有 API Key | ✅ .env.local | ✅ .env.local |

---

## 3. OpenClaw 降级机制概要

OpenClaw 内置两级降级机制（文档参考：`openclaw/docs/concepts/model-failover.md`）：

### 3.1 第一级：Auth Profile 轮转

同一 provider 内的多个认证配置（API Key / OAuth）之间轮转。适用于同一服务的多账号场景。

### 3.2 第二级：Model Fallback 链

`agents.defaults.model.fallbacks` 数组按序尝试。当 primary 模型（含其所有 auth profile）均不可用时，依次尝试 fallback 列表中的下一个模型。

**触发降级的条件：**
- 认证失败（401/403）
- 速率限制（429）
- 请求超时
- 服务器错误（5xx）

**同样会触发降级/冷却的条件：**
- 格式/验证错误（OpenClaw 当前策略视为 failover-worthy）

### 3.3 冷却退避策略

失败的 profile 进入指数退避冷却：`1min → 5min → 25min → 1h (cap)`

计费类失败（额度耗尽）退避更长：`5h → 10h → 20h → 24h (cap)`

### 3.4 会话粘性

OpenClaw 在一个会话内固定使用同一 auth profile（保持 provider 端缓存热度），仅在以下情况重置：
- 新建/重置会话
- Compaction 完成
- 当前 profile 进入冷却

---

## 4. 方案设计

### 4.1 推荐降级链

```
anyrouter/claude-opus-4-6          ← 首选：最强模型
  ↓ (失败)
anyrouter/claude-sonnet-4-5-20250929  ← 同 provider 降级：Sonnet 4.5
  ↓ (失败)
wzw/claude-sonnet-4-5-20250929     ← 跨 provider：不同后端的 Sonnet 4.5
  ↓ (失败)
wzw/claude-sonnet-4-20250514       ← 继续降级：Sonnet 4
  ↓ (失败)
wzw/claude-haiku-4-5-20251001      ← 最后兜底：Haiku 4.5（轻量但可用）
```

**设计思路：**
1. Opus 4.6 是唯一来源（anyrouter），不可替代，放最前
2. 同 provider 内先降到 Sonnet 4.5（可能只是 Opus 过载而 Sonnet 仍可用）
3. 跨 provider 到 wzw 的 Sonnet 4.5（anyrouter 整体宕机时的核心兜底）
4. wzw 内继续降级到更旧/更轻的模型
5. Haiku 作为最终兜底 — 能力下降但至少不会完全失联

### 4.2 目标配置

```jsonc
{
  "models": {
    "mode": "merge",
    "providers": {
      "anyrouter": {
        "baseUrl": "https://anyrouter.top",
        "apiKey": "${ANYROUTER_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "Claude Opus 4.6",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      },
      "wzw": {
        "baseUrl": "https://wzw.pp.ua/v1",
        "apiKey": "${WZW_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-sonnet-4-5-20250929",
            "name": "Claude Sonnet 4.5 (wzw)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-sonnet-4-20250514",
            "name": "Claude Sonnet 4 (wzw)",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "claude-haiku-4-5-20251001",
            "name": "Claude Haiku 4.5 (wzw)",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anyrouter/claude-opus-4-6",
        "fallbacks": [
          "anyrouter/claude-sonnet-4-5-20250929",
          "wzw/claude-sonnet-4-5-20250929",
          "wzw/claude-sonnet-4-20250514",
          "wzw/claude-haiku-4-5-20251001"
        ]
      },
      "models": {
        "anyrouter/claude-opus-4-6": { "alias": "opus" },
        "anyrouter/claude-sonnet-4-5-20250929": { "alias": "sonnet" },
        "wzw/claude-sonnet-4-5-20250929": { "alias": "wzw-sonnet" },
        "wzw/claude-sonnet-4-20250514": {},
        "wzw/claude-haiku-4-5-20251001": { "alias": "haiku" }
      }
    }
  }
}
```

### 4.3 环境变量

无需新增。复用现有 `.env.local` 中已有的 key：

| 变量 | 用途 |
|------|------|
| `ANYROUTER_API_KEY` | anyrouter provider（已有） |
| `WZW_API_KEY` | wzw provider（建议独立于 OPENAI_API_KEY） |

---

## 5. 降级场景分析

### 场景 A：anyrouter Opus 过载，Sonnet 正常

```
用户消息 → anyrouter/opus (超时)
         → anyrouter/sonnet ✅ 成功回复
```
**体验影响：** 轻微降级，回复质量略降，用户几乎无感。

### 场景 B：anyrouter 整体宕机

```
用户消息 → anyrouter/opus (超时)
         → anyrouter/sonnet (超时)
         → wzw/sonnet-4-5 ✅ 成功回复
```
**体验影响：** 跨 provider 切换，回复质量与 anyrouter/sonnet 同级，延迟增加约 1-2 秒（额外重试耗时）。

### 场景 C：anyrouter 宕机 + wzw Sonnet 4.5 限速

```
用户消息 → anyrouter/opus (超时)
         → anyrouter/sonnet (超时)
         → wzw/sonnet-4-5 (429)
         → wzw/sonnet-4 ✅ 成功回复
```
**体验影响：** 使用稍旧的 Sonnet 4，能力下降但仍可正常对话。

### 场景 D：全部 Sonnet 不可用（极端情况）

```
用户消息 → anyrouter/opus → anyrouter/sonnet → wzw/sonnet-4-5 → wzw/sonnet-4 (全部失败)
         → wzw/haiku-4-5 ✅ 成功回复
```
**体验影响：** Haiku 模型能力有限，复杂推理和长文生成质量下降明显，但基本对话和记忆检索仍可用。媛媛人格一致性由 system prompt 保障，不受模型切换影响。

### 场景 E：所有 provider 全部不可用

```
全部 5 个模型均失败 → Agent 报错
```
**体验影响：** 完全不可用。此为极端情况，需人工介入（排查网络或添加新 provider）。

---

## 6. 实施步骤

### Step 1：备份当前配置

```bash
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak
```

### Step 2：验证 wzw 连通性

```bash
# 测试 wzw anthropic-messages 协议
curl -s https://wzw.pp.ua/v1/messages \
  -H "x-api-key: $WZW_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "ping"}]
  }'
```

### Step 3：应用仓库脚本补丁

```bash
bash scripts/llm_enable_failover.sh
```

关键变更：
1. `models.providers` 新增 `wzw` provider（保留既有其它配置）
2. `agents.defaults.model.fallbacks` 替换为 5 级降级链
3. `agents.defaults.models` 注册所有可切换模型别名

### Step 4：重启 Gateway

```bash
openclaw restart
```

### Step 5：验证降级链

```bash
# 查看当前模型配置
openclaw models status

# 查看降级链
openclaw models fallbacks list
```

### Step 6：手动降级测试（可选）

通过 `/model` 命令手动切换到各模型，验证每个都能正常回复：

```
/model wzw/claude-sonnet-4-5-20250929
/model wzw/claude-sonnet-4-20250514
/model wzw/claude-haiku-4-5-20251001
```

---

## 7. 后续扩展

### 7.1 新增 Provider

未来如果获取到其他中继服务（如 OpenRouter、自建代理），只需在 `models.providers` 中添加新 provider 并在 fallbacks 链中插入合适位置即可。

### 7.2 Per-Agent 差异化模型

OpenClaw 支持按 Agent 覆盖模型配置。未来可以为不同 Agent 分配不同级别的模型：

```jsonc
{
  "agents": {
    "list": [
      { "id": "companion", "model": { "primary": "anyrouter/claude-opus-4-6" } },
      { "id": "tech-helper", "model": { "primary": "wzw/claude-sonnet-4-5-20250929" } },
      { "id": "memory-manager", "model": "wzw/claude-haiku-4-5-20251001" }
    ]
  }
}
```

### 7.3 Auth Profile 多 Key 轮转

如果同一 provider 获得多个 API Key，可以通过 auth profile 配置实现同 provider 内的 key 轮转，进一步提高单 provider 的可用性。

### 7.4 健康监控（与 savc-ui 集成）

在管理界面的仪表盘中展示各 provider 的实时状态，包括：
- 各模型的最近调用成功率
- 当前降级状态（正在使用哪一级模型）
- 冷却中的 provider/profile

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| wzw baseUrl 格式不兼容 | 中 | 降级链断裂 | Step 2 提前验证协议兼容性 |
| wzw API Key 额度耗尽 | 低 | 失去备用 provider | 监控用量，及时续费/更换 |
| 频繁降级导致体验波动 | 中 | 用户感知到回复质量不稳定 | 人格 prompt 保持一致，质量差异主要在推理深度 |
| Haiku 兜底能力不足 | 中 | 复杂对话质量下降明显 | 仅作最终兜底，正常情况下不会触及 |
| 所有 provider 同时宕机 | 极低 | 完全不可用 | 保持添加新 provider 的能力，收到告警后人工介入 |

---

## 9. 总结

| 维度 | 当前 | 方案实施后 |
|------|------|-----------|
| Provider 数量 | 1（anyrouter） | 2（anyrouter + wzw） |
| 降级链深度 | 0（无效） | 4 级（5 个模型） |
| 最高可用模型 | Opus 4.6 | Opus 4.6（不变） |
| 最低兜底模型 | 无 | Haiku 4.5 |
| 配置变更量 | — | 仅修改 `openclaw.json`，无代码改动 |
| 回滚方式 | — | 恢复 `openclaw.json.bak` + `openclaw restart` |

# 统一身份认证服务（NestJS）

基于 NestJS 的统一身份认证服务，支持多种认证策略、策略模式运行时切换、Redis 会话存储与框架级权限校验。

## 特性

- **多认证策略**：内置 JWT、OAuth2.0（授权码模式）、LDAP 三种策略。
- **策略模式 + 运行时切换**：所有策略实现统一的 `IAuthStrategy` 接口，通过 `AuthStrategyRegistry` 注册；登录时以请求体 `strategy` 字段在运行时动态选择，未传则使用默认策略。
- **统一接口**：`login` / `logout` / `refresh` 屏蔽策略差异，令牌由 `TokenService` 统一签发（access + refresh，含刷新令牌轮换）。
- **Redis 会话存储**：会话状态存于 Redis，支持 TTL 过期与登出即时失效；Redis 不可用时自动降级为内存存储（仅供开发/演示）。
- **框架级权限校验**：`AuthGuard`（认证）+ `PermissionGuard`（`@Roles` / `@Permissions`）+ `AuthMiddleware`（令牌预解析与日志），仅框架层，不含具体业务。
- **Swagger 文档**：启动后访问 `/api-docs`。
- **Node 原生测试脚本**：`test/run-tests.js`，无第三方测试框架依赖。

## 目录结构

```
src/
├── config/configuration.ts        # 统一配置加载
├── redis/                          # Redis 全局模块（含内存降级）
├── auth/
│   ├── interfaces/                 # IAuthStrategy、用户/会话/令牌类型
│   ├── strategies/                 # jwt / oauth2 / ldap 三种策略实现
│   ├── registry/                   # 策略注册中心（运行时切换核心）
│   ├── services/                   # auth / session / token 服务
│   ├── guards/                     # AuthGuard、PermissionGuard
│   ├── decorators/                 # @Public @Roles @Permissions @CurrentUser
│   ├── middleware/                 # AuthMiddleware
│   ├── dto/                        # 请求 DTO 与响应 VO
│   ├── auth.controller.ts          # 统一登录/登出/刷新等接口
│   └── auth.module.ts
├── app.module.ts
└── main.ts                         # 启动 + Swagger
test/
├── http-client.js                  # 原生 http 封装
└── run-tests.js                    # 接口集成测试
```

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境变量（可按需修改）
cp .env.example .env

# 开发模式启动
npm run start:dev
# 或生产构建后启动
npm run build && npm run start:prod
```

启动后：
- API 服务：`http://localhost:3000`
- Swagger 文档：`http://localhost:3000/api-docs`

> 若 3000 端口被占用，可用 `PORT=3100 npm run start:prod` 指定端口。

## 运行测试

先启动服务，然后在另一个终端执行：

```bash
npm run test:api
# 指定端口：BASE_URL=http://localhost:3100 node test/run-tests.js
```

## 主要接口

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | `/auth/login` | 统一登录（body.strategy 切换策略） | 公开 |
| POST | `/auth/logout` | 登出，销毁会话 | Bearer |
| POST | `/auth/refresh` | 刷新令牌（轮换） | 公开（需 refreshToken） |
| GET | `/auth/strategies` | 查询可用策略 | 公开 |
| GET | `/auth/oauth2/authorize-url` | 获取 OAuth2 授权跳转地址 | 公开 |
| GET | `/auth/profile` | 当前用户信息 | Bearer |
| GET | `/auth/admin-only` | 角色守卫演示（需 admin） | Bearer + 角色 |
| GET | `/auth/need-permission` | 权限守卫演示（需 user:write） | Bearer + 权限 |

### 内置演示账号（JWT 策略）

| 用户名 | 密码 | 角色 | 权限 |
| --- | --- | --- | --- |
| admin | admin123 | admin | user:read, user:write, system:manage |
| user | user123 | user | user:read |

> OAuth2 与 LDAP 在未配置真实服务端时以演示模式返回模拟用户；生产环境请在 `.env` 中配置真实端点。

## 登录示例

```bash
# JWT 策略登录
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"jwt","username":"admin","password":"admin123"}'

# 运行时切换到 LDAP 策略
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"ldap","username":"jdoe","password":"secret"}'
```

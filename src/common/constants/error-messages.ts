/**
 * 统一错误消息枚举
 *
 * 将项目中所有面向客户端的错误提示集中管理，避免硬编码字符串散落在各文件中。
 * 好处：
 *  1. 统一文案风格，便于维护与国际化（i18n）改造；
 *  2. 测试可直接断言枚举值，降低文案变更导致测试脆弱的风险；
 *  3. 动态内容使用 {0}/{1} 占位符，配合 formatErrorMessage 填充。
 *
 * 命名规范：按业务域分组前缀
 *  - AUTH_*      认证流程（登录/登出/刷新/token 校验）
 *  - GUARD_*     守卫（鉴权/RBAC）
 *  - JWT_*       JWT 本地策略
 *  - OAUTH2_*    OAuth2 策略
 *  - LDAP_*      LDAP 策略
 *  - STRATEGY_*  策略上下文
 */
export enum ErrorMessage {
  // ============ 通用 ============
  INTERNAL_ERROR = '服务器内部错误',

  // ============ 守卫层 ============
  /** 未携带 Authorization 头或 token */
  GUARD_NO_TOKEN = '未提供认证令牌，请先登录',
  /** RolesGuard 无法从请求中读取到用户角色 */
  GUARD_NO_ROLE_INFO = '无法获取用户角色信息',
  /** 权限不足（参数：所需角色列表字符串） */
  GUARD_FORBIDDEN_ROLES = '权限不足，需要以下角色之一: {0}',

  // ============ 认证流程（AuthService） ============
  /** access token 无效或过期 */
  AUTH_INVALID_ACCESS_TOKEN = 'access token 无效或已过期',
  /** refresh token 无效或过期 */
  AUTH_INVALID_REFRESH_TOKEN = 'refresh token 无效或已过期',
  /** 使用了错误类型的 token 调接口 */
  AUTH_WRONG_TOKEN_TYPE = '令牌类型错误',
  /** 应使用 refresh token 调刷新接口 */
  AUTH_USE_REFRESH_TOKEN = '请使用 refresh token 刷新',
  /** Redis 中会话不存在或已过期 */
  AUTH_SESSION_EXPIRED = '会话已失效，请重新登录',
  /** refresh token 与服务端存储摘要不匹配（可能被盗用） */
  AUTH_REFRESH_TOKEN_MISMATCH = 'refresh token 不匹配，会话已失效',

  // ============ JWT 本地策略 ============
  /** JWT 登录缺少用户名或密码 */
  JWT_CREDENTIALS_REQUIRED = 'JWT 认证需要提供 username 和 password',
  /** 用户名或密码错误（统一提示，避免用户枚举） */
  JWT_INVALID_CREDENTIALS = '用户名或密码错误',

  // ============ OAuth2 策略 ============
  /** OAuth2 配置项缺失（参数：配置键名） */
  OAUTH2_CONFIG_MISSING = 'OAuth2 配置缺失: {0}，请检查 .env 中的相关环境变量',
  /** 登录时未携带授权码 code */
  OAUTH2_CODE_REQUIRED = 'OAuth2 认证需要提供授权码 code',
  /** 无法连接 OAuth2 授权服务器 */
  OAUTH2_TOKEN_FETCH_FAILED = '无法连接 OAuth2 授权服务器，请检查网络或配置',
  /** 授权码换取令牌失败（参数：上游错误描述） */
  OAUTH2_TOKEN_EXCHANGE_FAILED = 'OAuth2 授权码换取令牌失败: {0}',
  /** 获取用户信息失败 */
  OAUTH2_USERINFO_FAILED = '获取 OAuth2 用户信息失败',
  /** 用户信息缺少必要字段 */
  OAUTH2_USERINFO_MISSING_FIELDS = 'OAuth2 用户信息缺少必要字段（id/username）',

  // ============ LDAP 策略 ============
  /** LDAP 配置项缺失（参数：配置键名） */
  LDAP_CONFIG_MISSING = 'LDAP 配置缺失: {0}，请检查 .env 中的相关环境变量',
  /** LDAP 登录缺少用户名或密码 */
  LDAP_CREDENTIALS_REQUIRED = 'LDAP 认证需要提供 username 和 password',
  /** 无法连接 LDAP 服务器（参数：底层错误信息） */
  LDAP_CONNECT_FAILED = '无法连接 LDAP 服务器: {0}',
  /** 管理员账号绑定失败（参数：底层错误信息） */
  LDAP_ADMIN_BIND_FAILED = 'LDAP 管理员绑定失败: {0}',
  /** 搜索用户失败（参数：底层错误信息） */
  LDAP_SEARCH_FAILED = 'LDAP 搜索失败: {0}',
  /** 搜索过程出错（参数：底层错误信息） */
  LDAP_SEARCH_ERROR = 'LDAP 搜索错误: {0}',
  /** 搜索不到用户 */
  LDAP_USER_NOT_FOUND = 'LDAP 用户不存在',
  /** 用户条目缺少 DN，无法做用户绑定验证 */
  LDAP_ENTRY_NO_DN = 'LDAP 用户条目缺少 DN',
  /** 用户 DN 绑定失败（用户名或密码错误） */
  LDAP_INVALID_CREDENTIALS = 'LDAP 用户名或密码错误',

  // ============ 策略上下文 ============
  /** 切换到未注册的策略（参数：策略类型） */
  STRATEGY_UNSUPPORTED = '不支持的认证策略: {0}',
  /** 执行认证时找不到策略（参数：策略类型） */
  STRATEGY_NOT_FOUND = '未找到认证策略: {0}，请检查系统配置',
  /** 代码层获取策略实例失败（参数：策略类型） */
  STRATEGY_INSTANCE_NOT_FOUND = '未找到认证策略: {0}',
}

/**
 * 填充错误消息模板中的占位符
 *
 * 模板使用 {0}、{1} ... 作为占位符，按顺序替换为传入的参数。
 * 例如：formatErrorMessage(ErrorMessage.GUARD_FORBIDDEN_ROLES, 'admin,user')
 *
 * @param template 消息模板（通常取自 ErrorMessage 枚举）
 * @param args 依次填充占位符的参数
 */
export function formatErrorMessage(
  template: string,
  ...args: Array<string | number | undefined | null>
): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const i = Number(index);
    const value = args[i];
    return value === undefined || value === null ? '' : String(value);
  });
}

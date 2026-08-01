/**
 * 全局异常过滤器
 *
 * 统一捕获应用中抛出的所有异常（HttpException 及其子类、未知异常），
 * 并转换为结构一致的 JSON 响应，便于客户端统一处理错误。
 *
 * 响应结构: { statusCode, message, error, timestamp, path }
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 判断是否为 HttpException，分别提取状态码与错误信息
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = '服务器内部错误';
    let error = 'Internal Server Error';

    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        message = r.message ?? message;
        error = r.error ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // 非 HTTP 异常（如 LDAP/Redis 连接错误）记录详细日志，但不对外暴露堆栈
      message = exception.message;
      this.logger.error(
        `未处理异常: ${exception.message}`,
        exception.stack,
      );
    }

    // 统一错误响应格式
    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

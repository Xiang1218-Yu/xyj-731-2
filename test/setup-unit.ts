/**
 * Jest 单元测试全局初始化
 *
 * 加载 reflect-metadata  polyfill，class-validator/class-transformer 依赖它。
 * NestJS 应用在 main.ts 中已引入，但独立运行的单元测试需要在此显式加载。
 */
import 'reflect-metadata';

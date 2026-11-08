import { expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';

import { AUTH_FILE, env } from './env';

/**
 * Authenticated client for the REST API, using the cookies saved by the setup project.
 * Use it to arrange data quickly and to assert what the UI actually persisted.
 */
export class ApiClient {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(): Promise<ApiClient> {
    const ctx = await request.newContext({ baseURL: env.apiUrl, storageState: AUTH_FILE });
    return new ApiClient(ctx);
  }

  async get<T = any>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return this.json(await this.ctx.get(path, { params }));
  }

  async post<T = any>(path: string, data?: unknown): Promise<T> {
    return this.json(await this.ctx.post(path, { data }));
  }

  async patch<T = any>(path: string, data?: unknown): Promise<T> {
    return this.json(await this.ctx.patch(path, { data }));
  }

  async put<T = any>(path: string, data?: unknown): Promise<T> {
    return this.json(await this.ctx.put(path, { data }));
  }

  /** Raw response for tests that assert on failures (4xx). */
  raw(): APIRequestContext {
    return this.ctx;
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async json<T>(res: APIResponse): Promise<T> {
    expect(res.ok(), `${res.url()} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

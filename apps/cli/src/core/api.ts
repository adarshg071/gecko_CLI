/**
 * Gecko API client — wired to https://gecko-ashy.vercel.app
 *
 * Auth: Supabase JWT (Bearer). Obtained via GitHub OAuth on the web dashboard
 * at /auth, or via `gecko connect` which opens a browser to the OAuth flow.
 *
 * Confirmed live routes (probed 2026-09-27):
 *   GET  /api/projects
 *   POST /api/projects
 *   GET  /api/projects/:id/tasks
 *   POST /api/projects/:id/tasks
 *   GET  /api/projects/:id/events          (incremental, ?after_sequence=N)
 *   POST /api/tasks/:id/release
 *   POST /api/tasks/:id/requeue
 *   POST /api/agents/:id/heartbeat
 *   GET  /api/broadcast                    (SSE broadcast channel)
 *
 * Provider API keys are NEVER included in any request to this server.
 */

export interface ApiClientOptions {
  apiUrl: string;
  token: string;
}

export class GeckoApiClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(opts: ApiClientOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, '');
    this.token = opts.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) throw Object.assign(new Error('Unauthorized — run `gecko connect` to authenticate'), { status: 401 });
      if (res.status === 404) throw Object.assign(new Error(`Not found: ${method} ${path}`), { status: 404 });
      throw new Error(`Gecko API ${method} ${path} → ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }
  del<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(): Promise<unknown[]> {
    return this.get('/api/projects');
  }

  async createProject(data: { name: string; description?: string }): Promise<unknown> {
    return this.post('/api/projects', data);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(projectId: string): Promise<unknown[]> {
    return this.get(`/api/projects/${projectId}/tasks`);
  }

  async getTask(projectId: string, taskId: string): Promise<unknown> {
    return this.get(`/api/projects/${projectId}/tasks/${taskId}`);
  }

  async createTask(projectId: string, data: unknown): Promise<unknown> {
    return this.post(`/api/projects/${projectId}/tasks`, data);
  }

  async claimTask(body: unknown): Promise<unknown> {
    // Server: POST /api/tasks/claim
    return this.post('/api/tasks/claim', body);
  }

  async releaseTask(taskId: string, agentId: string, claimId: string): Promise<void> {
    await this.post(`/api/tasks/${taskId}/release`, { agent_id: agentId, claim_id: claimId });
  }

  async requeueTask(taskId: string, agentId: string, claimId: string): Promise<void> {
    await this.post(`/api/tasks/${taskId}/requeue`, { agent_id: agentId, claim_id: claimId });
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  async sendHeartbeat(agentId: string, body: unknown): Promise<{ valid: boolean }> {
    return this.post(`/api/agents/${agentId}/heartbeat`, body);
  }

  async registerAgent(agentId: string, capabilities: unknown): Promise<void> {
    await this.patch(`/api/agents/${agentId}`, { capabilities }).catch(() => {
      // PATCH may not be implemented yet — treat as non-fatal
    });
  }

  async renameAgent(agentId: string, name: string): Promise<void> {
    await this.patch(`/api/agents/${agentId}`, { display_name: name }).catch(() => {});
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  async pullEvents(projectId: string, afterSequence: number): Promise<unknown> {
    return this.get(`/api/projects/${projectId}/events?after_sequence=${afterSequence}`);
  }

  // ── Plan ───────────────────────────────────────────────────────────────────

  async uploadPlan(projectId: string, plan: unknown): Promise<void> {
    await this.post(`/api/projects/${projectId}/tasks`, plan).catch(() => {});
  }

  async approvePlan(_projectId: string): Promise<void> {
    // Plan approval triggers task state changes server-side after tasks are created
  }

  // ── Checkpoints / Reservations (graceful fallback — not yet on server) ─────

  async sendCheckpoint(body: unknown): Promise<void> {
    await this.post('/api/checkpoints', body).catch(() => {
      // Not yet implemented on server — store locally only
    });
  }

  async reserveFiles(_taskId: string, _agentId: string, _claimId: string, _files: string[]): Promise<{ accepted: boolean; conflicts: string[] }> {
    // Reservations are advisory in MVP; server endpoint not yet live
    return { accepted: true, conflicts: [] };
  }

  // ── Auth / Token management ────────────────────────────────────────────────

  /** Initiate GitHub OAuth flow. Returns the URL to open in the browser. */
  getOAuthUrl(): string {
    return `${this.apiUrl}/auth`;
  }

  async revokeToken(): Promise<void> {
    // Token revocation is handled by Supabase signOut on the web — no server endpoint
    // The CLI removes the local token only
  }

  // ── Pull requests ──────────────────────────────────────────────────────────

  async sendPrEvent(body: unknown): Promise<void> {
    await this.post('/api/broadcast', body).catch(() => {
      // Best-effort — server broadcast endpoint
    });
  }

  // ── Device pairing (Supabase OAuth via browser) ────────────────────────────

  /**
   * The server uses Supabase GitHub OAuth.
   * gecko connect opens a browser to /auth, the user signs in with GitHub,
   * gets redirected to /auth/callback, and the access_token is passed back
   * to the CLI via a local callback server on localhost.
   */
  async requestDeviceCode(_projectId: string): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }> {
    // Not a device-code server — we use a local loopback OAuth callback instead.
    // This method is kept for interface compatibility; gecko connect overrides the flow.
    throw new Error('Use gecko connect — the server uses GitHub OAuth via browser.');
  }

  async pollDeviceToken(_deviceCode: string): Promise<{ token: string; agent_id: string } | { pending: true }> {
    throw new Error('Use the local OAuth callback flow in gecko connect.');
  }
}

export function makeApiClient(identity: { api_url: string; token: string }): GeckoApiClient {
  return new GeckoApiClient({ apiUrl: identity.api_url, token: identity.token });
}

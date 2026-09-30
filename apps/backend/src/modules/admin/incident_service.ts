import {
  OperationalErrorCategory,
  OperationalIncident,
  OperationalIncidentSeverity,
  IncidentUpdate,
} from './types';

export class OperationalIncidentService {
  private static instance: OperationalIncidentService;
  private incidents: OperationalIncident[] = [];
  private readonly maxIncidents = 200;
  private readonly dedupWindowMs = 15 * 60 * 1000; // 15 minutes deduplication window

  private constructor() {}

  public static getInstance(): OperationalIncidentService {
    if (!OperationalIncidentService.instance) {
      OperationalIncidentService.instance = new OperationalIncidentService();
    }
    return OperationalIncidentService.instance;
  }

  /**
   * Strip sensitive tokens, bearer headers, passwords, and long hashes from messages
   */
  public sanitizeMessage(msg: string): string {
    if (!msg || typeof msg !== 'string') return 'Unknown operational error';
    return msg
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(api[_-]?key|secret|token|password|auth|authorization)=([^&\s]+)/gi, '$1=[REDACTED]')
      .replace(/[a-f0-9]{32,}/gi, '[REDACTED_HASH]')
      .slice(0, 300);
  }

  /**
   * Record a server-observed operational incident with deduplication
   */
  public record(params: {
    category: OperationalErrorCategory;
    route: string;
    severity?: OperationalIncidentSeverity;
    business_id?: string | null;
    business_name?: string | null;
    message: string;
  }): OperationalIncident {
    const now = new Date();
    const nowIso = now.toISOString();
    const sanitizedMsg = this.sanitizeMessage(params.message);
    const severity: OperationalIncidentSeverity = params.severity || 'error';
    const bizId = params.business_id || null;

    // Check for duplicate incident within dedup window
    const dedupCutoff = new Date(now.getTime() - this.dedupWindowMs);
    const existing = this.incidents.find(inc =>
      inc.category === params.category &&
      inc.route === params.route &&
      inc.message === sanitizedMsg &&
      inc.business_id === bizId &&
      new Date(inc.timestamp) >= dedupCutoff
    );

    if (existing) {
      existing.count += 1;
      existing.timestamp = nowIso;
      // Escalate severity only to higher levels (info < warning < error < critical)
      const severityOrder: OperationalIncidentSeverity[] = ['info', 'warning', 'error', 'critical'];
      if (severityOrder.indexOf(severity) > severityOrder.indexOf(existing.severity)) {
        existing.severity = severity;
      }
      return existing;
    }

    const newIncident: OperationalIncident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: nowIso,
      first_seen: nowIso,
      category: params.category,
      route: params.route,
      severity,
      business_id: bizId,
      business_name: params.business_name || null,
      message: sanitizedMsg,
      count: 1,
      status: 'active',
      admin_note: null,
      resolved_at: null,
    };

    this.incidents.unshift(newIncident);

    // Keep ring buffer capped
    if (this.incidents.length > this.maxIncidents) {
      this.incidents = this.incidents.slice(0, this.maxIncidents);
    }

    return newIncident;
  }

  /**
   * Retrieve recent incidents with optional filtering
   */
  public getRecentIncidents(filter?: {
    category?: OperationalErrorCategory;
    severity?: OperationalIncidentSeverity;
    business_id?: string;
    limit?: number;
    since?: Date;
  }): OperationalIncident[] {
    let result = [...this.incidents];

    if (filter?.since) {
      const sinceTime = filter.since.getTime();
      result = result.filter(inc => new Date(inc.timestamp).getTime() >= sinceTime);
    }

    if (filter?.category) {
      result = result.filter(inc => inc.category === filter.category);
    }

    if (filter?.severity) {
      result = result.filter(inc => inc.severity === filter.severity);
    }

    if (filter?.business_id) {
      result = result.filter(inc => inc.business_id === filter.business_id);
    }

    const limit = filter?.limit || 50;
    return result.slice(0, limit);
  }

  /**
   * Count incidents by operational category
   */
  public getIncidentCounts(since?: Date): {
    total: number;
    ai_failures: number;
    authorization_failures: number;
    customer_flow_failures: number;
    qr_failures: number;
    database_failures: number;
  } {
    const list = this.getRecentIncidents({ since, limit: this.maxIncidents });
    let total = 0;
    let ai_failures = 0;
    let authorization_failures = 0;
    let customer_flow_failures = 0;
    let qr_failures = 0;
    let database_failures = 0;

    for (const inc of list) {
      total += inc.count;
      if (inc.category === 'AI') ai_failures += inc.count;
      else if (inc.category === 'AUTH' || inc.category === 'AUTHORIZATION') authorization_failures += inc.count;
      else if (inc.category === 'CUSTOMER_FLOW') customer_flow_failures += inc.count;
      else if (inc.category === 'QR') qr_failures += inc.count;
      else if (inc.category === 'DATABASE') database_failures += inc.count;
    }

    return {
      total,
      ai_failures,
      authorization_failures,
      customer_flow_failures,
      qr_failures,
      database_failures,
    };
  }

  /**
   * Update incident status and/or admin note (admin only)
   */
  public updateIncident(id: string, update: IncidentUpdate): OperationalIncident | null {
    const incident = this.incidents.find(inc => inc.id === id);
    if (!incident) return null;

    if (update.status !== undefined) {
      incident.status = update.status;
      if (update.status === 'resolved') {
        incident.resolved_at = new Date().toISOString();
      }
    }
    if (update.admin_note !== undefined) {
      // Sanitize note to strip secrets
      incident.admin_note = update.admin_note
        ? this.sanitizeMessage(update.admin_note)
        : null;
    }

    return incident;
  }

  /**
   * Get a single incident by ID
   */
  public getIncident(id: string): OperationalIncident | null {
    return this.incidents.find(inc => inc.id === id) || null;
  }

  /**
   * Reset buffer (used for automated tests)
   */
  public clear(): void {
    this.incidents = [];
  }
}

export const operationalIncidents = OperationalIncidentService.getInstance();

import { GeneratedWorkoutPlan } from "@/types";

// Row shapes as stored by the SQLite driver. These are driver-level types; the
// application talks to the Repository interface instead.
export interface DbMember {
  id: string;
  member_code: string;
  full_name: string;
  email: string;
  pin_code: string;
  tier_name: string;
  has_ai_access: number; // 0 or 1
  subscription_status: string;
  expires_at: string;
  created_at: string;
}

export interface DbWorkoutPlan {
  id: string;
  member_id: string;
  split_name: string;
  split_type: string;
  days_per_week: number;
  session_duration: number;
  plan_json: string;
  created_at: string;
}

export interface DbLeadInquiry {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  goal: string | null;
  preferred_plan: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export type DbAdminMember = Omit<DbMember, "pin_code">;

// Gallery photos are stored as BLOBs in the tenant database, so backups and
// tenant isolation cover them without a separate file store.
export interface DbMedia {
  id: string;
  filename: string;
  mime: string;
  size: number;
  alt: string;
  created_at: string;
}

export interface MediaInput {
  filename: string;
  mime: string;
  size: number;
  alt: string;
  data: Uint8Array;
}

export interface MediaWithData extends DbMedia {
  data: Uint8Array;
}

// Gym occupancy: one row per visit, open while checked_out_at is null.
export interface DbVisit {
  id: string;
  member_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  last_activity_at: string | null;
  created_at: string;
}

// Minimal member row used to decide whether a subscription gates occupancy.
export interface MemberAccess {
  id: string;
  member_code: string;
  full_name: string;
  subscription_status: string;
  expires_at: string;
  has_ai_access: number;
}

// Server-side member session. `session_id_hash` is the SHA-256 of the random
// session id carried inside the signed cookie; the raw id is never stored, so a
// database leak cannot be replayed as a live session.
export interface DbMemberSession {
  session_id_hash: string;
  member_id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
  ip: string | null;
  user_agent: string | null;
}

export interface MemberSessionInput {
  sessionIdHash: string;
  memberId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ip?: string | null;
  userAgent?: string | null;
}

export interface InsideMember {
  member_id: string;
  member_code: string;
  full_name: string;
  checked_in_at: string;
}

export interface VisitWithMember extends DbVisit {
  member_code: string;
  full_name: string;
}

export type StaffRole = "admin" | "trainer";

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  permissions: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface DbStaffAccount extends StaffAccount {
  password_hash: string;
}

export interface StaffInput {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
  permissions?: string[];
}

export interface StaffUpdate {
  name?: string;
  email?: string;
  role?: StaffRole;
  password?: string;
  permissions?: string[];
  active?: boolean;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  actor_role: string;
  actor_legacy: boolean;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface AuditInput {
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  actorRole: string;
  actorLegacy?: boolean;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditFilters {
  limit?: number;
  offset?: number;
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface MemberNotification {
  id: string;
  member_id: string;
  type: string;
  title: string;
  body: string;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

export interface MemberNotificationInput {
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
}

export interface AccessEvent {
  id: string;
  member_id: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AccessEventWithMember extends AccessEvent {
  member_code: string;
  full_name: string;
}

export interface AccessAlert {
  member_id: string;
  member_code: string;
  full_name: string;
  event_count: number;
  last_event_at: string;
  event_types: string[];
}

// The authenticated member shape returned to the app (mirrors MemberUser on the
// client, minus anything the client does not need).
export interface MemberSession {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  joinedAt: string;
  subscription: {
    tier: "standard" | "all_inclusive_ai";
    tierName: string;
    status: "active" | "expired";
    expiresAt: string;
    autoRenew: boolean;
    hasAIAccess: boolean;
  };
  savedPlans: GeneratedWorkoutPlan[];
}

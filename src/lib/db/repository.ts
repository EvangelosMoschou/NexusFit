import { GeneratedWorkoutPlan, GymConfig } from "@/types";
import {
  DbAdminMember,
  DbLeadInquiry,
  DbMedia,
  DbVisit,
  InsideMember,
  MediaInput,
  MediaWithData,
  AccessAlert,
  AccessEvent,
  AccessEventWithMember,
  AuditFilters,
  AuditInput,
  AuditPage,
  MemberAccess,
  MemberNotification,
  MemberNotificationInput,
  MemberSession,
  StaffAccount,
  StaffInput,
  StaffUpdate,
  VisitWithMember,
  DbStaffAccount,
} from "./types";

export type LeadStatus = "pending" | "contacted" | "registered";

export interface LeadInput {
  fullName: string;
  email: string;
  phone?: string;
  goal?: string;
  preferredPlan?: string;
  notes?: string;
}

export interface MemberInput {
  id?: string;
  memberCode: string;
  fullName: string;
  email: string;
  pinCode: string;
  tierName: string;
  hasAIAccess: boolean;
  subscriptionStatus: string;
  expiresAt: string;
}

export interface MemberExport {
  member: DbAdminMember | null;
  plans: GeneratedWorkoutPlan[];
}

// The single seam between the application and its storage.
//
// Every method is async so that swapping the sync `node:sqlite` driver for an
// async one (e.g. Postgres) means writing a new implementation of this interface
// only — no route or component changes.
export interface Repository {
  // Gym configuration (white-label content)
  getGymConfig(): Promise<GymConfig>;
  updateGymConfig(config: Partial<GymConfig>): Promise<boolean>;

  // Media library (gallery photos)
  listMedia(): Promise<DbMedia[]>;
  getMedia(id: string): Promise<MediaWithData | null>;
  saveMedia(input: MediaInput): Promise<DbMedia | null>;
  deleteMedia(id: string): Promise<boolean>;

  // Gym occupancy (check-in / check-out)
  getOccupancy(): Promise<{ inside: number; capacity: number }>;
  getInsideMembers(): Promise<InsideMember[]>;
  getRecentVisits(limit?: number): Promise<VisitWithMember[]>;
  getVisitIntervalsSince(
    since: string
  ): Promise<Array<{ checked_in_at: string; checked_out_at: string | null }>>;
  getMemberVisits(memberId: string, limit?: number): Promise<DbVisit[]>;
  getMemberVisitCount(memberId: string, days?: number): Promise<number>;
  getMemberVisitStatus(memberId: string): Promise<{ inside: boolean; since: string | null }>;
  getReentryCooldownSeconds(memberId: string): Promise<number>;
  getLastCheckoutAt(memberId: string): Promise<string | null>;
  recordAccessEvent(
    memberId: string,
    eventType: string,
    details?: Record<string, unknown>
  ): Promise<boolean>;
  countAccessEvents(memberId: string, days?: number): Promise<number>;
  listMemberAccessEvents(memberId: string, limit?: number): Promise<AccessEvent[]>;
  listAccessAlerts(threshold?: number, days?: number): Promise<AccessAlert[]>;
  listRecentAccessEvents(limit?: number): Promise<AccessEventWithMember[]>;
  purgeAccessEvents(days?: number): Promise<number>;
  touchMemberVisit(memberId: string): Promise<boolean>;
  checkInMember(memberId: string): Promise<{
    status: "in" | "already_in" | "unknown";
    visit?: DbVisit;
  }>;
  checkOutMember(memberId: string): Promise<{ status: "out" | "not_in"; visit?: DbVisit }>;
  closeStaleVisits(): Promise<number>;
  closeIdleVisits(): Promise<number>;

  // Members
  listMembers(): Promise<DbAdminMember[]>;
  saveMember(member: MemberInput): Promise<boolean>;
  deleteMember(id: string): Promise<boolean>;
  // GDPR erasure: the member, their plans, and any leads sharing their email.
  eraseMember(id: string): Promise<boolean>;
  exportMember(id: string): Promise<MemberExport>;
  getMemberAccess(id: string): Promise<MemberAccess | null>;
  authenticateMember(identifier: string, pin: string): Promise<MemberSession | null>;

  // In-app member notifications
  ensureMemberNotification(
    memberId: string,
    input: MemberNotificationInput
  ): Promise<boolean>;
  listMemberNotifications(
    memberId: string,
    limit?: number
  ): Promise<MemberNotification[]>;
  getUnreadNotificationCount(memberId: string): Promise<number>;
  markMemberNotificationRead(memberId: string, notificationId: string): Promise<boolean>;
  markAllMemberNotificationsRead(memberId: string): Promise<number>;

  // Staff accounts (admins/trainers)
  listStaff(): Promise<StaffAccount[]>;
  getStaffById(id: string): Promise<DbStaffAccount | null>;
  getStaffByEmail(email: string): Promise<DbStaffAccount | null>;
  createStaff(input: StaffInput): Promise<StaffAccount | null>;
  updateStaff(id: string, patch: StaffUpdate): Promise<StaffAccount | null>;
  deleteStaff(id: string): Promise<boolean>;
  touchStaffLogin(id: string): Promise<void>;

  // Audit log
  logAudit(input: AuditInput): Promise<boolean>;
  listAudit(filters?: AuditFilters): Promise<AuditPage>;
  anonymizeStaffAudit(staffId: string): Promise<number>;
  purgeAudit(days?: number): Promise<number>;

  // Workout plans
  saveWorkoutPlan(memberId: string, plan: GeneratedWorkoutPlan): Promise<boolean>;

  // Leads
  listLeads(): Promise<DbLeadInquiry[]>;
  saveLead(lead: LeadInput): Promise<boolean>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<boolean>;
  deleteLead(id: string): Promise<boolean>;
  purgeExpiredLeads(months?: number): Promise<number>;
}

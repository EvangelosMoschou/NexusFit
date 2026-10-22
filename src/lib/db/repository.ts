import { GeneratedWorkoutPlan, GymConfig } from "@/types";
import { DbAdminMember, DbLeadInquiry, MemberSession } from "./types";

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

  // Members
  listMembers(): Promise<DbAdminMember[]>;
  saveMember(member: MemberInput): Promise<boolean>;
  deleteMember(id: string): Promise<boolean>;
  // GDPR erasure: the member, their plans, and any leads sharing their email.
  eraseMember(id: string): Promise<boolean>;
  exportMember(id: string): Promise<MemberExport>;
  authenticateMember(identifier: string, pin: string): Promise<MemberSession | null>;

  // Workout plans
  saveWorkoutPlan(memberId: string, plan: GeneratedWorkoutPlan): Promise<boolean>;

  // Leads
  listLeads(): Promise<DbLeadInquiry[]>;
  saveLead(lead: LeadInput): Promise<boolean>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<boolean>;
  deleteLead(id: string): Promise<boolean>;
  purgeExpiredLeads(months?: number): Promise<number>;
}

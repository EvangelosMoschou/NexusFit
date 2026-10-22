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

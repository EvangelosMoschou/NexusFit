import {
  getSavedGymConfig,
  updateSavedGymConfig,
  getAllLeadsAdmin,
  updateLeadStatusAdmin,
  deleteLeadAdmin,
  purgeExpiredLeads,
  getAllMembersAdmin,
  upsertMemberAdmin,
  deleteMemberAdmin,
  eraseMemberCompletely,
  exportMemberData,
  getMemberByCredentials,
  saveWorkoutPlanToDb,
  saveLeadInquiryToDb,
} from "@/lib/sqliteDb";
import { Repository } from "./repository";

// SQLite-backed repository, bound to one tenant.
//
// The underlying driver (`node:sqlite`) is synchronous, so these methods simply
// resolve the result. That is deliberate: the interface is async so a future
// async driver (Postgres/MySQL) can be implemented behind it without touching
// any caller. The tenant id is captured here and threaded into every query, so a
// repository instance can never reach another gym's data.
export function createSqliteRepository(tenantId: string): Repository {
  return {
    async getGymConfig() {
      return getSavedGymConfig(tenantId);
    },
    async updateGymConfig(config) {
      return updateSavedGymConfig(config, tenantId);
    },
    async listMembers() {
      return getAllMembersAdmin(tenantId);
    },
    async saveMember(member) {
      return upsertMemberAdmin(member, tenantId);
    },
    async deleteMember(id) {
      return deleteMemberAdmin(id, tenantId);
    },
    async eraseMember(id) {
      return eraseMemberCompletely(id, tenantId);
    },
    async exportMember(id) {
      return exportMemberData(id, tenantId);
    },
    async authenticateMember(identifier, pin) {
      return getMemberByCredentials(identifier, pin, tenantId);
    },
    async saveWorkoutPlan(memberId, plan) {
      return saveWorkoutPlanToDb(memberId, plan, tenantId);
    },
    async listLeads() {
      return getAllLeadsAdmin(tenantId);
    },
    async saveLead(lead) {
      return saveLeadInquiryToDb(lead, tenantId);
    },
    async updateLeadStatus(id, status) {
      return updateLeadStatusAdmin(id, status, tenantId);
    },
    async deleteLead(id) {
      return deleteLeadAdmin(id, tenantId);
    },
    async purgeExpiredLeads(months) {
      return purgeExpiredLeads(months, tenantId);
    },
  };
}

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
  listMediaAdmin,
  getMediaWithData,
  saveMediaToDb,
  deleteMediaAdmin,
  getOccupancy,
  getInsideMembers,
  getRecentVisits,
  getVisitIntervalsSince,
  getMemberVisits,
  getMemberVisitCount,
  getMemberVisitStatus,
  getReentryCooldownSeconds,
  getLastCheckoutAt,
  recordAccessEvent,
  countAccessEvents,
  listMemberAccessEvents,
  listAccessAlerts,
  listRecentAccessEvents,
  purgeAccessEvents,
  touchMemberVisit,
  checkInMember,
  checkOutMember,
  closeStaleVisits,
  closeIdleVisits,
  getMemberAccess,
  ensureMemberNotification,
  listMemberNotifications,
  getUnreadNotificationCount,
  markMemberNotificationRead,
  markAllMemberNotificationsRead,
  listStaffAccounts,
  getStaffAccountById,
  getStaffAccountByEmail,
  createStaffAccount,
  updateStaffAccount,
  deleteStaffAccount,
  touchStaffLogin,
  insertAuditEntry,
  listAuditEntries,
  anonymizeStaffAudit,
  purgeAuditLog,
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
    async listMedia() {
      return listMediaAdmin(tenantId);
    },
    async getMedia(id) {
      return getMediaWithData(id, tenantId);
    },
    async saveMedia(input) {
      return saveMediaToDb(input, tenantId);
    },
    async deleteMedia(id) {
      return deleteMediaAdmin(id, tenantId);
    },
    async getOccupancy() {
      return getOccupancy(tenantId);
    },
    async getInsideMembers() {
      return getInsideMembers(tenantId);
    },
    async getRecentVisits(limit) {
      return getRecentVisits(limit, tenantId);
    },
    async getVisitIntervalsSince(since) {
      return getVisitIntervalsSince(since, tenantId);
    },
    async getMemberVisits(memberId, limit) {
      return getMemberVisits(memberId, limit, tenantId);
    },
    async getMemberVisitCount(memberId, days) {
      return getMemberVisitCount(memberId, days, tenantId);
    },
    async getMemberVisitStatus(memberId) {
      return getMemberVisitStatus(memberId, tenantId);
    },
    async getReentryCooldownSeconds(memberId) {
      return getReentryCooldownSeconds(memberId, tenantId);
    },
    async getLastCheckoutAt(memberId) {
      return getLastCheckoutAt(memberId, tenantId);
    },
    async recordAccessEvent(memberId, eventType, details) {
      return recordAccessEvent(memberId, eventType, details, tenantId);
    },
    async countAccessEvents(memberId, days) {
      return countAccessEvents(memberId, days, tenantId);
    },
    async listMemberAccessEvents(memberId, limit) {
      return listMemberAccessEvents(memberId, limit, tenantId);
    },
    async listAccessAlerts(threshold, days) {
      return listAccessAlerts(threshold, days, tenantId);
    },
    async listRecentAccessEvents(limit) {
      return listRecentAccessEvents(limit, tenantId);
    },
    async purgeAccessEvents(days) {
      return purgeAccessEvents(days, tenantId);
    },
    async touchMemberVisit(memberId) {
      return touchMemberVisit(memberId, tenantId);
    },
    async checkInMember(memberId) {
      return checkInMember(memberId, tenantId);
    },
    async checkOutMember(memberId) {
      return checkOutMember(memberId, tenantId);
    },
    async closeStaleVisits() {
      return closeStaleVisits(undefined, tenantId);
    },
    async closeIdleVisits() {
      const minutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
      return closeIdleVisits(minutes, tenantId);
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
    async getMemberAccess(id) {
      return getMemberAccess(id, tenantId);
    },
    async authenticateMember(identifier, pin) {
      return getMemberByCredentials(identifier, pin, tenantId);
    },
    async ensureMemberNotification(memberId, input) {
      return ensureMemberNotification(memberId, input, tenantId);
    },
    async listMemberNotifications(memberId, limit) {
      return listMemberNotifications(memberId, limit, tenantId);
    },
    async getUnreadNotificationCount(memberId) {
      return getUnreadNotificationCount(memberId, tenantId);
    },
    async markMemberNotificationRead(memberId, notificationId) {
      return markMemberNotificationRead(memberId, notificationId, tenantId);
    },
    async markAllMemberNotificationsRead(memberId) {
      return markAllMemberNotificationsRead(memberId, tenantId);
    },
    async listStaff() {
      return listStaffAccounts(tenantId);
    },
    async getStaffById(id) {
      return getStaffAccountById(id, tenantId);
    },
    async getStaffByEmail(email) {
      return getStaffAccountByEmail(email, tenantId);
    },
    async createStaff(input) {
      return createStaffAccount(input, tenantId);
    },
    async updateStaff(id, patch) {
      return updateStaffAccount(id, patch, tenantId);
    },
    async deleteStaff(id) {
      return deleteStaffAccount(id, tenantId);
    },
    async touchStaffLogin(id) {
      return touchStaffLogin(id, tenantId);
    },
    async logAudit(input) {
      return insertAuditEntry(input, tenantId);
    },
    async listAudit(filters) {
      return listAuditEntries(filters, tenantId);
    },
    async anonymizeStaffAudit(staffId) {
      return anonymizeStaffAudit(staffId, tenantId);
    },
    async purgeAudit(days) {
      return purgeAuditLog(days, tenantId);
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

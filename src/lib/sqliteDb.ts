// Public surface of the SQLite data layer.
//
// The implementation lives in cohesive modules under `./db/` — connection and
// boot (`db/connection`, `db/schema`), then one module per table family:
// members, leads, gym config, member sessions, media, staff, audit,
// notifications, access events and visits.
//
// This file stays the stable entry point every caller imports, so the split is
// invisible to them: same exported names, same signatures, same behaviour.
// Anything that needs a new export should be added to the owning module and
// re-exported here, not implemented in this file.

export { DEFAULT_TENANT_ID } from "./db/tenant";

export { getDataDir, getDatabase } from "./db/connection";

export type { DbAdminMember, DbLeadInquiry, DbMember, DbWorkoutPlan } from "./db/types";

export {
  deleteMemberAdmin,
  eraseMemberCompletely,
  exportMemberData,
  getAllMembersAdmin,
  getMemberAccess,
  getMemberByCredentials,
  saveWorkoutPlanToDb,
  upsertMemberAdmin,
} from "./db/members";

export {
  deleteLeadAdmin,
  deleteLeadsByEmail,
  getAllLeadsAdmin,
  purgeExpiredLeads,
  saveLeadInquiryToDb,
  updateLeadStatusAdmin,
} from "./db/leads";

export { getSavedGymConfig, updateSavedGymConfig } from "./db/gymConfig";

export {
  createMemberSession,
  enforceMemberSessionLimit,
  getMemberSession,
  listMemberSessionHistory,
  listMemberSessions,
  purgeMemberSessions,
  revokeAllMemberSessions,
  revokeMemberSession,
  touchMemberSession,
} from "./db/memberSessions";

export { deleteMediaAdmin, getMediaWithData, listMediaAdmin, saveMediaToDb } from "./db/media";

export {
  createStaffAccount,
  deleteStaffAccount,
  getStaffAccountByEmail,
  getStaffAccountById,
  listStaffAccounts,
  touchStaffLogin,
  updateStaffAccount,
} from "./db/staff";

export { anonymizeStaffAudit, insertAuditEntry, listAuditEntries, purgeAuditLog } from "./db/audit";

export {
  ensureMemberNotification,
  getUnreadNotificationCount,
  listMemberNotifications,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "./db/notifications";

export {
  countAccessEvents,
  listAccessAlerts,
  listMemberAccessEvents,
  listRecentAccessEvents,
  purgeAccessEvents,
  recordAccessEvent,
} from "./db/accessEvents";

export {
  checkInMember,
  checkOutMember,
  closeIdleVisits,
  closeStaleVisits,
  getInsideMembers,
  getLastCheckoutAt,
  getMemberVisitCount,
  getMemberVisitStatus,
  getMemberVisits,
  getOccupancy,
  getRecentVisits,
  getReentryCooldownSeconds,
  getVisitIntervalsSince,
  touchMemberVisit,
} from "./db/visits";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Σύνδεση",
  "member.save": "Δημιουργία / ενημέρωση μέλους",
  "member.erase": "Οριστική διαγραφή μέλους",
  "lead.status": "Αλλαγή κατάστασης lead",
  "lead.delete": "Διαγραφή lead",
  "config.update": "Αλλαγή ρυθμίσεων",
  "media.upload": "Μεταφόρτωση φωτογραφίας",
  "media.delete": "Διαγραφή φωτογραφίας",
  "staff.create": "Δημιουργία λογαριασμού προσωπικού",
  "staff.update": "Ενημέρωση λογαριασμού προσωπικού",
  "staff.delete": "Διαγραφή λογαριασμού προσωπικού",
  "occupancy.check_in": "Χειροκίνητο check-in",
  "occupancy.check_out": "Χειροκίνητο check-out",
  "access.denied": "Απόρριψη πρόσβασης",
  "access.alert": "Alarm επαναλαμβανόμενης πρόσβασης",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  admin: "Διαχειριστής",
  trainer: "Γυμναστής",
  staff: "Προσωπικό",
  member: "Μέλος",
  lead: "Lead",
  config: "Ρυθμίσεις",
  media: "Φωτογραφία",
  occupancy: "Παρουσία",
  access: "Πρόσβαση",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

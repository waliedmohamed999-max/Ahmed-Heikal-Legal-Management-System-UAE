-- Integrity triggers as BEGIN ... END blocks.
-- A single-statement trigger created in a multi-statement batch is stored with a trailing
-- ";" in its body; mysqldump then emits "...';*/" which the mysql client cannot restore.
-- BEGIN ... END bodies end with END, dump and restore cleanly (verified by the restore test).
-- Behaviour is unchanged: AuditLog UPDATE/DELETE and legal-record DELETE are rejected.

DROP TRIGGER IF EXISTS `audit_log_no_update`;
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `AuditLog` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
END;

DROP TRIGGER IF EXISTS `audit_log_no_delete`;
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `AuditLog` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
END;

DROP TRIGGER IF EXISTS `Client_no_hard_delete`;
CREATE TRIGGER `Client_no_hard_delete` BEFORE DELETE ON `Client` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Matter_no_hard_delete`;
CREATE TRIGGER `Matter_no_hard_delete` BEFORE DELETE ON `Matter` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Document_no_hard_delete`;
CREATE TRIGGER `Document_no_hard_delete` BEFORE DELETE ON `Document` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `DocumentVersion_no_hard_delete`;
CREATE TRIGGER `DocumentVersion_no_hard_delete` BEFORE DELETE ON `DocumentVersion` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Hearing_no_hard_delete`;
CREATE TRIGGER `Hearing_no_hard_delete` BEFORE DELETE ON `Hearing` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Deadline_no_hard_delete`;
CREATE TRIGGER `Deadline_no_hard_delete` BEFORE DELETE ON `Deadline` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Invoice_no_hard_delete`;
CREATE TRIGGER `Invoice_no_hard_delete` BEFORE DELETE ON `Invoice` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Payment_no_hard_delete`;
CREATE TRIGGER `Payment_no_hard_delete` BEFORE DELETE ON `Payment` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `TimelineEvent_no_hard_delete`;
CREATE TRIGGER `TimelineEvent_no_hard_delete` BEFORE DELETE ON `TimelineEvent` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Note_no_hard_delete`;
CREATE TRIGGER `Note_no_hard_delete` BEFORE DELETE ON `Note` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Communication_no_hard_delete`;
CREATE TRIGGER `Communication_no_hard_delete` BEFORE DELETE ON `Communication` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

DROP TRIGGER IF EXISTS `Approval_no_hard_delete`;
CREATE TRIGGER `Approval_no_hard_delete` BEFORE DELETE ON `Approval` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';
END;

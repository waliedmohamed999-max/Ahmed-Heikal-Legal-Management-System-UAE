-- Recreate the hard-delete guards with messages that contain no semicolon.
-- A ";" inside a quoted string within mysqldump version comments (/*!50003 ... */) is
-- misparsed by the mysql client, which made logical backups unrestorable (found by the
-- Phase 11 restore test). Behaviour is unchanged: DELETE on these tables is rejected.

DROP TRIGGER IF EXISTS `Client_no_hard_delete`;
CREATE TRIGGER `Client_no_hard_delete` BEFORE DELETE ON `Client`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Matter_no_hard_delete`;
CREATE TRIGGER `Matter_no_hard_delete` BEFORE DELETE ON `Matter`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Document_no_hard_delete`;
CREATE TRIGGER `Document_no_hard_delete` BEFORE DELETE ON `Document`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `DocumentVersion_no_hard_delete`;
CREATE TRIGGER `DocumentVersion_no_hard_delete` BEFORE DELETE ON `DocumentVersion`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Hearing_no_hard_delete`;
CREATE TRIGGER `Hearing_no_hard_delete` BEFORE DELETE ON `Hearing`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Deadline_no_hard_delete`;
CREATE TRIGGER `Deadline_no_hard_delete` BEFORE DELETE ON `Deadline`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Invoice_no_hard_delete`;
CREATE TRIGGER `Invoice_no_hard_delete` BEFORE DELETE ON `Invoice`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Payment_no_hard_delete`;
CREATE TRIGGER `Payment_no_hard_delete` BEFORE DELETE ON `Payment`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `TimelineEvent_no_hard_delete`;
CREATE TRIGGER `TimelineEvent_no_hard_delete` BEFORE DELETE ON `TimelineEvent`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Note_no_hard_delete`;
CREATE TRIGGER `Note_no_hard_delete` BEFORE DELETE ON `Note`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Communication_no_hard_delete`;
CREATE TRIGGER `Communication_no_hard_delete` BEFORE DELETE ON `Communication`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

DROP TRIGGER IF EXISTS `Approval_no_hard_delete`;
CREATE TRIGGER `Approval_no_hard_delete` BEFORE DELETE ON `Approval`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked - use soft delete or archive';

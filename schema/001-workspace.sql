CREATE TABLE `task_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `shift_name` enum('morning','evening','night') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_shift` (`name`,`shift_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `shift_tasks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `shift_date` date NOT NULL,
  `shift_name` enum('morning','evening','night') NOT NULL,
  `status` enum('Pending','Completed') NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `template_id` int unsigned DEFAULT NULL,
  `origin_shift_date` date DEFAULT NULL,
  `origin_shift_name` enum('morning','evening','night') DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_template_origin` (`template_id`,`origin_shift_date`,`origin_shift_name`),
  KEY `idx_shift_tasks_shift` (`shift_date`,`shift_name`),
  CONSTRAINT `fk_task_template` FOREIGN KEY (`template_id`) REFERENCES `task_templates` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `allowed_emails` (
  `email` varchar(254) NOT NULL,
  `role` enum('admin','operator') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `email_report_settings` (
  `id` tinyint unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `recipient_emails` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `shift_report_deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `shift_date` date NOT NULL,
  `shift_name` enum('morning','evening','night') NOT NULL,
  `recipient_emails` text NOT NULL,
  `report_subject` varchar(255) NOT NULL,
  `report_body` mediumtext NOT NULL,
  `delivery_status` enum('Pending','Sending','Sent','Failed','Uncertain') NOT NULL DEFAULT 'Pending',
  `attempts` int unsigned NOT NULL DEFAULT '0',
  `last_attempt_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `message_id` varchar(255) DEFAULT NULL,
  `last_error` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `requested_by_user_id` varchar(255) DEFAULT NULL,
  `requested_by_name` varchar(255) DEFAULT NULL,
  `requested_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_shift_report` (`shift_date`,`shift_name`),
  KEY `delivery_queue` (`delivery_status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `task_handovers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `task_id` int unsigned NOT NULL,
  `from_shift_date` date NOT NULL,
  `from_shift_name` enum('morning','evening','night') NOT NULL,
  `to_shift_date` date NOT NULL,
  `to_shift_name` enum('morning','evening','night') NOT NULL,
  `handed_over_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_source_shift` (`task_id`,`from_shift_date`,`from_shift_name`),
  KEY `idx_handover_destination` (`to_shift_date`,`to_shift_name`),
  CONSTRAINT `task_handovers_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `shift_tasks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `task_status_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `task_id` int unsigned NOT NULL,
  `previous_status` enum('Pending','Completed') NOT NULL,
  `new_status` enum('Pending','Completed') NOT NULL,
  `shift_date` date NOT NULL,
  `shift_name` enum('morning','evening','night') NOT NULL,
  `changed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `changed_by_user_id` varchar(255) DEFAULT NULL,
  `changed_by_name` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_task_status_history_task` (`task_id`,`changed_at`),
  CONSTRAINT `fk_status_history_task` FOREIGN KEY (`task_id`) REFERENCES `shift_tasks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO email_report_settings (id, enabled, recipient_emails) VALUES (1, FALSE, '');

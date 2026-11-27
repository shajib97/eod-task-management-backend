CREATE TABLE IF NOT EXISTS auth_rate_limit (id varchar(36) PRIMARY KEY, `key` varchar(255) NOT NULL UNIQUE, count int NOT NULL, lastRequest bigint NOT NULL) ENGINE=InnoDB;

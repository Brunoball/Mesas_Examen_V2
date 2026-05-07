CREATE DATABASE IF NOT EXISTS mesas_master
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mesas_master;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS planes_saas (
  idPlan int unsigned NOT NULL AUTO_INCREMENT,
  nombre varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  nivel tinyint unsigned NOT NULL DEFAULT 1,
  activo tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idPlan),
  UNIQUE KEY uq_plan_nombre (nombre),
  KEY idx_plan_nivel (nivel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenants (
  idTenant int unsigned NOT NULL AUTO_INCREMENT,
  nombre varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  logo_url varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  logo_icono_url varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  db_host varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'localhost',
  db_name varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  db_user varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  db_pass varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  idPlan int unsigned NOT NULL DEFAULT 1,
  activo tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idTenant),
  UNIQUE KEY uq_db_name (db_name),
  KEY idx_tenant_activo (activo),
  KEY fk_tenant_plan (idPlan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_master (
  idUsuarioMaster int unsigned NOT NULL AUTO_INCREMENT,
  idTenant int unsigned NOT NULL,
  usuario varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  email_recuperacion varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  hash_contrasena varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  rol enum('admin','vista') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'vista',
  tema enum('claro','oscuro') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'claro',
  activo tinyint(1) NOT NULL DEFAULT 1,
  fecha_creacion datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idUsuarioMaster),
  UNIQUE KEY uq_usuario_por_tenant (idTenant,usuario),
  KEY idx_user_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  idSesion bigint unsigned NOT NULL AUTO_INCREMENT,
  session_key varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  idUsuarioMaster int unsigned NOT NULL,
  idTenant int unsigned NOT NULL,
  creado_en datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en datetime NOT NULL,
  ultimo_uso datetime DEFAULT NULL,
  ip varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  user_agent varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  activo tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idSesion),
  UNIQUE KEY uk_session_key (session_key),
  KEY ix_tenant (idTenant),
  KEY ix_user (idUsuarioMaster)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_auditoria (
  idLog bigint unsigned NOT NULL AUTO_INCREMENT,
  idUsuarioMaster int unsigned DEFAULT NULL,
  idTenant int unsigned DEFAULT NULL,
  usuario varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ip varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  user_agent varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  exito tinyint(1) NOT NULL DEFAULT 0,
  creado_en datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idLog),
  KEY idx_log_tenant (idTenant),
  KEY idx_log_usuario (idUsuarioMaster)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  idReset int unsigned NOT NULL AUTO_INCREMENT,
  idUsuarioMaster int unsigned NOT NULL,
  token_hash char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  expiracion datetime NOT NULL,
  usado tinyint(1) NOT NULL DEFAULT 0,
  creado_en datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usado_en datetime DEFAULT NULL,
  ip_solicitud varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  user_agent varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (idReset),
  KEY idx_password_resets_usuario (idUsuarioMaster),
  KEY idx_password_resets_token (token_hash),
  KEY idx_password_resets_expiracion (expiracion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO planes_saas (idPlan, nombre, nivel, activo)
VALUES (1, 'Plan Demo', 1, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  nivel = VALUES(nivel),
  activo = VALUES(activo);

INSERT INTO tenants (
  idTenant,
  nombre,
  logo_url,
  logo_icono_url,
  db_host,
  db_name,
  db_user,
  db_pass,
  idPlan,
  activo
)
VALUES (
  1,
  'Mesas Examen ENA',
  NULL,
  NULL,
  'localhost',
  'mesas_examen_ena',
  'root',
  'brunoball516',
  1,
  1
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  db_host = VALUES(db_host),
  db_name = VALUES(db_name),
  db_user = VALUES(db_user),
  db_pass = VALUES(db_pass),
  idPlan = VALUES(idPlan),
  activo = VALUES(activo);

INSERT INTO usuarios_master (
  idTenant,
  usuario,
  email_recuperacion,
  hash_contrasena,
  rol,
  tema,
  activo
)
VALUES (
  1,
  'admin',
  NULL,
  '$2y$12$oX8KsPU5FT/K9.VFI2/gk.8s2M9D8i8fLedX2gIvUl8uYbmH0nHF6',
  'admin',
  'claro',
  1
)
ON DUPLICATE KEY UPDATE
  hash_contrasena = VALUES(hash_contrasena),
  rol = VALUES(rol),
  tema = VALUES(tema),
  activo = VALUES(activo);

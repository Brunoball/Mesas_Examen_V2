USE mesas_examen_ena;

CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_usuario INT NULL,
    modulo VARCHAR(80) NOT NULL,
    accion VARCHAR(120) NOT NULL,
    tipo_operacion VARCHAR(60) NOT NULL,
    metodo_http VARCHAR(10) NOT NULL,
    ruta VARCHAR(500) NULL,
    ip VARCHAR(80) NULL,
    user_agent VARCHAR(500) NULL,
    datos_request LONGTEXT NULL,
    resultado TINYINT(1) NOT NULL DEFAULT 1,
    codigo_http SMALLINT UNSIGNED NOT NULL DEFAULT 200,
    mensaje_respuesta VARCHAR(500) NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_auditoria),
    KEY idx_auditoria_fecha (fecha_hora),
    KEY idx_auditoria_usuario (id_usuario),
    KEY idx_auditoria_modulo (modulo),
    KEY idx_auditoria_accion (accion),
    KEY idx_auditoria_tipo (tipo_operacion),
    KEY idx_auditoria_resultado (resultado),
    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios (idUsuario)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

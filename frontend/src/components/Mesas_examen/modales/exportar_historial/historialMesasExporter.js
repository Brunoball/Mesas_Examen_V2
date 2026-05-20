const textoCorto = (valor, fallback = "-") => {
  const texto = String(valor ?? "").trim();
  return texto || fallback;
};

const normalizarHora = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (/hs\.?$/i.test(texto)) return texto.toUpperCase();
  return `${texto.slice(0, 5)} HS.`.toUpperCase();
};

const textoCursoDivision = (curso, division) => {
  const partes = [curso, division].map((item) => String(item || "").trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "";
};

const obtenerFechaTexto = (fila, campoBase = "fecha_mesa") => {
  const directo = textoCorto(fila?.[`${campoBase}_texto`], "");
  if (directo) return directo;

  const valor = textoCorto(fila?.[campoBase], "");
  if (!valor) return "-";

  if (/^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const [anio, mes, dia] = valor.slice(0, 10).split("-");
    return `${dia}/${mes}/${anio}`;
  }

  return valor;
};

const ordenarFilasHistorial = (a, b) => {
  const armadoA = Number(a?.id_armado_historial || 0);
  const armadoB = Number(b?.id_armado_historial || 0);
  if (armadoA !== armadoB) return armadoB - armadoA;

  const grupoA = Number(a?.numero_grupo || 999999);
  const grupoB = Number(b?.numero_grupo || 999999);
  if (grupoA !== grupoB) return grupoA - grupoB;

  const mesaA = Number(a?.numero_mesa || 999999);
  const mesaB = Number(b?.numero_mesa || 999999);
  if (mesaA !== mesaB) return mesaA - mesaB;

  const alumnoA = textoCorto(a?.alumno, "").localeCompare(textoCorto(b?.alumno, ""), "es");
  if (alumnoA !== 0) return alumnoA;

  return textoCorto(a?.materia, "").localeCompare(textoCorto(b?.materia, ""), "es");
};

export const construirMesasDesdeHistorial = (data = {}) => {
  const detalle = Array.isArray(data?.detalle) ? [...data.detalle] : [];
  const armadosPorId = new Map((Array.isArray(data?.armados) ? data.armados : []).map((armado) => [
    Number(armado?.id_armado_historial || 0),
    armado,
  ]));

  const grupos = new Map();

  detalle.sort(ordenarFilasHistorial).forEach((fila) => {
    const idArmado = Number(fila?.id_armado_historial || 0);
    const numeroMesa = textoCorto(fila?.numero_mesa, "SIN_MESA");
    const numeroGrupo = textoCorto(fila?.numero_grupo, "SIN_GRUPO");
    const clave = `${idArmado || "sin-armado"}__${numeroGrupo}__${numeroMesa}`;
    const armado = armadosPorId.get(idArmado) || fila;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        id_grupo: clave,
        id_armado_historial: idArmado,
        codigo_armado: textoCorto(armado?.codigo_armado || fila?.codigo_armado, "Historial"),
        creado_en_texto: textoCorto(armado?.creado_en_texto || fila?.creado_en_texto, ""),
        motivo: textoCorto(armado?.motivo || fila?.motivo_armado, ""),
        numero_grupo: fila?.numero_grupo || null,
        numero_mesa: fila?.numero_mesa || null,
        fecha_mesa: fila?.fecha_mesa || null,
        fecha: fila?.fecha_mesa || null,
        turno: fila?.turno || "",
        hora: normalizarHora(fila?.hora),
        observacion: textoCorto(armado?.codigo_armado || fila?.codigo_armado, ""),
        numeros: [{
          numero_mesa: fila?.numero_mesa || "-",
          tipo_mesa: fila?.tipo_mesa || "historial",
          materia: "",
          docente: "",
          observacion: textoCorto(armado?.codigo_armado || fila?.codigo_armado, ""),
          alumnos: [],
        }],
      });
    }

    const grupo = grupos.get(clave);
    const numero = grupo.numeros[0];
    const materia = textoCorto(fila?.materia, "Sin materia");
    const docente = textoCorto(fila?.docente, "Sin docente");
    const cursoMateriaTexto = textoCursoDivision(fila?.materia_curso, fila?.materia_division)
      || textoCursoDivision(fila?.curso_materia, fila?.division_materia);

    numero.alumnos.push({
      id_mesa: fila?.id_mesa_original || fila?.id_historial_detalle,
      id_previa: fila?.id_previa_original || fila?.id_historial_detalle,
      numero_mesa: fila?.numero_mesa,
      estudiante: fila?.alumno,
      alumno: fila?.alumno,
      dni: fila?.dni,
      materia,
      docente,
      curso_materia: fila?.materia_curso || fila?.curso_materia,
      division_materia: fila?.materia_division || fila?.division_materia,
      curso_materia_texto: cursoMateriaTexto,
      curso_alumno: fila?.cursando_curso,
      division_alumno: fila?.cursando_division,
      condicion: fila?.condicion,
      tipo_mesa: fila?.tipo_mesa,
      nota: fila?.nota,
      previa_activa: fila?.previa_activa,
    });
  });

  grupos.forEach((grupo) => {
    const numero = grupo.numeros[0];
    const materias = Array.from(new Set(numero.alumnos.map((alumno) => textoCorto(alumno?.materia, "")).filter(Boolean)));
    const docentes = Array.from(new Set(numero.alumnos.map((alumno) => textoCorto(alumno?.docente, "")).filter(Boolean)));
    numero.materia = materias.length === 1 ? materias[0] : "VARIAS MATERIAS";
    numero.docente = docentes.length === 1 ? docentes[0] : "VARIOS DOCENTES";
    grupo.materia = numero.materia;
    grupo.docente = numero.docente;
    grupo.cantidad_alumnos = numero.alumnos.length;
  });

  return Array.from(grupos.values()).sort((a, b) => {
    const armadoA = Number(a.id_armado_historial || 0);
    const armadoB = Number(b.id_armado_historial || 0);
    if (armadoA !== armadoB) return armadoB - armadoA;

    const grupoA = Number(a.numero_grupo || 999999);
    const grupoB = Number(b.numero_grupo || 999999);
    if (grupoA !== grupoB) return grupoA - grupoB;

    return Number(a.numero_mesa || 999999) - Number(b.numero_mesa || 999999);
  });
};

export const contarMesasHistorial = (data = {}) => construirMesasDesdeHistorial(data).length;

export const contarRegistrosHistorialExportacion = (data = {}) => {
  const resultados = Array.isArray(data?.resultados) ? data.resultados.length : 0;
  const detalle = Array.isArray(data?.detalle) ? data.detalle.length : 0;
  return resultados + detalle;
};

const construirResultadosHistorial = (data = {}) => {
  const resultados = Array.isArray(data?.resultados) ? data.resultados : [];
  return resultados.map((fila) => ({
    fecha_nota: obtenerFechaTexto(fila, "fecha_nota"),
    fecha_mesa: obtenerFechaTexto(fila, "fecha_mesa"),
    grupo: textoCorto(fila?.numero_grupo),
    mesa: textoCorto(fila?.numero_mesa),
    alumno: textoCorto(fila?.alumno),
    dni: textoCorto(fila?.dni),
    materia: textoCorto(fila?.materia),
    docente: textoCorto(fila?.docente),
    tipo: textoCorto(fila?.tipo_mesa_texto || fila?.tipo_mesa),
    condicion: textoCorto(fila?.condicion),
    nota: textoCorto(fila?.nota),
    aprobado: Number(fila?.aprobado) === 1 ? "Sí" : Number(fila?.aprobado) === 0 ? "No" : "-",
    estado: textoCorto(fila?.estado_resultado),
    motivo: textoCorto(fila?.motivo, ""),
  }));
};

const construirDetallePlanoHistorial = (data = {}) => {
  const detalle = Array.isArray(data?.detalle) ? [...data.detalle] : [];

  return detalle.sort(ordenarFilasHistorial).map((fila) => ({
    armado: textoCorto(fila?.codigo_armado),
    fecha: obtenerFechaTexto(fila, "fecha_mesa"),
    grupo: textoCorto(fila?.numero_grupo),
    mesa: textoCorto(fila?.numero_mesa),
    alumno: textoCorto(fila?.alumno),
    dni: textoCorto(fila?.dni),
    materia: textoCorto(fila?.materia),
    docente: textoCorto(fila?.docente),
    tipo: textoCorto(fila?.tipo_mesa),
    nota: textoCorto(fila?.nota),
    activa: Number(fila?.previa_activa) === 1 ? "Sí" : Number(fila?.previa_activa) === 0 ? "No" : "-",
    turno: textoCorto(fila?.turno),
    condicion: textoCorto(fila?.condicion),
  }));
};

const xmlEscape = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const cell = (valor, style = "") => `<Cell${style ? ` ss:StyleID=\"${style}\"` : ""}><Data ss:Type=\"String\">${xmlEscape(valor)}</Data></Cell>`;
const row = (celdas) => `<Row>${celdas.join("")}</Row>`;

const crearHojaTabla = ({ nombre, titulo, subtitulo, columnas, filas }) => {
  const widths = columnas.map((col) => `<Column ss:Width="${col.width || 100}"/>`).join("");
  const totalCols = Math.max(columnas.length - 1, 0);
  const rows = [
    widths,
    `<Row ss:Height="24"><Cell ss:MergeAcross="${totalCols}" ss:StyleID="title"><Data ss:Type="String">${xmlEscape(titulo)}</Data></Cell></Row>`,
    `<Row><Cell ss:MergeAcross="${totalCols}" ss:StyleID="sub"><Data ss:Type="String">${xmlEscape(subtitulo)}</Data></Cell></Row>`,
    row(columnas.map((col) => cell(col.label, "header"))),
  ];

  if (filas.length === 0) {
    rows.push(`<Row><Cell ss:MergeAcross="${totalCols}" ss:StyleID="empty"><Data ss:Type="String">Sin registros para exportar.</Data></Cell></Row>`);
  } else {
    filas.forEach((fila) => {
      rows.push(row(columnas.map((col) => cell(fila[col.key]))));
    });
  }

  rows.push(`<Row><Cell ss:MergeAcross="${totalCols}" ss:StyleID="sub"><Data ss:Type="String">${xmlEscape(`${filas.length} registros`)}</Data></Cell></Row>`);
  return `<Worksheet ss:Name="${xmlEscape(nombre)}"><Table>${rows.join("")}</Table></Worksheet>`;
};

const descargarBlob = (blob, nombreArchivo) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const columnasResultadosExcel = [
  { key: "fecha_nota", label: "Fecha nota", width: 82 },
  { key: "fecha_mesa", label: "Fecha mesa", width: 82 },
  { key: "grupo", label: "Grupo", width: 58 },
  { key: "mesa", label: "Mesa", width: 58 },
  { key: "alumno", label: "Alumno", width: 210 },
  { key: "dni", label: "DNI", width: 86 },
  { key: "materia", label: "Materia / Previa", width: 210 },
  { key: "docente", label: "Docente", width: 185 },
  { key: "tipo", label: "Tipo", width: 75 },
  { key: "condicion", label: "Condición", width: 90 },
  { key: "nota", label: "Nota", width: 58 },
  { key: "aprobado", label: "Aprobado", width: 72 },
  { key: "estado", label: "Estado", width: 95 },
  { key: "motivo", label: "Motivo", width: 160 },
];

const columnasDetalleExcel = [
  { key: "armado", label: "Armado", width: 155 },
  { key: "fecha", label: "Fecha", width: 82 },
  { key: "grupo", label: "Grupo", width: 58 },
  { key: "mesa", label: "Mesa", width: 58 },
  { key: "alumno", label: "Alumno", width: 210 },
  { key: "dni", label: "DNI", width: 86 },
  { key: "materia", label: "Materia", width: 210 },
  { key: "docente", label: "Docente", width: 190 },
  { key: "tipo", label: "Tipo", width: 75 },
  { key: "turno", label: "Turno", width: 80 },
  { key: "nota", label: "Nota", width: 58 },
  { key: "activa", label: "Activa", width: 66 },
];

export const descargarExcelHistorialMesas = (data = {}) => {
  const resultados = construirResultadosHistorial(data);
  const detalle = construirDetallePlanoHistorial(data);

  if (resultados.length === 0 && detalle.length === 0) {
    throw new Error("No hay historial para exportar.");
  }

  const subtitulo = String(data?.busqueda || "").trim()
    ? `Filtro aplicado: ${data.busqueda}`
    : "Exportación completa del historial guardado";

  const worksheets = [
    crearHojaTabla({
      nombre: "Historial notas",
      titulo: "HISTORIAL DE NOTAS Y PREVIAS",
      subtitulo,
      columnas: columnasResultadosExcel,
      filas: resultados,
    }),
    crearHojaTabla({
      nombre: "Detalle mesas",
      titulo: "DETALLE DEL ARMADO DE MESAS",
      subtitulo: "Todas las mesas del historial en una sola hoja",
      columnas: columnasDetalleExcel,
      filas: detalle,
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="sub"><Font ss:Bold="1" ss:Size="10"/><Alignment ss:Horizontal="Left"/></Style>
  <Style ss:ID="empty"><Font ss:Italic="1" ss:Size="10"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0A2540" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
 </Styles>
 ${worksheets.join("\n")}
</Workbook>`;

  const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  descargarBlob(blob, "historial-mesas-de-examen.xls");
};

const PAGE = {
  width: 841.89,
  height: 595.28,
  margin: 22,
};

const COLORS = {
  blue: "#0A2540",
  blueSoft: "#eef4ff",
  border: "#dbe3ef",
  text: "#172033",
  muted: "#46576d",
  headerBg: "#f8fafc",
  cellBg: "#ffffff",
  cellAlt: "#f8fafc",
};

const hexToRgb = (hex) => {
  const clean = String(hex || "#000000").replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean.padEnd(6, "0").slice(0, 6);

  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
};

const colorCmd = (hex, operator) => {
  const [r, g, b] = hexToRgb(hex).map((item) => Number.isFinite(item) ? item.toFixed(3) : "0.000");
  return `${r} ${g} ${b} ${operator}`;
};

const winAnsiSpecial = {
  "€": 128,
  "‚": 130,
  "ƒ": 131,
  "„": 132,
  "…": 133,
  "†": 134,
  "‡": 135,
  "ˆ": 136,
  "‰": 137,
  "Š": 138,
  "‹": 139,
  "Œ": 140,
  "Ž": 142,
  "‘": 145,
  "’": 146,
  "“": 147,
  "”": 148,
  "•": 149,
  "–": 150,
  "—": 151,
  "˜": 152,
  "™": 153,
  "š": 154,
  "›": 155,
  "œ": 156,
  "ž": 158,
  "Ÿ": 159,
};

const normalizarTextoPdf = (texto) => String(texto ?? "")
  .replace(/\r?\n/g, " ")
  .replace(/\s+/g, " ")
  .replace(/·/g, "-")
  .trim();

const byteWinAnsi = (char) => {
  if (Object.prototype.hasOwnProperty.call(winAnsiSpecial, char)) return winAnsiSpecial[char];
  const code = char.charCodeAt(0);
  if (code >= 0 && code <= 255) return code;
  return 63;
};

const escapePdfText = (texto) => {
  const clean = normalizarTextoPdf(texto);
  let out = "";

  for (const char of clean) {
    const byte = byteWinAnsi(char);
    if (byte === 40 || byte === 41 || byte === 92) {
      out += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 32 || byte > 126) {
      out += `\\${byte.toString(8).padStart(3, "0")}`;
    } else {
      out += String.fromCharCode(byte);
    }
  }

  return out;
};

const medirTexto = (texto, size = 10, bold = false) => {
  const clean = normalizarTextoPdf(texto);
  const factor = bold ? 0.56 : 0.52;
  return clean.length * size * factor;
};

const recortarLinea = (texto, maxWidth, size, bold) => {
  let linea = normalizarTextoPdf(texto);
  if (medirTexto(linea, size, bold) <= maxWidth) return linea;

  while (linea.length > 3 && medirTexto(`${linea}...`, size, bold) > maxWidth) {
    linea = linea.slice(0, -1).trimEnd();
  }

  return `${linea}...`;
};

const wrapText = (texto, maxWidth, size = 8, bold = false, maxLines = 2) => {
  const clean = normalizarTextoPdf(texto);
  if (!clean) return [""];

  const words = clean.split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (medirTexto(next, size, bold) <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = recortarLinea(visible[maxLines - 1], maxWidth, size, bold);
    return visible;
  }

  return lines.map((line) => recortarLinea(line, maxWidth, size, bold));
};

class PdfCanvas {
  constructor() {
    this.pages = [];
    this.current = [];
  }

  beginPage() {
    if (this.current.length > 0) this.endPage();
    this.current = [];
  }

  endPage() {
    this.pages.push(this.current.join(""));
    this.current = [];
  }

  topY(yTop, height = 0) {
    return PAGE.height - yTop - height;
  }

  raw(value) {
    this.current.push(value);
  }

  rect(x, yTop, width, height, { fill = null, stroke = null, lineWidth = 0.5 } = {}) {
    const y = this.topY(yTop, height);
    this.raw("q\n");
    this.raw(`${lineWidth.toFixed(2)} w\n`);
    if (fill) this.raw(`${colorCmd(fill, "rg")}\n`);
    if (stroke) this.raw(`${colorCmd(stroke, "RG")}\n`);
    this.raw(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? "B" : fill ? "f" : "S"}\n`);
    this.raw("Q\n");
  }

  text(texto, x, yTop, {
    size = 8,
    font = "F1",
    color = COLORS.text,
    maxWidth = null,
    align = "left",
  } = {}) {
    const bold = font === "F2";
    const clean = maxWidth ? recortarLinea(texto, maxWidth, size, bold) : normalizarTextoPdf(texto);
    const textWidth = medirTexto(clean, size, bold);
    let tx = x;

    if (maxWidth && align === "center") {
      tx = x + Math.max(0, (maxWidth - textWidth) / 2);
    } else if (maxWidth && align === "right") {
      tx = x + Math.max(0, maxWidth - textWidth);
    }

    const baseline = this.topY(yTop + size, 0);
    this.raw("q\n");
    this.raw(`${colorCmd(color, "rg")}\n`);
    this.raw(`BT /${font} ${size.toFixed(2)} Tf 1 0 0 1 ${tx.toFixed(2)} ${baseline.toFixed(2)} Tm (${escapePdfText(clean)}) Tj ET\n`);
    this.raw("Q\n");
  }

  wrappedText(texto, x, yTop, width, {
    size = 8,
    font = "F1",
    color = COLORS.text,
    maxLines = 2,
    lineHeight = null,
    align = "left",
  } = {}) {
    const bold = font === "F2";
    const lines = wrapText(texto, width, size, bold, maxLines);
    const lh = lineHeight || size + 2;

    lines.forEach((line, index) => {
      this.text(line, x, yTop + (index * lh), { size, font, color, maxWidth: width, align });
    });
  }
}

const xColumna = (columnas, index) => PAGE.margin + columnas.slice(0, index).reduce((total, col) => total + col.width, 0);

const dibujarHeaderSeccion = (pdf, { titulo, subtitulo, pagina, totalPaginas }) => {
  const x = PAGE.margin;
  const width = PAGE.width - (PAGE.margin * 2);

  pdf.rect(x, 18, width, 50, { fill: COLORS.headerBg, stroke: COLORS.blue, lineWidth: 1 });
  pdf.text(titulo, x + 14, 32, { size: 15, font: "F2", color: COLORS.blue, maxWidth: 520 });
  pdf.text(subtitulo, x + 14, 53, { size: 8.5, font: "F2", color: COLORS.muted, maxWidth: 530 });
  pdf.text(`Página ${pagina} de ${totalPaginas}`, x + width - 150, 37, { size: 8.5, font: "F2", color: COLORS.muted, maxWidth: 140, align: "right" });
};

const dibujarTablaHeader = (pdf, columnas, yTop) => {
  columnas.forEach((col, index) => {
    const x = xColumna(columnas, index);
    pdf.rect(x, yTop, col.width, 22, { fill: COLORS.blue, stroke: COLORS.blue, lineWidth: 0.6 });
    pdf.text(col.label, x + 3, yTop + 8, { size: 7.2, font: "F2", color: "#ffffff", maxWidth: col.width - 6, align: "center" });
  });
};

const dibujarFilaTabla = (pdf, columnas, fila, yTop, index) => {
  const rowHeight = 25;
  const fill = index % 2 === 0 ? COLORS.cellBg : COLORS.cellAlt;

  columnas.forEach((col, colIndex) => {
    const x = xColumna(columnas, colIndex);
    pdf.rect(x, yTop, col.width, rowHeight, { fill, stroke: COLORS.border, lineWidth: 0.45 });
    pdf.wrappedText(textoCorto(fila[col.key]), x + 3, yTop + 6, col.width - 6, {
      size: col.size || 7.4,
      font: col.bold ? "F2" : "F1",
      align: col.align || "left",
      maxLines: col.maxLines || 2,
      lineHeight: 8.8,
    });
  });
};

const dibujarTablaVacia = (pdf, columnas, yTop) => {
  const width = columnas.reduce((total, col) => total + col.width, 0);
  pdf.rect(PAGE.margin, yTop, width, 32, { fill: COLORS.cellBg, stroke: COLORS.border, lineWidth: 0.5 });
  pdf.text("Sin registros para exportar.", PAGE.margin, yTop + 11, { size: 9, font: "F2", color: COLORS.muted, maxWidth: width, align: "center" });
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const columnasResultadosPdf = [
  { key: "fecha_nota", label: "Fecha nota", width: 64, align: "center" },
  { key: "fecha_mesa", label: "Fecha mesa", width: 64, align: "center" },
  { key: "mesa", label: "Mesa", width: 38, align: "center", bold: true },
  { key: "alumno", label: "Alumno", width: 150, bold: true },
  { key: "dni", label: "DNI", width: 62, align: "center", bold: true },
  { key: "materia", label: "Previa / Materia", width: 150, bold: true },
  { key: "docente", label: "Docente", width: 130 },
  { key: "tipo", label: "Tipo", width: 50, align: "center" },
  { key: "nota", label: "Nota", width: 32, align: "center", bold: true },
  { key: "estado", label: "Estado", width: 54, align: "center" },
];

const columnasDetallePdf = [
  { key: "fecha", label: "Fecha", width: 70, align: "center" },
  { key: "grupo", label: "Grupo", width: 42, align: "center", bold: true },
  { key: "mesa", label: "Mesa", width: 42, align: "center", bold: true },
  { key: "alumno", label: "Alumno", width: 150, bold: true },
  { key: "dni", label: "DNI", width: 64, align: "center", bold: true },
  { key: "materia", label: "Materia", width: 155, bold: true },
  { key: "docente", label: "Docente", width: 135 },
  { key: "tipo", label: "Tipo", width: 55, align: "center" },
  { key: "nota", label: "Nota", width: 37, align: "center", bold: true },
  { key: "activa", label: "Activa", width: 44, align: "center" },
];

const construirPaginasSeccion = ({ titulo, subtitulo, columnas, filas }) => {
  const maxRowsPerPage = 17;
  const partes = filas.length > 0 ? chunk(filas, maxRowsPerPage) : [[]];
  return partes.map((filasPagina, index) => ({
    titulo,
    subtitulo,
    columnas,
    filas: filasPagina,
    paginaSeccion: index + 1,
    totalPaginasSeccion: partes.length,
  }));
};

const generarPdfHistorial = ({ resultados, detalle, busqueda }) => {
  const pdf = new PdfCanvas();
  const filtro = String(busqueda || "").trim();
  const subtituloBase = filtro ? `Filtro aplicado: ${filtro}` : "Exportación completa del historial guardado";

  const paginas = [
    ...construirPaginasSeccion({
      titulo: "HISTORIAL DE NOTAS Y PREVIAS",
      subtitulo: `${subtituloBase} · ${resultados.length} registros`,
      columnas: columnasResultadosPdf,
      filas: resultados,
    }),
    ...construirPaginasSeccion({
      titulo: "DETALLE DEL ARMADO DE MESAS",
      subtitulo: `Todas las mesas del historial en una sola tabla · ${detalle.length} registros`,
      columnas: columnasDetallePdf,
      filas: detalle,
    }),
  ];

  paginas.forEach((pagina, index) => {
    pdf.beginPage();
    dibujarHeaderSeccion(pdf, {
      titulo: pagina.titulo,
      subtitulo: pagina.subtitulo,
      pagina: index + 1,
      totalPaginas: paginas.length,
    });
    const tableTop = 82;
    const headerHeight = 22;
    const rowHeight = 25;
    dibujarTablaHeader(pdf, pagina.columnas, tableTop);

    if (pagina.filas.length === 0) {
      dibujarTablaVacia(pdf, pagina.columnas, tableTop + headerHeight);
    } else {
      pagina.filas.forEach((fila, rowIndex) => {
        dibujarFilaTabla(pdf, pagina.columnas, fila, tableTop + headerHeight + (rowIndex * rowHeight), rowIndex);
      });
    }

    pdf.endPage();
  });

  return construirDocumentoPdf(pdf.pages);
};

const construirDocumentoPdf = (pageStreams) => {
  const objects = [null];
  const addObject = (content) => {
    objects.push(content);
    return objects.length - 1;
  };

  const catalogId = addObject(null);
  const pagesId = addObject(null);
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds = [];

  pageStreams.forEach((stream) => {
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width.toFixed(2)} ${PAGE.height.toFixed(2)}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }

  return bytes;
};

export const descargarPdfHistorialMesas = (data = {}) => {
  const resultados = construirResultadosHistorial(data);
  const detalle = construirDetallePlanoHistorial(data);

  if (resultados.length === 0 && detalle.length === 0) {
    throw new Error("No hay historial para exportar.");
  }

  const bytes = generarPdfHistorial({ resultados, detalle, busqueda: data?.busqueda });
  const blob = new Blob([bytes], { type: "application/pdf" });
  descargarBlob(blob, "historial-mesas-de-examen.pdf");
};

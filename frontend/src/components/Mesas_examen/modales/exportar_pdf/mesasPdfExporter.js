const PAGE = {
  width: 841.89,
  height: 595.28,
  margin: 24,
};

const COLORS = {
  blue: "#1f4b93",
  blueDark: "#15376f",
  blueSoft: "#eef4ff",
  border: "#dbe3ef",
  borderStrong: "#c4d0e0",
  text: "#172033",
  muted: "#46576d",
  headerBg: "#f8fafc",
  cellBg: "#ffffff",
  cellAlt: "#f8fafc",
  cellSoft: "#f4f7fb",
};

const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

export const construirTituloPdfExportacion = ({ tituloFijo = "MESAS DE EXAMEN", continuacion = "" } = {}) => {
  const fijo = String(tituloFijo || "MESAS DE EXAMEN").trim() || "MESAS DE EXAMEN";
  const extra = String(continuacion || "").trim();
  return extra ? `${fijo} ${extra}` : fijo;
};

const textoCorto = (valor, fallback = "-") => {
  const texto = String(valor || "").trim();
  return texto || fallback;
};

const textoCursoDivision = (curso, division) => {
  const partes = [curso, division].map((item) => String(item || "").trim()).filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : "-";
};

const parseFechaMesa = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return null;

  let dia = null;
  let mes = null;
  let anio = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    const [y, m, d] = texto.slice(0, 10).split("-").map(Number);
    anio = y;
    mes = m;
    dia = d;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [d, m, y] = texto.split("/").map(Number);
    anio = y;
    mes = m;
    dia = d;
  }

  if (!dia || !mes || !anio) return null;

  const fecha = new Date(anio, mes - 1, dia);
  if (Number.isNaN(fecha.getTime())) return null;

  return {
    dia,
    mes,
    anio,
    diaSemana: DIAS_ES[fecha.getDay()],
    mesTexto: MESES_ES[mes - 1] || "",
  };
};

const obtenerPartesFechaMesa = (item) =>
  parseFechaMesa(item?.fecha_mesa) || parseFechaMesa(item?.fecha) || null;

const normalizarHora = (valor) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (/hs\.?$/i.test(texto)) return texto.toUpperCase();
  return `${texto.slice(0, 5)} HS.`.toUpperCase();
};

const obtenerHoraMesa = (item) => {
  const turno = String(item?.turno || "").toLowerCase();
  const hora = normalizarHora(item?.hora);
  if (hora) return hora;
  if (turno.includes("mañana") || turno.includes("manana")) return "07:30 HS.";
  if (turno.includes("tarde")) return "13:30 HS.";
  return "-";
};

const obtenerTurnoMesa = (item) => textoCorto(item?.turno).toUpperCase();

const obtenerFechaResumenPdf = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);
  if (!partes) return `${turno} · ${hora}`;
  return `${partes.diaSemana} ${partes.dia} · ${turno} · ${hora}`;
};

const obtenerFechaStack = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);

  if (!partes) {
    return [textoCorto(item?.fecha || item?.fecha_mesa), turno, hora];
  }

  return [partes.diaSemana, String(partes.dia), partes.mesTexto, turno, hora];
};

const obtenerTextoNumerosMesa = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  const desdeNumeros = numeros
    .map((numero) => numero?.numero_mesa)
    .filter((numero) => numero !== undefined && numero !== null && numero !== "")
    .join(" · ");
  if (desdeNumeros) return desdeNumeros;
  return String(grupo?.numeros_mesa_texto || grupo?.numero_mesa || "-").replace(/,/g, " · ");
};

const obtenerCursoAlumno = (alumno) => {
  if (!alumno) return "-";

  const cursoMateria = textoCursoDivision(alumno.curso_materia, alumno.division_materia);
  if (cursoMateria !== "-") return cursoMateria;

  const cursoMateriaTexto = textoCorto(alumno.curso_materia_texto, "");
  if (cursoMateriaTexto) return cursoMateriaTexto;

  const cursoAlumno = textoCursoDivision(alumno.curso_alumno, alumno.division_alumno);
  if (cursoAlumno !== "-") return cursoAlumno;

  const cursoCursando = textoCursoDivision(alumno.cursando_curso, alumno.cursando_division);
  if (cursoCursando !== "-") return cursoCursando;

  return textoCorto(alumno.curso);
};

const obtenerMateriaAlumno = (alumno, numero) =>
  textoCorto(alumno?.materia || numero?.materia, "Sin materia");

const obtenerDocenteAlumno = (alumno, numero) =>
  textoCorto(alumno?.docente || numero?.docente, "Sin docente");

const obtenerNumerosVistaPdf = (grupo) => {
  const numeros = Array.isArray(grupo?.numeros) ? grupo.numeros : [];
  if (numeros.length > 0) return numeros;
  return [{
    numero_mesa: grupo?.numero_mesa || grupo?.numeros_mesa_texto || grupo?.id_grupo || "-",
    materia: grupo?.materia || "",
    docente: grupo?.docente || "",
    alumnos: Array.isArray(grupo?.alumnos) ? grupo.alumnos : [],
  }];
};

const agruparAlumnosParaVistaPdf = (numero) => {
  const alumnos = Array.isArray(numero?.alumnos) ? numero.alumnos : [];

  if (alumnos.length === 0) {
    return [{
      materia: textoCorto(numero?.materia, "Sin registros"),
      docente: textoCorto(numero?.docente, "Sin docente"),
      alumnos: [null],
    }];
  }

  const grupos = new Map();
  alumnos.forEach((alumno) => {
    const materia = obtenerMateriaAlumno(alumno, numero);
    const docente = obtenerDocenteAlumno(alumno, numero);
    const key = `${materia.toLowerCase()}__${docente.toLowerCase()}`;
    if (!grupos.has(key)) {
      grupos.set(key, { materia, docente, alumnos: [] });
    }
    grupos.get(key).alumnos.push(alumno);
  });

  return Array.from(grupos.values());
};

const construirFilasGrupo = (grupo) => {
  const numeros = obtenerNumerosVistaPdf(grupo);
  const filas = [];

  numeros.forEach((numero) => {
    const bloques = agruparAlumnosParaVistaPdf(numero);

    bloques.forEach((bloque) => {
      bloque.alumnos.forEach((alumno) => {
        filas.push({
          materia: bloque.materia,
          docente: bloque.docente,
          estudiante: alumno ? textoCorto(alumno.estudiante || alumno.alumno, "Sin estudiante") : "Sin alumnos vinculados",
          dni: alumno ? textoCorto(alumno.dni) : "-",
          curso: alumno ? obtenerCursoAlumno(alumno) : "-",
          nota: alumno && alumno.nota ? String(alumno.nota) : "-",
        });
      });
    });
  });

  return filas.length > 0 ? filas : [{
    materia: "Sin registros",
    estudiante: "Sin alumnos vinculados",
    dni: "-",
    curso: "-",
    nota: "-",
    docente: "Sin docente",
  }];
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

const wrapText = (texto, maxWidth, size = 10, bold = false, maxLines = 2) => {
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

const normalizarUrlLogo = (url) => {
  const value = String(url || "").trim();

  if (
    !value
    || value.toLowerCase() === "null"
    || value.toLowerCase() === "undefined"
    || value === "-"
  ) {
    return "";
  }

  return value;
};

const dataUrlToBytes = (dataUrl) => {
  const partes = String(dataUrl || "").split(",");
  if (partes.length < 2 || typeof window === "undefined" || typeof window.atob !== "function") {
    return null;
  }

  const binario = window.atob(partes[1]);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i) & 0xff;
  }

  return bytes;
};

const bytesToBinaryString = (bytes) => {
  const chunkSize = 8192;
  let out = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }

  return out;
};

const cargarImagenComoJpegAsset = (url) => new Promise((resolve) => {
  const logoUrl = normalizarUrlLogo(url);

  if (!logoUrl || typeof document === "undefined") {
    resolve(null);
    return;
  }

  const img = new Image();
  const esDataUrl = logoUrl.startsWith("data:");
  const esBlobUrl = logoUrl.startsWith("blob:");

  // Importante: si el logo viene como data URL desde el backend, no necesita CORS.
  // Si viene como URL pública externa, intentamos CORS; si el servidor no lo permite,
  // el fallback correcto es que el endpoint perfil_logo_institucional entregue logo_data_url.
  if (!esDataUrl && !esBlobUrl) {
    img.crossOrigin = "anonymous";
  }

  let resuelto = false;
  const finalizar = (asset) => {
    if (resuelto) return;
    resuelto = true;
    resolve(asset || null);
  };

  const timeout = window.setTimeout(() => finalizar(null), 8000);

  img.onload = () => {
    try {
      window.clearTimeout(timeout);

      const maxSize = 512;
      const widthOriginal = Math.max(1, img.naturalWidth || img.width || 1);
      const heightOriginal = Math.max(1, img.naturalHeight || img.height || 1);
      const ratio = Math.min(maxSize / widthOriginal, maxSize / heightOriginal, 1);
      const drawWidth = Math.max(1, Math.round(widthOriginal * ratio));
      const drawHeight = Math.max(1, Math.round(heightOriginal * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = drawWidth;
      canvas.height = drawHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finalizar(null);
        return;
      }

      // El PDF embebe el logo como JPEG. Esta base blanca evita que los PNG
      // con transparencia salgan con fondo negro en algunos visores.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, drawWidth, drawHeight);
      ctx.drawImage(img, 0, 0, drawWidth, drawHeight);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const bytes = dataUrlToBytes(dataUrl);

      if (!bytes || bytes.length === 0) {
        finalizar(null);
        return;
      }

      finalizar({
        name: "ImLogo",
        width: drawWidth,
        height: drawHeight,
        bytes,
      });
    } catch (_) {
      finalizar(null);
    }
  };

  img.onerror = () => {
    window.clearTimeout(timeout);
    finalizar(null);
  };

  img.src = logoUrl;
});

const calcularCajaImagen = (asset, maxWidth, maxHeight) => {
  if (!asset?.width || !asset?.height) {
    return { width: maxWidth, height: maxHeight, offsetX: 0, offsetY: 0 };
  }

  const ratio = Math.min(maxWidth / asset.width, maxHeight / asset.height);
  const width = asset.width * ratio;
  const height = asset.height * ratio;

  return {
    width,
    height,
    offsetX: (maxWidth - width) / 2,
    offsetY: (maxHeight - height) / 2,
  };
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

  rect(x, yTop, width, height, { fill = null, stroke = COLORS.border, lineWidth = 0.7 } = {}) {
    const y = this.topY(yTop, height);
    this.raw("q\n");
    if (fill) this.raw(`${colorCmd(fill, "rg")}\n`);
    if (stroke) this.raw(`${colorCmd(stroke, "RG")}\n`);
    this.raw(`${lineWidth.toFixed(2)} w\n`);
    this.raw(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? "B" : fill ? "f" : "S"}\n`);
    this.raw("Q\n");
  }

  text(texto, x, yTop, {
    size = 10,
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

  image(name, x, yTop, width, height) {
    const y = this.topY(yTop, height);
    this.raw("q\n");
    this.raw(`${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n`);
    this.raw(`/${name} Do\n`);
    this.raw("Q\n");
  }

  wrappedText(texto, x, yTop, width, {
    size = 9,
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

const columnas = [
  { key: "hora", label: "Hora", width: 78 },
  { key: "materia", label: "Espacio Curricular", width: 185 },
  { key: "estudiante", label: "Estudiante", width: 190 },
  { key: "dni", label: "DNI", width: 68 },
  { key: "curso", label: "Curso", width: 62 },
  { key: "nota", label: "Nota", width: 54 },
  { key: "docente", label: "Docentes", width: 156.89 },
];

const xColumna = (index) => PAGE.margin + columnas.slice(0, index).reduce((total, col) => total + col.width, 0);

const dibujarLogoHeader = (pdf, logoAsset, x, yTop, width, height) => {
  if (logoAsset) {
    pdf.rect(x, yTop, width, height, { fill: "#ffffff", stroke: COLORS.borderStrong, lineWidth: 0.7 });
    const caja = calcularCajaImagen(logoAsset, width - 8, height - 8);
    pdf.image(logoAsset.name, x + 4 + caja.offsetX, yTop + 4 + caja.offsetY, caja.width, caja.height);
    return;
  }

  pdf.rect(x, yTop, width, height, { fill: COLORS.blue, stroke: COLORS.blue, lineWidth: 0.7 });
  pdf.text("LOGO", x + 8, yTop + 14, { size: 9, font: "F2", color: "#ffffff", maxWidth: width - 16, align: "center" });
};

const dibujarHeaderMesa = (pdf, grupo, titulo, paginaGrupo, totalPaginasGrupo, logoAsset, institucionNombre) => {
  const x = PAGE.margin;
  const width = PAGE.width - (PAGE.margin * 2);
  const institucion = textoCorto(institucionNombre, "Institución");

  pdf.rect(x, 22, width, 58, { fill: COLORS.headerBg, stroke: COLORS.blue, lineWidth: 1.2 });
  dibujarLogoHeader(pdf, logoAsset, x + 12, 33, 44, 36);

  pdf.text(titulo, x + 70, 34, { size: 17, font: "F2", color: COLORS.blue, maxWidth: 420 });
  pdf.text(institucion, x + 70, 57, { size: 9.5, font: "F2", color: COLORS.muted, maxWidth: 330 });

  const metaX = x + width - 260;
  pdf.text(obtenerFechaResumenPdf(grupo), metaX, 35, { size: 9.5, font: "F2", color: COLORS.text, maxWidth: 250, align: "right" });
  pdf.text(`N° de mesa: ${obtenerTextoNumerosMesa(grupo)}`, metaX, 51, { size: 10.5, font: "F2", color: COLORS.blue, maxWidth: 250, align: "right" });

  if (totalPaginasGrupo > 1) {
    pdf.text(`Página ${paginaGrupo} de ${totalPaginasGrupo}`, metaX, 66, { size: 8.5, font: "F1", color: COLORS.muted, maxWidth: 250, align: "right" });
  }
};

const dibujarTablaHeader = (pdf, yTop) => {
  columnas.forEach((col, index) => {
    const x = xColumna(index);
    pdf.rect(x, yTop, col.width, 24, { fill: COLORS.blue, stroke: COLORS.blue, lineWidth: 0.7 });
    pdf.text(col.label, x + 4, yTop + 8, { size: 8.5, font: "F2", color: "#ffffff", maxWidth: col.width - 8, align: "center" });
  });
};

const dibujarCeldaTexto = (pdf, texto, x, yTop, width, height, opciones = {}) => {
  const {
    size = 8.2,
    font = "F1",
    align = "left",
    color = COLORS.text,
    maxLines = 2,
    paddingX = 5,
    paddingY = 6,
  } = opciones;

  pdf.wrappedText(texto, x + paddingX, yTop + paddingY, width - (paddingX * 2), {
    size,
    font,
    align,
    color,
    maxLines,
    lineHeight: size + 2,
  });
};

const dibujarHoraStack = (pdf, grupo, x, yTop, width, height) => {
  const stack = obtenerFechaStack(grupo).filter(Boolean);
  const lineHeight = 10.5;
  const totalHeight = stack.length * lineHeight;
  const inicioY = yTop + Math.max(6, (height - totalHeight) / 2);

  stack.forEach((linea, index) => {
    pdf.text(linea, x + 4, inicioY + (index * lineHeight), {
      size: 8.6,
      font: "F2",
      color: COLORS.blue,
      maxWidth: width - 8,
      align: "center",
    });
  });
};

const dibujarPaginaMesa = (pdf, { grupo, titulo, filas, paginaGrupo, totalPaginasGrupo, logoAsset, institucionNombre }) => {
  const tableTop = 92;
  const headerHeight = 24;
  const rowHeight = 28;
  const bodyTop = tableTop + headerHeight;

  dibujarHeaderMesa(pdf, grupo, titulo, paginaGrupo, totalPaginasGrupo, logoAsset, institucionNombre);
  dibujarTablaHeader(pdf, tableTop);

  const bodyHeight = filas.length * rowHeight;
  pdf.rect(xColumna(0), bodyTop, columnas[0].width, bodyHeight, { fill: COLORS.blueSoft, stroke: COLORS.border, lineWidth: 0.7 });
  dibujarHoraStack(pdf, grupo, xColumna(0), bodyTop, columnas[0].width, bodyHeight);

  filas.forEach((fila, index) => {
    const y = bodyTop + (index * rowHeight);
    const fill = index % 2 === 0 ? COLORS.cellBg : COLORS.cellAlt;

    columnas.slice(1).forEach((col, colIndex) => {
      const absoluteIndex = colIndex + 1;
      const x = xColumna(absoluteIndex);
      const isSoft = col.key === "materia" || col.key === "docente";
      pdf.rect(x, y, col.width, rowHeight, {
        fill: isSoft ? COLORS.cellSoft : fill,
        stroke: COLORS.border,
        lineWidth: 0.7,
      });
    });

    dibujarCeldaTexto(pdf, fila.materia, xColumna(1), y, columnas[1].width, rowHeight, { font: "F2", maxLines: 2 });
    dibujarCeldaTexto(pdf, fila.estudiante, xColumna(2), y, columnas[2].width, rowHeight, { font: "F2", maxLines: 2 });
    dibujarCeldaTexto(pdf, fila.dni, xColumna(3), y, columnas[3].width, rowHeight, { font: "F2", align: "center", maxLines: 1, paddingY: 9 });
    dibujarCeldaTexto(pdf, fila.curso, xColumna(4), y, columnas[4].width, rowHeight, { font: "F2", align: "center", maxLines: 1, paddingY: 9 });
    dibujarCeldaTexto(pdf, fila.nota, xColumna(5), y, columnas[5].width, rowHeight, { font: "F2", align: "center", maxLines: 1, paddingY: 9 });
    dibujarCeldaTexto(pdf, fila.docente, xColumna(6), y, columnas[6].width, rowHeight, { font: "F2", maxLines: 2 });
  });
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const generarPdfMesas = ({ mesas = [], titulo = "MESAS DE EXAMEN", logoAsset = null, institucionNombre = "Institución" } = {}) => {
  const pdf = new PdfCanvas();
  const maxRowsPerPage = 16;

  if (!Array.isArray(mesas) || mesas.length === 0) {
    pdf.beginPage();
    pdf.rect(PAGE.margin, 22, PAGE.width - (PAGE.margin * 2), 58, { fill: COLORS.headerBg, stroke: COLORS.blue, lineWidth: 1.2 });
    dibujarLogoHeader(pdf, logoAsset, PAGE.margin + 12, 33, 44, 36);
    pdf.text(titulo, PAGE.margin + 70, 40, { size: 18, font: "F2", color: COLORS.blue, maxWidth: 500 });
    pdf.text(textoCorto(institucionNombre, "Institución"), PAGE.margin + 70, 62, { size: 9.5, font: "F2", color: COLORS.muted, maxWidth: 330 });
    pdf.text("No hay mesas visibles para exportar.", PAGE.margin + 18, 105, { size: 12, font: "F2", color: COLORS.text, maxWidth: 500 });
    pdf.endPage();
    return construirDocumentoPdf(pdf.pages, { logoAsset });
  }

  mesas.forEach((grupo) => {
    const filas = construirFilasGrupo(grupo);
    const paginas = chunk(filas, maxRowsPerPage);

    paginas.forEach((filasPagina, index) => {
      pdf.beginPage();
      dibujarPaginaMesa(pdf, {
        grupo,
        titulo,
        filas: filasPagina,
        paginaGrupo: index + 1,
        totalPaginasGrupo: paginas.length,
        logoAsset,
        institucionNombre,
      });
      pdf.endPage();
    });
  });

  return construirDocumentoPdf(pdf.pages, { logoAsset });
};

const construirDocumentoPdf = (pageStreams, { logoAsset = null } = {}) => {
  const objects = [null];
  const addObject = (content) => {
    objects.push(content);
    return objects.length - 1;
  };

  const catalogId = addObject(null);
  const pagesId = addObject(null);
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let logoObjectId = null;

  if (logoAsset?.bytes?.length) {
    const imageStream = bytesToBinaryString(logoAsset.bytes);
    logoObjectId = addObject(`<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(logoAsset.width))} /Height ${Math.max(1, Math.round(logoAsset.height))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoAsset.bytes.length} >>\nstream\n${imageStream}\nendstream`);
  }

  const pageIds = [];
  const xObjectResource = logoObjectId ? `/XObject << /${logoAsset.name} ${logoObjectId} 0 R >> ` : "";

  pageStreams.forEach((stream) => {
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width.toFixed(2)} ${PAGE.height.toFixed(2)}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> ${xObjectResource}>> /Contents ${contentId} 0 R >>`);
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

const limpiarNombreArchivo = (valor) => {
  const base = String(valor || "mesas-de-examen")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "mesas-de-examen";
};

export const descargarPdfMesas = async ({ mesas = [], tituloFijo, continuacion, logoUrl = "", institucionNombre = "Institución" } = {}) => {
  const titulo = construirTituloPdfExportacion({ tituloFijo, continuacion });
  const logoAsset = await cargarImagenComoJpegAsset(logoUrl);
  const bytes = generarPdfMesas({ mesas, titulo, logoAsset, institucionNombre });
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${limpiarNombreArchivo(titulo)}.pdf`;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

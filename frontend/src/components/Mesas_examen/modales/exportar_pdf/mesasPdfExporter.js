import escudoIpEtUrl from "../../../../imagenes/Escudo.png";

// Diseño del PDF basado en la planilla institucional de mesas de examen.
// Formato A4 vertical: encabezado centrado y tablas compactas en escala de grises.
const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 28.35,
};

const COLORS = {
  title: "#111111",
  text: "#565656",
  textStrong: "#505050",
  border: "#c7c7c7",
  borderStrong: "#222222",
  headerBg: "#eeeeee",
  cellBg: "#ffffff",
};

const TABLE = {
  top: 86,
  bottom: 813,
  gap: 7,
  headerHeight: 18,
  minRowHeight: 18,
  bodySize: 7.6,
  strongSize: 7.7,
  bodyLineHeight: 9.1,
  paddingX: 4,
  paddingY: 4.7,
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


const obtenerFechaStack = (item) => {
  const partes = obtenerPartesFechaMesa(item);
  const turno = obtenerTurnoMesa(item);
  const hora = obtenerHoraMesa(item);

  if (!partes) {
    return [textoCorto(item?.fecha || item?.fecha_mesa), turno, hora];
  }

  return [partes.diaSemana, String(partes.dia), partes.mesTexto, turno, hora];
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
          nota: alumno && alumno.nota !== undefined && alumno.nota !== null && String(alumno.nota).trim() ? String(alumno.nota) : "-",
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
  const factor = bold ? 0.59 : 0.54;
  return clean.length * size * factor;
};

// Métricas reales de Helvetica-Bold (unidades AFM / 1000). Se usan en el
// encabezado institucional para que ambas líneas queden centradas sobre el
// eje real de la hoja, independientemente de la cantidad de letras anchas o finas.
const HELVETICA_BOLD_WIDTHS = {
  " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 278,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 722, W: 944, X: 722, Y: 722, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556, "`": 278,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584, "°": 400,
};

const medirTextoHelveticaBold = (texto, size = 10) => {
  const clean = normalizarTextoPdf(texto);
  const unidades = Array.from(clean).reduce((total, char) => total + (HELVETICA_BOLD_WIDTHS[char] || 556), 0);
  return (unidades * size) / 1000;
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
  { key: "hora", label: "Hora", width: 62 },
  { key: "materia", label: "Espacio Curricular", width: 116 },
  { key: "estudiante", label: "Estudiante", width: 140 },
  { key: "dni", label: "DNI", width: 56 },
  { key: "curso", label: "Curso", width: 46 },
  { key: "nota", label: "Nota", width: 35 },
  { key: "docente", label: "Docentes", width: 83.58 },
];

const anchoTabla = columnas.reduce((total, col) => total + col.width, 0);
const xColumna = (index) => PAGE.margin + columnas.slice(0, index).reduce((total, col) => total + col.width, 0);
const textoMayuscula = (valor) => normalizarTextoPdf(valor).toUpperCase();

const dibujarLogoHeader = (pdf, logoAsset, x, yTop, width, height) => {
  if (!logoAsset) return;

  const caja = calcularCajaImagen(logoAsset, width, height);
  pdf.image(logoAsset.name, x + caja.offsetX, yTop + caja.offsetY, caja.width, caja.height);
};

const dibujarHeaderDocumento = (pdf, titulo, logoAsset, institucionNombre = "Institución") => {
  const institucion = textoCorto(institucionNombre, "Institución");
  const contentWidth = PAGE.width - (PAGE.margin * 2);
  const tituloHeader = textoMayuscula(titulo);
  const xTitulo = (PAGE.width - medirTextoHelveticaBold(tituloHeader, 18)) / 2;
  const xInstitucion = (PAGE.width - medirTextoHelveticaBold(institucion, 10)) / 2;

  dibujarLogoHeader(pdf, logoAsset, PAGE.margin + 2, 15, 37, 43);

  // El escudo queda a la izquierda, pero los títulos se centran sobre toda la hoja.
  pdf.text(tituloHeader, xTitulo, 19, {
    size: 18,
    font: "F2",
    color: COLORS.title,
  });

  pdf.text(institucion, xInstitucion, 41, {
    size: 10,
    font: "F2",
    color: COLORS.title,
  });

  pdf.rect(PAGE.margin, 67, contentWidth, 0.9, {
    fill: COLORS.borderStrong,
    stroke: COLORS.borderStrong,
    lineWidth: 0.5,
  });
};

const dibujarTablaHeader = (pdf, yTop) => {
  columnas.forEach((col, index) => {
    const x = xColumna(index);
    pdf.rect(x, yTop, col.width, TABLE.headerHeight, {
      fill: COLORS.headerBg,
      stroke: COLORS.border,
      lineWidth: 0.55,
    });
    pdf.text(col.label, x + 2, yTop + 5.1, {
      size: 7.7,
      font: "F2",
      color: COLORS.textStrong,
      maxWidth: col.width - 4,
      align: "center",
    });
  });
};

const dibujarCeldaTexto = (pdf, texto, x, yTop, width, height, opciones = {}) => {
  const {
    size = TABLE.bodySize,
    font = "F1",
    align = "left",
    color = COLORS.text,
    maxLines = 6,
    paddingX = TABLE.paddingX,
    lineHeight = TABLE.bodyLineHeight,
    verticalCenter = true,
  } = opciones;

  const bold = font === "F2";
  const lineas = wrapText(textoMayuscula(texto), width - (paddingX * 2), size, bold, maxLines);
  const altoTexto = lineas.length * lineHeight;
  const inicioY = verticalCenter
    ? yTop + Math.max(TABLE.paddingY, ((height - altoTexto) / 2) + 0.5)
    : yTop + TABLE.paddingY;

  lineas.forEach((linea, index) => {
    pdf.text(linea, x + paddingX, inicioY + (index * lineHeight), {
      size,
      font,
      color,
      maxWidth: width - (paddingX * 2),
      align,
    });
  });
};

const dibujarHoraStack = (pdf, grupo, x, yTop, width, height) => {
  const stack = obtenerFechaStack(grupo).filter(Boolean).map(textoMayuscula);
  const size = 7.7;
  const lineHeight = 9.2;
  const totalHeight = stack.length * lineHeight;
  const inicioY = yTop + Math.max(TABLE.paddingY, ((height - totalHeight) / 2) + 0.4);

  stack.forEach((linea, index) => {
    pdf.text(linea, x + TABLE.paddingX, inicioY + (index * lineHeight), {
      size,
      font: "F2",
      color: COLORS.textStrong,
      maxWidth: width - (TABLE.paddingX * 2),
      align: "center",
    });
  });
};

const construirSpans = (filas, key) => {
  const spans = [];
  let inicio = 0;

  while (inicio < filas.length) {
    const valor = filas[inicio]?.[key] || "-";
    let fin = inicio + 1;
    while (fin < filas.length && String(filas[fin]?.[key] || "-") === String(valor)) {
      fin += 1;
    }
    spans.push({ inicio, cantidad: fin - inicio, valor });
    inicio = fin;
  }

  return spans;
};

const altoMinimoTexto = (texto, width, size, font = "F1", maxLines = 6) => {
  const bold = font === "F2";
  const lineas = wrapText(textoMayuscula(texto), width - (TABLE.paddingX * 2), size, bold, maxLines);
  return Math.max(TABLE.minRowHeight, (lineas.length * TABLE.bodyLineHeight) + (TABLE.paddingY * 2));
};

const altoMinimoHoraStack = (grupo) => {
  const stack = obtenerFechaStack(grupo).filter(Boolean);
  const lineHeightHora = 9.2;
  const altoTextoHora = stack.length * lineHeightHora;

  // Cuando una mesa tiene muy pocas filas, la celda de Hora ocupa poca altura
  // y el bloque vertical de fecha/turno/hora puede invadir la siguiente tabla.
  // Este mínimo reserva espacio real para esas 5 líneas antes de dibujar.
  return Math.max(TABLE.minRowHeight, altoTextoHora + (TABLE.paddingY * 2) + 3);
};

const repartirAltoFaltante = (alturas, requerido) => {
  const actual = alturas.reduce((total, item) => total + item, 0);
  if (actual >= requerido || alturas.length === 0) return;

  const faltantePorFila = (requerido - actual) / alturas.length;
  for (let i = 0; i < alturas.length; i += 1) {
    alturas[i] += faltantePorFila;
  }
};

const ajustarAlturasPorSpan = (alturas, spans, keyWidth, size) => {
  spans.forEach((span) => {
    const requerido = altoMinimoTexto(span.valor, keyWidth, size, "F2");
    const actual = alturas.slice(span.inicio, span.inicio + span.cantidad).reduce((total, item) => total + item, 0);
    if (actual >= requerido) return;

    const faltantePorFila = (requerido - actual) / span.cantidad;
    for (let i = span.inicio; i < span.inicio + span.cantidad; i += 1) {
      alturas[i] += faltantePorFila;
    }
  });
};

const prepararBloqueTabla = (grupo, filas) => {
  const spansMateria = construirSpans(filas, "materia");
  const spansDocente = construirSpans(filas, "docente");
  const alturas = filas.map((fila) => Math.max(
    TABLE.minRowHeight,
    altoMinimoTexto(fila.estudiante, columnas[2].width, TABLE.bodySize),
    altoMinimoTexto(fila.dni, columnas[3].width, TABLE.bodySize),
    altoMinimoTexto(fila.curso, columnas[4].width, TABLE.bodySize),
    altoMinimoTexto(fila.nota, columnas[5].width, TABLE.bodySize),
  ));

  ajustarAlturasPorSpan(alturas, spansMateria, columnas[1].width, TABLE.strongSize);
  ajustarAlturasPorSpan(alturas, spansDocente, columnas[6].width, TABLE.strongSize);
  repartirAltoFaltante(alturas, altoMinimoHoraStack(grupo));

  const altoCuerpo = alturas.reduce((total, item) => total + item, 0);
  return {
    grupo,
    filas,
    spansMateria,
    spansDocente,
    alturas,
    height: TABLE.headerHeight + altoCuerpo,
  };
};

const obtenerYFila = (bloque, index, bodyTop) => bodyTop + bloque.alturas
  .slice(0, index)
  .reduce((total, height) => total + height, 0);

const obtenerAltoSpan = (bloque, span) => bloque.alturas
  .slice(span.inicio, span.inicio + span.cantidad)
  .reduce((total, height) => total + height, 0);

const dibujarBloqueTabla = (pdf, bloque, yTop) => {
  const bodyTop = yTop + TABLE.headerHeight;
  const bodyHeight = bloque.alturas.reduce((total, height) => total + height, 0);

  dibujarTablaHeader(pdf, yTop);

  pdf.rect(xColumna(0), bodyTop, columnas[0].width, bodyHeight, {
    fill: COLORS.cellBg,
    stroke: COLORS.border,
    lineWidth: 0.55,
  });
  dibujarHoraStack(pdf, bloque.grupo, xColumna(0), bodyTop, columnas[0].width, bodyHeight);

  bloque.spansMateria.forEach((span) => {
    const y = obtenerYFila(bloque, span.inicio, bodyTop);
    const height = obtenerAltoSpan(bloque, span);
    pdf.rect(xColumna(1), y, columnas[1].width, height, {
      fill: COLORS.cellBg,
      stroke: COLORS.border,
      lineWidth: 0.55,
    });
    dibujarCeldaTexto(pdf, span.valor, xColumna(1), y, columnas[1].width, height, {
      size: TABLE.strongSize,
      font: "F2",
      color: COLORS.textStrong,
      maxLines: 6,
    });
  });

  bloque.filas.forEach((fila, index) => {
    const y = obtenerYFila(bloque, index, bodyTop);
    const height = bloque.alturas[index];

    [2, 3, 4, 5].forEach((colIndex) => {
      pdf.rect(xColumna(colIndex), y, columnas[colIndex].width, height, {
        fill: COLORS.cellBg,
        stroke: COLORS.border,
        lineWidth: 0.55,
      });
    });

    dibujarCeldaTexto(pdf, fila.estudiante, xColumna(2), y, columnas[2].width, height);
    dibujarCeldaTexto(pdf, fila.dni, xColumna(3), y, columnas[3].width, height, {
      align: "center",
      maxLines: 1,
    });
    dibujarCeldaTexto(pdf, fila.curso, xColumna(4), y, columnas[4].width, height, {
      align: "center",
      maxLines: 1,
    });
    dibujarCeldaTexto(pdf, fila.nota, xColumna(5), y, columnas[5].width, height, {
      align: "center",
      maxLines: 1,
    });
  });

  bloque.spansDocente.forEach((span) => {
    const y = obtenerYFila(bloque, span.inicio, bodyTop);
    const height = obtenerAltoSpan(bloque, span);
    pdf.rect(xColumna(6), y, columnas[6].width, height, {
      fill: COLORS.cellBg,
      stroke: COLORS.border,
      lineWidth: 0.55,
    });
    dibujarCeldaTexto(pdf, span.valor, xColumna(6), y, columnas[6].width, height, {
      size: TABLE.strongSize,
      font: "F2",
      color: COLORS.textStrong,
      maxLines: 8,
    });
  });

  pdf.rect(PAGE.margin, yTop, anchoTabla, TABLE.headerHeight + bodyHeight, {
    fill: null,
    stroke: COLORS.borderStrong,
    lineWidth: 0.85,
  });
};

const cortarFilasQueEntran = (grupo, filas, maxHeight) => {
  if (filas.length === 0) return { visibles: [], restantes: [] };

  let cantidad = 1;
  let ultimoQueEntra = null;
  while (cantidad <= filas.length) {
    const candidato = prepararBloqueTabla(grupo, filas.slice(0, cantidad));
    if (candidato.height <= maxHeight) {
      ultimoQueEntra = cantidad;
      cantidad += 1;
    } else {
      break;
    }
  }

  const corte = ultimoQueEntra || 1;
  return {
    visibles: filas.slice(0, corte),
    restantes: filas.slice(corte),
  };
};

const generarPdfMesas = ({ mesas = [], titulo = "MESAS DE EXAMEN", logoAsset = null, institucionNombre = "Institución" } = {}) => {
  const pdf = new PdfCanvas();
  const alturaPaginaDisponible = TABLE.bottom - TABLE.top;
  let paginaIniciada = false;
  let cursorY = TABLE.top;
  let hayTablaEnPagina = false;

  const iniciarPagina = () => {
    if (paginaIniciada) pdf.endPage();
    pdf.beginPage();
    dibujarHeaderDocumento(pdf, titulo, logoAsset, institucionNombre);
    paginaIniciada = true;
    cursorY = TABLE.top;
    hayTablaEnPagina = false;
  };

  iniciarPagina();

  if (!Array.isArray(mesas) || mesas.length === 0) {
    pdf.text("NO HAY MESAS VISIBLES PARA EXPORTAR.", PAGE.margin, TABLE.top + 14, {
      size: 10,
      font: "F2",
      color: COLORS.textStrong,
      maxWidth: anchoTabla,
      align: "center",
    });
    pdf.endPage();
    return construirDocumentoPdf(pdf.pages, { logoAsset });
  }

  mesas.forEach((grupo) => {
    let pendientes = construirFilasGrupo(grupo);

    while (pendientes.length > 0) {
      let bloqueCompleto = prepararBloqueTabla(grupo, pendientes);
      const espacioNecesario = bloqueCompleto.height + (hayTablaEnPagina ? TABLE.gap : 0);
      const restanteActual = TABLE.bottom - cursorY;

      if (espacioNecesario <= restanteActual) {
        if (hayTablaEnPagina) cursorY += TABLE.gap;
        dibujarBloqueTabla(pdf, bloqueCompleto, cursorY);
        cursorY += bloqueCompleto.height;
        hayTablaEnPagina = true;
        pendientes = [];
        continue;
      }

      if (hayTablaEnPagina && bloqueCompleto.height <= alturaPaginaDisponible) {
        iniciarPagina();
        continue;
      }

      if (hayTablaEnPagina) iniciarPagina();

      const { visibles, restantes } = cortarFilasQueEntran(grupo, pendientes, alturaPaginaDisponible);
      bloqueCompleto = prepararBloqueTabla(grupo, visibles);
      dibujarBloqueTabla(pdf, bloqueCompleto, cursorY);
      cursorY += bloqueCompleto.height;
      hayTablaEnPagina = true;
      pendientes = restantes;

      if (pendientes.length > 0) iniciarPagina();
    }
  });

  pdf.endPage();
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
  // Primero se usa el logo institucional configurado en el perfil/tenant.
  // Si no existe o no se puede cargar, queda como respaldo el escudo local.
  let logoAsset = await cargarImagenComoJpegAsset(logoUrl);
  if (!logoAsset && escudoIpEtUrl) {
    logoAsset = await cargarImagenComoJpegAsset(escudoIpEtUrl);
  }
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

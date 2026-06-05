// src/components/Materias/modales/ModalCorrelativa.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faPlus,
  faSave,
  faTimes,
  faTrash,
  faDiagramProject,
} from "@fortawesome/free-solid-svg-icons";

import "../../Global/Global_css/Global_Modals.css";
import "./ModalMaterias.css";
import "./ModalCorrelativa.css";

const aMayusculas = (valor) => String(valor ?? "").toUpperCase();

const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const esCursoEgresado = (curso) => {
  const nombre = normalizar(curso?.nombre_curso || curso?.curso || "");
  return nombre.includes("egresado");
};

const nuevaRelacionVacia = () => ({
  id_curso_posterior: "",
  id_materia_posterior: "",
  bloquea_inscripcion: 1,
  bloquea_armado: 1,
  activo: 1,
});

const agruparPorCurso = (lista = []) => {
  return lista.reduce((acc, materia) => {
    const idCurso = Number(materia?.id_curso || 0);
    if (idCurso <= 0) return acc;
    acc[String(idCurso)] = [...(acc[String(idCurso)] || []), materia];
    return acc;
  }, {});
};

const unificarListaMaterias = (lista = []) => {
  const mapa = new Map();

  lista.forEach((m) => {
    const idCurso = Number(m?.id_curso || 0);
    const idMateria = Number(m?.id_materia || 0);
    if (idCurso <= 0 || idMateria <= 0) return;
    mapa.set(`${idCurso}-${idMateria}`, m);
  });

  return Array.from(mapa.values()).sort((a, b) => {
    const cursoA = Number(a.id_curso || 0);
    const cursoB = Number(b.id_curso || 0);
    if (cursoA !== cursoB) return cursoA - cursoB;
    return String(a.materia || "").localeCompare(String(b.materia || ""), "es");
  });
};


const ROMANOS_CORRELATIVAS = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

const analizarCadenaMateria = (materia) => {
  const normalizada = normalizar(materia).replace(/\s+/g, " ").trim();
  const analisis = {
    normalizada,
    base: normalizada,
    orden: 0,
    sufijo: "",
    tieneNumeracion: false,
  };

  const match = normalizada.match(/^(.*?)(?:\s+|-)(xii|xi|viii|vii|vi|iv|ix|iii|ii|i|x|v|[1-9][0-9]?)$/i);
  if (!match) return analisis;

  const base = String(match[1] || "").trim();
  const sufijo = String(match[2] || "").trim().toLowerCase();
  const orden = /^\d+$/.test(sufijo) ? Number(sufijo) : Number(ROMANOS_CORRELATIVAS[sufijo] || 0);

  if (!base || orden <= 0) return analisis;

  return {
    normalizada,
    base,
    orden,
    sufijo,
    tieneNumeracion: true,
  };
};

const claveRelacionCorrelativa = (rel) => [
  Number(rel?.id_materia || 0),
  Number(rel?.id_curso || 0),
  Number(rel?.id_materia_relacionada || 0),
  Number(rel?.id_curso_relacionada || 0),
  String(rel?.tipo || "anterior").toLowerCase(),
].join("|");

const claveRelacionPendiente = (anterior, posterior) => [
  Number(posterior?.id_materia || 0),
  Number(posterior?.id_curso || 0),
  Number(anterior?.id_materia || 0),
  Number(anterior?.id_curso || 0),
  "anterior",
].join("|");

const ordenarCadena = (a, b, tieneNumeracion) => {
  if (tieneNumeracion) {
    const ordenA = Number(a.orden || 9999);
    const ordenB = Number(b.orden || 9999);
    if (ordenA !== ordenB) return ordenA - ordenB;
  }

  const cursoA = Number(a.id_curso || 0);
  const cursoB = Number(b.id_curso || 0);
  if (cursoA !== cursoB) return cursoA - cursoB;

  return Number(a.id_materia || 0) - Number(b.id_materia || 0);
};

const ModalCorrelativa = ({
  item,
  correlativas = [],
  materiasPorCurso = [],
  cursos = [],
  onObtenerMateriasPorCurso,
  onPrecargarMateriasDeCursos,
  onClose,
  onSave,
  onToast,
}) => {
  const esEdicion = !!item?.id_materia_correlativa;

  const [modo, setModo] = useState("manual");
  const [idCursoAnterior, setIdCursoAnterior] = useState(
    item?.id_curso_relacionada || ""
  );
  const [idMateriaAnterior, setIdMateriaAnterior] = useState(
    item?.id_materia_relacionada || ""
  );
  const [idMateriaAuto, setIdMateriaAuto] = useState("");
  const [autoBloqueaInscripcion, setAutoBloqueaInscripcion] = useState(1);
  const [autoBloqueaArmado, setAutoBloqueaArmado] = useState(1);
  const [materiasCursoCache, setMateriasCursoCache] = useState(() =>
    agruparPorCurso(materiasPorCurso)
  );
  const [cursosCargando, setCursosCargando] = useState({});
  const [cargandoAuto, setCargandoAuto] = useState(false);
  const [relaciones, setRelaciones] = useState(() => {
    if (esEdicion) {
      return [
        {
          id_curso_posterior: item?.id_curso || "",
          id_materia_posterior: item?.id_materia || "",
          bloquea_inscripcion: Number(item?.bloquea_inscripcion ?? 1),
          bloquea_armado: Number(item?.bloquea_armado ?? 1),
          activo: Number(item?.activo ?? 1),
        },
      ];
    }

    return [nuevaRelacionVacia()];
  });

  const mountedRef = useRef(false);
  const cacheRef = useRef(materiasCursoCache);
  const cursosCargandoRef = useRef({});
  const cursosPrecargadosRef = useRef(
    new Set(Object.keys(materiasCursoCache || {}))
  );
  const peticionesCursoRef = useRef({});
  const autoRequestIdRef = useRef(0);
  const autoPrecargaRef = useRef({ clave: "", promesa: null });

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      autoRequestIdRef.current += 1;
      peticionesCursoRef.current = {};
      autoPrecargaRef.current = { clave: "", promesa: null };
    };
  }, []);

  useEffect(() => {
    cacheRef.current = materiasCursoCache;
  }, [materiasCursoCache]);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (!Array.isArray(materiasPorCurso) || materiasPorCurso.length === 0) return;

    setMateriasCursoCache((prev) => {
      const siguiente = { ...prev };
      const agrupadas = agruparPorCurso(materiasPorCurso);

      Object.entries(agrupadas).forEach(([idCurso, lista]) => {
        siguiente[idCurso] = unificarListaMaterias([
          ...(siguiente[idCurso] || []),
          ...lista,
        ]);
        cursosPrecargadosRef.current.add(String(idCurso));
      });

      cacheRef.current = siguiente;
      return siguiente;
    });
  }, [materiasPorCurso]);

  const cursosActivos = useMemo(() => {
    return cursos.filter((c) => Number(c.activo ?? 1) === 1 && !esCursoEgresado(c));
  }, [cursos]);

  const idsCursosActivos = useMemo(() => {
    return new Set(cursosActivos.map((c) => Number(c.id_curso)).filter((id) => id > 0));
  }, [cursosActivos]);


  const nombreCursoPorId = useMemo(() => {
    const mapa = new Map();
    cursosActivos.forEach((c) => {
      const id = Number(c?.id_curso || 0);
      if (id > 0) mapa.set(id, c?.nombre_curso || c?.curso || "");
    });
    return mapa;
  }, [cursosActivos]);

  const correlativasRealizadasSet = useMemo(() => {
    const set = new Set();
    (Array.isArray(correlativas) ? correlativas : []).forEach((rel) => {
      if (Number(rel?.activo ?? 1) !== 1) return;
      set.add(claveRelacionCorrelativa(rel));
    });
    return set;
  }, [correlativas]);

  const marcarCursoCargando = useCallback((idCurso, valor) => {
    const clave = String(idCurso || "");
    if (!clave) return;

    if (cursosCargandoRef.current[clave] === valor) return;

    cursosCargandoRef.current = {
      ...cursosCargandoRef.current,
      [clave]: valor,
    };

    if (!mountedRef.current) return;

    setCursosCargando((prev) => {
      if (prev[clave] === valor) return prev;

      return {
        ...prev,
        [clave]: valor,
      };
    });
  }, []);

  const cargarMateriasCurso = useCallback(
    async (idCurso) => {
      const id = Number(idCurso || 0);
      if (id <= 0) return [];

      const clave = String(id);
      const cacheActual = cacheRef.current[clave] || [];

      if (cursosPrecargadosRef.current.has(clave)) {
        return cacheActual;
      }

      if (Array.isArray(cacheActual) && cacheActual.length > 0) {
        cursosPrecargadosRef.current.add(clave);
        return cacheActual;
      }

      if (peticionesCursoRef.current[clave]) {
        return peticionesCursoRef.current[clave];
      }

      if (typeof onObtenerMateriasPorCurso !== "function") {
        cursosPrecargadosRef.current.add(clave);
        return [];
      }

      marcarCursoCargando(clave, true);

      const promesa = (async () => {
        try {
          const lista = await onObtenerMateriasPorCurso(id);
          const normalizada = unificarListaMaterias(
            Array.isArray(lista) ? lista : []
          );

          cursosPrecargadosRef.current.add(clave);

          const siguienteCache = {
            ...cacheRef.current,
            [clave]: normalizada,
          };

          cacheRef.current = siguienteCache;

          if (mountedRef.current) {
            setMateriasCursoCache(siguienteCache);
          }

          return normalizada;
        } catch (error) {
          console.error(`No se pudieron obtener materias del curso ${id}:`, error);

          if (mountedRef.current) {
            onToast?.("error", "No se pudieron cargar las materias del curso seleccionado.");
          }

          return [];
        } finally {
          delete peticionesCursoRef.current[clave];
          marcarCursoCargando(clave, false);
        }
      })();

      peticionesCursoRef.current[clave] = promesa;
      return promesa;
    },
    [marcarCursoCargando, onObtenerMateriasPorCurso, onToast]
  );

  const idsCursosNecesarios = useMemo(() => {
    const ids = [
      idCursoAnterior,
      ...relaciones.map((rel) => rel.id_curso_posterior),
    ];

    return Array.from(
      new Set(ids.map((id) => Number(id)).filter((id) => id > 0))
    );
  }, [idCursoAnterior, relaciones]);

  useEffect(() => {
    if (modo !== "manual") return;

    idsCursosNecesarios.forEach((id) => {
      cargarMateriasCurso(id);
    });
  }, [modo, idsCursosNecesarios, cargarMateriasCurso]);

  const idsCursosAuto = useMemo(() => {
    return cursosActivos
      .map((c) => Number(c.id_curso))
      .filter((id) => id > 0);
  }, [cursosActivos]);

  useEffect(() => {
    if (modo !== "auto" || esEdicion) {
      autoRequestIdRef.current += 1;
      setCargandoAuto(false);
      return;
    }

    if (idsCursosAuto.length === 0) return;

    let cancelado = false;
    const requestId = autoRequestIdRef.current + 1;
    autoRequestIdRef.current = requestId;

    const cargarTodosParaAuto = async () => {
      const idsFaltantes = idsCursosAuto.filter(
        (id) => !cursosPrecargadosRef.current.has(String(id))
      );

      if (idsFaltantes.length === 0) {
        setCargandoAuto(false);
        return;
      }

      setCargandoAuto(true);

      try {
        let lista = [];

        if (typeof onPrecargarMateriasDeCursos === "function") {
          const clave = idsFaltantes.join("|");
          let promesa = null;

          if (
            autoPrecargaRef.current.clave === clave &&
            autoPrecargaRef.current.promesa
          ) {
            promesa = autoPrecargaRef.current.promesa;
          } else {
            promesa = onPrecargarMateriasDeCursos(idsFaltantes);
            autoPrecargaRef.current = { clave, promesa };
          }

          try {
            lista = await promesa;
          } finally {
            if (autoPrecargaRef.current.promesa === promesa) {
              autoPrecargaRef.current = { clave: "", promesa: null };
            }
          }

          idsFaltantes.forEach((id) =>
            cursosPrecargadosRef.current.add(String(id))
          );
        } else {
          const resultados = await Promise.all(
            idsFaltantes.map((id) => cargarMateriasCurso(id))
          );
          lista = resultados.flat();
        }

        if (
          cancelado ||
          !mountedRef.current ||
          autoRequestIdRef.current !== requestId
        ) {
          return;
        }

        const agrupadas = agruparPorCurso(Array.isArray(lista) ? lista : []);

        setMateriasCursoCache((prev) => {
          const siguiente = { ...prev };

          Object.entries(agrupadas).forEach(([idCurso, materias]) => {
            siguiente[idCurso] = unificarListaMaterias([
              ...(siguiente[idCurso] || []),
              ...materias,
            ]);
            cursosPrecargadosRef.current.add(String(idCurso));
          });

          cacheRef.current = siguiente;
          return siguiente;
        });
      } catch (error) {
        console.error(
          "No se pudieron precargar materias para correlativas automáticas:",
          error
        );

        if (
          !cancelado &&
          mountedRef.current &&
          autoRequestIdRef.current === requestId
        ) {
          onToast?.("error", "No se pudieron precargar las materias para el modo automático.");
        }
      } finally {
        if (
          !cancelado &&
          mountedRef.current &&
          autoRequestIdRef.current === requestId
        ) {
          setCargandoAuto(false);
        }
      }
    };

    cargarTodosParaAuto();

    return () => {
      cancelado = true;
      autoRequestIdRef.current += 1;
    };
  }, [
    modo,
    esEdicion,
    idsCursosAuto,
    onPrecargarMateriasDeCursos,
    cargarMateriasCurso,
    onToast,
  ]);

  const materiasPorCursoCompletas = useMemo(() => {
    if (modo !== "auto" || esEdicion) return [];

    return unificarListaMaterias([
      ...materiasPorCurso,
      ...Object.values(materiasCursoCache).flat(),
    ]);
  }, [modo, esEdicion, materiasPorCurso, materiasCursoCache]);

  const materiasDeCurso = useCallback(
    (idCurso) => {
      const id = Number(idCurso || 0);
      if (id <= 0) return [];

      const cache = materiasCursoCache[String(id)] || [];

      return unificarListaMaterias(cache)
        .filter((m) => Number(m.activo ?? 1) === 1)
        .sort((a, b) =>
          String(a.materia || "").localeCompare(String(b.materia || ""), "es")
        );
    },
    [materiasCursoCache]
  );

  const estaCargandoCurso = (idCurso) =>
    Boolean(cursosCargando[String(idCurso || "")]);

  const materiasCursoAnterior = useMemo(
    () => materiasDeCurso(idCursoAnterior),
    [idCursoAnterior, materiasDeCurso]
  );

  const materiasAuto = useMemo(() => {
    if (modo !== "auto" || esEdicion) return [];

    const grupos = new Map();

    materiasPorCursoCompletas.forEach((m) => {
      if (Number(m.activo ?? 1) !== 1) return;

      const idCurso = Number(m.id_curso || 0);
      const idMateria = Number(m.id_materia || 0);
      if (idCurso <= 0 || idMateria <= 0 || !idsCursosActivos.has(idCurso)) return;

      const analisis = analizarCadenaMateria(m.materia);
      if (!analisis.normalizada) return;

      const key = analisis.tieneNumeracion
        ? `num:${analisis.base}`
        : `exact:${analisis.normalizada}`;

      if (!grupos.has(key)) {
        grupos.set(key, {
          key,
          base: analisis.base,
          nombreVisible: analisis.tieneNumeracion ? analisis.base : analisis.normalizada,
          tieneNumeracion: analisis.tieneNumeracion,
          items: [],
          vistos: new Set(),
        });
      }

      const grupo = grupos.get(key);
      const claveItem = `${idCurso}-${idMateria}`;
      if (grupo.vistos.has(claveItem)) return;
      grupo.vistos.add(claveItem);

      grupo.items.push({
        id_curso: idCurso,
        nombre_curso: m.nombre_curso || nombreCursoPorId.get(idCurso) || "",
        id_materia: idMateria,
        materia: m.materia,
        orden: analisis.orden,
        sufijo: analisis.sufijo,
      });
    });

    return Array.from(grupos.values())
      .map((grupo) => {
        const cadena = [...grupo.items].sort((a, b) => ordenarCadena(a, b, grupo.tieneNumeracion));
        const relacionesTotales = [];

        for (let i = 0; i < cadena.length - 1; i++) {
          const anterior = cadena[i];
          const posterior = cadena[i + 1];

          if (
            Number(anterior.id_curso) === Number(posterior.id_curso) &&
            Number(anterior.id_materia) === Number(posterior.id_materia)
          ) {
            continue;
          }

          relacionesTotales.push({ anterior, posterior });
        }

        const relacionesPendientes = relacionesTotales.filter(
          ({ anterior, posterior }) => !correlativasRealizadasSet.has(claveRelacionPendiente(anterior, posterior))
        );

        const primero = cadena[0] || {};

        return {
          id_materia: primero.id_materia,
          materia: grupo.tieneNumeracion ? grupo.base : primero.materia,
          etiqueta: grupo.tieneNumeracion ? grupo.base : primero.materia,
          cursos: cadena.map((item) => ({
            id_curso: item.id_curso,
            nombre_curso: item.nombre_curso,
            materia: item.materia,
          })),
          cadena,
          relacionesTotales,
          relacionesPendientes,
          tieneNumeracion: grupo.tieneNumeracion,
        };
      })
      .filter((m) => m.relacionesTotales.length > 0 && m.relacionesPendientes.length > 0)
      .sort((a, b) => String(a.etiqueta || a.materia).localeCompare(String(b.etiqueta || b.materia), "es"));
  }, [modo, esEdicion, materiasPorCursoCompletas, idsCursosActivos, nombreCursoPorId, correlativasRealizadasSet]);

  const itemAutoSeleccionado = useMemo(() => {
    return materiasAuto.find((m) => String(m.id_materia) === String(idMateriaAuto)) || null;
  }, [idMateriaAuto, materiasAuto]);

  const cursosAutoSeleccionados = useMemo(() => {
    if (!itemAutoSeleccionado) return [];
    return [...itemAutoSeleccionado.cursos];
  }, [itemAutoSeleccionado]);

  const relacionesAutoPendientes = useMemo(() => {
    return itemAutoSeleccionado?.relacionesPendientes || [];
  }, [itemAutoSeleccionado]);

  const agregarRelacion = () => {
    setRelaciones((prev) => [...prev, nuevaRelacionVacia()]);
  };

  const quitarRelacion = (index) => {
    setRelaciones((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const cambiarCursoAnterior = (valor) => {
    setIdCursoAnterior(valor);
    setIdMateriaAnterior("");
  };

  const cambiarRelacion = (index, campo, valor) => {
    setRelaciones((prev) =>
      prev.map((rel, i) => {
        if (i !== index) return rel;

        if (campo === "id_curso_posterior") {
          return {
            ...rel,
            id_curso_posterior: valor,
            id_materia_posterior: "",
          };
        }

        return {
          ...rel,
          [campo]: valor,
        };
      })
    );
  };

  const cambiarModo = (nuevoModo) => {
    if (esEdicion) return;

    setModo((prev) => {
      if (prev === nuevoModo) return prev;
      return nuevoModo;
    });

  };

  const validarManual = () => {
    if (!idCursoAnterior) {
      return "Primero tenés que seleccionar el curso/año anterior.";
    }

    if (estaCargandoCurso(idCursoAnterior)) {
      return "Esperá a que carguen las materias del curso anterior.";
    }

    if (!idMateriaAnterior) {
      return "Después tenés que seleccionar una materia de ese curso.";
    }

    if (relaciones.length === 0) {
      return "Tenés que agregar al menos una materia posterior.";
    }

    const claves = new Set();

    for (let i = 0; i < relaciones.length; i++) {
      const rel = relaciones[i];

      if (!rel.id_curso_posterior) {
        return `Seleccioná el curso posterior en la relación ${i + 1}.`;
      }

      if (estaCargandoCurso(rel.id_curso_posterior)) {
        return `Esperá a que carguen las materias de la relación ${i + 1}.`;
      }

      if (!rel.id_materia_posterior) {
        return `Seleccioná la materia posterior en la relación ${i + 1}.`;
      }

      if (
        String(rel.id_curso_posterior) === String(idCursoAnterior) &&
        String(rel.id_materia_posterior) === String(idMateriaAnterior)
      ) {
        return `La relación ${i + 1} no puede ser igual a la materia anterior.`;
      }

      const clave = `${rel.id_curso_posterior}-${rel.id_materia_posterior}`;

      if (claves.has(clave)) {
        return `La relación ${i + 1} está repetida.`;
      }

      claves.add(clave);
    }

    return "";
  };

  const validarAuto = () => {
    if (cargandoAuto) {
      return "Esperá a que se carguen las materias de todos los cursos.";
    }

    if (!idMateriaAuto) {
      return "Seleccioná la materia que querés encadenar automáticamente.";
    }

    if (cursosAutoSeleccionados.length < 2) {
      return "La materia seleccionada tiene que existir en dos o más cursos según cátedras.";
    }

    if (relacionesAutoPendientes.length === 0) {
      return "Esa cadena ya tiene todas sus correlativas creadas.";
    }

    return "";
  };

  const resumenModo = esEdicion
    ? "Edición"
    : modo === "auto"
    ? "Automático"
    : "Manual";

  const resumenRelaciones = modo === "auto"
    ? `${relacionesAutoPendientes.length} pendiente${relacionesAutoPendientes.length === 1 ? "" : "s"}`
    : `${relaciones.length} relación${relaciones.length === 1 ? "" : "es"}`;

  const cursoAnteriorNombre = useMemo(() => {
    const curso = cursosActivos.find(
      (c) => String(c.id_curso) === String(idCursoAnterior)
    );
    return curso?.nombre_curso || "";
  }, [cursosActivos, idCursoAnterior]);

  const materiaAnteriorNombre = useMemo(() => {
    const materia = materiasCursoAnterior.find(
      (m) => String(m.id_materia) === String(idMateriaAnterior)
    );
    return materia?.materia || "";
  }, [materiasCursoAnterior, idMateriaAnterior]);

  const materiaAutoNombre = useMemo(() => {
    return itemAutoSeleccionado?.etiqueta || itemAutoSeleccionado?.materia || "";
  }, [itemAutoSeleccionado]);

  const resumenBase = modo === "auto"
    ? materiaAutoNombre || "Sin materia base"
    : materiaAnteriorNombre
    ? `${cursoAnteriorNombre ? `${cursoAnteriorNombre} · ` : ""}${materiaAnteriorNombre}`
    : cursoAnteriorNombre || "Sin materia base";

  const resumenSalida = modo === "auto"
    ? cursosAutoSeleccionados.length > 0
      ? cursosAutoSeleccionados.map((c) => c.nombre_curso).join(" → ")
      : resumenRelaciones
    : resumenRelaciones;

  const guardar = () => {
    if (modo === "auto") {
      const msg = validarAuto();

      if (msg) {
        onToast?.("error", msg);
        return;
      }

      onSave({
        modo: "auto_por_materia",
        id_materia: Number(itemAutoSeleccionado?.id_materia || idMateriaAuto),
        tipo: "anterior",
        activo: 1,
        bloquea_inscripcion: Number(autoBloqueaInscripcion),
        bloquea_armado: Number(autoBloqueaArmado),
      });

      return;
    }

    const msg = validarManual();

    if (msg) {
      onToast?.("error", msg);
      return;
    }

    if (esEdicion) {
      const unica = relaciones[0];

      onSave({
        id_materia_correlativa: item.id_materia_correlativa,
        id_materia: Number(unica.id_materia_posterior),
        id_curso: Number(unica.id_curso_posterior),
        id_materia_relacionada: Number(idMateriaAnterior),
        id_curso_relacionada: Number(idCursoAnterior),
        tipo: "anterior",
        activo: Number(unica.activo),
        bloquea_inscripcion: Number(unica.bloquea_inscripcion),
        bloquea_armado: Number(unica.bloquea_armado),
        orden: 1,
      });

      return;
    }

    onSave({
      modo: "masivo",
      id_materia_anterior: Number(idMateriaAnterior),
      id_curso_anterior: Number(idCursoAnterior),
      relaciones: relaciones.map((rel, index) => ({
        id_materia_posterior: Number(rel.id_materia_posterior),
        id_curso_posterior: Number(rel.id_curso_posterior),
        tipo: "anterior",
        activo: Number(rel.activo),
        bloquea_inscripcion: Number(rel.bloquea_inscripcion),
        bloquea_armado: Number(rel.bloquea_armado),
        orden: index + 1,
      })),
    });
  };

  return createPortal(
    <div
      className="gm-modalOverlay modal-corr-overlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="gm-modal gm-modal--materias-xl modal-corr"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correlativa-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header modal-corr-header">
          <div className="gm-modal__headIcon modal-corr-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faDiagramProject} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="correlativa-modal-title">
              {esEdicion ? "Editar correlatividad" : "Nueva correlatividad"}
            </h2>

            <p>
              Armá relaciones manuales o generá cadenas automáticas por materia.
            </p>
          </div>

          <button type="button" className="gm-modal__close modal-corr-close" onClick={onClose} aria-label="Cerrar modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-corr-body">
          {!esEdicion && (
            <div className="gm-tabs gm-tabs--google modal-corr-mode-tabs materias-modal-tabs" role="tablist" aria-label="Modo de carga de correlativas">
              <button
                type="button"
                role="tab"
                aria-selected={modo === "manual"}
                className={`gm-tab${modo === "manual" ? " is-active" : ""}`}
                onClick={() => cambiarModo("manual")}
              >
                <FontAwesomeIcon icon={faPlus} />
                <span>Manual / varias juntas</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={modo === "auto"}
                className={`gm-tab${modo === "auto" ? " is-active" : ""}`}
                onClick={() => cambiarModo("auto")}
              >
                <FontAwesomeIcon icon={faBolt} />
                <span>Autogenerar por materia</span>
              </button>
            </div>
          )}

          <div className="modal-corr-summary" aria-label="Resumen de correlatividad">
            <div className="modal-corr-summary-item">
              <span>Modo</span>
              <strong>{resumenModo}</strong>
            </div>

            <div className="modal-corr-summary-item modal-corr-summary-item--wide">
              <span>Base</span>
              <strong title={aMayusculas(resumenBase)}>{aMayusculas(resumenBase)}</strong>
            </div>

            <div className="modal-corr-summary-item">
              <span>Salida</span>
              <strong title={aMayusculas(resumenSalida)}>{aMayusculas(resumenSalida)}</strong>
            </div>
          </div>

          {modo === "manual" && (
            <>
              <div className="modal-corr-section">
                <div className="modal-corr-section-title">
                  1. Materia anterior / correlativa base
                </div>

                <div className="modal-corr-grid">
                  <div className="modal-corr-field">
                    <label>Curso anterior</label>
                    <select
                      value={idCursoAnterior}
                      onChange={(e) => cambiarCursoAnterior(e.target.value)}
                      disabled={esEdicion}
                    >
                      <option value="">Seleccionar curso</option>
                      {cursosActivos.map((c) => (
                        <option key={c.id_curso} value={c.id_curso}>
                          {aMayusculas(c.nombre_curso)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="modal-corr-field">
                    <label>Materia anterior</label>
                    <select
                      value={idMateriaAnterior}
                      onChange={(e) => setIdMateriaAnterior(e.target.value)}
                      disabled={
                        esEdicion ||
                        !idCursoAnterior ||
                        estaCargandoCurso(idCursoAnterior)
                      }
                    >
                      <option value="">
                        {!idCursoAnterior
                          ? "Primero seleccioná curso"
                          : estaCargandoCurso(idCursoAnterior)
                          ? "Cargando materias..."
                          : "Seleccionar materia del curso"}
                      </option>

                      {materiasCursoAnterior.map((m) => (
                        <option
                          key={`${m.id_curso || idCursoAnterior}-${m.id_materia}`}
                          value={m.id_materia}
                        >
                          {aMayusculas(m.materia)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-corr-section">
                <div className="modal-corr-section-title-row">
                  <div className="modal-corr-section-title">
                    2. Materias posteriores que dependen de la anterior
                  </div>

                  {!esEdicion && (
                    <button
                      type="button"
                      className="gm-btn gm-btn--soft modal-corr-add"
                      onClick={agregarRelacion}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                      Agregar otra
                    </button>
                  )}
                </div>

                <div className="modal-corr-relaciones">
                  {relaciones.map((rel, index) => {
                    const materiasPosteriores = materiasDeCurso(
                      rel.id_curso_posterior
                    );
                    const cargandoPosteriores = estaCargandoCurso(
                      rel.id_curso_posterior
                    );

                    return (
                      <div className="modal-corr-relacion" key={index}>
                        <div className="modal-corr-relacion-numero">
                          #{index + 1}
                        </div>

                        <div className="modal-corr-grid relacion-grid">
                          <div className="modal-corr-field">
                            <label>Curso posterior</label>
                            <select
                              value={rel.id_curso_posterior}
                              onChange={(e) =>
                                cambiarRelacion(
                                  index,
                                  "id_curso_posterior",
                                  e.target.value
                                )
                              }
                            >
                              <option value="">Seleccionar curso</option>
                              {cursosActivos.map((c) => (
                                <option key={c.id_curso} value={c.id_curso}>
                                  {aMayusculas(c.nombre_curso)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="modal-corr-field">
                            <label>Materia posterior</label>
                            <select
                              value={rel.id_materia_posterior}
                              onChange={(e) =>
                                cambiarRelacion(
                                  index,
                                  "id_materia_posterior",
                                  e.target.value
                                )
                              }
                              disabled={!rel.id_curso_posterior || cargandoPosteriores}
                            >
                              <option value="">
                                {!rel.id_curso_posterior
                                  ? "Primero seleccioná curso"
                                  : cargandoPosteriores
                                  ? "Cargando materias..."
                                  : "Seleccionar materia del curso"}
                              </option>

                              {materiasPosteriores.map((m) => (
                                <option
                                  key={`${m.id_curso}-${m.id_materia}`}
                                  value={m.id_materia}
                                >
                                  {aMayusculas(m.materia)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="modal-corr-options">
                            <span className="modal-corr-options-title">Reglas</span>

                            <div className="modal-corr-checks">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={Number(rel.bloquea_inscripcion) === 1}
                                  onChange={(e) =>
                                    cambiarRelacion(
                                      index,
                                      "bloquea_inscripcion",
                                      e.target.checked ? 1 : 0
                                    )
                                  }
                                />
                                Bloquea inscripción
                              </label>

                              <label>
                                <input
                                  type="checkbox"
                                  checked={Number(rel.bloquea_armado) === 1}
                                  onChange={(e) =>
                                    cambiarRelacion(
                                      index,
                                      "bloquea_armado",
                                      e.target.checked ? 1 : 0
                                    )
                                  }
                                />
                                Bloquea armado
                              </label>
                            </div>
                          </div>
                        </div>

                        {!esEdicion && relaciones.length > 1 && (
                          <button
                            type="button"
                            className="modal-corr-remove"
                            onClick={() => quitarRelacion(index)}
                            title="Quitar relación"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-corr-example">
                Ejemplo: <strong>1° - MATEMÁTICA</strong> como base y <strong>2° - MATEMÁTICA</strong> como posterior. Podés cargar varias relaciones antes de guardar.
              </div>
            </>
          )}

          {modo === "auto" && !esEdicion && (
            <div className="modal-corr-section auto-section">
              <div className="modal-corr-section-title">
                Autogenerar cadena por materia
              </div>

              <div className="modal-corr-grid">
                <div className="modal-corr-field">
                  <label>Materia a encadenar</label>
                  <select
                    value={idMateriaAuto}
                    onChange={(e) => setIdMateriaAuto(e.target.value)}
                    disabled={cargandoAuto}
                  >
                    <option value="">
                      {cargandoAuto
                        ? "Cargando materias de todos los cursos..."
                        : "Seleccionar materia"}
                    </option>

                    {materiasAuto.map((m) => (
                      <option key={m.id_materia} value={m.id_materia}>
                        {aMayusculas(m.etiqueta || m.materia)} ({m.relacionesPendientes.length} pendiente{m.relacionesPendientes.length === 1 ? "" : "s"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-corr-options auto-checks">
                  <span className="modal-corr-options-title">Reglas de bloqueo</span>

                  <div className="modal-corr-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={Number(autoBloqueaInscripcion) === 1}
                        onChange={(e) =>
                          setAutoBloqueaInscripcion(e.target.checked ? 1 : 0)
                        }
                      />
                      Bloquea inscripción
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={Number(autoBloqueaArmado) === 1}
                        onChange={(e) =>
                          setAutoBloqueaArmado(e.target.checked ? 1 : 0)
                        }
                      />
                      Bloquea armado
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-corr-auto-preview">
                {cargandoAuto ? (
                  <p>
                    Cargando materias desde cátedras para detectar en qué años
                    existe cada una...
                  </p>
                ) : materiasAuto.length === 0 ? (
                  <p>
                    No quedan cadenas automáticas pendientes para generar. Las correlativas que ya existen se ocultan de este selector.
                  </p>
                ) : cursosAutoSeleccionados.length === 0 ? (
                  <p>
                    Seleccioná una materia y el sistema va a mostrar los años
                    encontrados en cátedras.
                  </p>
                ) : (
                  <>
                    <p>
                      Se van a crear solamente las relaciones pendientes de esta cadena:
                    </p>

                    <div className="auto-course-chain">
                      {cursosAutoSeleccionados.map((c, index) => (
                        <React.Fragment key={`${c.id_curso}-${c.materia || index}`}>
                          <span title={aMayusculas(c.materia)}>
                            {aMayusculas(c.nombre_curso)} · {aMayusculas(c.materia)}
                          </span>
                          {index < cursosAutoSeleccionados.length - 1 && (
                            <b>→</b>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    <small>
                      Pendientes a guardar: {relacionesAutoPendientes.length}. Las que ya existen no aparecen para volver a generarlas.
                    </small>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="gm-modal__actions modal-corr-actions">
          <button type="button" className="gm-btn gm-btn--ghost btn-corr" onClick={onClose}>
            Cancelar
          </button>

          <button
            type="button"
            className="gm-btn gm-btn--primary btn-corr"
            onClick={guardar}
            disabled={cargandoAuto}
          >
            <FontAwesomeIcon icon={faSave} />
            {modo === "auto"
              ? "Generar "
              : "Guardar "}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModalCorrelativa;
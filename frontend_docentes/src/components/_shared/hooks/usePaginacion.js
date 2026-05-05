import { useState } from 'react';

export function usePaginacion(porPaginaInicial = 20) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(porPaginaInicial);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  function actualizarPaginacion(paginacionBackend = {}) {
    setTotalPaginas(Number(paginacionBackend.paginas || paginacionBackend.total_paginas || 1));
    setTotalRegistros(Number(paginacionBackend.total || paginacionBackend.total_registros || 0));
  }

  return {
    pagina,
    setPagina,
    porPagina,
    setPorPagina,
    totalPaginas,
    totalRegistros,
    actualizarPaginacion,
  };
}

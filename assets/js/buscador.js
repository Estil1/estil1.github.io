/* Buscador de ticket — mejora progresiva (sin dependencias, sin fetch al cargar).
 *
 * El HTML de /herramientas/buscador/ ya trae el formulario, la tabla de reglas,
 * el ejemplo de lectura y la tabla de resultados del ejemplo, así que la página
 * es completa sin este archivo. Con JavaScript, el mismo formulario filtra
 * sobre /datos/<loteria>.json (o /datos/index.json para "todos") y pinta el
 * resultado en #buscador-resultados.
 *
 * Reglas de la casa:
 *  - el fetch se lanza SOLO al enviar el formulario, nunca al cargar la página;
 *  - una sola descarga por sorteo (caché en memoria);
 *  - el estado se anuncia en un role="status" (aria-live="polite");
 *  - si algo falla, se dice y el ejemplo servido sigue en la página.
 */
(function () {
  'use strict';

  var form = document.getElementById('buscador-form');
  if (!form) { return; }
  var sel = document.getElementById('buscador-loteria');
  var campo = document.getElementById('buscador-numeros');
  var estado = document.getElementById('buscador-estado');
  var salida = document.getElementById('buscador-resultados');
  if (!sel || !campo || !estado || !salida) { return; }

  var cache = {};
  var TOPE = 50;
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function fechaCorta(iso) {
    var p = iso.split('-');
    if (p.length !== 3) { return iso; }
    return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1] + ' ' + p[0];
  }

  function trozos(texto) {
    return String(texto || '').split(/[^0-9]+/).filter(function (t) { return t.length > 0; });
  }

  function rellena(ticket, cifras) {
    return ticket.map(function (n) {
      while (cifras && n.length < cifras) { n = '0' + n; }
      return n;
    });
  }

  function aciertos(ticket, numeros) {
    var cuenta = {};
    numeros.forEach(function (n) { cuenta[n] = (cuenta[n] || 0) + 1; });
    var total = 0;
    ticket.forEach(function (n) {
      if (cuenta[n] > 0) { cuenta[n] -= 1; total += 1; }
    });
    return total;
  }

  function cargar(clave) {
    if (cache[clave]) { return Promise.resolve(cache[clave]); }
    var url = clave === 'todos' ? '/datos/index.json' : '/datos/' + clave + '.json';
    return fetch(url, { credentials: 'same-origin' }).then(function (respuesta) {
      if (!respuesta.ok) { throw new Error('HTTP ' + respuesta.status); }
      return respuesta.json();
    }).then(function (datos) {
      cache[clave] = datos;
      return datos;
    });
  }

  function filasDe(datos, ticket) {
    var loterias = datos.loterias || [datos];
    var filas = [];
    loterias.forEach(function (loteria) {
      var consulta = rellena(ticket, loteria.digits || 0);
      (loteria.sorteos || []).forEach(function (registro) {
        var numeros = String(registro[2]).split('-');
        var cuantos = aciertos(consulta, numeros);
        if (cuantos > 0) {
          filas.push({
            nombre: loteria.nombre || loteria.id,
            fecha: registro[0],
            hora: registro[1],
            numeros: numeros,
            aciertos: cuantos,
            de: consulta.length
          });
        }
      });
    });
    filas.sort(function (a, b) {
      if (b.aciertos !== a.aciertos) { return b.aciertos - a.aciertos; }
      if (a.fecha !== b.fecha) { return a.fecha < b.fecha ? 1 : -1; }
      return a.nombre < b.nombre ? -1 : 1;
    });
    return filas;
  }

  function celda(texto, etiqueta) {
    var td = document.createElement('td');
    td.textContent = texto;
    if (etiqueta) { td.setAttribute('data-etiqueta', etiqueta); }
    return td;
  }

  function celdaNumeros(numeros) {
    var td = document.createElement('td');
    numeros.forEach(function (n) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = n;
      td.appendChild(chip);
    });
    return td;
  }

  function pintar(filas, ticket, desde, hasta) {
    while (salida.firstChild) { salida.removeChild(salida.firstChild); }
    if (!filas.length) {
      var vacio = document.createElement('p');
      vacio.className = 'tabla-ayuda';
      vacio.textContent = 'Ningún sorteo de los últimos 90 días contiene esos números. ' +
        'Revisa que estén escritos como se publican.';
      salida.appendChild(vacio);
      return;
    }

    var caja = document.createElement('div');
    caja.className = 'tabla-scroll';
    caja.setAttribute('role', 'region');
    caja.setAttribute('tabindex', '0');
    var leyenda = 'Resultados de los últimos 90 días que contienen al menos un número del ticket';
    caja.setAttribute('aria-label', leyenda);

    var tabla = document.createElement('table');
    tabla.className = 'tabla';
    var caption = document.createElement('caption');
    caption.textContent = 'Números ' + ticket.join(' y ') + ' · del ' + fechaCorta(desde) +
      ' al ' + fechaCorta(hasta) + ' · ' + Math.min(filas.length, TOPE) + ' de ' +
      filas.length + ' coincidencias';
    tabla.appendChild(caption);

    var thead = document.createElement('thead');
    var filaCabecera = document.createElement('tr');
    ['Sorteo', 'Fecha', 'Hora', 'Números del sorteo', 'Aciertos'].forEach(function (texto) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = texto;
      filaCabecera.appendChild(th);
    });
    thead.appendChild(filaCabecera);
    tabla.appendChild(thead);

    var tbody = document.createElement('tbody');
    filas.slice(0, TOPE).forEach(function (f) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = f.nombre;
      tr.appendChild(th);
      tr.appendChild(celda(fechaCorta(f.fecha)));
      tr.appendChild(celda(f.hora));
      tr.appendChild(celdaNumeros(f.numeros));
      tr.appendChild(celda(f.aciertos + ' de ' + f.de));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);

    caja.appendChild(tabla);
    salida.appendChild(caja);

    if (filas.length > TOPE) {
      var aviso = document.createElement('p');
      aviso.className = 'tabla-ayuda';
      aviso.textContent = 'Se muestran las ' + TOPE + ' coincidencias con más aciertos de ' +
        filas.length + '. Escribe más números del ticket para afinar la búsqueda.';
      salida.appendChild(aviso);
    }
  }

  form.addEventListener('submit', function (evento) {
    evento.preventDefault();
    var ticket = trozos(campo.value);
    if (!ticket.length) {
      estado.textContent = 'Escribe al menos un número del boleto para buscar.';
      while (salida.firstChild) { salida.removeChild(salida.firstChild); }
      campo.focus();
      return;
    }
    var clave = sel.value || 'todos';
    estado.textContent = 'Buscando…';
    cargar(clave).then(function (datos) {
      var filas = filasDe(datos, ticket);
      var ventana = datos.ventana || {};
      var desde = datos.desde || ventana.desde || '';
      var hasta = datos.hasta || ventana.hasta || '';
      pintar(filas, ticket, desde, hasta);
      estado.textContent = filas.length
        ? filas.length + ' coincidencias en los últimos 90 días.'
        : 'Ninguna coincidencia en los últimos 90 días.';
    }).catch(function (error) {
      estado.textContent = 'No se pudo cargar el índice de resultados (' + error.message +
        '). Las tablas de abajo están calculadas en el servidor.';
    });
  });
})();

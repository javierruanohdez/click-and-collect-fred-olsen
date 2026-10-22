import React, { useState, useEffect, useMemo, useReducer, useRef, useCallback, createContext, useContext } from 'react';
import {
  Apple,
  ArrowRight,
  Award,
  Banknote,
  Beer,
  BellRing,
  CakeSlice,
  Candy,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock,
  CloudOff,
  Coffee,
  Cookie,
  CreditCard,
  Croissant,
  CupSoda,
  Droplet,
  Flame,
  IceCreamBowl,
  Info,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Package,
  PartyPopper,
  Plus,
  RefreshCw,
  RotateCcw,
  Sandwich,
  Ship,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

/* ====================================================================
   CLICK & COLLECT A BORDO · VERSIÓN 2 · sincronización en tiempo real (Firebase / Firestore)
   Una sola app React con dos vistas que comparten el MISMO estado global, ahora compartido
   también ENTRE DISPOSITIVOS:
     · Vista A — App del pasajero (mobile-first)
     · Vista B — Panel de tripulación (tablet / horizontal)
   Diseño: paleta, tipografía, botones y tarjetas tomados de diseño_app_fred_olsen.css

   CÓMO ACTIVAR LA SINCRONIZACIÓN
     1. npm i firebase lucide-react          (además de react / react-dom y Tailwind)
     2. Consola de Firebase → Firestore Database → Crear base de datos.
     3. Ajustes del proyecto → Tus apps → Web → copia la configuración y pégala en `firebaseConfig`
        (justo debajo de este comentario).
     4. Reglas de Firestore para la DEMO (¡no usar así en producción!):
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents { match /{doc=**} { allow read, write: if true; } }
          }
   Mientras `firebaseConfig` tenga los valores de ejemplo (TU_…), la app arranca en MODO LOCAL:
   funciona igual que la v1, pero los datos solo viven en este dispositivo.

   COLECCIONES DE FIRESTORE
     · pedidos/{001, 002, …}   → un documento por pedido (número correlativo como ID)
     · config/contador         → { ultimo: n }        número del último pedido (transacción)
     · config/demo             → { altaDemanda: bool } interruptor "Modo Alta Demanda" compartido
   ==================================================================== */

/* ╔════════════════════════════════════════════════════════════════════╗
   ║  0. FIREBASE · PEGA AQUÍ TUS CREDENCIALES  ◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄  ║
   ╚════════════════════════════════════════════════════════════════════╝ */
const firebaseConfig = {
  apiKey: "AIzaSyC7qbEd6hFO3_L1COoHgw4M47F3qaU1OLc",
  authDomain: "click-and-collect-fred-olsen.firebaseapp.com",
  projectId: "click-and-collect-fred-olsen",
  storageBucket: "click-and-collect-fred-olsen.firebasestorage.app",
  messagingSenderId: "581539595363",
  appId: "1:581539595363:web:e2a295906a1bd751866456",
  measurementId: "G-E4654EV12G"
};

// ¿Hay credenciales reales? Si no, la app funciona en modo local (sin red) en lugar de fallar.
const FIREBASE_CONFIGURADO = ['apiKey', 'projectId', 'appId'].every(
  (k) => typeof firebaseConfig[k] === 'string' && firebaseConfig[k].trim() !== '' && !/^TU_/.test(firebaseConfig[k])
);

// Inicialización de Firebase + Firestore (con caché offline persistente si el navegador lo permite).
let app = null;
let db = null;
let errorInicioFirebase = null;
if (FIREBASE_CONFIGURADO) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    try {
      db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch (e) {
      db = getFirestore(app); // ya estaba inicializado (recarga en caliente) o el navegador no admite caché persistente
    }
  } catch (e) {
    errorInicioFirebase = e;
    app = null;
    db = null;
  }
}

/* -------------------------------------------------------------------
   1. DATOS · catálogo real (CSV) + cafeterías del buque (estado global inicial)
   ------------------------------------------------------------------- */

// Catálogo cargado desde catalogo_cafeteria_bajamar_express.csv
// (columnas: id, nombre, precio, categoria, imagen_url, stock_disponible).
// Para probar un producto agotado, pon su stock_disponible a 0 en este CSV.
const CATALOGO_CSV = `id,nombre,precio,categoria,imagen_url,stock_disponible
1,Agua Sin Gas 50cl,1.75,Aguas,lucide:droplet,180
2,Bocadillo Pollo Gourmet,5.72,Bocadillos,lucide:sandwich,45
3,Café Cortado,1.9,Cafés,lucide:coffee,250
4,Sándwich Mixto,5.7,Sandwiches,lucide:layers,40
5,Bocadillo Jamón Serrano y Queso,5.76,Bocadillos,lucide:sandwich,45
6,Oferta Bollería + Bebida Caliente,4.2,Ofertas,lucide:sparkles,60
7,Café Solo,1.9,Cafés,lucide:coffee,250
8,Cerveza Dorada,2.77,Cervezas,lucide:beer,120
9,Sándwich Atún,5.73,Sandwiches,lucide:layers,35
10,Bocadillo Tortilla,5.77,Bocadillos,lucide:sandwich,35
11,Bocadillo Chorizo de Teror y Queso Ahumado,5.95,Bocadillos,lucide:sandwich,30
12,Bocadillo Pata Asada y Queso Tierno,5.95,Bocadillos,lucide:sandwich,30
13,Bocadillo Vegetal con Atún,5.75,Bocadillos,lucide:sandwich,25
14,Sándwich Pollo César,5.8,Sandwiches,lucide:layers,30
15,Sándwich Vegetal,5.5,Sandwiches,lucide:layers,25
16,Café con Leche,2.1,Cafés,lucide:coffee,250
17,Café Leche y Leche,2.2,Cafés,lucide:coffee,200
18,Barraquito / Zaperoco,2.6,Cafés,lucide:coffee,120
19,Infusión / Té Variado,1.9,Cafés,lucide:cup-soda,150
20,Croissant de Mantequilla,2.3,Croissants,lucide:croissant,45
21,Croissant Mixto Jamón y Queso,3.8,Croissants,lucide:croissant,30
22,Napolitana de Chocolate,2.5,Bolleria,lucide:cookie,40
23,Muffin Artesano de Arándanos,2.8,Bolleria,lucide:cake-slice,30
24,Donut Glaseado,2.2,Bolleria,lucide:circle-dot,35
25,Agua Con Gas 50cl,1.9,Aguas,lucide:droplet,80
26,Coca-Cola Original 33cl,2.6,Refrescos Cola,lucide:cup-soda,110
27,Coca-Cola Zero 33cl,2.6,Refrescos Cola,lucide:cup-soda,110
28,Clipper de Fresa 33cl,2.6,Refrescos Cola,lucide:cup-soda,90
29,Appletiser 27.5cl,2.8,Refrescos Cola,lucide:cup-soda,75
30,Cerveza Dorada Especial,3.1,Cervezas,lucide:beer,90
31,Cerveza Tropical Sin Filtros,3.1,Cervezas,lucide:beer,85
32,"Cerveza Dorada Sin Alcohol 0,0",2.77,Cervezas,lucide:beer,70
33,Papas Fritas Munchitos,1.95,Snacks,lucide:package,80
34,Ambrosía Tirma,1.5,Snacks,lucide:candy,100
35,Papas Fritas Lay's al Punto de Sal,2.2,Snacks,lucide:package,70
36,Yogur Artesano Canario con Gofio,2.5,Snacks,lucide:ice-cream-bowl,25
37,Fruta Fresca Km 0 (Plátano de Canarias / Manzana),1.6,Snacks,lucide:apple,50
38,Oferta Bocadillo + Refresco o Cerveza,7.8,Ofertas,lucide:sparkles,50
39,Oferta Sándwich + Agua o Refresco,7.5,Ofertas,lucide:sparkles,50
40,Menú Web+ Canjeable (Principal + Bebida + Snack),8.9,Ofertas,lucide:award,60
`;

// Parser CSV mínimo: soporta campos entre comillas con comas dentro (p. ej. "Cerveza ... 0,0").
function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((x) => x.trim() !== '')) filas.push(fila); }
  return filas;
}

function cargarCatalogo(csv) {
  const [cabecera, ...filas] = parsearCSV(csv);
  const col = Object.fromEntries(cabecera.map((h, i) => [h.trim(), i]));
  return filas.map((f) => ({
    id: Number(f[col.id]),
    nombre: f[col.nombre].trim(),
    precio: parseFloat(f[col.precio]),
    categoria: f[col.categoria].trim(),
    imagen_url: f[col.imagen_url].trim(),
    stock_disponible: parseInt(f[col.stock_disponible], 10) || 0,
  }));
}

const PRODUCTOS_INICIALES = cargarCatalogo(CATALOGO_CSV);

// imagen_url: "lucide:nombre-del-icono" pinta un icono Lucide; cualquier otra URL se pinta como <img>.
const ICONOS_LUCIDE = {
  droplet: Droplet, sandwich: Sandwich, layers: Layers, sparkles: Sparkles, coffee: Coffee, beer: Beer,
  'cup-soda': CupSoda, croissant: Croissant, cookie: Cookie, 'cake-slice': CakeSlice, 'circle-dot': CircleDot,
  package: Package, candy: Candy, 'ice-cream-bowl': IceCreamBowl, apple: Apple, award: Award,
};

// Orden de las categorías en la app y su icono. Las categorías del CSV que no estén aquí se añaden al final.
const CATEGORIAS_CONFIG = [
  { clave: 'Ofertas', icono: Sparkles },
  { clave: 'Cafés', icono: Coffee },
  { clave: 'Bocadillos', icono: Sandwich },
  { clave: 'Sandwiches', icono: Layers },
  { clave: 'Croissants', icono: Croissant },
  { clave: 'Bolleria', etiqueta: 'Bollería', icono: CakeSlice },
  { clave: 'Snacks', icono: Candy },
  { clave: 'Aguas', icono: Droplet },
  { clave: 'Refrescos Cola', icono: CupSoda },
  { clave: 'Cervezas', icono: Beer },
];
const CATEGORIAS = (() => {
  const presentes = [...new Set(PRODUCTOS_INICIALES.map((p) => p.categoria))];
  const conocidas = CATEGORIAS_CONFIG.filter((c) => presentes.includes(c.clave));
  const extra = presentes.filter((k) => !CATEGORIAS_CONFIG.some((c) => c.clave === k)).map((k) => ({ clave: k, icono: Utensils }));
  return [...conocidas, ...extra].map((c) => ({ nombre: c.clave, etiqueta: c.etiqueta || c.clave, icono: c.icono }));
})();

// El tiempo de espera de cada cafetería NO es un dato fijo: se calcula con el modelo de colas de la sección 2
const UBICACIONES_INICIALES = [
  { id: 'proa', nombre: 'Cafetería Proa', corto: 'Proa', zona: 'Cubierta 6 · Zona de proa' },
  { id: 'centro', nombre: 'Cafetería Centro', corto: 'Centro', zona: 'Cubierta 6 · Zona central' },
  { id: 'popa', nombre: 'Cafetería Popa', corto: 'Popa', zona: 'Cubierta 6 · Zona de popa' },
];

// Color de la etiqueta de cada cafetería en las tarjetas de la tripulación
const TONO_ETIQUETA_UBICACION = { proa: 'blue', centro: 'cream', popa: 'yellow' };

const METODOS_PAGO = [
  { id: 'google', nombre: 'Google Pay', icono: Wallet },
  { id: 'apple', nombre: 'Apple Pay', icono: Smartphone },
  { id: 'bizum', nombre: 'Bizum', icono: Banknote },
  { id: 'tarjeta', nombre: 'Tarjeta', icono: CreditCard },
];

// Ciclo de vida de un pedido (estilo pantalla de cocina): al pagar entra DIRECTAMENTE en 'preparando'.
//   preparando → listo → entregado
const ESTADOS = ['preparando', 'listo', 'entregado'];
const ESTADO_INICIAL_PEDIDO = 'preparando';

// Cómo se muestra al pasajero cada estado de un pedido activo
const INFO_ESTADO = {
  preparando: { texto: 'En preparación', tono: 'yellow', icono: ChefHat },
  listo: { texto: 'Listo para recoger', tono: 'green', icono: BellRing },
};

/* Reglas de negocio ------------------------------------------------- */
// Modelo determinista de colas: espera = (artículos en cola × MIN_POR_ARTICULO + BASE_RECOGIDA_MIN) × factor
const MIN_POR_ARTICULO = 1.5; // tiempo de preparación de cada artículo (min)
const BASE_RECOGIDA_MIN = 2; // trayecto + recogida (min), constante
// Modo Alta Demanda: multiplica el tiempo total de TODAS las cafeterías.
const FACTOR_SOBRECARGA = 1.5;
const REFRESCO_ESPERAS_MS = 60 * 1000; // las esperas se recalculan y refrescan cada 60 s

// Fred. Olsen Plus: no hay descuentos en comida, se acumulan puntos según el gasto.
const PUNTOS_PLUS_POR_EURO = 10;

// Venta cruzada: si el carrito lleva comida pero ninguna bebida, sugerimos una bebida.
const CATEGORIAS_COMIDA = ['Bocadillos', 'Sandwiches', 'Croissants', 'Bolleria', 'Snacks'];
const CATEGORIAS_CON_BEBIDA = ['Aguas', 'Refrescos Cola', 'Cervezas', 'Cafés', 'Ofertas']; // las ofertas ya incluyen bebida
const ID_BEBIDA_SUGERIDA = 1; // Agua Sin Gas 50cl

/* -------------------------------------------------------------------
   2. UTILIDADES
   ------------------------------------------------------------------- */
const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
const numeroPedido = (n) => `#${String(n).padStart(3, '0')}`;
const redondear = (n) => Math.round(n * 100) / 100;
// Artículos (unidades, no pedidos) pendientes de preparar en una cafetería: SOLO pedidos en 'preparando'
// ('listo' y 'entregado' ya no ocupan a la cocina).
const articulosEnColaDe = (ubId, pedidos) =>
  pedidos
    .filter((p) => p.ubicacionId === ubId && p.estado === 'preparando')
    .reduce((s, p) => s + p.items.reduce((a, i) => a + i.cantidad, 0), 0);
// Espera (min) = (artículos × 1,5 + 2) × (1,5 si hay Alta Demanda). Se redondea hacia arriba a minutos enteros
// para no prometer nunca menos tiempo del real; el color del chip se calcula con ese mismo valor.
const calcularEspera = (articulos, altaDemanda = false) =>
  Math.ceil((articulos * MIN_POR_ARTICULO + BASE_RECOGIDA_MIN) * (altaDemanda ? FACTOR_SOBRECARGA : 1));
const esperaDe = (ub, pedidos, altaDemanda = false) => calcularEspera(articulosEnColaDe(ub.id, pedidos), altaDemanda);
// Hook: fuerza el recálculo de las esperas en pantalla exactamente cada 60 s (y devuelve la hora de la última actualización)
function useRefrescoEsperas(ms = REFRESCO_ESPERAS_MS) {
  const [refresco, setRefresco] = useState(() => ({ tick: 0, hora: Date.now() }));
  useEffect(() => {
    const id = setInterval(() => setRefresco((r) => ({ tick: r.tick + 1, hora: Date.now() })), ms);
    return () => clearInterval(id);
  }, [ms]);
  return refresco;
}
// Escala de espera: baja < 7 min · media 7–14 min · alta > 14 min
const nivelEspera = (min) => (min < 7 ? 'baja' : min <= 14 ? 'media' : 'alta');
const NIVELES_ESPERA = {
  baja: { chip: 'bg-sky-300 text-sky-900', punto: 'bg-sky-300', nombre: 'Baja', rango: '< 7 min' },
  media: { chip: 'bg-fo-blue text-white', punto: 'bg-fo-blue', nombre: 'Media', rango: '7-14 min' },
  alta: { chip: 'bg-purple-900 text-white', punto: 'bg-purple-900', nombre: 'Alta', rango: '> 14 min' },
};
// Equivale a Math.floor(total * 10); se pasa por céntimos enteros para evitar errores de coma flotante.
const puntosPlusDe = (total) => Math.floor(Math.round(total * 100) / (100 / PUNTOS_PLUS_POR_EURO));

// ¿Hay comida sin bebida en el carrito? Devuelve el producto a sugerir (si existe y hay stock) o null.
function sugerenciaBebida(lineas, productos) {
  const hayComida = lineas.some((l) => CATEGORIAS_COMIDA.includes(l.categoria));
  const hayBebida = lineas.some((l) => CATEGORIAS_CON_BEBIDA.includes(l.categoria));
  if (!hayComida || hayBebida) return null;
  const p = productos.find((x) => x.id === ID_BEBIDA_SUGERIDA);
  return p && p.stock_disponible > 0 ? p : null;
}

/* -------------------------------------------------------------------
   3. DATOS EN TIEMPO REAL (Firestore) + ESTADO GLOBAL
      · `pedidos` y el "Modo Alta Demanda" viven en Firestore y llegan por onSnapshot
        → cualquier dispositivo (pasajero, tripulación, métricas…) ve los cambios al instante.
      · El carrito es local de cada dispositivo.
      · Sin credenciales (modo local) la misma capa funciona en memoria.
   ------------------------------------------------------------------- */
const COL_PEDIDOS = 'pedidos';
const COL_CONFIG = 'config'; // config/contador → { ultimo } · config/demo → { altaDemanda }
const TIMEOUT_CONEXION_MS = 8000; // si Firestore no responde en 8 s se avisa de "sin conexión"
const AVISO_MS = 6000;

const idPedido = (numero) => String(numero).padStart(3, '0'); // ID del documento: 001, 002…
const aMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.now());

// Documento de Firestore → pedido de la app (tolerante con datos incompletos)
function docAPedido(d) {
  const x = d.data({ serverTimestamps: 'estimate' }) || {};
  return {
    numero: Number(x.numero),
    items: Array.isArray(x.items) ? x.items : [],
    total: Number(x.total) || 0,
    ubicacionId: x.ubicacionId,
    metodoPago: x.metodoPago,
    estado: ESTADOS.includes(x.estado) ? x.estado : ESTADO_INICIAL_PEDIDO,
    creado: aMillis(x.creado),
    clienteId: x.clienteId || null,
    puntosPlus: x.puntosPlus || null,
  };
}
// Descarta documentos corruptos (sin número o con una cafetería desconocida) para no romper la interfaz
const pedidoValido = (p) => Number.isFinite(p.numero) && UBICACIONES_INICIALES.some((u) => u.id === p.ubicacionId);

const MENSAJES_CONEXION = {
  'permission-denied': 'Firebase ha rechazado el acceso. Revisa las reglas de Firestore.',
  unauthenticated: 'Firebase ha rechazado las credenciales. Revisa firebaseConfig.',
  'not-found': 'No se encuentra la base de datos de Firestore. Créala en la consola de Firebase.',
  unavailable: 'No hay conexión con Firebase.',
  'failed-precondition': 'Firestore no está disponible en este navegador o falta un índice.',
};
const mensajeErrorConexion = (err) => MENSAJES_CONEXION[err && err.code] || 'No se ha podido conectar con Firebase.';
function mensajeErrorEscritura(err) {
  const c = err && err.code;
  if (c === 'sin-stock') return err.message;
  if (c === 'unavailable' || c === 'deadline-exceeded') return 'Sin conexión con el servidor: no se ha enviado el pedido. Comprueba tu conexión e inténtalo de nuevo.';
  if (c === 'permission-denied') return 'Firebase ha rechazado el pedido. Revisa las reglas de Firestore.';
  return 'No se ha podido enviar el pedido. Inténtalo de nuevo.';
}

// Identificador anónimo de este dispositivo: así "mis pedidos" del pasajero son solo los suyos
function obtenerClienteId() {
  const nuevo = () => 'c-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  try {
    let id = localStorage.getItem('click-collect-cliente');
    if (!id) {
      id = nuevo();
      localStorage.setItem('click-collect-cliente', id);
    }
    return id;
  } catch (e) {
    return nuevo(); // sin almacenamiento (modo privado…): vale para esta sesión
  }
}

/* ---- Backend Firestore ------------------------------------------------ */
function crearBackendFirestore(firestore) {
  const refPedido = (numero) => doc(firestore, COL_PEDIDOS, idPedido(numero));
  const refContador = doc(firestore, COL_CONFIG, 'contador');
  const refDemo = doc(firestore, COL_CONFIG, 'demo');
  return {
    modo: 'firebase',

    // Escucha en tiempo real la colección `pedidos` (incluye cambios de metadatos para saber si hay conexión)
    suscribirPedidos(onDatos, onError) {
      return onSnapshot(
        query(collection(firestore, COL_PEDIDOS), orderBy('numero')),
        { includeMetadataChanges: true },
        (snap) => {
          onDatos({
            pedidos: snap.docs.map(docAPedido).filter(pedidoValido),
            cambios: snap.docChanges().map((c) => ({ tipo: c.type, pedido: docAPedido(c.doc) })).filter((c) => pedidoValido(c.pedido)),
            desdeCache: snap.metadata.fromCache,
          });
        },
        onError
      );
    },

    suscribirConfig(onDatos, onError) {
      return onSnapshot(refDemo, (snap) => onDatos({ altaDemanda: snap.exists() && snap.data().altaDemanda === true }), onError);
    },

    // CONFIRMAR_PEDIDO → setDoc con ID propio (001, 002…) dentro de una transacción:
    // el contador compartido garantiza que dos dispositivos nunca reciben el mismo número.
    crearPedido({ items, total, ubicacionId, metodoPago, clienteId }) {
      return runTransaction(firestore, async (tx) => {
        const cont = await tx.get(refContador);
        let numero = (cont.exists() ? Number(cont.data().ultimo) || 0 : 0) + 1;
        let ref = refPedido(numero);
        for (let i = 0; i < 25; i++) {
          // por si el contador se hubiera quedado atrás: busca el siguiente número libre
          const existente = await tx.get(ref);
          if (!existente.exists()) break;
          numero += 1;
          ref = refPedido(numero);
        }
        tx.set(ref, { numero, items, total, ubicacionId, metodoPago, clienteId, estado: ESTADO_INICIAL_PEDIDO, creado: serverTimestamp() });
        tx.set(refContador, { ultimo: numero });
        return { numero, items, total, ubicacionId, metodoPago, clienteId, estado: ESTADO_INICIAL_PEDIDO, creado: Date.now(), puntosPlus: null };
      });
    },

    // AVANZAR_PEDIDO → actualiza el campo `estado` del documento existente
    avanzarPedido(numero, estado) {
      return updateDoc(refPedido(numero), { estado });
    },
    sumarPuntos(numero, puntosPlus) {
      return updateDoc(refPedido(numero), { puntosPlus });
    },
    fijarAltaDemanda(valor) {
      return setDoc(refDemo, { altaDemanda: valor }, { merge: true });
    },
    // Borra todos los pedidos (para TODOS los dispositivos) y reinicia el contador
    async reiniciar() {
      const todos = await getDocs(collection(firestore, COL_PEDIDOS));
      for (let i = 0; i < todos.docs.length; i += 400) {
        const lote = writeBatch(firestore);
        todos.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
        await lote.commit();
      }
      const fin = writeBatch(firestore);
      fin.set(refContador, { ultimo: 0 });
      fin.set(refDemo, { altaDemanda: false });
      await fin.commit();
    },
  };
}

/* ---- Backend local (sin credenciales): mismo contrato, datos en memoria ---- */
function crearBackendLocal() {
  let pedidos = [];
  let ultimo = 0;
  let altaDemanda = false;
  const oyentesPedidos = new Set();
  const oyentesConfig = new Set();
  const emitirPedidos = (cambios = []) =>
    oyentesPedidos.forEach((f) => f({ pedidos: pedidos.map((p) => ({ ...p })), cambios, desdeCache: false }));
  const emitirConfig = () => oyentesConfig.forEach((f) => f({ altaDemanda }));
  const modificar = (numero, cambio) => {
    const actual = pedidos.find((p) => p.numero === numero);
    if (!actual) return;
    const nuevo = { ...actual, ...cambio };
    pedidos = pedidos.map((p) => (p.numero === numero ? nuevo : p));
    emitirPedidos([{ tipo: 'modified', pedido: nuevo }]);
  };
  return {
    modo: 'local',
    suscribirPedidos(onDatos) {
      oyentesPedidos.add(onDatos);
      onDatos({ pedidos: pedidos.map((p) => ({ ...p })), cambios: [], desdeCache: false });
      return () => oyentesPedidos.delete(onDatos);
    },
    suscribirConfig(onDatos) {
      oyentesConfig.add(onDatos);
      onDatos({ altaDemanda });
      return () => oyentesConfig.delete(onDatos);
    },
    async crearPedido({ items, total, ubicacionId, metodoPago, clienteId }) {
      ultimo += 1;
      const pedido = { numero: ultimo, items, total, ubicacionId, metodoPago, clienteId, estado: ESTADO_INICIAL_PEDIDO, creado: Date.now(), puntosPlus: null };
      pedidos = [...pedidos, pedido];
      emitirPedidos([{ tipo: 'added', pedido }]);
      return { ...pedido };
    },
    async avanzarPedido(numero, estado) {
      modificar(numero, { estado });
    },
    async sumarPuntos(numero, puntosPlus) {
      modificar(numero, { puntosPlus });
    },
    async fijarAltaDemanda(valor) {
      altaDemanda = valor;
      emitirConfig();
    },
    async reiniciar() {
      pedidos = [];
      ultimo = 0;
      altaDemanda = false;
      emitirPedidos();
      emitirConfig();
    },
  };
}

/* ---- Estado global ---------------------------------------------------- */
const StoreCtx = createContext(null);
const useStore = () => useContext(StoreCtx);

// El stock mostrado = stock del catálogo − unidades ya pedidas (en TODOS los dispositivos, porque sale de `pedidos`)
const conStock = (catalogo, pedidos) => {
  const usado = {};
  pedidos.forEach((p) => p.items.forEach((i) => { usado[i.id] = (usado[i.id] || 0) + i.cantidad; }));
  return catalogo.map((p) => ({ ...p, stock_disponible: Math.max(0, p.stock_disponible - (usado[p.id] || 0)) }));
};

const estadoInicial = () => ({
  catalogo: PRODUCTOS_INICIALES,
  productos: PRODUCTOS_INICIALES.map((p) => ({ ...p })),
  ubicaciones: UBICACIONES_INICIALES,
  carrito: {}, // { [idProducto]: cantidad } · local de cada dispositivo
  pedidos: [], // ← sincronizado con la colección `pedidos` de Firestore
  altaDemanda: false, // ← sincronizado con config/demo
  notificaciones: [], // avisos al pasajero cuando la tripulación marca SU pedido como listo
  aviso: null, // aviso global { texto, tono }
  cargado: !FIREBASE_CONFIGURADO, // ¿ha llegado ya la primera lectura de Firestore? (en modo local no hay nada que esperar)
  conexion: FIREBASE_CONFIGURADO ? 'conectando' : 'local', // local | conectando | conectado | sin-conexion | error
  errorConexion: null,
});

function reducer(state, action) {
  switch (action.type) {
    case 'CARRITO_MAS': {
      const p = state.productos.find((x) => x.id === action.id);
      if (!p) return state;
      const actual = state.carrito[p.id] || 0;
      if (actual >= p.stock_disponible) return state; // nunca más que el stock
      return { ...state, carrito: { ...state.carrito, [p.id]: actual + 1 } };
    }
    case 'CARRITO_MENOS': {
      const actual = state.carrito[action.id] || 0;
      const carrito = { ...state.carrito };
      if (actual <= 1) delete carrito[action.id];
      else carrito[action.id] = actual - 1;
      return { ...state, carrito };
    }
    case 'CARRITO_QUITAR': {
      const carrito = { ...state.carrito };
      delete carrito[action.id];
      return { ...state, carrito };
    }
    case 'CARRITO_VACIAR':
      return { ...state, carrito: {} };
    case 'SET_PEDIDOS': {
      const productos = conStock(state.catalogo, action.pedidos);
      let carrito = state.carrito;
      let aviso = state.aviso;
      if (action.ajustar !== false) {
        // Si otro pasajero se ha llevado las últimas unidades, el carrito baja a lo que realmente queda
        const ajustado = {};
        let cambio = false;
        Object.entries(carrito).forEach(([id, cant]) => {
          const prod = productos.find((x) => x.id === Number(id));
          const n = Math.min(cant, prod ? prod.stock_disponible : 0);
          if (n !== cant) cambio = true;
          if (n > 0) ajustado[id] = n;
        });
        if (cambio) {
          carrito = ajustado;
          aviso = { texto: 'Hemos ajustado tu carrito: otro pasajero se ha llevado las últimas unidades de algún artículo.', tono: 'info' };
        }
      }
      return { ...state, pedidos: action.pedidos, productos, carrito, aviso, cargado: action.cargado === undefined ? state.cargado : action.cargado };
    }
    case 'SET_ALTA_DEMANDA':
      return { ...state, altaDemanda: action.valor };
    case 'SET_CONEXION':
      return { ...state, conexion: action.conexion, errorConexion: action.error === undefined ? state.errorConexion : action.error };
    case 'NOTIFICAR':
      return { ...state, notificaciones: [...state.notificaciones, { id: state.notificaciones.length + 1, ...action.notificacion }] };
    case 'LIMPIAR_NOTIFICACIONES':
      return { ...state, notificaciones: [] };
    case 'AVISAR':
      return { ...state, aviso: action.aviso };
    case 'CERRAR_AVISO':
      return { ...state, aviso: null };
    default:
      return state;
  }
}

/* Proveedor: conecta con Firestore (o con el backend local) y expone `dispatch`.
   `dispatch` acepta las acciones del reducer Y las acciones con efectos —CONFIRMAR_PEDIDO, AVANZAR_PEDIDO,
   SUMAR_PUNTOS_PLUS, ALTA_DEMANDA, REINICIAR—, que escriben en Firestore y devuelven una Promise. */
function StoreProvider({ children }) {
  const [state, dispatch0] = useReducer(reducer, undefined, estadoInicial);
  const stateRef = useRef(state); // lectura del estado más reciente dentro de callbacks asíncronos
  stateRef.current = state;
  const clienteId = useMemo(obtenerClienteId, []);
  const backend = useMemo(() => (db ? crearBackendFirestore(db) : crearBackendLocal()), []);
  const [intento, setIntento] = useState(0); // sube al pulsar "Reintentar" y vuelve a suscribir
  const ultimaInstantanea = useRef([]); // último resultado de onSnapshot
  const optimistas = useRef(new Map()); // pedidos recién creados que aún no han llegado por onSnapshot
  const notificadas = useRef(new Set());
  const enVuelo = useRef(new Set()); // transiciones enviadas y aún sin confirmar (evita dobles toques)
  const confirmando = useRef(false); // mientras se crea MI pedido no se reajusta el carrito (aún no está vaciado)

  // Publica en el estado la instantánea de Firestore + los pedidos "optimistas" que aún no han llegado en ella
  const publicarPedidos = useCallback((instantanea, marcarCargado) => {
    ultimaInstantanea.current = instantanea;
    const ahora = Date.now();
    const numeros = new Set(instantanea.map((p) => p.numero));
    optimistas.current.forEach((o, n) => {
      if (numeros.has(n) || ahora - o.t > 20000) optimistas.current.delete(n);
    });
    const extra = [...optimistas.current.values()].map((o) => o.pedido);
    const todos = [...instantanea, ...extra].sort((a, b) => a.numero - b.numero);
    dispatch0({ type: 'SET_PEDIDOS', pedidos: todos, ajustar: !confirmando.current, ...(marcarCargado ? { cargado: true } : {}) });
  }, []);

  useEffect(() => {
    let vivo = true;
    const emitir = (a) => {
      if (vivo) dispatch0(a);
    };
    const remoto = backend.modo === 'firebase';
    if (!remoto && typeof console !== 'undefined' && console.info) {
      console.info(errorInicioFirebase ? '[Click & Collect] No se pudo iniciar Firebase: modo local.' : '[Click & Collect] Firebase sin configurar: modo local. Pega tus credenciales en `firebaseConfig`.');
    }
    let sincronizado = false; // ¿hemos hablado ya con el SERVIDOR (no solo con la caché)?
    let reloj = null;
    if (remoto) {
      emitir({ type: 'SET_CONEXION', conexion: 'conectando', error: null });
      reloj = setTimeout(() => {
        if (!sincronizado) emitir({ type: 'SET_CONEXION', conexion: 'sin-conexion' });
      }, TIMEOUT_CONEXION_MS);
    }
    const bajas = [
      backend.suscribirPedidos(
        (datos) => {
          if (!vivo) return;
          publicarPedidos(datos.pedidos, true);
          datos.cambios.forEach((c) => {
            const clave = `${c.pedido.numero}:listo`;
            if (c.tipo === 'removed') notificadas.current.delete(clave);
            // Aviso al pasajero: la tripulación ha marcado SU pedido como listo (llegue desde donde llegue el cambio)
            if (c.tipo === 'modified' && c.pedido.estado === 'listo' && c.pedido.clienteId === clienteId && !notificadas.current.has(clave)) {
              notificadas.current.add(clave);
              const ub = UBICACIONES_INICIALES.find((u) => u.id === c.pedido.ubicacionId);
              emitir({
                type: 'NOTIFICAR',
                notificacion: { numero: c.pedido.numero, estado: 'listo', texto: `¡Pedido ${numeroPedido(c.pedido.numero)} listo para recoger en ${ub.nombre}!` },
              });
            }
          });
          if (remoto) {
            if (!datos.desdeCache) {
              sincronizado = true;
              clearTimeout(reloj);
              emitir({ type: 'SET_CONEXION', conexion: 'conectado', error: null });
            } else if (sincronizado) {
              sincronizado = false; // se ha perdido el servidor: seguimos con la caché local
              emitir({ type: 'SET_CONEXION', conexion: 'sin-conexion' });
            }
          }
        },
        (err) => {
          clearTimeout(reloj);
          emitir({ type: 'SET_CONEXION', conexion: 'error', error: mensajeErrorConexion(err) });
        }
      ),
      backend.suscribirConfig((datos) => emitir({ type: 'SET_ALTA_DEMANDA', valor: datos.altaDemanda }), () => {}),
    ];
    return () => {
      vivo = false;
      clearTimeout(reloj);
      bajas.forEach((baja) => baja());
    };
  }, [backend, intento, clienteId, publicarPedidos]);

  /* ---- Acciones con efectos (escriben en Firestore) ---- */
  const acciones = {
    // CONFIRMAR_PEDIDO: crea el pedido en Firestore (estado inicial 'preparando'). Devuelve su número; lanza error si falla.
    async confirmarPedido({ ubicacionId, metodoPago }) {
      const s = stateRef.current;
      const items = Object.entries(s.carrito)
        .map(([id, cantidad]) => {
          const p = s.productos.find((x) => x.id === Number(id));
          return p ? { id: p.id, nombre: p.nombre, precio: p.precio, cantidad, stock: p.stock_disponible } : null;
        })
        .filter((i) => i && i.cantidad > 0);
      if (!items.length) throw Object.assign(new Error('Tu carrito se ha quedado vacío. Revisa tu pedido.'), { code: 'sin-stock' });
      const agotado = items.find((i) => i.cantidad > i.stock); // otro dispositivo pudo llevarse las últimas unidades
      if (agotado) throw Object.assign(new Error(`Lo sentimos, «${agotado.nombre}» se ha agotado mientras pedías. Revisa tu carrito.`), { code: 'sin-stock' });
      const lineas = items.map(({ stock, ...i }) => i);
      const total = redondear(lineas.reduce((t, i) => t + i.precio * i.cantidad, 0));
      confirmando.current = true;
      try {
        const pedido = await backend.crearPedido({ items: lineas, total, ubicacionId, metodoPago, clienteId });
        dispatch0({ type: 'CARRITO_VACIAR' });
        optimistas.current.set(pedido.numero, { pedido, t: Date.now() }); // visible ya, sin esperar al onSnapshot
        publicarPedidos(ultimaInstantanea.current, false);
        return pedido.numero;
      } finally {
        confirmando.current = false;
      }
    },

    // AVANZAR_PEDIDO: preparando → listo → entregado. `desde` = estado que veía quien pulsa el botón:
    // si otro dispositivo (o un doble toque) ya lo movió, no se avanza dos veces.
    async avanzarPedido({ numero, desde }) {
      const p = stateRef.current.pedidos.find((x) => x.numero === numero);
      if (!p) return false;
      const base = desde || p.estado;
      const sig = ESTADOS[ESTADOS.indexOf(base) + 1];
      if (p.estado !== base || !sig) return false;
      const clave = `${numero}:${base}`;
      if (enVuelo.current.has(clave)) return false;
      enVuelo.current.add(clave);
      try {
        await backend.avanzarPedido(numero, sig);
        return true;
      } catch (e) {
        dispatch0({ type: 'AVISAR', aviso: { texto: `No se ha podido actualizar el pedido ${numeroPedido(numero)}. Inténtalo de nuevo.`, tono: 'error' } });
        return false;
      } finally {
        enVuelo.current.delete(clave);
      }
    },

    // SUMAR_PUNTOS_PLUS: 10 puntos por cada 1 € del pedido (una sola vez por pedido)
    async sumarPuntosPlus({ numero, tarjeta }) {
      const p = stateRef.current.pedidos.find((x) => x.numero === numero);
      const limpia = String(tarjeta || '').replace(/\s+/g, '');
      if (!p || p.puntosPlus || !limpia) return false;
      try {
        await backend.sumarPuntos(numero, { puntos: puntosPlusDe(p.total), tarjetaFin: limpia.slice(-4) });
        return true;
      } catch (e) {
        dispatch0({ type: 'AVISAR', aviso: { texto: 'No se han podido sumar los puntos Plus. Inténtalo de nuevo.', tono: 'error' } });
        return false;
      }
    },

    // ALTA_DEMANDA: interruptor compartido por todos los dispositivos
    async alternarAltaDemanda() {
      try {
        await backend.fijarAltaDemanda(!stateRef.current.altaDemanda);
      } catch (e) {
        dispatch0({ type: 'AVISAR', aviso: { texto: 'No se ha podido cambiar el Modo Alta Demanda.', tono: 'error' } });
      }
    },

    // REINICIAR: borra los pedidos (en todos los dispositivos) y deja la demo a cero
    async reiniciarDemo() {
      try {
        await backend.reiniciar();
        optimistas.current.clear();
        notificadas.current.clear();
        dispatch0({ type: 'CARRITO_VACIAR' });
        dispatch0({ type: 'LIMPIAR_NOTIFICACIONES' });
        return true;
      } catch (e) {
        dispatch0({ type: 'AVISAR', aviso: { texto: 'No se ha podido reiniciar la demo. Comprueba tu conexión.', tono: 'error' } });
        return false;
      }
    },
  };
  const accionesRef = useRef(acciones);
  accionesRef.current = acciones;

  const dispatch = useCallback((accion) => {
    const a = accionesRef.current;
    switch (accion.type) {
      case 'CONFIRMAR_PEDIDO':
        return a.confirmarPedido(accion);
      case 'AVANZAR_PEDIDO':
        return a.avanzarPedido(accion);
      case 'SUMAR_PUNTOS_PLUS':
        return a.sumarPuntosPlus(accion);
      case 'ALTA_DEMANDA':
        return a.alternarAltaDemanda();
      case 'REINICIAR':
        return a.reiniciarDemo();
      default:
        dispatch0(accion);
        return undefined;
    }
  }, []);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const value = useMemo(
    () => ({ state, dispatch, stateRef, clienteId, modo: backend.modo, reintentar }),
    [state, dispatch, clienteId, backend, reintentar]
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/* -------------------------------------------------------------------
   4. COMPONENTES DE UI COMPARTIDOS (estilo del CSS corporativo)
   ------------------------------------------------------------------- */
// Botones: .btn-primary (amarillo/azul), .btn-secondary (azul/blanco), .btn-outline-*  · radio 0.375rem · 700 · 16px
function Btn({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-btn border font-bold leading-[1.3] transition-all duration-200 disabled:cursor-not-allowed';
  const tam =
    size === 'xs' ? 'px-3 py-[7px] text-[13px] !gap-1.5' : size === 'sm' ? 'px-4 py-[9px] text-sm' : 'px-8 py-[13px] text-base';
  const variantes = {
    primary:
      'border-fo-yellow bg-fo-yellow text-fo-blue hover:border-fo-blue disabled:border-[#E3E3E3] disabled:bg-[#E3E3E3] disabled:text-[#9A9A9A]',
    secondary:
      'border-fo-blue bg-fo-blue text-white hover:bg-[#00408F] disabled:border-[#E3E3E3] disabled:bg-[#E3E3E3] disabled:text-[#9A9A9A]',
    outline: 'border-fo-yellow bg-white text-fo-blue hover:bg-fo-yellow/20',
    outlineBlue: 'border-fo-blue bg-white text-fo-blue hover:bg-fo-ice',
    soft: 'border-transparent bg-fo-ice text-fo-blue hover:border-fo-blue',
  };
  return (
    <button className={`${base} ${tam} ${variantes[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// Etiquetas tipo ".urgente" / ".newDetail"
function Pill({ tone = 'blue', className = '', children }) {
  const tonos = {
    blue: 'bg-fo-blue text-fo-yellow',
    yellow: 'bg-fo-yellow text-fo-blue',
    cream: 'bg-fo-cream text-fo-blue',
    grey: 'bg-fo-grey text-white',
    red: 'bg-fo-red text-white',
    green: 'bg-fo-green text-white',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${tonos[tone]} ${className}`}>
      {children}
    </span>
  );
}

// Barrita amarilla bajo los títulos (hr de 3px, 15 % de ancho)
const BarraAmarilla = () => <span className="mt-2 block h-[3px] w-[15%] min-w-[36px] bg-fo-yellow" />;

// Logo como <img>; si la imagen no carga (o no hay `src`), se pinta un texto con estilo equivalente.
function LogoMarca({ src, alt, className = '', children }) {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo) return <span className="whitespace-nowrap leading-none">{children}</span>;
  return <img src={src} alt={alt} draggable="false" onError={() => setFallo(true)} className={`w-auto select-none ${className}`} />;
}

function ChipEspera({ min, tam = 'md' }) {
  const pequeno = tam === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ring-1 ring-white/70 ${NIVELES_ESPERA[nivelEspera(min)].chip} ${
        pequeno ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-sm'
      }`}
    >
      <Clock size={pequeno ? 11 : 14} strokeWidth={2.5} />
      {min} min
    </span>
  );
}

function ImagenProducto({ producto, size = 32 }) {
  const url = producto.imagen_url || '';
  if (url.startsWith('lucide:')) {
    // acepta "lucide:cup-soda" y también "lucide:CupSoda"
    const clave = url.slice(7).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const Ico = ICONOS_LUCIDE[clave] || Utensils;
    return <Ico size={size} strokeWidth={1.75} />;
  }
  return <img src={url} alt={producto.nombre} className="h-full w-full object-cover" />;
}

function Stepper({ cantidad, onDec, onInc, incDisabled }) {
  const b =
    'flex h-8 w-8 items-center justify-center rounded-full bg-fo-blue text-white transition hover:bg-[#00408F] disabled:cursor-not-allowed disabled:bg-[#E3E3E3] disabled:text-[#9A9A9A]';
  return (
    <div className="inline-flex items-center gap-3">
      <button type="button" className={b} onClick={onDec} aria-label="Quitar uno">
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <span className="min-w-[1.25rem] text-center text-base font-bold text-fo-blue" aria-live="polite">
        {cantidad}
      </span>
      <button type="button" className={b} onClick={onInc} disabled={incDisabled} aria-label="Añadir uno más">
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// Indicador de pasos (círculos amarillos de 30 px, como el registro del área de usuario)
function Pasos({ actual }) {
  const pasos = ['Resumen', 'Recogida', 'Pago'];
  return (
    <ol className="flex shrink-0 items-center border-b border-fo-line bg-white px-5 py-3" aria-label="Progreso del pedido">
      {pasos.map((t, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const activo = n === actual;
        return (
          <li key={t} className="flex flex-1 items-center last:flex-none">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm font-bold ${
                  hecho || activo ? 'bg-fo-yellow text-fo-blue' : 'bg-fo-grey text-white'
                }`}
              >
                {hecho ? <Check size={16} strokeWidth={3} /> : n}
              </span>
              <span className={`text-[13px] ${activo ? 'font-bold text-fo-blue' : 'font-medium text-fo-grey'}`}>{t}</span>
            </span>
            {i < pasos.length - 1 && <span className="mx-2 h-[2px] flex-1 bg-[#E3E3E3]" />}
          </li>
        );
      })}
    </ol>
  );
}

// Pantalla completa dentro del "móvil" (cabecera azul + cuerpo con scroll + pie fijo)
function Pantalla({ titulo, onBack, paso, children, footer }) {
  return (
    <section className="fo-slide-in absolute inset-0 z-20 flex flex-col bg-fo-ice" aria-label={titulo}>
      <div className="flex shrink-0 items-center gap-2 bg-fo-blue px-3 py-3 text-white">
        <button type="button" onClick={onBack} aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10">
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-base font-bold">{titulo}</h2>
      </div>
      {paso ? <Pasos actual={paso} /> : null}
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-fo-line bg-white p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.06)]">{footer}</div>
      ) : null}
    </section>
  );
}

// Hoja inferior (modal móvil): overlay rgba(48,48,48,.5) + radio 1.25rem arriba
function HojaInferior({ titulo, subtitulo, onClose, children, footer, icono: Icono = ShoppingBag }) {
  return (
    <div className="absolute inset-0 z-30" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="fo-fade-in absolute inset-0 bg-[rgba(48,48,48,0.5)]" onClick={onClose} />
      <div className="fo-sheet-in absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col rounded-t-[1.25rem] bg-white shadow-[0_2px_10px_0_rgba(0,0,0,0.15)]">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-fo-blue">
              <Icono size={20} /> {titulo}
            </h2>
            {subtitulo ? <p className="mt-0.5 text-[13px] text-fo-grey">{subtitulo}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full text-fo-blue transition hover:bg-fo-ice">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3">{children}</div>
        {footer ? <div className="shrink-0 border-t border-fo-line p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---- Estado de la conexión con Firebase ---------------------------------- */
const INFO_CONEXION = {
  local: { texto: 'Modo local', punto: 'bg-white/60', titulo: 'Firebase sin configurar: los pedidos solo viven en este navegador. Pega tus credenciales en firebaseConfig.' },
  conectando: { texto: 'Conectando…', punto: 'bg-fo-yellow animate-pulse', titulo: 'Conectando con Firebase…' },
  conectado: { texto: 'En directo', punto: 'bg-[#3DDC97]', titulo: 'Conectado a Firebase: los pedidos se sincronizan en tiempo real entre dispositivos.' },
  'sin-conexion': { texto: 'Sin conexión', punto: 'bg-fo-red', titulo: 'Sin conexión con Firebase: se muestran los últimos datos guardados.' },
  error: { texto: 'Error de conexión', punto: 'bg-fo-red', titulo: 'No se ha podido conectar con Firebase.' },
};

// Indicador compacto (punto + texto en pantallas anchas) para la barra global
function ChipConexion() {
  const { state } = useStore();
  const c = INFO_CONEXION[state.conexion] || INFO_CONEXION.local;
  return (
    <span
      role="status"
      data-conexion={state.conexion}
      title={state.conexion === 'local' && errorInicioFirebase ? 'No se ha podido iniciar Firebase (revisa firebaseConfig): funcionando en modo local.' : c.titulo}
      aria-label={`Conexión: ${c.texto}`}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-1 py-1 text-[11px] font-bold text-white/90 max-[359px]:hidden sm:bg-white/10 sm:px-2"
    >
      <span className={`h-2 w-2 rounded-full ${c.punto}`} />
      <span className="hidden md:inline">{c.texto}</span>
    </span>
  );
}

// Pantalla de carga mientras llega la primera lectura de Firestore (o si no se puede conectar)
function PantallaCarga({ marco = false }) {
  const { state, reintentar, modo } = useStore();
  const { cargado, conexion, errorConexion } = state;
  if (modo !== 'firebase' || cargado) return null;
  const fallo = conexion === 'error' || conexion === 'sin-conexion';
  return (
    <div
      className={`fo-fade-in absolute inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-fo-ice px-8 text-center ${marco ? 'md:rounded-[2.25rem]' : ''}`}
      role={fallo ? 'alert' : 'status'}
      aria-live="polite"
      data-carga={fallo ? 'error' : 'conectando'}
    >
      {fallo ? <CloudOff size={46} className="text-fo-red" /> : <Loader2 size={46} className="animate-spin text-fo-blue" />}
      <div>
        <p className="text-xl font-bold text-fo-blue">{conexion === 'error' ? 'No se puede conectar' : fallo ? 'Sin conexión' : 'Conectando con Firebase…'}</p>
        <p className="mt-1 text-sm text-fo-grey">
          {conexion === 'error'
            ? errorConexion
            : fallo
              ? 'No hay conexión con el servidor. Comprueba tu conexión a internet.'
              : 'Sincronizando los pedidos en tiempo real'}
        </p>
      </div>
      {fallo ? (
        <Btn onClick={reintentar}>
          <RefreshCw size={16} /> Reintentar
        </Btn>
      ) : null}
    </div>
  );
}

// Franja de aviso cuando se pierde la conexión con datos ya cargados
function BandaConexion() {
  const { state, reintentar, modo } = useStore();
  const { cargado, conexion, errorConexion } = state;
  if (modo !== 'firebase' || !cargado || (conexion !== 'sin-conexion' && conexion !== 'error')) return null;
  return (
    <div role="status" data-banda="conexion" className="flex shrink-0 items-center gap-2 bg-fo-red px-4 py-1.5 text-xs font-semibold text-white">
      <CloudOff size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 leading-snug">
        {conexion === 'error' ? errorConexion : 'Sin conexión con el servidor. Mostrando los últimos datos guardados.'}
      </span>
      <button type="button" onClick={reintentar} className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 font-bold transition hover:bg-white/30">
        Reintentar
      </button>
    </div>
  );
}

// Aviso global (errores de escritura, carrito ajustado…): se cierra solo a los 6 s o al tocarlo
function AvisoGlobal() {
  const { state, dispatch } = useStore();
  const aviso = state.aviso;
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => dispatch({ type: 'CERRAR_AVISO' }), AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso, dispatch]);
  if (!aviso) return null;
  const error = aviso.tono === 'error';
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[80] flex justify-center">
      <button
        type="button"
        role="alert"
        data-aviso={aviso.tono}
        onClick={() => dispatch({ type: 'CERRAR_AVISO' })}
        className={`fo-toast-in pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg p-3 text-left text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] ${error ? 'bg-fo-red' : 'bg-fo-blue'}`}
      >
        {error ? <TriangleAlert size={18} className="mt-px shrink-0 text-fo-yellow" /> : <Info size={18} className="mt-px shrink-0 text-fo-yellow" />}
        <span className="min-w-0 flex-1 leading-snug">{aviso.texto}</span>
        <X size={16} className="mt-0.5 shrink-0 opacity-70" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------
   5. MAPA DEL BUQUE (plano estilizado, selección de cafetería)
   ------------------------------------------------------------------- */
// Posición de cada cafetería sobre el plano, en % del lienzo de 300 × 440
const POS_MAPA = {
  proa: { left: '32%', top: '17.7%', width: '36%', height: '12.7%' },
  centro: { left: '24%', top: '46.4%', width: '52%', height: '12.7%' },
  popa: { left: '24%', top: '75%', width: '52%', height: '12.7%' },
};

// Filas de butacas decorativas entre cafeterías (no indican dónde está sentado el pasajero)
const FILAS_BUTACAS = [154, 174, 280, 300];
const COLUMNAS_BUTACAS = [64, 82, 100, 118, 168, 186, 204, 222];

function MapaBuque({ ubicaciones, esperas, masRapida, seleccion, onSelect }) {
  const casco =
    'M150 12 C214 46 260 110 260 186 L260 402 Q260 428 234 428 L66 428 Q40 428 40 402 L40 186 C40 110 86 46 150 12 Z';

  return (
    <div className="relative mx-auto w-full max-w-[300px] select-none" style={{ aspectRatio: '300 / 440' }}>
      <svg viewBox="0 0 300 440" className="absolute inset-0 h-full w-full" role="img" aria-label="Plano del buque con las cafeterías de proa, centro y popa">
        <rect width="300" height="440" rx="18" fill="#E5EFF6" />
        {/* estela */}
        <path d="M14 400 q10 -8 20 0 t20 0 M246 400 q10 -8 20 0 t20 0 M14 40 q10 -8 20 0 t20 0 M246 40 q10 -8 20 0 t20 0" fill="none" stroke="#9AB6D1" strokeWidth="2" strokeLinecap="round" opacity=".6" />
        {/* casco y cubierta */}
        <path d={casco} fill="#FFFFFF" stroke="#002F6C" strokeWidth="3" />
        <path d={casco} fill="#F4F7FF" stroke="#E4E4E4" strokeWidth="1.5" transform="translate(150 220) scale(.93) translate(-150 -220)" />
        <text x="150" y="62" textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="3" fill="#535353">PROA</text>
        <text x="150" y="404" textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="3" fill="#535353">POPA</text>
        {/* butacas decorativas */}
        {FILAS_BUTACAS.map((y) =>
          COLUMNAS_BUTACAS.map((x) => <rect key={`${y}-${x}`} x={x} y={y} width="14" height="11" rx="3.5" fill="#D0D8E8" />)
        )}
      </svg>

      {/* Zonas pulsables: se elige la cafetería tocando directamente el plano */}
      {ubicaciones.map((ub) => {
        const pos = POS_MAPA[ub.id];
        if (!pos) return null;
        const sel = seleccion === ub.id;
        const espera = esperas[ub.id];
        return (
          <button
            key={ub.id}
            type="button"
            aria-pressed={sel}
            aria-label={`${ub.nombre}, espera ${espera} minutos`}
            onClick={() => onSelect(ub.id)}
            style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
            className={`absolute flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-fo-blue text-center text-fo-blue transition-all duration-200 ${
              sel ? 'z-10 scale-105 bg-fo-yellow shadow-lg' : 'bg-white shadow-sm hover:scale-[1.03] hover:bg-fo-ice'
            }`}
          >
            <span className="text-[11px] font-bold leading-tight">{ub.nombre}</span>
            <ChipEspera min={espera} tam="sm" />
            {masRapida === ub.id ? (
              <span className="absolute -top-2.5 left-2 rounded-full bg-fo-blue px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-fo-yellow">
                Más rápida
              </span>
            ) : null}
            {sel ? (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-fo-blue text-white shadow">
                <Check size={12} strokeWidth={3.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------
   6. VISTA A — APP DEL PASAJERO
   ------------------------------------------------------------------- */
function ProductoCard({ p, cantidad, onAdd, onDec }) {
  const agotado = p.stock_disponible <= 0;
  const pocas = !agotado && p.stock_disponible <= 5;
  const enMaximo = cantidad >= p.stock_disponible;
  return (
    <article className="relative rounded-card border border-fo-line bg-white p-3 shadow-[1px_2px_4px_0_rgba(187,187,187,0.5)]">
      {agotado ? (
        <span className="absolute right-3 top-3 z-10">
          <Pill tone="grey">Agotado</Pill>
        </span>
      ) : pocas ? (
        <span className="absolute right-3 top-3 z-10">
          <Pill tone="cream">Últimas {p.stock_disponible}</Pill>
        </span>
      ) : null}
      <div className={`flex gap-3 ${agotado ? 'opacity-50 grayscale' : ''}`}>
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F7F7] text-fo-blue">
          <ImagenProducto producto={p} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`text-base font-semibold leading-tight text-fo-blue ${agotado || pocas ? 'pr-20' : ''}`}>{p.nombre}</h3>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-lg font-bold text-fo-blue">{eur(p.precio)}</span>
            {cantidad > 0 ? (
              <Stepper cantidad={cantidad} onDec={onDec} onInc={onAdd} incDisabled={enMaximo} />
            ) : (
              <Btn
                size="xs"
                onClick={onAdd}
                disabled={agotado}
                aria-label={`Añadir ${p.nombre} al carrito`}
                className="w-fit shrink-0"
                data-btn="anadir"
              >
                <Plus size={14} strokeWidth={2.5} /> Añadir al carrito
              </Btn>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// Seguimiento para el pasajero: 3 fases (el pedido entra directamente en preparación al pagar)
const PASOS_SEGUIMIENTO = [
  { estado: 'preparando', titulo: 'En preparación', texto: 'La tripulación está preparando tu pedido.', icono: ChefHat },
  { estado: 'listo', titulo: 'Listo para recoger', texto: 'Dirígete a la cafetería.', icono: BellRing },
  { estado: 'entregado', titulo: 'Entregado', texto: 'Disfruta tu pedido.', icono: PartyPopper },
];

function SeguimientoPedido({ pedido }) {
  const idx = ESTADOS.indexOf(pedido.estado); // preparando 0 · listo 1 · entregado 2
  const ultimo = PASOS_SEGUIMIENTO.length - 1;
  return (
    <ol className="space-y-0" aria-label="Fases del pedido">
      {PASOS_SEGUIMIENTO.map((paso, i) => {
        // "Entregado" es el cierre: cuando llega, las tres fases quedan completadas
        const hecho = idx > i || pedido.estado === 'entregado';
        const activo = !hecho && idx === i;
        const Ico = paso.icono;
        const circulo = hecho
          ? i === ultimo
            ? 'bg-fo-green text-white'
            : 'bg-fo-blue text-white'
          : activo
          ? paso.estado === 'listo'
            ? 'bg-fo-green text-white'
            : 'bg-fo-yellow text-fo-blue fo-ring'
          : 'bg-[#E3E3E3] text-[#9A9A9A]';
        return (
          <li key={paso.estado} className="flex gap-3" data-fase={paso.estado} aria-current={activo ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${circulo}`}>
                {hecho ? <Check size={18} strokeWidth={3} /> : <Ico size={18} />}
              </span>
              {i < ultimo ? <span className={`my-1 w-[2px] flex-1 ${hecho ? 'bg-fo-blue' : 'bg-[#E3E3E3]'}`} style={{ minHeight: 18 }} /> : null}
            </div>
            <div className="pb-4 pt-1.5">
              <p className={`text-[15px] font-semibold leading-tight ${hecho || activo ? 'text-fo-blue' : 'text-[#9A9A9A]'}`}>{paso.titulo}</p>
              <p className={`text-[13px] ${hecho || activo ? 'text-fo-grey' : 'text-[#B5B5B5]'}`}>{paso.texto}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* Fred. Olsen Plus · puntos post-compra (sin descuentos: 10 puntos por cada 1 € del pedido) */
function BloquePuntosPlus({ pedido }) {
  const { dispatch } = useStore();
  const [tarjeta, setTarjeta] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const idCampo = `plus-tarjeta-${pedido.numero}`;

  const sumar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (!tarjeta.trim()) {
      setError('Introduce el número de tu tarjeta Plus.');
      return;
    }
    setError('');
    setEnviando(true);
    await dispatch({ type: 'SUMAR_PUNTOS_PLUS', numero: pedido.numero, tarjeta }); // escribe en Firestore; el aviso de error lo gestiona el store
    setEnviando(false);
  };

  if (pedido.puntosPlus) {
    const { puntos, tarjetaFin } = pedido.puntosPlus;
    return (
      <div className="fo-pop flex items-center gap-3 rounded-card border-2 border-fo-green bg-white p-4" role="status" data-plus="sumado">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fo-green text-white">
          <Award size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-fo-blue">¡Enhorabuena! Has sumado {puntos} puntos a tu cuenta Plus</p>
          <p className="mt-0.5 text-xs text-fo-grey">
            Tarjeta ···· {tarjetaFin} · {PUNTOS_PLUS_POR_EURO} puntos por cada 1 € gastado
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={sumar} noValidate className="rounded-card border border-fo-line bg-white p-4" data-plus="formulario">
      <h3 className="flex items-center gap-2 font-bold text-fo-blue">
        <Award size={18} /> ¿Eres cliente Fred. Olsen Plus?
      </h3>
      <p className="mt-0.5 text-[13px] text-fo-grey">Suma puntos con este pedido</p>
      <div className="mt-3 flex gap-2">
        <label htmlFor={idCampo} className="sr-only">
          Número de tarjeta Plus
        </label>
        <input
          id={idCampo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={tarjeta}
          onChange={(e) => {
            setTarjeta(e.target.value);
            if (error) setError('');
          }}
          placeholder="Número de tarjeta Plus"
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={`${idCampo}-info`}
          className={`min-w-0 flex-1 rounded-btn border bg-white px-3 py-2.5 text-[15px] text-fo-blue placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-fo-blue/30 ${
            error ? 'border-fo-red' : 'border-[#E3E3E3] focus:border-fo-blue'
          }`}
        />
        <Btn type="submit" size="sm" disabled={enviando}>
          {enviando ? 'Sumando…' : 'Suma puntos'}
        </Btn>
      </div>
      <p id={`${idCampo}-info`} className={`mt-2 text-xs ${error ? 'font-semibold text-fo-red' : 'text-fo-grey'}`} aria-live="polite">
        {error || `Con este pedido sumarías ${puntosPlusDe(pedido.total)} puntos (${PUNTOS_PLUS_POR_EURO} por cada 1 € gastado).`}
      </p>
    </form>
  );
}

function AppPasajero({ visible }) {
  const { state, dispatch, clienteId, modo } = useStore();
  const { productos, ubicaciones, carrito, pedidos, notificaciones, altaDemanda } = state;

  const [fase, setFase] = useState('catalogo'); // catalogo | carrito | mapa | pago | confirmado
  const [ubicacionId, setUbicacionId] = useState(null);
  const [procesando, setProcesando] = useState(false); // false | 'pago' (pago simulado) | 'envio' (escribiendo el pedido en Firestore)
  const [errorPago, setErrorPago] = useState('');
  const [seguimiento, setSeguimiento] = useState(null);
  const [toast, setToast] = useState(null);
  const [listaActivos, setListaActivos] = useState(false); // hoja con los pedidos activos
  const [catActiva, setCatActiva] = useState(CATEGORIAS[0].nombre);
  const scrollRef = useRef(null);
  const navRef = useRef(null);
  const timerPago = useRef(null);

  // Mantiene visible, dentro de la barra de categorías, la pestaña activa (hay 10 y no caben todas)
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav && nav.querySelector(`[data-chip="${catActiva}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
    if (nav.scrollTo) nav.scrollTo({ left, behavior: 'smooth' });
    else nav.scrollLeft = left;
  }, [catActiva]);

  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      clearTimeout(timerPago.current);
    };
  }, []);

  const lineas = useMemo(
    () => productos.filter((p) => carrito[p.id] > 0).map((p) => ({ ...p, cantidad: carrito[p.id] })),
    [productos, carrito]
  );
  const totalItems = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = redondear(lineas.reduce((s, l) => s + l.cantidad * l.precio, 0));
  const bebidaSugerida = useMemo(() => sugerenciaBebida(lineas, productos), [lineas, productos]);
  // Esperas por cafetería (modelo de colas). Se recalculan al cambiar los pedidos / la alta demanda y, además,
  // a la fuerza cada 60 s con el temporizador de useRefrescoEsperas.
  const refresco = useRefrescoEsperas();
  const esperas = useMemo(
    () => Object.fromEntries(ubicaciones.map((u) => [u.id, esperaDe(u, pedidos, altaDemanda)])),
    [ubicaciones, pedidos, altaDemanda, refresco.tick]
  );
  const ubElegida = ubicaciones.find((u) => u.id === ubicacionId) || null;
  const masRapida = useMemo(() => {
    const orden = [...ubicaciones].sort((a, b) => esperas[a.id] - esperas[b.id]);
    return orden.length > 1 && esperas[orden[0].id] < esperas[orden[1].id] ? orden[0].id : null;
  }, [ubicaciones, esperas]);

  // "Mis pedidos" = solo los de ESTE dispositivo (las esperas de las cafeterías, en cambio, cuentan los pedidos de todos).
  const misPedidos = useMemo(() => pedidos.filter((p) => p.clienteId === clienteId), [pedidos, clienteId]);
  // Pedidos activos = los míos que aún no se han entregado (en preparación o listos para recoger). Más recientes primero.
  const pedidosActivos = useMemo(() => misPedidos.filter((p) => p.estado !== 'entregado').reverse(), [misPedidos]);
  const hayListo = pedidosActivos.some((p) => p.estado === 'listo');
  const pedidoSeg = misPedidos.find((p) => p.numero === seguimiento) || null;

  // Si el pedido que se está mirando desaparece (p. ej. otro dispositivo reinicia la demo), volvemos al catálogo
  useEffect(() => {
    if (fase === 'confirmado' && !pedidoSeg) {
      setFase('catalogo');
      setSeguimiento(null);
    }
  }, [fase, pedidoSeg]);

  // Abre el seguimiento detallado (fase 'confirmado') de un pedido concreto
  const verSeguimiento = (numero) => {
    setSeguimiento(numero);
    setListaActivos(false);
    setFase('confirmado');
  };

  // Aviso al pasajero cuando la tripulación mueve su pedido
  const prevNotif = useRef(notificaciones.length);
  useEffect(() => {
    if (notificaciones.length > prevNotif.current) setToast(notificaciones[notificaciones.length - 1]);
    prevNotif.current = notificaciones.length;
  }, [notificaciones.length]);
  useEffect(() => {
    if (!toast || !visible) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast, visible]);

  const irA = (nombre) => {
    const cont = scrollRef.current;
    const el = cont && cont.querySelector(`[data-cat="${nombre}"]`);
    if (!cont || !el) return;
    setCatActiva(nombre);
    const y = el.offsetTop - 64;
    if (cont.scrollTo) cont.scrollTo({ top: y, behavior: 'smooth' });
    else cont.scrollTop = y;
  };
  const alHacerScroll = (e) => {
    const cont = e.currentTarget;
    const top = cont.scrollTop + 90;
    let activa = CATEGORIAS[0].nombre;
    CATEGORIAS.forEach((c) => {
      const el = cont.querySelector(`[data-cat="${c.nombre}"]`);
      if (el && el.offsetTop <= top) activa = c.nombre;
    });
    setCatActiva(activa);
  };

  // Pago simulado (2 s) → CONFIRMAR_PEDIDO: el pedido se escribe en Firestore y la tripulación lo ve al instante
  const pagar = (metodo) => {
    if (procesando || !ubicacionId || totalItems === 0) return;
    setErrorPago('');
    setProcesando('pago');
    timerPago.current = setTimeout(async () => {
      if (!montado.current) return;
      setProcesando('envio');
      try {
        const numero = await dispatch({ type: 'CONFIRMAR_PEDIDO', ubicacionId, metodoPago: metodo });
        if (!montado.current) return;
        setSeguimiento(numero);
        setFase('confirmado');
      } catch (err) {
        if (!montado.current) return;
        if (err && err.code === 'sin-stock') {
          dispatch({ type: 'AVISAR', aviso: { texto: err.message, tono: 'error' } });
          setFase('carrito');
        } else {
          setErrorPago(mensajeErrorEscritura(err)); // el carrito se conserva: se puede reintentar
        }
      } finally {
        if (montado.current) setProcesando(false);
      }
    }, 2000);
  };

  const nuevoPedido = () => {
    setUbicacionId(null);
    setFase('catalogo');
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-fo-ice">
      {/* Barra superior fija: pedidos activos del pasajero (siempre visible, en todas las pantallas) */}
      <div className="shrink-0 bg-fo-ink px-4 py-2">
        <button
          type="button"
          onClick={() => setListaActivos(true)}
          aria-haspopup="dialog"
          aria-label={`${pedidosActivos.length} ${pedidosActivos.length === 1 ? 'pedido activo' : 'pedidos activos'}. Ver mis pedidos`}
          data-btn="pedidos-activos"
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
            pedidosActivos.length > 0 ? 'bg-fo-yellow text-fo-blue hover:bg-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          <span className="flex items-center gap-2">
            <Package size={18} />
            <span>
              {pedidosActivos.length} {pedidosActivos.length === 1 ? 'Pedido Activo' : 'Pedidos Activos'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {hayListo ? (
              <span className="rounded-full bg-fo-green px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Listo para recoger</span>
            ) : null}
            <ChevronRight size={16} />
          </span>
        </button>
      </div>
      <BandaConexion />

      {/* Resto de la app: las pantallas y hojas se superponen aquí, por debajo de la barra superior */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Cabecera */}
        <header className="shrink-0">
          {/* Franja blanca con los logos (Fred. Olsen Express · Talento Canario) */}
          <div className="flex items-center justify-between gap-4 border-b border-fo-line bg-white px-5 pb-2.5 pt-4">
            <LogoMarca src={LOGO_FRED_OLSEN} alt="Fred. Olsen Express" className="h-10">
              <span className="text-[15px] font-extrabold uppercase tracking-tight text-fo-blue">
                Fred. Olsen <i className="font-semibold normal-case text-fo-red">Express</i>
              </span>
            </LogoMarca>
            <LogoMarca src={LOGO_TALENTO_CANARIO} alt="Talento Canario" className="h-9">
              <span className="text-sm font-extrabold lowercase tracking-tight text-[#353A8E]">talento canario</span>
            </LogoMarca>
          </div>
          <div className="flex items-center justify-between gap-3 bg-fo-blue px-4 pb-3 pt-3 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fo-yellow text-fo-blue">
                <Ship size={22} />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/70">A bordo</p>
                <h1 className="text-lg font-bold leading-tight">Click &amp; Collect</h1>
              </div>
            </div>
            <span className="rounded-full border border-white/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">Prototipo</span>
          </div>
        </header>

        {/* Aviso de Alta Demanda (lo activa la tripulación): primera cosa que ve el pasajero en el catálogo */}
        {altaDemanda && fase === 'catalogo' ? (
          <div
            role="alert"
            aria-label="Aviso de alta demanda"
            className="fo-toast-in flex shrink-0 items-start gap-2.5 bg-fo-red px-4 py-3 text-white shadow-md"
          >
            <TriangleAlert size={20} className="mt-px shrink-0 text-fo-yellow" />
            <p className="text-[13px] font-semibold leading-snug">
              <span className="font-bold">Alta demanda en cafeterías:</span> Los tiempos de espera son superiores a lo habitual.
            </p>
          </div>
        ) : null}

        {/* Catálogo */}
        <div ref={scrollRef} onScroll={alHacerScroll} className="relative flex-1 overflow-y-auto pb-28">
          <div className="space-y-4 px-4 pt-4">
            <div className="rounded-card bg-white p-4">
              <h2 className="text-xl font-bold text-fo-blue">Pide desde donde estés</h2>
              <BarraAmarilla />
              <p className="mt-3 text-sm font-light text-fo-grey">
                Elige, paga y recoge en la cafetería que prefieras. Sin colas y sin moverte hasta que esté listo.
              </p>
            </div>
          </div>

          {/* Pestañas de categoría (pegadas arriba al hacer scroll) */}
          <nav
            ref={navRef}
            className="sticky top-0 z-10 -mb-1 mt-3 flex gap-2 overflow-x-auto bg-fo-ice px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Categorías"
          >
            {CATEGORIAS.map((c) => {
              const Ico = c.icono;
              const activa = catActiva === c.nombre;
              return (
                <button
                  key={c.nombre}
                  type="button"
                  data-chip={c.nombre}
                  onClick={() => irA(c.nombre)}
                  aria-pressed={activa}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activa ? 'border-fo-blue bg-fo-blue text-white' : 'border-fo-line bg-white text-fo-grey hover:border-fo-blue'
                  }`}
                >
                  <Ico size={16} /> {c.etiqueta}
                </button>
              );
            })}
          </nav>

          <div className="space-y-6 px-4 pt-3">
            {CATEGORIAS.map((c) => (
              <section key={c.nombre} data-cat={c.nombre} aria-label={c.etiqueta}>
                <h2 className="text-lg font-bold uppercase text-fo-blue">{c.etiqueta}</h2>
                <BarraAmarilla />
                <div className="mt-3 space-y-3">
                  {productos
                    .filter((p) => p.categoria === c.nombre)
                    .map((p) => (
                      <ProductoCard
                        key={p.id}
                        p={p}
                        cantidad={carrito[p.id] || 0}
                        onAdd={() => dispatch({ type: 'CARRITO_MAS', id: p.id })}
                        onDec={() => dispatch({ type: 'CARRITO_MENOS', id: p.id })}
                      />
                    ))}
                </div>
              </section>
            ))}
            <p className="pb-2 text-center text-xs text-fo-grey">
              Prototipo · catálogo cargado desde CSV · pagos simulados ·{' '}
              {modo === 'firebase' ? 'pedidos sincronizados con Firebase' : 'modo local (sin Firebase)'}
            </p>
          </div>
        </div>

        {/* Botón flotante del carrito */}
        {totalItems > 0 && fase === 'catalogo' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4">
            <button
              type="button"
              onClick={() => setFase('carrito')}
              className="fo-bar-in pointer-events-auto flex w-full items-center justify-between rounded-lg border border-fo-yellow bg-fo-yellow px-4 py-3.5 font-bold text-fo-blue shadow-[0_8px_20px_rgba(0,47,108,0.35)] transition hover:border-fo-blue"
              aria-label={`Ver mi pedido: ${totalItems} artículos, ${eur(total)}`}
            >
              <span className="flex items-center gap-3">
                <span className="relative">
                  <ShoppingBag size={24} />
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-fo-blue px-1 text-[11px] text-white">
                    {totalItems}
                  </span>
                </span>
                Ver mi pedido
              </span>
              <span className="text-lg">{eur(total)}</span>
            </button>
          </div>
        ) : null}

        {/* PASO 1 · Resumen del carrito (hoja inferior) */}
        {fase === 'carrito' ? (
          <HojaInferior
            titulo="Tu pedido"
            subtitulo="Paso 1 de 3 · Resumen"
            onClose={() => setFase('catalogo')}
            footer={
              lineas.length > 0 ? (
                <div className="space-y-3">
                  {/* Venta cruzada: comida sin bebida → sugerimos Agua (1 clic) justo encima del total */}
                  {bebidaSugerida ? (
                    <div className="fo-pop flex items-center gap-3 rounded-card border border-fo-yellow bg-fo-cream p-3" data-upsell="bebida">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fo-blue text-fo-yellow">
                        <Droplet size={20} />
                      </span>
                      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fo-blue">
                        <b className="block text-sm">Completa tu menú</b>
                        ¿Añades un Agua por <b>{eur(bebidaSugerida.precio)}</b>?
                      </p>
                      <Btn
                        size="sm"
                        onClick={() => dispatch({ type: 'CARRITO_MAS', id: bebidaSugerida.id })}
                        aria-label={`Añadir ${bebidaSugerida.nombre} al pedido`}
                      >
                        <Plus size={16} strokeWidth={2.5} /> Añadir
                      </Btn>
                    </div>
                  ) : null}
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-semibold text-fo-grey">Total</span>
                    <span className="text-[28px] font-bold leading-none text-fo-blue">{eur(total)}</span>
                  </div>
                  <Btn className="w-full" onClick={() => setFase('mapa')}>
                    Elegir punto de recogida <ArrowRight size={18} />
                  </Btn>
                  <Btn variant="outlineBlue" className="w-full" onClick={() => setFase('catalogo')}>
                    Seguir pidiendo
                  </Btn>
                </div>
              ) : null
            }
          >
            {lineas.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag size={36} className="mx-auto text-[#B5B5B5]" />
                <p className="mt-3 font-semibold text-fo-blue">Tu carrito está vacío</p>
                <Btn className="mt-4" onClick={() => setFase('catalogo')}>
                  Ver el catálogo
                </Btn>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-fo-line">
                  {lineas.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 py-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F7] text-fo-blue">
                        <ImagenProducto producto={l} size={22} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] font-semibold leading-tight text-fo-blue">{l.nombre}</p>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'CARRITO_QUITAR', id: l.id })}
                            aria-label={`Quitar ${l.nombre}`}
                            className="-mr-1 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fo-red transition hover:bg-fo-red/10"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-[13px] text-fo-grey">
                            {eur(l.precio)} × {l.cantidad} = <b className="text-fo-blue">{eur(l.precio * l.cantidad)}</b>
                          </p>
                          <Stepper
                            cantidad={l.cantidad}
                            onDec={() => dispatch({ type: 'CARRITO_MENOS', id: l.id })}
                            onInc={() => dispatch({ type: 'CARRITO_MAS', id: l.id })}
                            incDisabled={l.cantidad >= l.stock_disponible}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-fo-cream p-3 text-[13px] font-semibold text-fo-blue">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  En el siguiente paso eliges en qué cafetería recoges tu pedido.
                </div>
              </>
            )}
          </HojaInferior>
        ) : null}

        {/* PASO 2 · Mapa del buque: la cafetería se elige tocando directamente el plano */}
        {fase === 'mapa' ? (
          <Pantalla
            titulo="Punto de recogida"
            paso={2}
            onBack={() => setFase('carrito')}
            footer={
              <div className="space-y-2">
                <p className="flex items-center justify-center gap-1.5 text-center text-[13px] font-semibold text-fo-grey">
                  <MapPin size={14} />
                  {ubElegida ? (
                    <span>
                      Recogida en <b className="text-fo-blue">{ubElegida.nombre}</b>
                    </span>
                  ) : (
                    'Toca una cafetería en el plano para continuar'
                  )}
                </p>
                <Btn className="w-full" disabled={!ubElegida} onClick={() => setFase('pago')}>
                  Continuar al pago <ArrowRight size={18} />
                </Btn>
              </div>
            }
          >
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-xl font-bold text-fo-blue">¿Dónde recoges tu pedido?</h3>
                <BarraAmarilla />
                <p className="mt-3 text-sm font-light text-fo-grey">
                  Toca la cafetería del plano donde quieres recogerlo. Los tiempos dependen de los artículos que hay en cola.
                </p>
                {altaDemanda ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-fo-cream p-2.5 text-[13px] font-semibold text-fo-blue" data-aviso="alta-demanda-mapa">
                    <TriangleAlert size={16} className="mt-px shrink-0 text-fo-red" />
                    Alta demanda: los tiempos de espera se multiplican por {FACTOR_SOBRECARGA.toLocaleString('es-ES')}.
                  </p>
                ) : null}
              </div>

              <div className="rounded-card border border-fo-line bg-white p-3">
                <MapaBuque
                  ubicaciones={ubicaciones}
                  esperas={esperas}
                  masRapida={masRapida}
                  seleccion={ubicacionId}
                  onSelect={setUbicacionId}
                />
                <div className="mt-3 border-t border-fo-line pt-3" aria-label="Leyenda de tiempos de espera">
                  <p className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-fo-grey">Tiempo de espera</p>
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-semibold text-fo-grey">
                    {Object.entries(NIVELES_ESPERA).map(([nivel, n]) => (
                      <span key={nivel} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ring-1 ring-black/10 ${n.punto}`} />
                        {n.nombre} ({n.rango})
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-[11px] text-fo-grey" data-actualizacion="esperas">
                    Se actualiza cada minuto · última vez a las{' '}
                    {new Date(refresco.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          </Pantalla>
        ) : null}

        {/* PASO 3 · Pago simulado */}
        {fase === 'pago' && ubElegida ? (
          <Pantalla titulo="Resumen y pago" paso={3} onBack={() => setFase('mapa')}>
            <div className="space-y-4 p-4">
              <div className="rounded-card border border-fo-line bg-white p-4">
                <h3 className="mb-2 flex items-center gap-2 font-bold text-fo-blue">
                  <ShoppingBag size={18} /> Tu pedido
                </h3>
                <ul className="divide-y divide-fo-line">
                  {lineas.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 py-2 text-sm">
                      <span>
                        {l.cantidad}× {l.nombre}
                      </span>
                      <span className="font-semibold text-fo-blue">{eur(l.cantidad * l.precio)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-end justify-between border-t border-fo-line pt-3">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-[28px] font-bold leading-none text-fo-blue">{eur(total)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-[0.625rem] bg-white p-4 ring-1 ring-fo-blue/20">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fo-yellow text-fo-blue">
                  <MapPin size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fo-grey">Recogida en</p>
                  <p className="font-bold text-fo-blue">{ubElegida.nombre}</p>
                  <p className="text-[13px] text-fo-grey">{ubElegida.zona}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ChipEspera min={esperas[ubElegida.id]} tam="sm" />
                  <button type="button" onClick={() => setFase('mapa')} className="text-xs font-semibold text-fo-blue underline">
                    Cambiar
                  </button>
                </div>
              </div>

              {errorPago ? (
                <div role="alert" data-error="pago" className="fo-pop flex items-start gap-2.5 rounded-card border-2 border-fo-red bg-white p-3.5 text-[13px] font-semibold text-fo-red">
                  <TriangleAlert size={18} className="mt-px shrink-0" />
                  <p className="min-w-0 flex-1 leading-snug">{errorPago}</p>
                </div>
              ) : null}

              <div>
                <h3 className="text-lg font-bold text-fo-blue">Elige cómo pagar</h3>
                <BarraAmarilla />
                <div className="mt-3 space-y-2.5">
                  {METODOS_PAGO.map((m) => {
                    const Ico = m.icono;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pagar(m.nombre)}
                        disabled={procesando}
                        className="flex w-full items-center gap-3 rounded-btn border border-[#E3E3E3] bg-white px-4 py-3.5 font-bold text-fo-blue transition hover:border-fo-blue hover:bg-fo-ice disabled:opacity-60"
                      >
                        <Ico size={20} />
                        <span className="flex-1 text-left">{m.nombre}</span>
                        <ChevronRight size={18} className="text-[#9A9A9A]" />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-fo-grey">
                  <Info size={14} className="mt-px shrink-0" /> Pago simulado: es un prototipo y no se realiza ningún cargo.
                </p>
              </div>
            </div>
          </Pantalla>
        ) : null}

        {/* Confirmación + seguimiento en directo */}
        {fase === 'confirmado' && pedidoSeg ? (
          <section className="fo-slide-in absolute inset-0 z-20 flex flex-col bg-fo-ice" aria-label="Pedido confirmado">
            <div className="flex-1 overflow-y-auto">
              <div className="bg-fo-blue px-5 pb-10 pt-8 text-center text-white">
                <span className="fo-pop mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-full bg-fo-yellow text-fo-blue">
                  <Check size={32} strokeWidth={3} />
                </span>
                <h2 className="mt-4 text-2xl font-bold">¡Pedido confirmado!</h2>
                <p className="mt-1 text-sm text-white/80">Hemos avisado a la cafetería</p>
                <p className="mt-3 inline-block rounded-full bg-fo-yellow px-5 py-1.5 text-2xl font-bold text-fo-blue" aria-label={`Número de pedido ${numeroPedido(pedidoSeg.numero)}`}>
                  Pedido {numeroPedido(pedidoSeg.numero)}
                </p>
              </div>

              <div className="-mt-5 space-y-4 px-4 pb-6">
                {(() => {
                  const ub = ubicaciones.find((u) => u.id === pedidoSeg.ubicacionId);
                  return (
                    <>
                      {pedidoSeg.estado === 'listo' ? (
                        <div className="fo-pop rounded-card border-2 border-fo-yellow bg-fo-cream p-4 text-center">
                          <BellRing className="mx-auto text-fo-blue" size={28} />
                          <p className="mt-1 text-lg font-bold text-fo-blue">¡Listo para recoger!</p>
                          <p className="text-sm text-fo-grey">
                            Acércate a <b>{ub.nombre}</b> y di tu número <b>{numeroPedido(pedidoSeg.numero)}</b>.
                          </p>
                        </div>
                      ) : null}
                      {pedidoSeg.estado === 'entregado' ? (
                        <div className="rounded-card border border-fo-line bg-white p-4 text-center">
                          <PartyPopper className="mx-auto text-fo-blue" size={28} />
                          <p className="mt-1 text-lg font-bold text-fo-blue">Pedido entregado</p>
                          <p className="text-sm text-fo-grey">¡Que aproveche!</p>
                        </div>
                      ) : null}

                      <div className="rounded-card bg-white p-4 shadow-[0_4px_10px_0_rgba(0,0,0,0.11)]">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fo-yellow text-fo-blue">
                            <MapPin size={20} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-fo-grey">Recoge tu pedido en</p>
                            <p className="text-lg font-bold leading-tight text-fo-blue">{ub.nombre}</p>
                            <p className="text-[13px] text-fo-grey">{ub.zona}</p>
                          </div>
                          {pedidoSeg.estado !== 'listo' && pedidoSeg.estado !== 'entregado' ? <ChipEspera min={esperas[ub.id]} tam="sm" /> : null}
                        </div>
                      </div>

                      <div className="rounded-card bg-white p-4">
                        <h3 className="mb-3 font-bold text-fo-blue">Estado de tu pedido</h3>
                        <SeguimientoPedido pedido={pedidoSeg} />
                      </div>

                      <BloquePuntosPlus key={pedidoSeg.numero} pedido={pedidoSeg} />

                      <div className="rounded-card bg-white p-4">
                        <h3 className="mb-2 font-bold text-fo-blue">Resumen</h3>
                        <ul className="divide-y divide-fo-line text-sm">
                          {pedidoSeg.items.map((i) => (
                            <li key={i.id} className="flex justify-between py-1.5">
                              <span>
                                {i.cantidad}× {i.nombre}
                              </span>
                              <span className="font-semibold text-fo-blue">{eur(i.cantidad * i.precio)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between border-t border-fo-line pt-2 text-sm">
                          <span>Pagado con {pedidoSeg.metodoPago}</span>
                          <span className="text-lg font-bold text-fo-blue">{eur(pedidoSeg.total)}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="shrink-0 border-t border-fo-line bg-white p-4">
              <Btn className="w-full" onClick={nuevoPedido}>
                Hacer otro pedido
              </Btn>
            </div>
          </section>
        ) : null}

        {/* Hoja con los pedidos activos: tocar uno abre su seguimiento detallado */}
        {listaActivos ? (
          <HojaInferior
            titulo="Pedidos activos"
            subtitulo="Toca un pedido para ver su estado y su número de recogida"
            icono={Package}
            onClose={() => setListaActivos(false)}
          >
            {pedidosActivos.length === 0 ? (
              <div className="py-8 text-center" data-lista="vacia">
                <Package size={36} className="mx-auto text-[#B5B5B5]" />
                <p className="mt-3 font-semibold text-fo-blue">No tienes pedidos activos</p>
                <p className="mt-1 text-sm text-fo-grey">Cuando hagas un pedido aparecerá aquí con su estado.</p>
                <Btn className="mt-4" onClick={() => setListaActivos(false)}>
                  Seguir mirando el catálogo
                </Btn>
              </div>
            ) : (
              <ul className="space-y-2.5 pb-2" aria-label="Pedidos activos">
                {pedidosActivos.map((p) => {
                  const ub = ubicaciones.find((u) => u.id === p.ubicacionId);
                  const articulos = p.items.reduce((s, i) => s + i.cantidad, 0);
                  const info = INFO_ESTADO[p.estado];
                  const Ico = info.icono;
                  return (
                    <li key={p.numero}>
                      <button
                        type="button"
                        onClick={() => verSeguimiento(p.numero)}
                        aria-label={`Ver seguimiento del pedido ${numeroPedido(p.numero)}, ${info.texto}`}
                        data-pedido-activo={p.numero}
                        className="flex w-full items-center gap-3 rounded-card border border-fo-line bg-white p-3 text-left shadow-[1px_2px_4px_0_rgba(187,187,187,0.5)] transition hover:border-fo-blue"
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${p.estado === 'listo' ? 'bg-fo-green text-white' : 'bg-fo-blue text-fo-yellow'}`}>
                          <Ico size={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <b className="text-lg leading-none text-fo-blue">{numeroPedido(p.numero)}</b>
                            <Pill tone={info.tono}>{info.texto}</Pill>
                          </span>
                          <span className="mt-1 block truncate text-[13px] text-fo-grey">
                            {ub.nombre} · {articulos} {articulos === 1 ? 'artículo' : 'artículos'} · {eur(p.total)}
                          </span>
                        </span>
                        <ChevronRight size={20} className="shrink-0 text-fo-blue" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </HojaInferior>
        ) : null}
      </div>

      {/* Spinner de pago (patrón .SpinnerClipLoader del CSS corporativo) */}
      {procesando ? (
        <div className="fo-fade-in absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[rgba(0,47,108,0.55)] text-fo-yellow" role="status" aria-live="polite">
          <Loader2 size={50} className="animate-spin" />
          <span className="px-6 text-center text-2xl font-semibold">{procesando === 'envio' ? 'Enviando tu pedido a la cafetería…' : 'Procesando pago…'}</span>
        </div>
      ) : null}

      {/* Mientras Firebase conecta (o si falla) la app muestra una pantalla de carga en lugar de datos a medias */}
      <PantallaCarga marco />

      {/* Aviso de la tripulación */}
      {toast ? (
        <div className="fo-toast-in absolute inset-x-3 top-3 z-[60]" role="alert">
          <button
            type="button"
            onClick={() => {
              if (misPedidos.some((p) => p.numero === toast.numero)) verSeguimiento(toast.numero);
              setToast(null);
            }}
            className={`flex w-full items-center gap-3 rounded-lg border-l-4 p-3 text-left shadow-[0_8px_20px_rgba(0,0,0,0.25)] ${
              toast.estado === 'listo' ? 'border-fo-yellow bg-fo-blue text-white' : 'border-fo-yellow bg-white text-fo-blue'
            }`}
          >
            <BellRing size={22} className={toast.estado === 'listo' ? 'text-fo-yellow' : 'text-fo-blue'} />
            <span className="flex-1 text-sm font-bold">{toast.texto}</span>
            <X size={16} className="opacity-60" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------
   7. VISTA B — PANEL DE TRIPULACIÓN (Kanban, tablet / horizontal)
   ------------------------------------------------------------------- */
// Pantalla de cocina: solo DOS columnas (el pedido entra ya en preparación, sin paso intermedio de "nuevo")
const COLUMNAS = [
  { estado: 'preparando', titulo: 'En Preparación', color: '#FFD100', icono: ChefHat, accion: 'Marcar como listo', variante: 'secondary' },
  { estado: 'listo', titulo: 'Listos para Recoger', color: '#1C9561', icono: BellRing, accion: 'Entregar', variante: 'outlineBlue' },
];

function useAhora(ms) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

function TarjetaPedido({ pedido, ubicacion, columna, ahora, onAvanzar }) {
  const mins = Math.max(0, Math.floor((ahora - pedido.creado) / 60000));
  // Se marca en rojo cuando un pedido en preparación ya ha superado el tiempo que le correspondía según el modelo de colas
  const tarde = pedido.estado === 'preparando' && mins >= calcularEspera(pedido.items.reduce((s, i) => s + i.cantidad, 0));
  const hora = new Date(pedido.creado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const Flecha = columna.estado === 'listo' ? Check : ArrowRight;
  return (
    <article className="fo-pop rounded-card border border-fo-line bg-white p-5 shadow-[0_4px_10px_0_rgba(0,0,0,0.11)]" aria-label={`Pedido ${numeroPedido(pedido.numero)}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-3xl font-bold leading-none text-fo-blue">{numeroPedido(pedido.numero)}</h3>
        <span className={`flex items-center gap-1 text-sm font-semibold ${tarde ? 'text-fo-red' : 'text-fo-grey'}`} data-tarde={tarde ? 'si' : undefined}>
          <Clock size={14} /> {mins < 1 ? 'Ahora mismo' : `hace ${mins} min`} · {hora}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Pill tone={TONO_ETIQUETA_UBICACION[ubicacion.id] || 'blue'}>
          <MapPin size={12} /> {ubicacion.nombre}
        </Pill>
        <span className="text-xs text-fo-grey">Pago: {pedido.metodoPago}</span>
      </div>
      <ul className="mt-3 space-y-1.5 border-t border-fo-line pt-3 text-lg">
        {pedido.items.map((i) => (
          <li key={i.id} className="flex gap-2">
            <b className="w-9 shrink-0 text-fo-blue">{i.cantidad}×</b>
            <span>{i.nombre}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-fo-line pt-3">
        <span className="text-xl font-bold text-fo-blue">{eur(pedido.total)}</span>
        <Btn variant={columna.variante} onClick={onAvanzar}>
          {columna.accion} <Flecha size={16} />
        </Btn>
      </div>
    </article>
  );
}

function PanelTripulacion() {
  const { state, dispatch } = useStore();
  const { pedidos, ubicaciones, altaDemanda } = state;
  const [filtro, setFiltro] = useState('todas');
  const ahora = useAhora(15000);
  useRefrescoEsperas(); // re-renderiza cada 60 s: los chips de espera de la cabecera se recalculan con el modelo de colas

  const activos = pedidos.filter((p) => p.estado !== 'entregado');
  const entregados = pedidos.length - activos.length;
  const visibles = activos
    .filter((p) => filtro === 'todas' || p.ubicacionId === filtro)
    .sort((a, b) => a.creado - b.creado);

  return (
    <div className={`relative flex h-full flex-col transition-colors duration-300 ${altaDemanda ? 'bg-[#FCEBEA]' : 'bg-fo-ice'}`}>
      <header className={`shrink-0 text-white transition-colors duration-300 ${altaDemanda ? 'bg-fo-red' : 'bg-fo-blue'}`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/70">Vista B · Tablet</p>
            <h1 className="text-xl font-bold leading-tight">Panel de tripulación</h1>
          </div>

          <div className="flex items-center gap-2">
            {ubicaciones.map((u) => (
              <span
                key={u.id}
                title={`${articulosEnColaDe(u.id, pedidos)} artículos en cola`}
                className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-3 pr-1 text-xs font-semibold"
              >
                {u.corto}
                <ChipEspera min={esperaDe(u, pedidos, altaDemanda)} tam="sm" />
              </span>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div className="flex gap-4 text-center text-xs text-white/80">
              <span><b className="block text-xl leading-none text-white">{activos.length}</b>activos</span>
              <span><b className="block text-xl leading-none text-white">{entregados}</b>entregados</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={altaDemanda}
              onClick={() => dispatch({ type: 'ALTA_DEMANDA' })}
              className="flex items-center gap-3 rounded-full border-2 border-white/40 bg-white/10 px-4 py-2 text-sm font-bold transition hover:bg-white/20"
            >
              <Flame size={18} className={altaDemanda ? 'text-fo-yellow' : ''} />
              Modo Alta Demanda
              <span className={`relative h-6 w-11 rounded-full transition-colors ${altaDemanda ? 'bg-fo-yellow' : 'bg-white/30'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${altaDemanda ? 'left-[22px] bg-fo-blue' : 'left-0.5 bg-white'}`} />
              </span>
              <span className="w-14 text-left text-[11px] uppercase">{altaDemanda ? 'Activo' : 'Inactivo'}</span>
            </button>
          </div>
        </div>
        {altaDemanda ? (
          <div className="flex items-center justify-center gap-2 bg-fo-yellow px-4 py-1.5 text-sm font-bold text-fo-blue">
            <TriangleAlert size={16} className="fo-blink" />
            MODO ALTA DEMANDA ACTIVO · Prioriza los pedidos más antiguos
          </div>
        ) : null}
      </header>
      <BandaConexion />

      <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
        <span className="mr-1 text-sm font-semibold text-fo-grey">Cafetería:</span>
        {[{ id: 'todas', corto: 'Todas' }, ...ubicaciones].map((u) => (
          <button
            key={u.id}
            type="button"
            aria-pressed={filtro === u.id}
            onClick={() => setFiltro(u.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              filtro === u.id ? 'border-fo-blue bg-fo-blue text-white' : 'border-fo-line bg-white text-fo-grey hover:border-fo-blue'
            }`}
          >
            {u.corto}
          </button>
        ))}
      </div>

      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2 md:overflow-hidden ${altaDemanda ? 'md:ring-4 md:ring-inset md:ring-fo-red/30' : ''}`}>
        {COLUMNAS.map((col) => {
          const pedidosCol = visibles.filter((p) => p.estado === col.estado);
          const Ico = col.icono;
          return (
            <section key={col.estado} className="flex min-h-[200px] flex-col overflow-hidden rounded-card border border-fo-line bg-white/70" aria-label={col.titulo}>
              <header className="flex items-center justify-between border-t-[5px] bg-white px-4 py-3" style={{ borderTopColor: col.color }}>
                <h2 className="flex items-center gap-2 text-base font-bold uppercase text-fo-blue">
                  <Ico size={18} /> {col.titulo}
                </h2>
                <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-fo-blue px-2 text-sm font-bold text-white">{pedidosCol.length}</span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {pedidosCol.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center text-sm text-[#9A9A9A]">
                    <Ico size={28} />
                    {col.estado === 'preparando' ? 'Sin pedidos en preparación. Haz un pedido en la App Pasajero y aparecerá aquí.' : 'Sin pedidos listos'}
                  </div>
                ) : (
                  pedidosCol.map((p) => (
                    <TarjetaPedido
                      key={p.numero}
                      pedido={p}
                      ubicacion={ubicaciones.find((u) => u.id === p.ubicacionId)}
                      columna={col}
                      ahora={ahora}
                      onAvanzar={() => dispatch({ type: 'AVANZAR_PEDIDO', numero: p.numero, desde: col.estado })}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <PantallaCarga />
    </div>
  );
}

/* -------------------------------------------------------------------
   8. APP: barra superior (interruptor de vista) + las dos vistas
   ------------------------------------------------------------------- */
function Contenido() {
  const { state, dispatch, modo } = useStore();
  const [vista, setVista] = useState('pasajero');
  const [claveReinicio, setClaveReinicio] = useState(0);
  const [confirmaReinicio, setConfirmaReinicio] = useState(false);
  const enPreparacion = state.pedidos.filter((p) => p.estado === 'preparando').length; // pendientes para la tripulación

  // Con Firebase, reiniciar borra los pedidos de TODOS los dispositivos: pide una segunda pulsación (se cancela sola a los 4 s)
  useEffect(() => {
    if (!confirmaReinicio) return undefined;
    const t = setTimeout(() => setConfirmaReinicio(false), 4000);
    return () => clearTimeout(t);
  }, [confirmaReinicio]);

  const reiniciar = async () => {
    if (modo === 'firebase' && !confirmaReinicio) {
      setConfirmaReinicio(true);
      dispatch({ type: 'AVISAR', aviso: { texto: 'Pulsa de nuevo para borrar los pedidos de TODOS los dispositivos.', tono: 'info' } });
      return;
    }
    setConfirmaReinicio(false);
    const ok = await dispatch({ type: 'REINICIAR' });
    if (ok) {
      setClaveReinicio((k) => k + 1);
      setVista('pasajero');
    }
  };

  const tab = (id, corto, texto, Ico, extra) => (
    <button
      type="button"
      role="tab"
      aria-selected={vista === id}
      onClick={() => setVista(id)}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${
        vista === id ? 'bg-fo-yellow text-fo-blue' : 'text-white/80 hover:bg-white/10'
      }`}
    >
      <Ico size={16} className="hidden sm:block" />
      <span className="sm:hidden">{corto}</span>
      <span className="hidden sm:inline">{texto}</span>
      {extra}
    </button>
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden font-sans">
      {/* Barra global: logos · interruptor de vista (centrado) · reinicio */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 bg-fo-blue px-3 text-white sm:px-4 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-white px-1.5 py-1 sm:gap-2.5 sm:px-2.5" data-marca="barra-global">
            <LogoMarca src={LOGO_FRED_OLSEN} alt="Fred. Olsen Express" className="h-[18px] sm:h-6">
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-fo-blue">
                Fred. Olsen <i className="font-semibold normal-case text-fo-red">Express</i>
              </span>
            </LogoMarca>
            <span aria-hidden="true" className="h-4 w-px bg-fo-line sm:h-5" />
            <LogoMarca src={LOGO_TALENTO_CANARIO} alt="Talento Canario" className="h-[18px] sm:h-6">
              <span className="text-[11px] font-extrabold lowercase tracking-tight text-[#353A8E]">talento canario</span>
            </LogoMarca>
          </div>
          <span className="hidden truncate text-sm font-bold text-white/90 lg:block">Click &amp; Collect a bordo</span>
        </div>

        <div role="tablist" aria-label="Cambiar de vista" className="flex shrink-0 gap-1 justify-self-center rounded-lg bg-white/10 p-1">
          {tab('pasajero', 'Pasajero', 'App Pasajero', Smartphone, null)}
          {tab(
            'tripulacion',
            'Tripulación',
            'Panel Tripulación',
            ClipboardList,
            enPreparacion > 0 ? (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-fo-red px-1 text-[11px] text-white" aria-label={`${enPreparacion} pedidos en preparación`}>
                {enPreparacion}
              </span>
            ) : null
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 justify-self-end">
          <ChipConexion />
          <button
            type="button"
            onClick={reiniciar}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition max-[339px]:hidden ${
              confirmaReinicio ? 'bg-fo-red text-white' : 'text-white/80 hover:bg-white/10'
            }`}
            title={modo === 'firebase' ? 'Reiniciar demo (borra los pedidos de todos los dispositivos)' : 'Reiniciar demo'}
            data-btn="reiniciar"
          >
            <RotateCcw size={15} />
            <span className={confirmaReinicio ? 'inline' : 'hidden md:inline'}>{confirmaReinicio ? '¿Seguro?' : 'Reiniciar demo'}</span>
          </button>
        </div>
      </div>

      {/* Contenedor de las vistas: centrado estricto (flex + items-center + justify-center) */}
      <main className="relative flex h-full min-h-0 w-full flex-1 items-center justify-center bg-fo-sky" data-contenedor="vistas">
        {/* Las dos vistas siguen montadas para conservar su estado local al cambiar */}
        <div className={`h-full w-full items-center justify-center md:p-6 ${vista === 'pasajero' ? 'flex' : 'hidden'}`}>
          <div className="relative h-full w-full max-w-[400px] overflow-hidden bg-fo-ice md:h-[min(100%,820px)] md:rounded-[3rem] md:border-[12px] md:border-[#0B1F3F] md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
            <AppPasajero key={claveReinicio} visible={vista === 'pasajero'} />
          </div>
        </div>
        <div className={`h-full w-full items-center justify-center ${vista === 'tripulacion' ? 'flex' : 'hidden'}`}>
          <div className="h-full w-full">
            <PanelTripulacion key={claveReinicio} />
          </div>
        </div>
        <AvisoGlobal />
      </main>
    </div>
  );
}

function App() {
  return (
    <StoreProvider>
      <Contenido />
    </StoreProvider>
  );
}

/* -------------------------------------------------------------------
   9. LOGOS incrustados en base64 (Fred. Olsen Express · Talento Canario)
   En un proyecto Vite puedes sustituirlos por ficheros:
     import LOGO_FRED_OLSEN from './assets/logo-fred-olsen-express.png';
   ------------------------------------------------------------------- */
const LOGO_FRED_OLSEN = 'data:image/png;base64,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';
const LOGO_TALENTO_CANARIO = 'data:image/png;base64,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';

/*
 * ───────── Estilos (solo la primera vez) ─────────
 * tailwind.config.js → pega esto dentro de `module.exports = ` (y carga la fuente Open Sans de Google Fonts):
 * {
 *   theme: {
 *     extend: {
 *       colors: {
 *         fo: {
 *           blue: '#002F6C',   // --color-blue   (cabecera, textos, botones secundarios)
 *           yellow: '#FFD100', // --color-yellow (CTA principal, acentos, barritas)
 *           red: '#E2251D',    // --color-red
 *           grey: '#535353',   // --color-grey   (texto base)
 *           ice: '#F4F7FF',    // fondo de la app / tarjetas azul claro
 *           sky: '#E5EFF6',    // .bg_blue
 *           line: '#E4E4E4',   // bordes de tarjetas
 *           cream: '#FEF7CB',  // alertas amarillas
 *           green: '#1C9561',  // check de éxito
 *           ink: '#0B1F3F',    // marco del móvil (solo demo)
 *         },
 *       },
 *       fontFamily: { sans: ['"Open Sans"', 'Arial', 'Verdana', 'sans-serif'] },
 *       borderRadius: { btn: '0.375rem', card: '1rem' },
 *     },
 *   },
 * }
 *
 * Además copia las @keyframes / clases .fo-* del <style> de la versión HTML a tu index.css.
 */

export default App;

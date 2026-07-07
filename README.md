# OpoKiller

Sistema de estudio personal para las oposiciones de **Veterinarios de Administración Sanitaria de la DGA (Aragón), Subgrupo A1** — convocatoria **25/0077** (93 plazas).

No es una app genérica de productividad: está conectada con tu temario real, tus tests, tus errores y tu ritmo de academia. Cada día te dice **qué estudiar, cuánto tiempo, qué material abrir y qué resultado producir**, y encadena el ciclo completo:

> material → planificación → sesión → recuperación → test → error → repaso → estadísticas → reajuste

Diseñada para reducir fricción y decisiones (perfil TDAH): una tarea principal visible, máximo 3 prioridades, botones grandes, modo concentración y recuperación fácil tras un día perdido.

---

## 1. Arranque rápido

```bash
npm install
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción (PWA) en dist/
npm run preview  # servir el build
npm test         # tests unitarios y de integración (vitest)
```

Requisitos: Node ≥ 18. La app funciona **offline** (PWA instalable) y guarda todo en tu navegador (IndexedDB). No envía datos a ningún servidor.

En el **primer arranque** la app importa automáticamente tu Excel (ya convertido a `src/data/seed.json`): 90 temas, 17 con material, 2 parciales (E12.2 DDD y E36.1 Triquina), las 50 preguntas reales del test del 17/06, tu inventario de materiales y los 3 tests semanales. Un onboarding de 4 pasos fija tu objetivo de horas y tu Pomodoro y genera tu primera semana.

---

## 2. Arquitectura

Capas separadas: **UI ← lógica de dominio (pura) ← datos**.

```
src/
  data/seed.json          Datos extraídos del Excel (fuente inicial)
  domain/                 Lógica pura, sin dependencias de UI ni de BD (testeable)
    types.ts              Modelo de datos (entidades)
    dates.ts              Utilidades de fecha ISO
    review.ts             Motor de repaso espaciado (0-5 → próxima fecha)
    scoring.ts            Corrección de tests con penalización + errores
    tasks.ts              Plantillas de tarea (verbo + ámbito + producto)
    planner.ts            Puntuación de prioridad + generación del día
    projection.ts         Proyección de fin de primera vuelta (datos reales)
    assistant.ts          Asistente de planificación (reglas, sin inventar)
    selectors.ts          Cálculos derivados para las pantallas
    docx.ts               Parser puro de WordprocessingML (.docx → bloques)
    wordImport.ts         Heurísticas: detección de tema, parsing y fusión de tests
    __tests__/            Tests unitarios y de integración
  db/
    db.ts                 Esquema Dexie (IndexedDB, v2 con productos)
    defaults.ts           Ajustes por defecto
    seed.ts               Carga inicial del seed
    actions.ts            Mutaciones (sesiones, repasos, tests, errores, productos…)
    excel.ts              Re-importación y exportación .xlsx (SheetJS)
    docxReader.ts         Descompresión .docx (JSZip) → parser puro
    wordActions.ts        Persistencia de import Word (tema/test/fusión) con undo
    notifications.ts      Notificaciones del navegador (opcionales, degradan)
    backup.ts             Copia/restauración JSON completa
  hooks/useData.ts        Hooks reactivos (dexie-react-hooks)
  ui/                     Componentes reutilizables + ErrorBoundary + toast
  screens/                Una pantalla por sección + WordImport / ExcelImport
  App.tsx / main.tsx      Shell, routing y arranque (siembra la BD)
```

**Stack:** React 18 + TypeScript (estricto) · Vite · Dexie (IndexedDB) · SheetJS (xlsx) · JSZip (docx) · React Router · vite-plugin-pwa. Sin backend.

---

## 3. Modelo de datos

Entidades principales (ver `src/domain/types.ts`): `Topic`, `Subtopic`, `Material` (con `version`/`supersedesId`), `StudyProduct`, `StudyTask`, `StudySession`, `Review`, `Question`, `Test`, `TestAttempt`, `ErrorEntry`, `WeeklyPlan`, `DailyCheckin`, `AppSettings`.

- Los **90 temas oficiales** (15 comunes `C01-C15` + 75 específicos `E01-E75`) se identifican por `officialId`.
- Los **temas parciales** se dividen en subtemas con progreso propio (`E12.2`, `E36.1`, `E36.2`), y el tema oficial actúa de contenedor.
- Campos de **catálogo** (título, material, prioridad) son editables y se pueden reimportar; los campos de **progreso** (minutos, dominio, estado, fechas de repaso) los calcula la app y nunca se sobrescriben al reimportar.

---

## 4. El planificador (`planner.ts`)

Cada tema candidato recibe una **puntuación de prioridad** explicable. Suma pesos configurables por: tema semanal/prioritario, repaso vencido (con bonus por días de retraso), dominio bajo, material parcial, tema ya empezado, preguntas pendientes y clase próxima. La UI muestra el motivo en texto llano: *«Se prioriza porque: tema semanal, dominio bajo, material parcial»*.

`generateDayPlan()` arma la lista ordenada del día respetando reglas anti-sobrecarga:

1. Recuperación inicial (protegida).
2. Temas actuales — **máximo 2** (1 en día mínimo).
3. Un único tema atrasado.
4. Repaso vencido más urgente.
5. Un test pendiente.
6. Errores vencidos.
7. Cierre (protegido).

Todo se recorta al **presupuesto de minutos** del tipo de día (mínimo 50 · ligero 120 · medio 210 · normal 270 · intensivo 330 · descanso 0). Las tareas nunca son genéricas: llevan verbo, ámbito, duración, producto y criterio de finalización.

Reparto semanal por defecto: **55% actual / 25% atraso / 20% repasos-tests** (configurable en Ajustes).

---

## 5. Motor de repaso espaciado (`review.ts`)

Intervalos por fase: **1, 3, 7, 14, 30, 60, 90** días. Tras cada repaso puntúas de 0 a 5:

- `≥3` avanza de fase (intervalo más largo).
- `2` mantiene la fase.
- `≤1` retrocede; `0` reinicia.

La cola de repasos se clasifica por urgencia (vence hoy · 1-3 días · +1 semana · crítico) para que no todos pesen igual. Una sesión de estudio programa automáticamente el primer repaso al día siguiente.

---

## 6. Corrección de tests (`scoring.ts`)

Penalización oficial configurable: **+1 acierto · −0,3333 error · 0 en blanco**. Se calcula nota neta, % bruto/neto, aciertos/errores/blancas y tiempo por pregunta.

**Corrección activa:** por cada fallo eliges la causa (no lo sabía, cifra, norma, excepción, lo cambié…) y la severidad, y se crea una entrada en el cuaderno de errores con su repetición programada (Alta 1 día · Media 3 · Baja 7). El cuaderno detecta **patrones recurrentes** («has fallado 5 veces cifras: crea una tabla única»).

---

## 7. Importar material (Excel y Word) y copias

- **Importar Word (.docx)** en Materiales → «Importar Word»: arrastra un **tema** o un **test** y la app detecta cuál es.
  - *Tema*: extrae apartados (encabezados), tablas, **normativa** (Reglamentos, Directivas, Leyes, RD, Órdenes, artículos) y **cifras/plazos**; sugiere el tema oficial (E##/C##) y subtema si es parcial; propone **productos de estudio** (mapa, tabla normativa, tabla de cifras, diagrama, preguntas, mini test). Al confirmar crea el material, marca el tema Recibido/Parcial, crea el subtema si falta y los productos. **Deshacer** en un toque.
  - *Test*: extrae preguntas numeradas con opciones A-D y la **respuesta correcta** (marcada en negrita/subrayado o desde una «Plantilla/Soluciones»); detecta la fecha del nombre. Si ya existe un test que coincide (fecha/título/nº), ofrece **fusionar la corrección** rellenando las respuestas en sus preguntas, sin duplicar.
- **Importar Excel** (onboarding y Ajustes): arrastrar-y-soltar → vista previa (hojas, temas nuevos/actualizados, preguntas nuevas vs. duplicadas, avisos) → **copia automática previa** → aplicar, con **deshacer**. Nunca sobrescribe tu progreso.
- **JSON completo** (Ajustes → Exportar/Restaurar): copia sin pérdida de toda la base (incluye productos de estudio). Registra la **fecha de la última copia** y avisa si pasan 7+ días.
- **Excel** (`.xlsx`): exporta temario, banco de preguntas y errores a un libro portable.
- **Reiniciar desde el Excel inicial** (Ajustes → Datos), con confirmación.

Los materiales de Word guardan **versión** (`version`) y a qué material anterior sustituyen (`supersedesId`), para no perder versiones previas.

---

## 8. Pantallas

Hoy · Plan · Calendario (semanal/mensual + proyección) · Temario · Repasos · Tests · Errores · Sesiones · Materiales (bandeja de entrada) · Estadísticas · Ajustes. Navegación adaptada a escritorio (barra lateral) y móvil/iPad (barra inferior). Modo claro/oscuro (auto o manual).

---

## 9. Funciones completadas

- [x] Importación del Excel (90 temas, 50 preguntas, materiales, tests) y reimportación con conservación de historial.
- [x] Onboarding y generación de primera semana + plan diario.
- [x] Pantalla Hoy: resumen, prioridad principal, resto del día, avisos, acciones rápidas.
- [x] Planificador con puntuación de prioridad explicable y tipos de día (incl. «día mínimo»).
- [x] Pomodoro + modo concentración + cierre de sesión que actualiza minutos, dominio y repaso del tema.
- [x] Motor de repaso espaciado con cola por urgencia.
- [x] Motor de tests (por tema, por cantidad, 10 al azar, solo fallos, simulacro) con penalización oficial y corrección activa.
- [x] Cuaderno de errores con severidad, repeticiones y detección de recurrencias.
- [x] Calendario semanal y mensual con proyección de fin de primera vuelta basada en datos reales.
- [x] Estadísticas reales (horas, temario, tests, constancia, franja productiva).
- [x] Gestor de temario con fichas, subtemas y estados; bandeja de materiales.
- [x] Asistente de planificación (reglas, sin inventar datos).
- [x] **Repasos reales**: cada estudio crea una fila de repaso pendiente; bandeja por urgencia + «Repasar un tema» a demanda; el tipo de repaso **varía** por fase (esquema, preguntas, mini-test, oral, procedimiento…). Completar reprograma la próxima fecha.
- [x] **Importar Excel en el onboarding y en Ajustes** (arrastrar-soltar, vista previa, copia previa automática y **deshacer**).
- [x] **Recuperación de sesión tras recargar**: si cierras/recargas a mitad de Pomodoro, Hoy ofrece «Reanudar» con el tiempo transcurrido correcto, o «Descartar».
- [x] **Calendario editable**: tocar una tarea permite **moverla a otro día**, completarla o eliminarla.
- [x] **Modo «Me he quedado atrás»**: reparte los repasos vencidos en varios días y deja hoy en mínimo, sin cargas imposibles.
- [x] Copias JSON/Excel con **fecha de última copia y aviso**, restauración y reinicio.
- [x] **Notificaciones opcionales** del navegador (sesión/repaso), con degradación elegante si se deniegan.
- [x] **Importación de Word (.docx)**: temas (estructura, normativa, cifras, productos sugeridos) y tests (preguntas + respuesta correcta), con **fusión de la versión corregida** y deshacer.
- [x] **Productos de estudio** por tema (mapa, tabla normativa/cifras, diagrama, preguntas, mini test…) con estado pendiente → iniciado → completado → revisar, visibles en la ficha del tema.
- [x] **Identidad e icono propios**: libro abierto con check de progreso en verde azulado; set completo de iconos (16→512, maskable, apple-touch, favicon .svg/.ico) y manifest PWA configurado.
- [x] Offline/PWA instalable, persistencia local (IndexedDB, migración v2 para productos), ErrorBoundary.
- [x] Tests automatizados (36) + typecheck estricto + ESLint (0 errores).

## 10. Funciones pendientes / próximas (v1.1+)

- Extracción de tablas de Word como tablas estructuradas navegables (hoy: se cuentan y alimentan sugerencias).
- Ficha de tema por pestañas (hoy: ficha única con subtemas + productos).
- Arrastrar-y-soltar real en el calendario (hoy: mover con un toque, que funciona también en móvil).
- Sincronización opcional entre dispositivos (Supabase) — fase 2.
- Code-splitting de SheetJS/JSZip para reducir el tamaño inicial del bundle.

---

## 11. Pruebas realizadas

`npm test` ejecuta 36 pruebas (`src/domain/__tests__`):

- **review / scoring / planner / seed / actions / excel-import**: motor de repaso, penalización oficial, prioridad, seed de 90 temas, integración con la BD (repasos, sesiones, recuperación) e importación del Excel real conservando progreso.
- **docx**: parser de WordprocessingML (encabezados, tablas, negrita/subrayado), detección de tema (id oficial, subtema, normativa, cifras, productos), parsing de test (preguntas, opciones, respuesta marcada o plantilla), detección de fecha y **fusión** de test corregido.
- **wordActions** (integración con la BD): importar un tema Word crea material + productos y marca el tema, con **undo** limpio; crear subtema en tema parcial; importar un test Word y **fusionar** su corrección rellenando respuestas.

Verificación manual en navegador de esta pasada (Word import real, docx generado):
- **Tema Word** (`Tema 37…docx`) → detecta E37 (85% confianza), extrae normativa (Reglamento UE 2017/625, RD 1086/2020) y cifras (15 días, 3 años, 40 horas), sugiere 6 productos → al guardar, E37 pasa a **Recibido** con material «Tema Word» y **6 productos** creados.
- **Test Word** (`…03-07-2026.docx`) → detecta 4 preguntas, **4 con respuesta** (negrita) y fecha 2026-07-03 → al guardar aparece en Tests y es jugable.
- Icono/identidad cargados (favicon .svg, apple-touch, theme #155753); consola sin errores.

## 12. Errores conocidos

- El bundle de producción supera 500 KB (SheetJS). Aceptable para una app personal offline; pendiente code-splitting.
- La proyección de fin de primera vuelta necesita algunas sesiones registradas para ser fiable (con 0 sesiones muestra «datos insuficientes»).

---

## 13. Cómo añadir funciones sin romper la app

1. Lógica nueva → función **pura** en `src/domain/` con su test en `__tests__/`.
2. Persistencia → añade la tabla/índice en `db.ts` (sube `version(n)` de Dexie para migrar) y la mutación en `actions.ts`.
3. UI → un componente pequeño en `screens/` o `ui/`, consumiendo datos con los hooks de `hooks/useData.ts`.
4. Mantén la separación UI/lógica/datos, evita `any`, y ejecuta `npx tsc -b && npm test` antes de dar por terminado.

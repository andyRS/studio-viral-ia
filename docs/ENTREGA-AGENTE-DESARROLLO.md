# Desarrollo pendiente para acompañar el diseño

Responsabilidades acordadas: este trabajo implementa diseño UX/UI y presentación. Migraciones, persistencia avanzada y desarrollo de servicios corresponden al otro agente. No se han cambiado `src/lib`, rutas API, Supabase, dependencias ni archivos de montaje.

## Prioridad alta · integridad y continuidad

1. **Guardado local verificable.** `src/lib/store.ts`: `save` captura y silencia errores de localStorage. Una imagen base64 o un historial grande puede superar cuota y la interfaz seguir mostrando el estado en memoria. Devolver resultado/error, conservar borrador recuperable y mostrar fallo de guardado real. Validar cuota llena y almacenamiento denegado.
2. **Separación de respaldo por usuario.** `src/lib/DataContext.tsx`: el respaldo de tablas opcionales utiliza claves locales compartidas; no contienen userId. Revisar aislamiento al cambiar de cuenta, migración de claves e importación explícita. No mezclar automáticamente proyectos locales de usuarios distintos.
3. **Fallback de tablas opcionales.** En `loadSupabase`, cualquier error de una tabla opcional activa respaldo local. Diferenciar tabla/columna ausente de un timeout, error de permisos o servicio temporalmente caído. No presentar un fallo transitorio como «falta migración».
4. **Creación consistente.** `GeneratorModule.createStory` guarda serie, personajes y episodio con múltiples operaciones. Definir recuperación y reanudación cuando falla un guardado intermedio; no repetir la generación completa por un fallo de persistencia. Preservar contenido generado antes de intentar guardar de nuevo.
5. **Autosave y concurrencia.** `DataContext.update` fusiona una instantánea actual y envía el registro completo. Evaluar carreras entre campos, Realtime y dos ventanas. Implementar revisión/updated_at, parches acotados y conflictos visibles antes de prometer guardado automático.

## Prioridad alta · experiencia cinematográfica

6. **Arrastrar escenas.** Proyectos largos tienen IDs estables; usar una operación explícita de orden con historial, candados y soporte por teclado. Las escenas cortas usan número/índice para archivos y clipChecks: moverlas exige preservar todas esas asociaciones. Las tomas ya tienen flechas y persistencia: aprovechar el handler existente al añadir arrastre, respetando sus reglas.
7. **Generación observable.** Rutas actuales devuelven respuestas completas. Para mostrar etapas internas reales se necesita un contrato de jobs/eventos o streaming. Definir estados, retry, idempotencia y cancelación admitida por proveedor. Hasta entonces mantener GenerationStatus indeterminado y mensajes honestos.
8. **Conservar borradores entre módulos.** El dashboard remonta el módulo con `key` y lo desmonta al navegar. Mover formularios en curso a almacenamiento de borradores, restaurar pestaña/escena y avisar antes de perder cambios. El acceso «Retomar» actual abre el episodio más reciente por fecha de creación, no el último punto editado.
9. **Archivos de trabajo.** SceneDesk mantiene archivos en sesión. Definir almacenamiento persistente y URLs de medios, con permisos y limpieza; solo entonces ofrecer continuidad de clips tras recargar. No presentar la revisión guardada como prueba de que el archivo sigue disponible.

## Prioridad media · calidad y expansión

10. **ESLint reproducible.** `npm run lint` abre el asistente inicial porque falta configuración. Configurar dependencias y script no interactivo con reglas apropiadas; incorporar a CI junto con typecheck, pruebas y build.
11. **Carga por módulo.** `page.tsx` importa todos los módulos de forma estática. Medir el bundle y adoptar importaciones dinámicas con skeletons; no modificar comportamiento de sesión/OAuth.
12. **Seguridad de tipos.** `strict:false`, datos extensivos en `any`. Tipar contratos de episodios/outline y normalizar respuestas externas antes de subir gradualmente strictness.
13. **Pruebas de integración.** Las pruebas presentes cubren lógica narrativa, no navegación, persistencia, diálogos, permisos ni errores de red. Añadir flujos de creación/recuperación, versiones, teclado, recarga y modo local vs autenticado con datos aislados.
14. **Publicaciones y métricas.** Conservar las reglas documentadas en creative-intelligence-system.md: ausencia no equivale a cero, series temporales requieren capturas reales, reprogramar exige escritura soportada y vínculos deben ser explícitos.
15. **Validación en navegador.** Pendiente escritorio y móvil, zoom 200 %, diálogo de referencia, secuencia horizontal, contraste, teclado, lector de pantalla, movimiento reducido y Web Vitals. La herramienta visual se bloqueó por no identificar la URL; no hay resultados visuales certificados.

## Contrato para integrar el diseño

- `cinematic.css` usa tokens semánticos y no exige migraciones.
- MissionControl consume useData y callbacks existentes de navegación.
- ReferencePreview es solo lectura; `previous` representa la última referencia guardada del historial.
- Las etapas de producción derivan de registros; no añadir porcentajes de tiempo ni marcar imágenes generadas por existir prompts.
- Mantener las restricciones de ficha aprobada y versión vigente antes de abrir producción.
- Evitar tocar simultáneamente `page.tsx`, `GeneratorModule.tsx` y `ProduccionPanels.tsx` sin coordinar: contienen la integración de presentación.

## Verificación

La base pasó typecheck y las 29 comprobaciones narrativas existentes. Las comprobaciones tras esta renovación y el build se registran en UX-RENOVACION.md. Lint bloqueado por configuración ausente. No hay validación de una sesión autenticada de producción ni migraciones ejecutadas.

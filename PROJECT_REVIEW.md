# Revisión técnica del proyecto `concurso`

## Lenguajes y frameworks detectados

- **Backend/API:** JavaScript (Node.js) con **Express 5**, **Mongoose**, **CORS** y **Morgan**.
- **Frontend:** **Vue 3** con **TypeScript** y **Vite**.
- **Ingesta de datos:** **Python 3** con **PyMongo**.
- **Infraestructura:** **Docker Compose**, **Nginx** y **MongoDB**.

## Opinión de optimización

### Fortalezas

- El frontend usa Vite y compilación estática para producción, lo que es positivo para rendimiento.
- El backend usa consultas de MongoDB relativamente simples y directas.
- El flujo de despliegue separa frontend/API/DB/ingesta, facilitando escalado por servicio.

### Riesgos o cuellos de botella

1. **Falta de índices en MongoDB** para campos usados en consultas frecuentes (`year`, `city`):
   - `aggregate + $match + $sample` puede degradar al crecer la colección.
   - `distinct('city')` y `countDocuments({ year: { $exists: true } })` también se benefician de índices.

2. **Ausencia de manejo de errores en endpoints async**:
   - Si falla Mongo o llega un resultado vacío, hoy puede devolver `undefined` o dejar errores sin controlar.

3. **Conexión y configuración sin hardening**:
   - CORS está acotado a localhost (bien para dev), pero no hay perfil explícito por entorno.
   - No se observan límites de rate limiting / cache HTTP para endpoints repetitivos.

4. **Ingesta Python carga todos los archivos en memoria** (`files = list(iter_files(source_dir))`):
   - En datasets grandes puede aumentar el consumo de RAM innecesariamente.

5. **Imágenes sin lazy loading y sin atributos de tamaño** en frontend:
   - Puede impactar métricas de render/performance al crecer el catálogo.

### Recomendaciones de alto impacto

1. Crear índices en MongoDB:
   - `{ year: 1 }`, `{ city: 1 }`, y potencialmente compuesto `{ city: 1, year: 1 }` según uso.

2. Endurecer control de errores en controladores:
   - `try/catch` por endpoint con respuestas 4xx/5xx claras.

3. Optimizar selección aleatoria:
   - Evaluar prefiltrado/caching de IDs elegibles por modo para evitar scans frecuentes.

4. Hacer la ingesta más streaming-friendly:
   - Iterar archivos sin materializar todo en lista.
   - Insertar en lotes si el volumen crece.

5. Mejoras frontend:
   - `loading="lazy"` en `<img>` y placeholders.
   - Evitar `sort(() => Math.random() - 0.5)` para barajado estadísticamente sesgado; usar Fisher–Yates.

## Conclusión

El proyecto está **bien planteado para una escala pequeña/media** y es funcional para desarrollo y despliegue con Docker. Sin embargo, para crecer en volumen de fotos y tráfico, conviene priorizar índices de MongoDB, manejo robusto de errores y optimizaciones de ingesta/selección aleatoria.

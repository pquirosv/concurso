# Ejecutar con Docker

Requisitos: Docker y Docker Compose instalados.

## Pasos rápidos

1) Construir y levantar servicios (Mongo, API, frontend):
```
docker compose up --build
```

2) UI disponible en `http://localhost:5173`. La API queda en `http://localhost:3000` hablando con Mongo en `mongo:27017`.

## Notas

- Los datos no se inicializan: agrega documentos a la colección `photos` en la base `prueba` para ver preguntas. Ejemplo rápido (otra terminal):
```
docker exec -it concursofotos-mongo-1 mongosh "mongodb://localhost:27017/prueba" --eval 'db.photos.insertOne({name:"paris.jpg",year:2021,yearOptions:["2019","2020","2021","2022"]})'
```
- El frontend se sirve con Vite dev server; recarga cuando se reinicia el contenedor. La API usa `npm run dev` (Express + nodemon).

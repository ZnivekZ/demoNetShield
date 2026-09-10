# Cómo ejecutar el proyecto con Docker

Antes de empezar, asegúrate de tener instalado y abierto **Docker Desktop** en tu computadora.

---

## Opción 1: Es la primera vez que descargas el proyecto en tu máquina

Sigue estos pasos en orden:

1. Abre una terminal dentro de la carpeta del proyecto.
2. Crea el archivo de configuración copiando la plantilla con este comando:
   `cp backend/.env.example backend/.env`
   *(En Windows con CMD usa: `copy backend\.env.example backend\.env`)*
3. Enciende el proyecto ejecutando:
   `docker compose --profile dev up --build`
   *(Espera unos minutos mientras descarga e instala todo automáticamente).*
4. Abre tu navegador web e ingresa a:
   * Para usar la aplicación: **http://localhost:5173**
   * Para ver la API del backend: **http://localhost:8000/docs**
5. Para apagar el proyecto cuando termines de trabajar:
   * Presiona `Ctrl + C` en la terminal, o escribe: `docker compose down`

---

## Opción 2: Ya venías trabajando en el proyecto (y ahora se agregó Docker)

Si ya tenías el código en tu computadora y descargaste los cambios (`git pull`):

1. Asegúrate de cerrar cualquier terminal donde estuvieras corriendo `python main.py`, `npm run dev` o `uvicorn` para que los puertos no queden trabados.
2. Verifica que tengas tu archivo `backend/.env`. Si no lo tienes, créalo con:
   `cp backend/.env.example backend/.env`
3. Ejecuta en la terminal:
   `docker compose --profile dev up --build`
   *(Solo la primera vez usas `--build` para que arme los contenedores).*
4. Entra a tu navegador en:
   * Aplicación: **http://localhost:5173**
   * Backend: **http://localhost:8000/docs**
5. En el día a día para volver a iniciarlo, solo ejecutas:
   `docker compose --profile dev up`
6. Para apagarlo cuando termines:
   `docker compose down`

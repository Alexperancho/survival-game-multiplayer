Instrucciones (coloca esta carpeta en la raíz del repo):

- icons/icon-192.png
- icons/icon-512.png
- icons/favicon.ico

1) Asegúrate de que tu manifest (manifest.webmanifest) tenga:
   "icons": [
     { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
     { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
   ]

2) En <head> de index.html añade (si no lo tienes):
   <link rel="icon" href="/icons/favicon.ico" sizes="any">
   <link rel="apple-touch-icon" href="/icons/icon-192.png">

3) Haz commit/push y comprueba en Chrome → DevTools → Application → Manifest.

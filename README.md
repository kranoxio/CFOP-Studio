# CFOP Studio

3D-Speedcube im Browser: Der Würfel wird verdreht und per CFOP gelöst, der aktuelle Algorithmus läuft daneben mit.
Läuft auf Desktop und Handy.

## Funktionen

- **Solver**: optimales Kreuz, F2L über die 41 Standardfälle (oder computer-optimal), OLL (57) und PLL (21) mit AUF.
  Die Kamera lässt sich frei um den Würfel schwenken, das Tempo ist von 0,5 bis 20 TPS einstellbar.
  „⏱ 12s“ spielt die Lösung in deiner Zielzeit ab. Jeder Zug ist anklickbar, dazu Zug-Pfeile,
  Fokus-Modus (irrelevante Steine abgedunkelt) und Pause nach jedem Schritt.
- **Algorithmen**: alle 119 Fälle als animiertes Raster, gefiltert nach Set, Gruppe, Favoriten und Lernstatus.
  In der Detailansicht kannst du Alternativen wählen oder einen eigenen Alg eintragen; der wird gegen eine Würfel-Simulation geprüft.
- **Trainer**: Fälle erkennen, aufdecken, bewerten. Schwache Fälle kommen öfter dran.
- **Timer**: Stackmat-artige Stoppuhr mit WCA-Scrambles, ao5/ao12, +2/DNF und „Lösung ansehen“ für jeden Scramble.

Fortschritt, eigene Algs und Zeiten werden im Browser gespeichert (localStorage).

## Auf dem NAS mit Portainer

Bei jedem Push baut GitHub Actions ein Docker-Image (amd64 + arm64) nach `ghcr.io/kranoxio/cfop-studio:latest`.

1. Portainer → **Stacks** → **Add stack** → Web editor:

   ```yaml
   services:
     cfop-studio:
       image: ghcr.io/kranoxio/cfop-studio:latest
       container_name: cfop-studio
       restart: unless-stopped
       ports:
         - "8085:80"
   ```

2. **Deploy the stack** → im Browser `http://<NAS-IP>:8085` öffnen.

Ist das Repo privat, ist auch das Image privat. Dann entweder unter GitHub → Packages → `cfop-studio` →
Package settings die Sichtbarkeit auf *Public* stellen, oder in Portainer unter **Registries** `ghcr.io`
mit GitHub-Benutzername und einem Personal Access Token (Scope `read:packages`) hinterlegen.

**Alternative ohne Registry:** In Portainer *Repository* als Build-Methode wählen, die Repo-URL eintragen
und als Compose-Pfad `docker-compose.build.yml` angeben. Portainer baut das Image dann direkt auf dem NAS.

Update: im Stack auf **Pull and redeploy** klicken.

## Entwicklung

```bash
npm install
npm run dev     # Entwicklungsserver
npm test        # prüft alle 119 Algs und den Solver
npm run build   # Produktions-Build nach dist/
```

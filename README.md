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
- **Trainer** mit drei Modi:
  - *Erkennung*: Fälle erkennen, aufdecken, bewerten. Schwache Fälle kommen öfter dran.
  - *Kreuz*: Kreuz oder X-Cross in der Inspektion planen, eingeben (Tastenfeld oder Smartcube) und mit der optimalen Lösung vergleichen.
  - *Lookahead*: Während der Würfel ein Paar einsetzt, das nächste Paar finden und seinen Slot antippen; bewertet nach Zugkosten.
- **Timer**: Stackmat-artige Stoppuhr mit WCA-Scrambles, ao5/ao12, +2/DNF und „Lösung ansehen“ für jeden Scramble.
- **GAN-Smartcube** (Bluetooth): Scramble-Assistent, Timer startet beim ersten Zug und stoppt automatisch,
  Splits für Kreuz, jedes F2L-Paar, OLL und PLL, Rekonstruktion jedes Solves mit erkannten OLL/PLL-Fällen
  und Vergleich mit dem Solver. Im Solver folgt der 3D-Würfel deinem echten Würfel („Mitverfolgen“), und
  „Meinen Würfel lösen“ löst den aktuellen Zustand. Ohne Würfel lässt sich alles mit dem Tastatur-Simulator testen.
- **2×2-Modus** (Umschalter oben rechts): eigener 2×2-Würfel, Solver mit wählbarer Methode
  - *Ortega*: erste Seite (optimal) → OLL (7) → PBL (8)
  - *CLL*: erste Ebene (optimal) → CLL (42)
  - *EG*: erste Seite (optimal) → je nach unterer Ebene CLL, EG-1 (40) oder EG-2 (40)

  Die Sammlung zeigt die 2×2-Kategorien OLL, PBL, CLL, EG-1, EG-2; im Trainer lassen sich beliebige
  Kategorien kombinieren (z. B. nur EG-1 + EG-2). Timer mit 2×2-Scrambles und eigener Session.
- **Einstellungen (⚙)**: Hell/Dunkel/Auto, Einhand-Modus (Daumen-Layout links oder rechts), Alg-Set zweihändig oder OH
  (einhändige OLL/PLL-Algs), Leistungsanzeige.

### Smartcube auf iPhone/iPad
Safari unterstützt kein Web Bluetooth. Installiere die kostenlose App **Bluefy** (Web-BLE-Browser) und öffne
CFOP Studio darin. Am Mac/PC funktionieren Chrome und Edge. Beim ersten Verbinden fragt die App eventuell nach
der MAC-Adresse des Würfels (steht in der GAN-App), die dann gespeichert wird.
Unterstützt (über die Bibliothek `gan-web-bluetooth`): GAN356 i3, i Carry / Carry 2, GAN12 ui (FreePlay/Maglev),
GAN14 ui, Mini ui, MoYu AI 2023.

Fortschritt, eigene Algs und Zeiten werden im Browser gespeichert (localStorage).

Die App lässt sich auf iPhone/iPad über *Teilen → Zum Home-Bildschirm* wie eine eigene App installieren
und funktioniert nach dem ersten Besuch auch offline. Das ⚡ oben rechts blendet eine Leistungsanzeige ein
(gezeichnete Bilder pro Sekunde, längstes Bild, Draw Calls, Auflösungsfaktor). Im Stillstand zeigt sie 0 FPS,
denn gezeichnet wird nur, wenn sich etwas bewegt.

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
npm test        # prüft alle 3×3-Algs (+ OH), 177 2×2-Algs, beide Solver, Splits und Wiedergabe
npm run build   # Produktions-Build nach dist/
```

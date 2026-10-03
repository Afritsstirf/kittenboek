# Kittenboek

Een eenvoudige app om alles bij te houden over je nieuwe lieve kitten: gewicht, dierenartsbezoeken, een dagboek, foto's en afspraken.

**Probeer het meteen:** https://afritsstirf.github.io/kittenboek/

## Wat kan je ermee?

- **Overzicht**: leeftijd, laatste gewicht, volgende afspraak, mijlpalen om aan te vinken ("Eerste keer gespind", "Kattenbak gebruikt", …) en een tijdlijn met alles samen.
- **Dagboek**: korte stukjes per dag, met een stemming (😸 blij, 🙀 ondeugend, 😴 slaperig…), wie het schreef en een foto.
- **Gewicht**: een groeicurve in grammen, met het verschil per weging en het gemiddelde per week.
- **Dierenarts**: gegevens van de praktijk, chipnummer en een logboek per bezoek.
- **Foto's**: een fotoalbum. Foto's worden automatisch verkleind.
- **Agenda**: afspraken om af te vinken, met één klik in **Google Agenda** of als **.ics-bestand** voor Apple- of Outlook-agenda. Er zijn ook suggesties voor vaccinaties, ontworming en meer.
- **Selecteren en verwijderen** in elke rubriek.
- **Eigen achtergrondfoto** van je kitten, met een zachte waas zodat alles leesbaar blijft (bij *Profiel*).
- **Back-up** downloaden en terugzetten (bij *Profiel*).
- Werkt op gsm en computer, in licht en donker thema, en **ook offline**.

## Privacy: alles blijft op je eigen toestel

Kittenboek heeft geen server en geen account. Alles wat je noteert, ook de foto's, wordt enkel bewaard in de browser van het toestel waarop je het gebruikt (IndexedDB).

Dat betekent ook:

- Op een ander toestel of in een andere browser zie je je gegevens niet. Gebruik **Profiel → Back-up downloaden** en zet dat bestand op het andere toestel terug met **Back-up terugzetten**.
- Als je de browsergegevens van de site wist, ben je alles kwijt. **Maak dus af en toe een back-up.** De app herinnert je eraan.

## Installeren op je gsm

Open de link in je browser en kies:

- **Android (Chrome):** menu ⋮ → *App installeren* of *Toevoegen aan startscherm*
- **iPhone (Safari):** deelknop → *Zet op beginscherm*

Kittenboek verschijnt dan met een eigen icoon, zoals een gewone app.

## Zelf draaien of aanpassen

Er is niets te installeren: het zijn gewone webbestanden zonder bouwstap of afhankelijkheden.

| Bestand | Wat zit erin |
|---|---|
| `index.html` | de opbouw van de pagina |
| `style.css` | kleuren, lettertypes en opmaak |
| `script.js` | de werking: opslaan, grafiek, agenda, back-up |
| `sw.js` | laat de app offline werken |
| `manifest.webmanifest` + `icons/` | naam en icoon voor installatie op gsm |

Start een eenvoudige webserver in deze map, bijvoorbeeld:

```bash
python -m http.server 8080
```

Open daarna `http://localhost:8080`. Je kan `index.html` ook gewoon dubbelklikken, maar dan werken offline gebruik en installeren niet.

Pas je bestanden aan en zet je ze online? Verhoog dan `CACHE` in `sw.js` (bv. `kittenboek-v2`), zodat gebruikers de nieuwe versie krijgen.

## Let op

De tips in de app (groei per week, vaccinatieschema, …) zijn algemene richtlijnen. Volg altijd het advies van je eigen dierenarts.

## Licentie

MIT: vrij te gebruiken, aan te passen en te delen. Zie [LICENSE](LICENSE).

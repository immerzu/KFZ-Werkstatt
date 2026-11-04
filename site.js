(function () {
    'use strict';

    var siteScriptUrl = document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : document.baseURI;

    var sticky = document.querySelector('.sticky-bereich');
    var root = document.documentElement;
    var reduziert = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* v98: Nur die Startseite zeigt die große Kopfzeile mit Logo. Auf allen anderen
       Seiten setzt der Generator die Klasse "unterseite" am <html> und "ohne-logo"
       am .sticky-bereich — dort bleibt die Leiste dauerhaft schmal (Logo weg). */
    var startseite = !root.classList.contains('unterseite');

    /* v92: größere Hysterese + Mindestabstand zwischen zwei Wechseln.
       Vorher pendelte die Kopfzeile beim Scrollen an der Schwelle (Zittern). */
    var kompaktRein = 80;
    var kompaktRaus = 24;
    var wechselSperre = 400;
    var letzterWechsel = 0;
    var nachholTimer = 0;
    var istKompakt = false;

    /* v91: Die Kopfzeile darf sich NUR verkleinern, wenn der Besucher selbst scrollt.
       Klickt er dagegen einen Menüpunkt/Anker an, springt die Seite nur — die Kopfzeile
       bleibt in ihrer Größe. unterschieden wird über die Eingabe: Rad, Wischen und
       Tastatur sind "echtes" Scrollen, ein Anker-Sprung ist es nicht. */
    var nutzerScrollt = false;
    var sprungAktiv = false;

    /* v91: Wird eine Seite mit Anker aufgerufen (z. B. von einer Unterseite aus
       "…/index.html#faq"), ist das ein Sprung und kein Scrollen — dann bleibt die
       Kopfzeile groß, bis der Besucher wirklich scrollt. */
    if (window.location.hash && window.location.hash !== '#') sprungAktiv = true;

    function markiereNutzerScroll() {
      if (nutzerScrollt) return;
      nutzerScrollt = true;
      sprungAktiv = false;
      aktualisiereKompakt();
    }

    var tastenZumScrollen = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar'];

    /* Zeigt der Link auf einen Anker derselben Seite? (dann ist es ein Sprung) */
    function istAnkerDerselbenSeite(href) {
      if (!href) return false;
      var teile = href.split('#');
      if (teile.length < 2 || teile[1] === '') return false;
      var pfad = teile[0];
      if (pfad === '') return true;
      var datei = window.location.pathname.split('/').pop() || 'index.html';
      return pfad === datei;
    }

    function findeLink(el) {
      while (el && el !== document) {
        if (el.tagName === 'A' && el.hasAttribute('href')) return el;
        el = el.parentNode;
      }
      return null;
    }

    /* v100: KEINE Nachführung der Anker-Landung mehr.
       v95 korrigierte nach einem Sprung nach (das lazy geladene Werkstattbild
       verschob das Ziel), v99 weich und erst nach Stillstand der Bewegung.
       Beides war als Ruckeln sichtbar: Chrome fährt am Ende der weichen Animation
       so langsam, dass pro Frame weniger als ein Pixel dazukommt — die
       Ruhe-Erkennung lief deshalb MITTEN in der Bewegung ab und startete eine
       ZWEITE Scrollbewegung („bleibt stehen und scrollt weiter", vom Nutzer
       gemeldet).
       Der Anlass für die Nachführung ist entfallen: Die Box des lazy geladenen
       Werkstattbildes ist seit v95 reserviert (aspect-ratio + feste Breite),
       beim Nachladen verschiebt sich also nichts. Der Sprung landet allein über
       scroll-padding-top: var(--kopf-kompakt) exakt unter der schmalen Leiste.
       ACHTUNG: In Kommentaren dieses Skripts keine Backticks verwenden — sie
       beenden das Template-Literal der Seite. */

    /* Ziel-Element eines Anker-Links ("…#faq" → Element mit id="faq"). */
    function zielElement(href) {
      var hash = (href || '').split('#')[1];
      return hash ? document.getElementById(hash) : null;
    }

    function initialisiereKompaktSperre() {
      window.addEventListener('wheel', markiereNutzerScroll, { passive: true });
      window.addEventListener('touchmove', markiereNutzerScroll, { passive: true });
      window.addEventListener('keydown', function (ereignis) {
        if (tastenZumScrollen.indexOf(ereignis.key) !== -1) markiereNutzerScroll();
      });
      document.addEventListener('click', function (ereignis) {
        var link = findeLink(ereignis.target);
        if (!link) return;
        if (istAnkerDerselbenSeite(link.getAttribute('href'))) {
          /* v97: Klick auf eine Rubrik — die Kopfzeile wird SOFORT verschmälert,
             wenn das Ziel weiter unten liegt (Nutzerwunsch: sie soll sich nicht nur
             beim Scrollen, sondern auch beim Klick auf eine Rubrik zusammenziehen).
             Die Zielposition wird vorher berechnet, weil window.scrollY im Moment
             des Klicks noch den alten Wert hat (ganz oben also 0).
             Die Landung rechnet der Browser mit scroll-padding-top =
             --kopf-kompakt, also exakt unter der schmalen Leiste. */
          sprungAktiv = false;
          nutzerScrollt = false;
          var sprungZielEl = zielElement(link.getAttribute('href'));
          var zielY = sprungZielEl
            ? sprungZielEl.getBoundingClientRect().top + window.scrollY
            : window.scrollY;
          if (nachholTimer) {
            window.clearTimeout(nachholTimer);
            nachholTimer = 0;
          }
          if (startseite) schalteKompakt(zielY > kompaktRein);
        } else {
          sprungAktiv = false;
        }
      });
    }

    function setzeStickyHoehe() {
      if (!sticky) return;
      /* v93: setzt NUR die aktuelle Höhe (Information). Sie darf nicht in Layout-
         Höhen eingehen — sonst verschiebt sich der Inhalt beim Scrollen. */
      root.style.setProperty('--sticky-hoehe', sticky.offsetHeight + 'px');
    }

    /* v93/v97: Die Reserve (Platz unter der festen Kopfzeile + Basis für
       --rubrik-hoehe) wird AUSSCHLIESSLICH hier gesetzt: einmal beim Laden und bei
       Fenstergrößen-Änderungen. Während der Zusammenklapp-Animation darf sie NICHT
       nachgeführt werden — die Kopfzeile misst dann Zwischenwerte (86 … 184 px), die
       Reserve würde mitwandern, der Inhalt nachrutschen und die Seite wachsen.
       v97: Hier wird zusätzlich die Höhe der EINGEKLAPPTEN Kopfzeile gemessen
       (--kopf-kompakt). Sie ist der Bezug für scroll-padding-top, weil die Leiste
       seit v97 auch beim Klick auf eine Rubrik schmal wird. */
    function messeKopfReserve() {
      if (!sticky) return;
      /* v98: Auf Unterseiten ist die Leiste dauerhaft schmal — beide Werte sind dort
         gleich, und es wird keine Zustandsklasse gesetzt. */
      if (!startseite) {
        var schmalUnten = sticky.offsetHeight;
        root.style.setProperty('--kopf-reserve', schmalUnten + 'px');
        root.style.setProperty('--kopf-kompakt', schmalUnten + 'px');
        return;
      }
      var warKompakt = istKompakt;
      /* v101: Übergänge für die Dauer der Messung abschalten. Sonst startet das
         Setzen der Klasse "kompakt" die 0,25-s-Animation, offsetHeight liefert
         sofort noch die GROSSE Höhe — und --kopf-kompakt (der Landepunkt für
         Ankersprünge) wäre 184 statt 86 px. Der Sprung landete dann 98 px zu tief
         (vom Nutzer am Foto gemeldet). */
      sticky.classList.add('ohne-uebergang');
      if (warKompakt) sticky.classList.remove('kompakt');
      var hoehe = sticky.offsetHeight;
      sticky.classList.add('kompakt');
      var schmal = sticky.offsetHeight;
      if (!warKompakt) sticky.classList.remove('kompakt');
      sticky.classList.remove('ohne-uebergang');
      root.style.setProperty('--kopf-reserve', hoehe + 'px');
      root.style.setProperty('--kopf-kompakt', schmal + 'px');
    }

    var notleiste = document.querySelector('.notleiste');
    function setzeNotleistenHoehe() {
      if (!notleiste) return;
      if (window.innerWidth <= 640) {
        root.style.setProperty('--notleiste-hoehe', notleiste.offsetHeight + 'px');
      } else {
        root.style.setProperty('--notleiste-hoehe', '0px');
      }
    }

    /* Schaltet die Kopfzeile um (Animation läuft über die CSS-Transition). */
    function schalteKompakt(soll) {
      if (!sticky || soll === istKompakt) return;
      letzterWechsel = Date.now();
      istKompakt = soll;
      sticky.classList.toggle('kompakt', soll);
      setzeStickyHoehe();
      if (!reduziert.matches) window.setTimeout(setzeStickyHoehe, 300);
    }

    function aktualisiereKompakt(sofort) {
      if (!sticky) return;
      /* v98: Unterseiten bleiben immer schmal — dort gibt es nichts umzuschalten. */
      if (!startseite) return;
      var y = window.scrollY;
      /* v97: Die Kopfzeile richtet sich IMMER nach der Scrollposition. Die frühere
         Sonderregel aus v91 („nach einem Klick auf einen Menüpunkt nicht
         verkleinern“) ist auf Nutzerwunsch aufgehoben: Genau wie beim Scrollen soll
         sich die Leiste auch beim Klick auf eine Rubrik verschmälern — sie nimmt
         sonst zu viel Platz weg und verdeckt Inhalt. */
      var soll = istKompakt ? y > kompaktRaus : y > kompaktRein;
      if (soll === istKompakt) return;
      /* v95: Bei einem Anker-Sprung (sofort === true) wird die Mindestpause
         übersprungen, damit die Leiste rechtzeitig schmal ist. */
      if (sofort) {
        if (nachholTimer) {
          window.clearTimeout(nachholTimer);
          nachholTimer = 0;
        }
      } else if (Date.now() - letzterWechsel < wechselSperre) {
        /* v92: Nach einem Wechsel kurz Ruhe lassen — die Kopfzeile animiert 0,25 s.
           Ein Umschalten mitten in der Animation ließ die Leiste zittern. */
        if (!nachholTimer) {
          nachholTimer = window.setTimeout(function () {
            nachholTimer = 0;
            aktualisiereKompakt();
          }, wechselSperre);
        }
        return;
      }
      schalteKompakt(soll);
    }

    setzeStickyHoehe();
    messeKopfReserve();
    setzeNotleistenHoehe();
    aktualisiereKompakt();
    initialisiereKompaktSperre();
    initialisiereFaqAnimation();

    if (sticky && 'ResizeObserver' in window) {
      new ResizeObserver(setzeStickyHoehe).observe(sticky);
    } else {
      window.addEventListener('resize', setzeStickyHoehe);
    }
    window.addEventListener('scroll', aktualisiereKompakt, { passive: true });
    window.addEventListener('resize', function () {
      messeKopfReserve();
      aktualisiereKompakt();
      setzeStickyHoehe();
      setzeNotleistenHoehe();
    });

    /* ==== v96: FAQ-Einträge weich auf- und zuklappen ==== */
    /* <details> klappt von sich aus hart auf. Hier wird die Höhe der Antwort
       animiert (Dauer muss zur CSS-Transition in .faq-item.ist-animiert passen).
       Ohne JavaScript bleibt der Eintrag normal bedienbar: Der Klick wird nur
       abgefangen, wenn das Skript die Animation übernimmt — bei reduzierter
       Bewegung ("prefers-reduced-motion") passiert gar nichts. */
    var faqDauer = 280;

    function initialisiereFaqAnimation() {
      var eintraege = document.querySelectorAll('.faq-item');
      for (var i = 0; i < eintraege.length; i++) {
        (function (eintrag) {
          var kopf = eintrag.querySelector('summary');
          var bereich = eintrag.querySelector('.faq-antwort');
          if (!kopf || !bereich) return;
          var laeuft = false;
          eintrag.classList.add('ist-animiert');

          function fertig(istOffen) {
            if (istOffen) {
              bereich.style.height = 'auto';
            } else {
              eintrag.removeAttribute('open');
              bereich.style.height = '';
            }
            laeuft = false;
          }

          kopf.addEventListener('click', function (ereignis) {
            if (reduziert.matches) return;        /* natives Verhalten, ohne Animation */
            ereignis.preventDefault();            /* auch während einer Animation: Klick schlucken */
            if (laeuft) return;
            laeuft = true;

            var istOffen = eintrag.hasAttribute('open');
            var endeTimer = 0;

            function nachziehen() {
              bereich.style.height = istOffen ? '0px' : (bereich.scrollHeight + 'px');
              /* Sicherheitsnetz, falls kein transitionend kommt. */
              endeTimer = window.setTimeout(function () { fertig(!istOffen); }, faqDauer + 80);
            }

            if (istOffen) {
              /* Erst auf die gemessene Höhe fixieren — von "auto" kann der
                 Browser nicht interpolieren. */
              bereich.style.height = bereich.scrollHeight + 'px';
              window.setTimeout(nachziehen, 20);
            } else {
              eintrag.setAttribute('open', '');
              bereich.style.height = '0px';
              window.setTimeout(nachziehen, 20);
            }

            bereich.addEventListener('transitionend', function einmal(ende) {
              if (ende.propertyName !== 'height') return;
              bereich.removeEventListener('transitionend', einmal);
              window.clearTimeout(endeTimer);
              fertig(!istOffen);
            });
          });
        })(eintraege[i]);
      }
    }

    /* Scroll-Reveal, Hero-Zoom, Hero-Parallax */
    function bereiteStaffelungVor() {
      var gruppen = document.querySelectorAll('.leistungen, .kontakt-grid, .faq-liste, .weitere-liste');
      for (var g = 0; g < gruppen.length; g++) {
        var kinder = gruppen[g].children;
        for (var k = 0; k < kinder.length; k++) kinder[k].style.transitionDelay = (k * 45) + 'ms';
      }
    }

    function initialisiereReveal() {
      var ziele = document.querySelectorAll('.reveal');
      if (!ziele.length) return;
      if (!('IntersectionObserver' in window) || reduziert.matches) {
        for (var i = 0; i < ziele.length; i++) ziele[i].classList.add('ist-sichtbar');
        return;
      }
      var beobachter = new IntersectionObserver(function (eintraege) {
        for (var j = 0; j < eintraege.length; j++) {
          var e = eintraege[j];
          if (!e.isIntersecting) continue;
          e.target.classList.add('ist-sichtbar');
          beobachter.unobserve(e.target);
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      for (var i = 0; i < ziele.length; i++) beobachter.observe(ziele[i]);
    }

    function initialisiereZoom() {
      var heroBild = document.querySelector('.hero-bild img');
      if (!heroBild) return;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { heroBild.classList.add('ist-sichtbar'); });
      });
    }

    function initialisiereParallax() {
      var hero = document.querySelector('.hero');
      if (!hero || reduziert.matches) return;
      var heroTick = false;
      var maxVersatz = 32;
      function aktualisiere() {
        heroTick = false;
        var rect = hero.getBoundingClientRect();
        if (rect.bottom < -50 || rect.top > window.innerHeight + 50) return;
        var versatz = -rect.top * 0.18;
        if (versatz > maxVersatz) versatz = maxVersatz;
        if (versatz < -maxVersatz) versatz = -maxVersatz;
        hero.style.setProperty('--hero-parallax', versatz.toFixed(1) + 'px');
      }
      window.addEventListener('scroll', function () {
        if (heroTick) return;
        heroTick = true;
        window.requestAnimationFrame(aktualisiere);
      }, { passive: true });
      aktualisiere();
    }

    /* Details per Hash öffnen (Impressum/Datenschutz auf der Startseite entfallen) */
    function oeffneDetailsFuerHash(hash) {
      if (!hash || hash.length < 2) return;
      var ziel = document.getElementById(hash.slice(1));
      if (ziel && ziel.tagName === 'DETAILS' && !ziel.open) ziel.open = true;
    }
    document.addEventListener('click', function (event) {
      if (!(event.target instanceof Element)) return;
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      oeffneDetailsFuerHash(link.getAttribute('href'));
    });
    window.addEventListener('hashchange', function () { oeffneDetailsFuerHash(window.location.hash); });
    oeffneDetailsFuerHash(window.location.hash);

    /* ==== v114: Ankündigung und „Aktuelles" aus dem Wartungsbereich ====
       Die Daten werden nicht mehr in der Seite mitgeliefert, sondern kommen aus
       dem Wartungsbereich: Cloudflare Worker /api/eintraege, gespeichert in Cloudflare D1. Gelesen wird zur Laufzeit — eine Änderung im Wartungsbereich wirkt
       sofort, ohne neuen Bau und ohne neuen Deploy.
       Antwortet die Function nicht (oder gibt es sie noch nicht), bleibt alles wie
       bisher: keine Ankündigung, kein „Aktuelles", kein Fehler, kein Sprung im
       Layout. Als Notnagel wird dann die frühere Datei ankuendigung.json versucht. */
    var ankuendigung = null;

    function ankuendigungGueltig(d) {
      if (!d || d.aktiv !== true) return false;
      var heute = new Date();
      heute.setHours(0, 0, 0, 0);
      /* v142: Ein Beginn in der Zukunft verhindert die Anzeige NICHT — genauso hält es
         der Server (eintraege.js, istSichtbar). Nur „abgelaufen" und der
         Schalter nehmen eine Ankündigung von der Seite. „von" steuert allein, ob der
         Öffnungsstatus schon rot wird (Feld laeuft). */
      if (d.bis) {
        var bis = new Date(d.bis + 'T23:59:59');
        if (!isNaN(bis.getTime()) && heute > bis) return false;
      }
      return true;
    }

    function zeigeAnkuendigung(d) {
      ankuendigung = d;
      var links = document.querySelector('.ankuendigung-links');
      var rechts = document.querySelector('.ankuendigung-rechts');
      /* v122 (Nutzerentscheidung): Die Ankündigung erscheint nur noch in der
         Kopfzeile — links und rechts vom Logo. Die früheren Anzeigen in der
         Superkachel (Hero-Kasten und Chip neben dem Status) sind entfernt. */
      if (links) links.textContent = d.text || '';
      if (rechts) rechts.textContent = d.zusatz || '';
      /* v124: Hinweiszeile am Handy — dort ist die Kontaktleiste aus und neben dem
         Logo ist kein Platz. Weil der Streifen die Kopfzeile höher macht, müssen die
         gemessenen Höhen (--kopf-reserve / --kopf-kompakt) danach neu bestimmt
         werden; sonst landen Ankersprünge zu tief. */
      var mobil = document.querySelector('[data-ankuendigung-mobil]');
      var mobilText = document.querySelector('[data-ankuendigung-mobil-text]');
      if (mobil && mobilText) {
        mobilText.textContent = d.text ? d.text + (d.zusatz ? ' · ' + d.zusatz : '') : '';
        mobil.hidden = !d.text;
        messeKopfReserve();
        setzeStickyHoehe();
      }
      aktualisiereStatus();
    }

    /* „Aktuelles": Meldungen aus dem Wartungsbereich. Die Karte steht im Markup
       auf hidden und wird nur gefüllt und eingeblendet, wenn es Meldungen gibt —
       ohne Meldungen sieht die Startseite aus wie vorher. */
    function zeitraumLesbar(m) {
      function lesbar(iso) {
        var t = String(iso).split('-');
        return t.length === 3 ? t[2] + '.' + t[1] + '.' + t[0] : iso;
      }
      if (!m.von && !m.bis) return '';
      if (m.von && m.bis) return 'Gültig ' + lesbar(m.von) + ' bis ' + lesbar(m.bis);
      if (m.von) return 'Ab ' + lesbar(m.von);
      return 'Bis ' + lesbar(m.bis);
    }

    function baueAktuelles(ferien, news) {
      /* v118: Die Kachel ist immer sichtbar (sie steht in der Navigation). Gibt es
         keine Meldungen, bleibt die Liste leer und der Hinweis darunter erscheint.
         v143: Der Betreiber kann mehrere Betriebsferien-Zeiträume ankündigen (Herbst-
         und Winterferien). Sie stehen OBEN und untereinander über die ganze Breite,
         darunter folgen die News-Kacheln im Raster. Die Reihenfolge kommt vom Server
         (nach Beginn, früheste zuerst). */
      var liste = document.querySelector('[data-aktuelles-liste]');
      var leer = document.querySelector('[data-aktuelles-leer]');
      if (!liste) return;
      liste.textContent = '';
      var ankuendigungen = ferien || [];
      var meldungen = news || [];
      if (!ankuendigungen.length && !meldungen.length) {
        if (leer) leer.hidden = false;
        return;
      }
      if (leer) leer.hidden = true;
      ankuendigungen.forEach(function (f) {
        var punkt = document.createElement('li');
        /* ist-laufend faerbt den Streifen kraeftiger — die gerade laufenden Ferien
           sollen zwischen mehreren angekuendigten sofort ins Auge fallen. */
        punkt.className = 'aktuelles-eintrag ist-ankuendigung' + (f.laeuft ? ' ist-laufend' : '');
        var absatz = document.createElement('p');
        absatz.textContent = f.text || '';
        punkt.appendChild(absatz);
        /* Der Zusatz nennt den Rueckkehr-Tag („Ab TT.MM. wieder fuer Sie da") — der
           Server zieht ihn auf den naechsten Oeffnungstag (v135). */
        if (f.zusatz) {
          var zurueck = document.createElement('p');
          zurueck.className = 'aktuelles-zeitraum';
          zurueck.textContent = f.zusatz;
          punkt.appendChild(zurueck);
        }
        liste.appendChild(punkt);
      });
      meldungen.forEach(function (m) {
        var punkt = document.createElement('li');
        punkt.className = 'aktuelles-eintrag';
        if (m.titel) {
          var ueberschrift = document.createElement('h3');
          ueberschrift.textContent = m.titel;
          punkt.appendChild(ueberschrift);
        }
        var absatz = document.createElement('p');
        absatz.textContent = m.text || '';
        punkt.appendChild(absatz);
        var zeitraum = zeitraumLesbar(m);
        if (zeitraum) {
          var fuss = document.createElement('p');
          fuss.className = 'aktuelles-zeitraum';
          fuss.textContent = zeitraum;
          punkt.appendChild(fuss);
        }
        /* v132: Das Veröffentlichungsdatum steht IMMER unten rechts in der Kachel.
           Es kommt vom Server (Feld veroeffentlicht, Tag der Anlage) und ändert sich
           nicht, wenn der Eintrag später bearbeitet wird. */
        if (m.veroeffentlicht) {
          var stand = document.createElement('p');
          stand.className = 'aktuelles-veroeffentlicht';
          stand.textContent = 'Veröffentlicht am ' + m.veroeffentlicht;
          punkt.appendChild(stand);
        }
        liste.appendChild(punkt);
      });
    }

    /* Notnagel: die frühere Datei neben den Seiten. Greift nur, wenn die Function
       nicht antwortet — dann ist wenigstens die Ankündigung noch da. */
    function ankuendigungAusDatei() {
      fetch(new URL('ankuendigung.json?t=' + Date.now(), siteScriptUrl).href)
        .then(function (a) { return a.ok ? a.json() : null; })
        .then(function (d) {
          if (!ankuendigungGueltig(d)) return;
          /* v142: „laeuft" steuert nur den roten Öffnungsstatus. Ein Eintrag mit Beginn
             in der Zukunft steht sofort in der Kopfzeile, färbt den Status aber noch
             nicht — dieselbe Regel wie beim Server (Feld laeuft in der Antwort). */
          var heuteIso = new Date().toLocaleDateString('sv-SE');
          d.laeuft = !(d.von && heuteIso < d.von);
          zeigeAnkuendigung(d);
          /* v143: Auch im Notnagel-Betrieb steht die Ansage in der Liste „Aktuelles" —
             News gibt es dann keine, weil die Datei nur die Ankündigung kennt. */
          baueAktuelles([d], []);
        })
        .catch(function () { /* keine Ankündigung – alles bleibt wie es ist */ });
    }

    function initialisiereAnkuendigung() {
      if (!document.querySelector('[data-oeffnungsstatus], .ankuendigung-links, [data-zeiten-hinweis], [data-aktuelles-liste], [data-ankuendigung-mobil]')) return;
      /* Bewusst /api/veroeffentlicht und nicht /api/eintraege: Die veröffentlichte
         Sicht ist auch dann richtig, wenn der Betreiber im selben Browser
         angemeldet ist — /api/eintraege liefert ihm die interne Liste. */
      /* v126: cache 'no-store' — die Antwort hat max-age=30. Ohne das zeigte die
         Seite nach einer Änderung im Wartungsbereich bis zu 30 s den alten Stand. */
      fetch('https://autocentrum-halle-api.immerzu.workers.dev/api/veroeffentlicht', { headers: { accept: 'application/json' }, cache: 'no-store' })
        .then(function (a) { return a.ok ? a.json() : null; })
        .then(function (d) {
          if (!d || d.ok !== true) { ankuendigungAusDatei(); return; }
          if (d.ankuendigung) zeigeAnkuendigung(d.ankuendigung);
          /* v143: Die Liste „Aktuelles" bekommt ALLE Ankündigungen (Betriebsferien und
             Krankheit, untereinander) und darunter die News. */
          baueAktuelles(d.ankuendigungen, d.news);
        })
        .catch(function (f) {
          /* Nicht still scheitern: Genau das hat einmal dazu gefuehrt, dass die Seite
             auf den Notnagel zurueckfiel und niemand den Grund sah. */
          if (window.console && console.warn) console.warn('Ankündigung konnte nicht geladen werden:', f);
          ankuendigungAusDatei();
        });
    }

    /* Öffnungsstatus live */
    var wochentagNamen = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    function aktualisiereStatus() {
      var badges = document.querySelectorAll('[data-oeffnungsstatus]');
      if (!badges.length) return;
      var jetzt = new Date();
      var tag = jetzt.getDay();
      var minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
      var oeffnungsStart = 8 * 60;
      var oeffnungsEnde = 17 * 60;
      var werktag = (tag >= 1 && tag <= 5);
      var istOffen = werktag && minuten >= oeffnungsStart && minuten < oeffnungsEnde;
      var text;
      if (istOffen) text = 'Jetzt geöffnet · bis 17:00 Uhr';
      else if (tag === 0 || tag === 6) text = 'Geschlossen · öffnet Montag um 08:00 Uhr';
      else if (tag === 5 && minuten >= oeffnungsEnde) text = 'Geschlossen · öffnet Montag um 08:00 Uhr';
      else if (minuten < oeffnungsStart) text = 'Geschlossen · öffnet heute um 08:00 Uhr';
      else text = 'Geschlossen · öffnet ' + wochentagNamen[tag + 1] + ' um 08:00 Uhr';
      /* v113: Eine aktive Ankündigung hat Vorrang — sie beantwortet die Frage
         „hat die Werkstatt offen?" genauer als der reine Zeitenstatus. */
      /* v120: Hier hatte die Ankündigung Vorrang vor dem Zeitenstatus. Das ist
         aufgehoben — der Status bleibt echt, der Urlaub steht als Hinweis daneben. */
      /* v120 (Nutzerkorrektur): Der Status zeigt IMMER den echten Zeitenstatus. Eine
         geplante Betriebsferien oder ein Urlaub ersetzt ihn nicht, sondern steht als
         eigener Hinweis daneben — sonst wirkt die Werkstatt geschlossen, obwohl offen ist. */
      /* v122: Nur wenn die Betriebsferien JETZT laufen, wird die Anzeige rot und nennt
         den Grund. Ist der Urlaub nur geplant, bleibt der echte Zeitenstatus stehen. */
      var laufend = !!(ankuendigung && ankuendigung.laeuft);
      if (laufend) {
        /* v127: Im Status steht nur der Grund ohne Datum („Betriebsferien") —
           mit Datum ist die Zeile am Handy zu schmal und würde abgeschnitten.
           Den Zeitraum zeigt der Streifen in der Kopfzeile. */
        text = ankuendigung.kurz || ankuendigung.text;
        istOffen = false;
      }
      for (var i = 0; i < badges.length; i++) {
        var b = badges[i];
        b.classList.toggle('ist-offen', istOffen);
        b.classList.toggle('ist-zu', !istOffen);
        b.classList.toggle('ist-ankuendigung', laufend);
        var txt = b.querySelector('.status-text');
        if (txt) txt.textContent = text;
      }
    }
    aktualisiereStatus();
    window.setInterval(aktualisiereStatus, 60000);

    /* v108: Zähler der Seitenaufrufe (CounterAPI v2) */
    function initialisiereAufrufezaehler() {
      var ziel = document.getElementById('aufrufezahl');
      if (!ziel) return;
      function ausblenden() {
        var huelle = ziel.closest('.nav-zaehler');
        if (huelle && huelle.parentNode) huelle.parentNode.style.display = 'none';
      }
      /* v108: Zeitstempel, damit die Zwischenspeicherung des Anbieters die Zählung nicht schluckt */
      fetch('https://api.counterapi.dev/v2/edes-team-5556/first-counter-5556/up?t=' + Date.now(), { method: 'GET', mode: 'cors', cache: 'no-store' })
        .then(function (antwort) {
          if (!antwort.ok) throw new Error('http ' + antwort.status);
          return antwort.json();
        })
        .then(function (daten) {
          /* v108: v2 liefert den Stand als data.up_count (v1 hatte count/value) */
          var zahl = null;
          var kern = daten && daten.data ? daten.data : null;
          if (kern && typeof kern.up_count === 'number') zahl = kern.up_count;
          else if (kern && typeof kern.count === 'number') zahl = kern.count;
          else if (kern && typeof kern.value === 'number') zahl = kern.value;
          else if (daten && typeof daten.count === 'number') zahl = daten.count;
          else if (daten && typeof daten.value === 'number') zahl = daten.value;
          if (zahl === null) { ausblenden(); return; }
          ziel.textContent = zahl.toLocaleString('de-DE');
        })
        .catch(function () { ausblenden(); });
    }

    /* Kalenderdatei (.ics) */
    var icsLink = document.getElementById('ics-download');
    if (icsLink) {
      icsLink.addEventListener('click', function (event) {
        event.preventDefault();
        var ics =
          'BEGIN:VCALENDAR\r\n' + 'VERSION:2.0\r\n' + 'PRODID:-//Autocentrum Halle//DE\r\n' +
          'CALSCALE:GREGORIAN\r\n' + 'BEGIN:VEVENT\r\n' +
          'UID:oeffnungszeiten-autocentrum-halle@autocentrum-halle.de\r\n' +
          'DTSTAMP:20260101T120000Z\r\n' + 'DTSTART:20260105T080000\r\n' + 'DTEND:20260105T170000\r\n' +
          'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n' +
          'SUMMARY:Autocentrum Halle – Öffnungszeiten\r\n' +
          'LOCATION:Zscherbener Landstraße 17\\, 06126 Halle (Saale)\r\n' +
          'DESCRIPTION:Autocentrum Halle\\, Inh. Daniel Oehme\\nTelefon: 0345 6786691\r\n' +
          'END:VEVENT\r\n' + 'END:VCALENDAR\r\n';
        var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'oeffnungszeiten-autocentrum-halle.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      });
    }

    /* Klappmenü (mobil) */
    var menueSchalter = document.getElementById('menue-schalter');
    var mobilMenue = document.getElementById('mobil-menue');
    function setzeMenue(offen) {
      if (!menueSchalter || !mobilMenue) return;
      mobilMenue.hidden = !offen;
      menueSchalter.setAttribute('aria-expanded', offen ? 'true' : 'false');
      menueSchalter.setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü öffnen');
      setzeStickyHoehe();
    }
    if (menueSchalter && mobilMenue) {
      menueSchalter.addEventListener('click', function () { setzeMenue(mobilMenue.hidden); });
      mobilMenue.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('a')) setzeMenue(false);
      });
      document.addEventListener('click', function (event) {
        if (mobilMenue.hidden) return;
        if (!(event.target instanceof Element)) return;
        if (menueSchalter.contains(event.target) || mobilMenue.contains(event.target)) return;
        setzeMenue(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || mobilMenue.hidden) return;
        setzeMenue(false);
        menueSchalter.focus();
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth > 640 && !mobilMenue.hidden) setzeMenue(false);
      });
    }

    /* ==== v147: Die rote Linie folgt der angeklickten Rubrik ====
       Bis v146 kam die Markierung allein aus dem Bau: Auf index.html war immer
       „Start" unterstrichen, weil Leistungen, Werkstatt, FAQ, Öffnungszeiten und
       Aktuelles Anker auf dieselbe Seite sind — die Linie blieb beim Klick also
       unter „Start" stehen (nur „Kontakt" ist eine eigene Seite). Jetzt richtet
       sich die Markierung nach dem Abschnitt, in dem man gerade ist: beim Klick
       sofort, beim Scrollen mitlaufend. Es ändern sich nur Klasse und Farbe,
       keine Höhen — deshalb kein Layout-Zittern (§7.2). */
    function initialisiereRubrikMarkierung() {
      var leiste = document.querySelector('.sticky-bereich');
      var alle = document.querySelectorAll('.hauptnav a, .mobil-menue a');
      var namen = ['leistungen', 'werkstatt', 'faq', 'oeffnungszeiten', 'aktuelles'];
      var abschnitte = [];
      for (var i = 0; i < namen.length; i++) {
        var el = document.getElementById(namen[i]);
        /* Ein hidden-Abschnitt (z. B. ein leeres „Aktuelles") hat top = 0 und
           würde sonst dauerhaft als aktiv gelten. */
        if (el && !el.hidden) abschnitte.push({ id: namen[i], el: el });
      }
      if (!abschnitte.length) return;   /* Unterseite: Markierung bleibt wie gebaut */

      /* Nach Position im Dokument sortieren — die Reihenfolge in der Navigation ist
         NICHT die Reihenfolge auf der Seite („Aktuelles" steht vor den
         Öffnungszeiten). Ohne diese Sortierung gewinnt der falsche Abschnitt. */
      abschnitte.sort(function (x, y) {
        return (x.el.getBoundingClientRect().top + window.pageYOffset) -
               (y.el.getBoundingClientRect().top + window.pageYOffset);
      });

      var aktuell = '';
      var sperreBis = 0;

      /* „Start" gehört zum Anker #oben, alle anderen Rubriken tragen ihren Namen. */
      function ankerVon(id) { return id === 'start' ? 'oben' : id; }

      function markiere(id) {
        if (id === aktuell) return;
        aktuell = id;
        for (var j = 0; j < alle.length; j++) {
          var a = alle[j];
          var ziel = a.getAttribute('href') || '';
          if (id !== '' && ziel.indexOf('#' + ankerVon(id)) !== -1) {
            a.classList.add('nav-aktiv');
            a.setAttribute('aria-current', id === 'start' ? 'page' : 'location');
          } else {
            a.classList.remove('nav-aktiv');
            a.removeAttribute('aria-current');
          }
        }
      }

      function ermittle() {
        var grenze = (leiste ? leiste.getBoundingClientRect().bottom : 0) + 12;
        var treffer = 'start';
        for (var k = 0; k < abschnitte.length; k++) {
          if (abschnitte[k].el.getBoundingClientRect().top <= grenze) treffer = abschnitte[k].id;
        }
        /* Am Seitenende ist der letzte Abschnitt gemeint — sonst „gewinnt" er nie,
           weil seine Oberkante die Grenze nicht mehr erreicht. */
        var hoehe = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        if (window.pageYOffset + window.innerHeight >= hoehe - 4) treffer = abschnitte[abschnitte.length - 1].id;
        return treffer;
      }

      function aktualisiere() {
        if (Date.now() < sperreBis) return;
        markiere(ermittle());
      }

      var laeuft = false;
      function beiScroll() {
        if (laeuft) return;
        laeuft = true;
        window.requestAnimationFrame(function () { laeuft = false; aktualisiere(); });
      }

      for (var m = 0; m < alle.length; m++) {
        alle[m].addEventListener('click', function () {
          var ziel = this.getAttribute('href') || '';
          var treffer = '';
          if (ziel.indexOf('#oben') !== -1) treffer = 'start';
          for (var n = 0; n < abschnitte.length; n++) {
            if (ziel.indexOf('#' + abschnitte[n].id) !== -1) treffer = abschnitte[n].id;
          }
          if (treffer === '') return;    /* z. B. Kontakt: eigene Seite, nichts zu tun */
          markiere(treffer);
          /* Das Scrollen ist weich (scroll-behavior: smooth) — währenddessen die
             Markierung nicht vom Scroll-Ereignis zurücknehmen lassen. */
          sperreBis = Date.now() + 900;
          window.setTimeout(aktualisiere, 950);
        });
      }

      window.addEventListener('scroll', beiScroll, { passive: true });
      window.addEventListener('resize', beiScroll);
      window.addEventListener('hashchange', beiScroll);
      aktualisiere();
    }
    bereiteStaffelungVor();
    initialisiereReveal();
    initialisiereZoom();
    initialisiereParallax();
    initialisiereAufrufezaehler();
    initialisiereAnkuendigung();
    initialisiereRubrikMarkierung();
  })();

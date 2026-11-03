(function () {
  "use strict";

  var API =
    "https://autocentrum-halle-api.immerzu.workers.dev/api/ankauf";

  var MAX_ORIGINAL = 10000000;
  var MAX_UPLOAD = 500000;
  var FOTO_FELDER = [
    "foto_front",
    "foto_heck",
    "foto_schaden"
  ];

  var formular =
    document.querySelector('form[name="ankauf"]');

  if (!formular) return;

  function statusElement() {
    var status =
      formular.querySelector(".cloudflare-ankauf-status");

    if (!status) {
      status = document.createElement("p");
      status.className =
        "formular-hinweis cloudflare-ankauf-status";
      status.setAttribute("role", "status");

      var knopf =
        formular.querySelector('button[type="submit"]');

      if (knopf) {
        knopf.insertAdjacentElement("afterend", status);
      } else {
        formular.appendChild(status);
      }
    }

    return status;
  }

  function fehlerZeigen(feld, text) {
    var kasten = feld.parentNode;
    if (!kasten) return;

    var alt = kasten.querySelector(".feld-fehler");

    if (alt) {
      alt.parentNode.removeChild(alt);
    }

    if (!text) return;

    var meldung = document.createElement("span");
    meldung.className = "feld-fehler";
    meldung.setAttribute("role", "alert");
    meldung.textContent = text;
    kasten.appendChild(meldung);
  }

  function vorschauZeigen(feld, name, datei) {
    var bild =
      formular.querySelector(
        '[data-vorschau="' + name + '"]'
      );

    if (!bild) return;

    var alt = bild.getAttribute("data-url");

    if (alt) {
      URL.revokeObjectURL(alt);
      bild.removeAttribute("data-url");
    }

    if (!datei) {
      bild.removeAttribute("src");
      bild.hidden = true;
      return;
    }

    var url = URL.createObjectURL(datei);

    bild.setAttribute("data-url", url);
    bild.src = url;
    bild.hidden = false;
  }

  function ladeBild(datei) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(datei);
      var bild = new Image();

      bild.onload = function () {
        URL.revokeObjectURL(url);
        resolve(bild);
      };

      bild.onerror = function () {
        URL.revokeObjectURL(url);
        reject(
          new Error("Ein ausgewähltes Bild konnte nicht gelesen werden.")
        );
      };

      bild.src = url;
    });
  }

  function canvasBlob(canvas, qualitaet) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error("Ein Bild konnte nicht verarbeitet werden.")
            );
          }
        },
        "image/jpeg",
        qualitaet
      );
    });
  }

  async function komprimiereBild(datei) {
    if (!datei || !datei.size) return null;

    if (datei.size > MAX_ORIGINAL) {
      throw new Error(
        "Ein Foto ist größer als 10 MB."
      );
    }

    var erlaubteTypen = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (erlaubteTypen.indexOf(datei.type) === -1) {
      throw new Error(
        "Fotos müssen JPEG, PNG oder WebP sein."
      );
    }

    if (datei.size <= MAX_UPLOAD) {
      return datei;
    }

    var bild = await ladeBild(datei);

    var kanten = [
      1600,
      1400,
      1200,
      1000,
      800
    ];

    var qualitaeten = [
      0.82,
      0.72,
      0.62,
      0.52,
      0.42
    ];

    for (var k = 0; k < kanten.length; k++) {
      var maxKante = kanten[k];

      var faktor = Math.min(
        1,
        maxKante /
          Math.max(
            bild.naturalWidth,
            bild.naturalHeight
          )
      );

      var breite = Math.max(
        1,
        Math.round(bild.naturalWidth * faktor)
      );

      var hoehe = Math.max(
        1,
        Math.round(bild.naturalHeight * faktor)
      );

      var canvas = document.createElement("canvas");
      canvas.width = breite;
      canvas.height = hoehe;

      var ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error(
          "Die Bildverarbeitung wird von diesem Browser nicht unterstützt."
        );
      }

      ctx.drawImage(
        bild,
        0,
        0,
        breite,
        hoehe
      );

      for (
        var q = 0;
        q < qualitaeten.length;
        q++
      ) {
        var blob =
          await canvasBlob(
            canvas,
            qualitaeten[q]
          );

        if (blob.size <= MAX_UPLOAD) {
          var basis =
            String(datei.name || "foto")
              .replace(/\.[^.]+$/, "");

          return new File(
            [blob],
            basis + ".jpg",
            {
              type: "image/jpeg",
              lastModified: Date.now()
            }
          );
        }
      }
    }

    throw new Error(
      "Ein Foto konnte nicht ausreichend verkleinert werden."
    );
  }

  FOTO_FELDER.forEach(function (name) {
    var feld = formular.elements.namedItem(name);

    if (!feld) return;

    feld.addEventListener("change", function () {
      var datei =
        feld.files && feld.files[0];

      var text = "";

      if (
        datei &&
        datei.size > MAX_ORIGINAL
      ) {
        text =
          "Das Bild ist größer als 10 MB.";
      }

      fehlerZeigen(feld, text);
      vorschauZeigen(
        feld,
        name,
        datei || null
      );
    });
  });

  formular.addEventListener(
    "submit",
    async function (ereignis) {
      ereignis.preventDefault();

      if (!formular.checkValidity()) {
        formular.reportValidity();
        return;
      }

      var status = statusElement();

      var knopf =
        formular.querySelector(
          'button[type="submit"]'
        );

      var alterText =
        knopf ? knopf.textContent : "";

      if (knopf) {
        knopf.disabled = true;
        knopf.textContent =
          "Fotos werden vorbereitet …";
      }

      status.textContent =
        "Fotos werden vorbereitet …";

      try {
        var daten = new FormData(formular);

        for (
          var i = 0;
          i < FOTO_FELDER.length;
          i++
        ) {
          var name = FOTO_FELDER[i];

          var feld =
            formular.elements.namedItem(name);

          var datei =
            feld &&
            feld.files &&
            feld.files[0];

          if (!datei) {
            daten.delete(name);
            continue;
          }

          fehlerZeigen(feld, "");

          var klein =
            await komprimiereBild(datei);

          daten.set(
            name,
            klein,
            klein.name
          );
        }

        if (knopf) {
          knopf.textContent =
            "Wird gesendet …";
        }

        status.textContent =
          "Wird gesendet …";

        var antwort =
          await fetch(API, {
            method: "POST",
            headers: {
              Accept: "application/json"
            },
            body: daten
          });

        var ergebnis;

        try {
          ergebnis = await antwort.json();
        } catch (_) {
          ergebnis = {
            ok: false,
            fehler:
              "Ungültige Serverantwort."
          };
        }

        if (
          !antwort.ok ||
          !ergebnis.ok
        ) {
          throw new Error(
            ergebnis.fehler ||
            "Senden fehlgeschlagen."
          );
        }

        formular.reset();

        FOTO_FELDER.forEach(
          function (name) {
            var feld =
              formular.elements.namedItem(name);

            if (feld) {
              fehlerZeigen(feld, "");
            }

            vorschauZeigen(
              feld,
              name,
              null
            );
          }
        );

        status.textContent =
          "Vielen Dank. Ihre Fahrzeugdaten und Fotos wurden erfolgreich übermittelt.";
      } catch (fehler) {
        status.textContent =
          fehler && fehler.message
            ? fehler.message
            : "Senden fehlgeschlagen. Bitte versuchen Sie es erneut.";
      } finally {
        if (knopf) {
          knopf.disabled = false;
          knopf.textContent =
            alterText;
        }
      }
    }
  );
})();

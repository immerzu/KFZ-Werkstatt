(function () {
  'use strict';

  var api = 'https://autocentrum-halle-api.immerzu.workers.dev/api/formular';

  var formulare = document.querySelectorAll(
    'form[name="kontakt"], form[name="rueckruf"], form[name="newsletter"]'
  );

  formulare.forEach(function (formular) {
    formular.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();

      if (!formular.checkValidity()) {
        formular.reportValidity();
        return;
      }

      var knopf = formular.querySelector('button[type="submit"]');
      var alterText = knopf ? knopf.textContent : '';

      var status = formular.querySelector('.cloudflare-formular-status');

      if (!status) {
        status = document.createElement('p');
        status.className = 'formular-hinweis cloudflare-formular-status';
        status.setAttribute('role', 'status');

        if (knopf) {
          knopf.insertAdjacentElement('afterend', status);
        } else {
          formular.appendChild(status);
        }
      }

      status.textContent = 'Wird gesendet …';

      if (knopf) {
        knopf.disabled = true;
        knopf.textContent = 'Wird gesendet …';
      }

      var daten = new URLSearchParams();

      new FormData(formular).forEach(function (wert, name) {
        if (typeof wert === 'string') {
          daten.append(name, wert);
        }
      });

      fetch(api, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: daten.toString()
      })
        .then(function (antwort) {
          return antwort.json()
            .catch(function () {
              return { ok: false, fehler: 'Ungültige Serverantwort.' };
            })
            .then(function (daten) {
              if (!antwort.ok || !daten.ok) {
                throw new Error(daten.fehler || 'Senden fehlgeschlagen.');
              }

              return daten;
            });
        })
        .then(function () {
          formular.reset();
          status.textContent =
            'Vielen Dank. Ihre Angaben wurden erfolgreich übermittelt.';
        })
        .catch(function (fehler) {
          status.textContent =
            fehler && fehler.message
              ? fehler.message
              : 'Senden fehlgeschlagen. Bitte versuchen Sie es erneut.';
        })
        .finally(function () {
          if (knopf) {
            knopf.disabled = false;
            knopf.textContent = alterText;
          }
        });
    });
  });
})();

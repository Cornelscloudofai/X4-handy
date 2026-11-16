// Texteinblendungen im Spielstil für die Trailer (Text-Ebene über dem Spiel, Einblendkurve)
export const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Text-Ebene über dem Spiel (eigene Elemente, jedes Bild aus Node gesetzt) */
export const OVERLAY = `(() => {
  if (document.getElementById('tr')) return;
  const st = document.createElement('style');
  st.textContent = \`
    body.tr-clean #hud, body.tr-clean #bottom, body.tr-clean #toasts, body.tr-clean #banner, body.tr-clean #objective, body.tr-clean #card { visibility: hidden !important; }
    #tr { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
    #tr .black { position: absolute; inset: 0; background: #02060c; opacity: 0; }
    #tr .flash { position: absolute; inset: 0; background: #e8fffb; opacity: 0; mix-blend-mode: screen; }
    #tr .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(2,6,12,.55) 100%); opacity: 0; }
    #tr .band { position: absolute; left: 0; right: 0; height: 190px; transform: translateY(-50%); background: linear-gradient(transparent, rgba(2,6,12,.72) 30%, rgba(2,6,12,.72) 70%, transparent); opacity: 0; }
    #tr .txt { position: absolute; left: 16px; right: 16px; transform: translateY(-50%); text-align: center; opacity: 0; }
    #tr .big { font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 40px; line-height: 1.05; letter-spacing: .07em; color: #effffb;
      text-shadow: 0 0 22px rgba(63,224,197,.9), 0 0 6px rgba(63,224,197,.7), 0 2px 10px rgba(0,0,0,.95); }
    #tr .small { font-family: 'Barlow', sans-serif; font-weight: 600; font-size: 18px; letter-spacing: .05em; color: #bff7ec; margin-top: 10px;
      text-shadow: 0 1px 8px rgba(0,0,0,.95), 0 0 2px #000; }
    #tr .logo { font-size: 50px; letter-spacing: .1em; }
    #tr .eyebrow { font-family: 'Chakra Petch', sans-serif; font-weight: 600; font-size: 15px; letter-spacing: .32em; color: #3fe0c5; margin-bottom: 10px; text-shadow: 0 1px 6px #000; }
  \`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.id = 'tr';
  d.innerHTML = '<div class="vig"></div><div class="black"></div><div class="band"></div><div class="txt"><div class="eyebrow"></div><div class="big"></div><div class="small"></div></div><div class="flash"></div>';
  document.body.appendChild(d);
})()`;

/** Zustand der Text-Ebene für ein Bild */
export async function overlay(page, o) {
  await page.evaluate((o) => {
    const r = document.getElementById('tr');
    const q = (c) => r.querySelector(c);
    const txt = q('.txt'), band = q('.band');
    q('.big').textContent = o.big ?? '';
    q('.big').classList.toggle('logo', !!o.logo);
    q('.small').textContent = o.small ?? '';
    q('.eyebrow').textContent = o.eyebrow ?? '';
    q('.eyebrow').style.display = o.eyebrow ? '' : 'none';
    q('.small').style.display = o.small ? '' : 'none';
    txt.style.top = band.style.top = `${o.y ?? 30}%`;
    txt.style.opacity = String(o.a ?? 0);
    txt.style.transform = `translateY(-50%) scale(${o.s ?? 1})`;
    txt.style.letterSpacing = '';
    band.style.opacity = String((o.a ?? 0) * (o.band ?? 1));
    q('.flash').style.opacity = String(o.flash ?? 0);
    q('.black').style.opacity = String(o.black ?? 0);
    q('.vig').style.opacity = String(o.vig ?? 0.8);
    document.body.classList.toggle('tr-clean', !!o.clean);
  }, o);
}

/** Einblendung: kurz größer, dann ruhig; am Ende weich weg */
export function title(t, a, b, fin = 0.22, fout = 0.2) {
  if (t < a || t > b) return { a: 0 };
  const i = ease((t - a) / fin), o = ease((b - t) / fout);
  return { a: Math.min(i, o), s: 1.1 - 0.1 * ease((t - a) / (fin * 1.6)) };
}


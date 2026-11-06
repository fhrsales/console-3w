// Google Analytics for everything under fhrsales.github.io (property "Portfolio fhrsales.github.io").
// The same file lives in the Portfolio, console-3w and votacoes-camara-api repos.
// Consent mode: no cookies until the visitor accepts. The choice is stored under the same
// localStorage key the portfolio uses, and all three sites share the fhrsales.github.io origin,
// so answering once on any of them answers for all.
(function () {
	var ID = 'G-Q9D6B0JQFR';
	var KEY = 'analytics-consent';

	window.dataLayer = window.dataLayer || [];
	window.gtag = window.gtag || function () { dataLayer.push(arguments); };

	var stored = null;
	try { stored = localStorage.getItem(KEY); } catch (e) {}

	gtag('consent', 'default', {
		analytics_storage: stored === 'granted' ? 'granted' : 'denied',
		ad_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied'
	});
	gtag('js', new Date());
	gtag('config', ID);

	if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;

	function loadGtag() {
		var s = document.createElement('script');
		s.async = true;
		s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
		document.head.appendChild(s);
	}

	function choose(value, box) {
		try { localStorage.setItem(KEY, value); } catch (e) {}
		gtag('consent', 'update', { analytics_storage: value });
		box.remove();
	}

	function showNotice() {
		var box = document.createElement('div');
		box.setAttribute('role', 'region');
		box.setAttribute('aria-label', 'Cookies');
		box.style.cssText =
			'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:520px;margin:0 auto;' +
			'display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:12px 14px 12px 18px;' +
			'background:#fff;color:#1a1a1a;border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.25);' +
			'font:400 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;';
		var p = document.createElement('p');
		p.style.cssText = 'margin:0;flex:1 1 240px;';
		p.textContent = 'Este site usa cookies do Google Analytics para contar visitas. Nada de publicidade.';
		var actions = document.createElement('div');
		actions.style.cssText = 'display:flex;gap:6px;margin-left:auto;';
		[['Recusar', 'denied', 'transparent', '#1a1a1a'], ['Aceitar', 'granted', '#1a1a1a', '#fff']].forEach(function (b) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = b[0];
			btn.style.cssText =
				'font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;border:0;border-radius:6px;' +
				'padding:9px 12px;min-height:36px;cursor:pointer;background:' + b[2] + ';color:' + b[3] + ';';
			btn.addEventListener('click', function () { choose(b[1], box); });
			actions.appendChild(btn);
		});
		box.appendChild(p);
		box.appendChild(actions);
		document.body.appendChild(box);
	}

	function start() {
		setTimeout(loadGtag, 1500);
		if (!stored) showNotice();
	}
	if (document.readyState === 'complete') start();
	else addEventListener('load', start);
})();

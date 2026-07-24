(function() {
  var API = '__DEPLOYR_API__';
  var SLUG = '__PROJECT_SLUG__';

  function send(data) {
    var payload = JSON.stringify(Object.assign({ projectSlug: SLUG }, data));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API + '/collect', payload);
    } else {
      fetch(API + '/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function() {});
    }
  }

  // Page view
  send({ path: location.pathname, referrer: document.referrer });

  // Web Vitals — LCP via PerformanceObserver
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      var po = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        send({ path: location.pathname, vitals: { lcp: last.startTime } });
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch(e) {}
  }
})();
